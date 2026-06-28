import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationStatus, RiskLevel } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HealthAnalyticsService } from './health-analytics.service';
import { SlaMonitoringService } from './sla-monitoring.service';

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

@Injectable()
export class KpiEngineService implements OnApplicationBootstrap {
  private readonly logger = new Logger(KpiEngineService.name);

  // In-Memory Cache Store
  private cacheStore = new Map<string, CacheEntry<any>>();

  // Cache TTL Configurations (in milliseconds)
  private readonly CACHE_TTLS = {
    EXECUTIVE_SUMMARY: 10 * 60 * 1000, // 10 minutes
    HEALTH_ANALYTICS: 5 * 60 * 1000, // 5 minutes
    ESCALATION_SUMMARY: 5 * 60 * 1000, // 5 minutes
  };

  constructor(
    private prisma: PrismaService,
    private healthService: HealthAnalyticsService,
    private slaService: SlaMonitoringService,
  ) {}

  /**
   * OnApplicationBootstrap hook: runs the initial backfill check on server boot
   */
  async onApplicationBootstrap() {
    this.logger.log('Checking database for initial historical backfill...');
    try {
      const snapshotCount = await this.prisma.executiveKpiSnapshot.count();
      if (snapshotCount === 0) {
        this.logger.log(
          'ExecutiveKpiSnapshot table is empty. Initiating Initial Historical Backfill Strategy...',
        );

        // 1. Run SLA check and generate breach logs
        await this.slaService.checkSlaBreaches();

        // 2. Generate initial health histories
        await this.healthService.recordAllHealthScores();

        // 3. Generate first Executive KPI Snapshot
        await this.generateDailySnapshot();

        this.logger.log('Initial Historical Backfill completed successfully!');
      } else {
        this.logger.log(
          `Found ${snapshotCount} snapshots. Skipping historical backfill.`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to run initial historical backfill on startup:',
        error.stack,
      );
    }
  }

  /**
   * Clears the cache maps (called upon data updates to avoid stale cache)
   */
  clearCache(key?: string) {
    if (key) {
      this.cacheStore.delete(key);
      this.logger.log(`Cache cleared for key: ${key}`);
    } else {
      this.cacheStore.clear();
      this.logger.log('All analytics caches cleared.');
    }
  }

  /**
   * Wrapper for caching service method calls
   */
  private async getCachedData<T>(
    cacheKey: string,
    ttl: number,
    fetchFn: () => Promise<T>,
  ): Promise<T> {
    const cached = this.cacheStore.get(cacheKey);
    const now = Date.now();

    if (cached && now < cached.expiresAt) {
      this.logger.log(`Cache Hit for key: ${cacheKey}`);
      return cached.data;
    }

    this.logger.log(
      `Cache Miss/Expired for key: ${cacheKey}. Fetching fresh data...`,
    );
    const freshData = await fetchFn();
    this.cacheStore.set(cacheKey, {
      data: freshData,
      expiresAt: now + ttl,
    });
    return freshData;
  }

  private getSecurityFilter(user: any): any {
    const where: any = {};
    if (user && user.role !== 'ADMIN' && user.role !== 'EVALUATOR') {
      where.OR = [];
      if (user.department) {
        where.OR.push({
          assignedEntityNameSnapshot: {
            mode: 'insensitive',
            equals: user.department.trim(),
          },
        });
      }
      where.OR.push({ assignedUserId: user.userId });
      if (where.OR.length === 0) {
        where.id = 'none';
      }
    }
    return where;
  }

  /**
   * Calculates the full set of KPIs from the KPI Catalog
   */
  async calculateKpiCatalog(user?: any) {
    const filter = this.getSecurityFilter(user);
    const trackings = await this.prisma.recommendationTracking.findMany({
      where: filter,
    });
    const total = trackings.length;

    if (total === 0) {
      return {
        overallProgressRate: 0,
        closureRate: 0,
        averageResolutionTimeDays: null,
        slaAdherenceRate: null,
        escalationVolume: 0,
        criticalOverdueRate: 0,
        total,
      };
    }

    // 1. Overall Progress Rate
    const sumProgress = trackings.reduce(
      (sum, item) => sum + item.progressPercent,
      0,
    );
    const overallProgressRate = Number((sumProgress / total).toFixed(2));

    // 2. Closure Rate
    const closedCount = trackings.filter(
      (item) =>
        item.status === RecommendationStatus.CLOSED ||
        item.status === RecommendationStatus.VERIFIED,
    ).length;
    const closureRate = Number(((closedCount / total) * 100).toFixed(2));

    // 3. Average Resolution Time (ART) in Days
    const closedItems = trackings.filter(
      (item) =>
        (item.status === RecommendationStatus.CLOSED ||
          item.status === RecommendationStatus.VERIFIED) &&
        item.closedAt,
    );
    let averageResolutionTimeDays: number | null = null;
    if (closedItems.length > 0) {
      const totalResolutionTime = closedItems.reduce((sum, item) => {
        const issued = new Date(item.issuedAt);
        const closed = new Date(item.closedAt!);
        return sum + (closed.getTime() - issued.getTime());
      }, 0);
      averageResolutionTimeDays = Number(
        (
          totalResolutionTime /
          closedItems.length /
          (1000 * 60 * 60 * 24)
        ).toFixed(2),
      );
    }

    // 4. SLA Adherence Rate
    // Percent of closed recommendations that were closed before or on their due date
    const closedWithDue = closedItems.filter((item) => item.dueDate);
    let slaAdherenceRate: number | null = null;
    if (closedWithDue.length > 0) {
      const adheredCount = closedWithDue.filter((item) => {
        const closed = new Date(item.closedAt!);
        const due = new Date(item.dueDate!);
        // Set hours to 0 to compare dates accurately
        closed.setHours(0, 0, 0, 0);
        due.setHours(0, 0, 0, 0);
        return closed <= due;
      }).length;
      slaAdherenceRate = Number(
        ((adheredCount / closedWithDue.length) * 100).toFixed(2),
      );
    }

    // 5. Escalation Volume
    const escalationVolume = trackings.filter(
      (item) => item.escalationLevel > 0,
    ).length;

    // 6. Critical Overdue Rate
    // Overdue by > 15 days and risk is CRITICAL or HIGH
    const now = new Date();
    const criticalOverdueCount = trackings.filter((item) => {
      if (!item.dueDate) return false;
      const isClosed = (
        [
          RecommendationStatus.CLOSED,
          RecommendationStatus.VERIFIED,
          RecommendationStatus.REJECTED,
        ] as RecommendationStatus[]
      ).includes(item.status);
      if (isClosed) return false;

      const due = new Date(item.dueDate);
      if (now <= due) return false;

      const diffTime = Math.abs(now.getTime() - due.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const isCriticalOrHigh =
        item.riskLevel === RiskLevel.CRITICAL ||
        item.riskLevel === RiskLevel.HIGH;

      return isCriticalOrHigh && diffDays > 15;
    }).length;

    const criticalOverdueRate = Number(
      ((criticalOverdueCount / total) * 100).toFixed(2),
    );

    return {
      overallProgressRate,
      closureRate,
      averageResolutionTimeDays,
      slaAdherenceRate,
      escalationVolume,
      criticalOverdueRate,
      total,
    };
  }

  /**
   * Generates a snapshot of the current KPIs by entity breakdown
   */
  async getEntityBreakdown(user?: any) {
    const filter = this.getSecurityFilter(user);
    const trackings = await this.prisma.recommendationTracking.findMany({
      where: filter,
      include: { assignedEntity: true },
    });

    const entityMap = new Map<
      string,
      {
        id: string;
        name: string;
        total: number;
        closed: number;
        sumProgress: number;
      }
    >();

    for (const item of trackings) {
      const entityId = item.assignedEntityId || 'unassigned';
      const entityName = item.assignedEntity
        ? item.assignedEntity.name
        : 'غير معين';

      const existing = entityMap.get(entityId) || {
        id: entityId,
        name: entityName,
        total: 0,
        closed: 0,
        sumProgress: 0,
      };

      existing.total++;
      existing.sumProgress += item.progressPercent;
      if (
        item.status === RecommendationStatus.CLOSED ||
        item.status === RecommendationStatus.VERIFIED
      ) {
        existing.closed++;
      }

      entityMap.set(entityId, existing);
    }

    const breakdown: any[] = [];
    entityMap.forEach((val) => {
      breakdown.push({
        entityId: val.id,
        entityName: val.name,
        total: val.total,
        closed: val.closed,
        complianceRate: Number((val.sumProgress / val.total).toFixed(2)),
      });
    });

    return breakdown;
  }

  /**
   * Generates a daily snapshot and logs it to ExecutiveKpiSnapshot
   * Runs daily at midnight
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateDailySnapshot() {
    this.logger.log('Executing daily executive KPI snapshot generation job...');
    try {
      const kpis = await this.calculateKpiCatalog();
      const entityBreakdown = await this.getEntityBreakdown();

      // Check count of critical / overdue
      const trackings = await this.prisma.recommendationTracking.findMany();
      const openRecommendations = trackings.filter(
        (item) =>
          !(
            [
              RecommendationStatus.CLOSED,
              RecommendationStatus.VERIFIED,
              RecommendationStatus.REJECTED,
            ] as RecommendationStatus[]
          ).includes(item.status),
      ).length;
      const closedRecommendations = trackings.length - openRecommendations;
      const overdueCount = trackings.filter((item) => {
        if (!item.dueDate) return false;
        const isOpen = !(
          [
            RecommendationStatus.CLOSED,
            RecommendationStatus.VERIFIED,
            RecommendationStatus.REJECTED,
          ] as RecommendationStatus[]
        ).includes(item.status);
        return isOpen && new Date(item.dueDate) < new Date();
      }).length;
      const escalationLevel3Count = trackings.filter(
        (item) => item.escalationLevel === 3,
      ).length;
      const criticalCount = trackings.filter(
        (item) => item.riskLevel === RiskLevel.CRITICAL,
      ).length;

      const snapshot = await this.prisma.executiveKpiSnapshot.create({
        data: {
          totalRecommendations: kpis.total,
          openRecommendations,
          closedRecommendations,
          overallComplianceRate: kpis.overallProgressRate,
          closureRate: kpis.closureRate,
          averageResolutionTimeDays: kpis.averageResolutionTimeDays,
          slaAdherenceRate: kpis.slaAdherenceRate,
          overdueCount,
          escalationLevel3Count,
          criticalCount,
          entityBreakdown: entityBreakdown as any,
        },
      });

      this.logger.log(
        `Executive KPI Snapshot created successfully with ID: ${snapshot.id}`,
      );
      return snapshot;
    } catch (error) {
      this.logger.error('Failed to generate daily KPI snapshot:', error.stack);
      throw error;
    }
  }

  /**
   * Returns cached Executive Summary statistics
   */
  async getExecutiveSummary(user?: any) {
    const isRestricted =
      user && user.role !== 'ADMIN' && user.role !== 'EVALUATOR';
    const cacheKey = isRestricted
      ? `EXECUTIVE_SUMMARY_USER_${user.userId}`
      : 'EXECUTIVE_SUMMARY';

    return this.getCachedData(
      cacheKey,
      this.CACHE_TTLS.EXECUTIVE_SUMMARY,
      async () => {
        const catalog = await this.calculateKpiCatalog(user);
        const breakdown = await this.getEntityBreakdown(user);

        // Fetch active campaign count
        const activeCampaigns = await this.prisma.campaign.count({
          where: { status: 'active' },
        });

        // Fetch pending inspections awaiting review
        const pendingInspections = await this.prisma.inspection.count({
          where: { status: 'pendingReview' },
        });

        // Top 5 lagging entities (lowest complianceRate)
        const laggingEntities = [...breakdown]
          .filter((e) => e.entityId !== 'unassigned')
          .sort((a, b) => a.complianceRate - b.complianceRate)
          .slice(0, 5);

        // Top 5 performing entities (highest complianceRate)
        const performingEntities = [...breakdown]
          .filter((e) => e.entityId !== 'unassigned')
          .sort((a, b) => b.complianceRate - a.complianceRate)
          .slice(0, 5);

        return {
          overallCompliance: catalog.overallProgressRate,
          closureRate: catalog.closureRate,
          averageResolutionTimeDays: catalog.averageResolutionTimeDays,
          slaAdherence: catalog.slaAdherenceRate,
          escalationVolume: catalog.escalationVolume,
          criticalOverdueRate: catalog.criticalOverdueRate,
          totalRecommendations: catalog.total,
          activeCampaigns,
          pendingInspections,
          laggingEntities,
          performingEntities,
        };
      },
    );
  }

  /**
   * Returns cached Health Analytics stats
   */
  async getHealthAnalyticsSummary(user?: any) {
    const isRestricted =
      user && user.role !== 'ADMIN' && user.role !== 'EVALUATOR';
    const cacheKey = isRestricted
      ? `HEALTH_ANALYTICS_USER_${user.userId}`
      : 'HEALTH_ANALYTICS';

    return this.getCachedData(
      cacheKey,
      this.CACHE_TTLS.HEALTH_ANALYTICS,
      async () => {
        const filter = this.getSecurityFilter(user);
        const trackings = await this.prisma.recommendationTracking.findMany({
          where: filter,
          include: { evidence: true },
        });

        const matrix = {
          EXCELLENT: 0,
          GOOD: 0,
          NEEDS_ATTENTION: 0,
          AT_RISK: 0,
          CRITICAL: 0,
        };

        const listWithScores = trackings.map((t) => {
          const score = this.healthService.calculateHealthScore(t);
          const status = this.healthService.getHealthStatus(score);
          matrix[status]++;
          return {
            id: t.id,
            recommendationNumber: t.recommendationNumber,
            score,
            status,
            progress: t.progressPercent,
          };
        });

        return {
          matrix,
          recommendations: listWithScores,
        };
      },
    );
  }

  /**
   * Returns cached Escalation statistics
   */
  async getEscalationSummary(user?: any) {
    const isRestricted =
      user && user.role !== 'ADMIN' && user.role !== 'EVALUATOR';
    const cacheKey = isRestricted
      ? `ESCALATION_SUMMARY_USER_${user.userId}`
      : 'ESCALATION_SUMMARY';

    return this.getCachedData(
      cacheKey,
      this.CACHE_TTLS.ESCALATION_SUMMARY,
      async () => {
        const filter = this.getSecurityFilter(user);
        const trackings = await this.prisma.recommendationTracking.findMany({
          where: filter,
        });

        const levels = {
          level0: trackings.filter((t) => t.escalationLevel === 0).length,
          level1: trackings.filter((t) => t.escalationLevel === 1).length,
          level2: trackings.filter((t) => t.escalationLevel === 2).length,
          level3: trackings.filter((t) => t.escalationLevel === 3).length,
        };

        // Determine driver ratio based on SLA breaches
        const breaches = await this.prisma.slaBreachLog.findMany({
          where: {
            tracking: filter,
          },
        });
        const drivers = {
          response: breaches.filter((b) => b.milestoneType === 'RESPONSE')
            .length,
          resolution: breaches.filter((b) => b.milestoneType === 'RESOLUTION')
            .length,
          closure: breaches.filter((b) => b.milestoneType === 'CLOSURE').length,
        };

        return {
          levels,
          drivers,
        };
      },
    );
  }
}
