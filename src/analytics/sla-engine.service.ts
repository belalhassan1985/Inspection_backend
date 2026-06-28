import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationStatus } from '@prisma/client';
import { NotificationService } from '../notifications/notification.service';

export interface SlaMilestoneMetrics {
  forwardingLag: number | null;
  processingLag: number | null;
  processingDuration: number | null;
  verificationDuration: number | null;
  closureDuration: number | null;
}

export interface SlaPerMilestoneStatus {
  forwarding: 'normal' | 'at_risk' | 'overdue' | null;
  processingStart: 'normal' | 'at_risk' | 'overdue' | null;
  resolution: 'normal' | 'at_risk' | 'overdue' | null;
  verification: 'normal' | 'at_risk' | 'overdue' | null;
  closure: 'normal' | 'at_risk' | 'overdue' | null;
}

export interface SlaMetricsResult {
  trackingId: string;
  recommendationNumber: string;
  status: string;
  riskLevel: string;
  dueDate: Date | null;
  milestones: SlaMilestoneMetrics;
  totalAge: number;
  overdueDays: number;
  slaPerMilestone: SlaPerMilestoneStatus;
  overallSla: 'normal' | 'at_risk' | 'overdue';
}

export interface SlaSummaryResult {
  total: number;
  normal: number;
  atRisk: number;
  overdue: number;
  avgForwardingLag: number | null;
  avgProcessingLag: number | null;
  avgProcessingDuration: number | null;
  avgVerificationDuration: number | null;
  avgClosureDuration: number | null;
  avgTotalAge: number;
  avgOverdueDays: number;
}

@Injectable()
export class SlaEngineService {
  private readonly logger = new Logger(SlaEngineService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  async calculateForOne(trackingId: string): Promise<SlaMetricsResult | null> {
    const tracking = await this.prisma.recommendationTracking.findUnique({
      where: { id: trackingId },
      include: {
        actionLogs: {
          where: { actionType: 'STATUS_CHANGE' },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!tracking) return null;

    return this.computeMetrics(tracking, tracking.actionLogs);
  }

  async calculateForAll(filter?: any): Promise<SlaMetricsResult[]> {
    const trackings = await this.prisma.recommendationTracking.findMany({
      where: filter,
      include: {
        actionLogs: {
          where: { actionType: 'STATUS_CHANGE' },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return trackings.map((t) => this.computeMetrics(t, t.actionLogs));
  }

  async getSlaSummary(filter?: any): Promise<SlaSummaryResult> {
    const allMetrics = await this.calculateForAll(filter);
    const total = allMetrics.length;

    if (total === 0) {
      return {
        total: 0,
        normal: 0,
        atRisk: 0,
        overdue: 0,
        avgForwardingLag: null,
        avgProcessingLag: null,
        avgProcessingDuration: null,
        avgVerificationDuration: null,
        avgClosureDuration: null,
        avgTotalAge: 0,
        avgOverdueDays: 0,
      };
    }

    const normal = allMetrics.filter((m) => m.overallSla === 'normal').length;
    const atRisk = allMetrics.filter((m) => m.overallSla === 'at_risk').length;
    const overdue = allMetrics.filter((m) => m.overallSla === 'overdue').length;

    const totalAgeSum = allMetrics.reduce((s, m) => s + m.totalAge, 0);
    const overdueDaysSum = allMetrics.reduce((s, m) => s + m.overdueDays, 0);

    const avgFromList = (
      extract: (m: SlaMetricsResult) => number | null,
    ): number | null => {
      const values = allMetrics.map(extract).filter((v) => v !== null);
      if (values.length === 0) return null;
      return Number(
        (values.reduce((s, v) => s + v, 0) / values.length).toFixed(1),
      );
    };

    return {
      total,
      normal,
      atRisk,
      overdue,
      avgForwardingLag: avgFromList((m) => m.milestones.forwardingLag),
      avgProcessingLag: avgFromList((m) => m.milestones.processingLag),
      avgProcessingDuration: avgFromList(
        (m) => m.milestones.processingDuration,
      ),
      avgVerificationDuration: avgFromList(
        (m) => m.milestones.verificationDuration,
      ),
      avgClosureDuration: avgFromList((m) => m.milestones.closureDuration),
      avgTotalAge: Number((totalAgeSum / total).toFixed(1)),
      avgOverdueDays: Number((overdueDaysSum / total).toFixed(1)),
    };
  }

  async checkAndLogBreaches(): Promise<{
    response: number;
    resolution: number;
    closure: number;
    newBreaches: number;
    skippedBreaches: number;
    totalScanned: number;
  }> {
    this.logger.log('SLA Engine: scan started...');
    const allMetrics = await this.calculateForAll();
    const totalScanned = allMetrics.length;
    this.logger.log(`SLA Engine: total scanned: ${totalScanned}`);

    // Collect all breach candidates
    interface BreachCandidate {
      trackingId: string;
      milestoneType: 'RESPONSE' | 'RESOLUTION' | 'CLOSURE';
      durationDays: number;
    }

    const candidates: BreachCandidate[] = [];
    let responseBreaches = 0;
    let resolutionBreaches = 0;
    let closureBreaches = 0;

    for (const metrics of allMetrics) {
      if (metrics.overallSla === 'normal') continue;

      if (metrics.slaPerMilestone.forwarding === 'overdue') {
        candidates.push({
          trackingId: metrics.trackingId,
          milestoneType: 'RESPONSE',
          durationDays: metrics.milestones.forwardingLag ?? metrics.totalAge,
        });
        responseBreaches++;
      }

      if (
        metrics.slaPerMilestone.resolution === 'overdue' &&
        metrics.overdueDays > 0
      ) {
        candidates.push({
          trackingId: metrics.trackingId,
          milestoneType: 'RESOLUTION',
          durationDays: metrics.overdueDays,
        });
        resolutionBreaches++;
      }

      if (metrics.slaPerMilestone.verification === 'overdue') {
        candidates.push({
          trackingId: metrics.trackingId,
          milestoneType: 'CLOSURE',
          durationDays: metrics.milestones.verificationDuration ?? 0,
        });
        closureBreaches++;
      } else if (metrics.slaPerMilestone.closure === 'overdue') {
        candidates.push({
          trackingId: metrics.trackingId,
          milestoneType: 'CLOSURE',
          durationDays: metrics.milestones.closureDuration ?? 0,
        });
        closureBreaches++;
      }
    }

    // Fetch all existing breaches matching candidate trackingIds in one query
    const candidateTrackingIds = [
      ...new Set(candidates.map((c) => c.trackingId)),
    ];
    const existingBreaches =
      candidateTrackingIds.length > 0
        ? await this.prisma.slaBreachLog.findMany({
            where: { trackingId: { in: candidateTrackingIds } },
          })
        : [];

    // Build a Set key for O(1) lookup: "trackingId|milestoneType"
    const existingKeySet = new Set(
      existingBreaches.map((b) => `${b.trackingId}|${b.milestoneType}`),
    );

    let newBreaches = 0;
    let skippedBreaches = 0;

    for (const candidate of candidates) {
      const key = `${candidate.trackingId}|${candidate.milestoneType}`;
      if (existingKeySet.has(key)) {
        // Update existing breach duration
        const existing = existingBreaches.find(
          (b) =>
            b.trackingId === candidate.trackingId &&
            b.milestoneType === candidate.milestoneType,
        );
        if (existing) {
          await this.prisma.slaBreachLog.update({
            where: { id: existing.id },
            data: { breachDurationDays: candidate.durationDays },
          });
        }
        skippedBreaches++;
        existingKeySet.delete(key);
      } else {
        await this.prisma.slaBreachLog.create({
          data: {
            trackingId: candidate.trackingId,
            milestoneType: candidate.milestoneType,
            breachDurationDays: candidate.durationDays,
          },
        });
        newBreaches++;
      }
    }

    this.logger.log(
      `SLA Engine: scan completed. Total scanned: ${totalScanned}, New breaches: ${newBreaches}, Existing skipped: ${skippedBreaches}`,
    );

    return {
      response: responseBreaches,
      resolution: resolutionBreaches,
      closure: closureBreaches,
      newBreaches,
      skippedBreaches,
      totalScanned,
    };
  }

  @Cron('0 2 * * *')
  async dailySlaCheck() {
    this.logger.log('SLA Engine: daily SLA breach check triggered (02:00)...');
    const result = await this.checkAndLogBreaches();
    await this.createSlaNotifications();
    this.logger.log(
      `SLA Engine: daily scan complete. Response: ${result.response}, Resolution: ${result.resolution}, Closure: ${result.closure}`,
    );
  }

  async createSlaNotifications(): Promise<{ created: number }> {
    const allMetrics = await this.calculateForAll();
    const atRiskOrOverdue = allMetrics.filter((m) => m.overallSla !== 'normal');

    let created = 0;

    for (const metrics of atRiskOrOverdue) {
      // Fetch tracking for user/campaign info
      const tracking = await this.prisma.recommendationTracking.findUnique({
        where: { id: metrics.trackingId },
        select: {
          id: true,
          recommendationNumber: true,
          assignedUserId: true,
          campaignId: true,
        },
      });

      if (!tracking) continue;

      // Get campaign leader/deputy
      let campaignLeaderId: string | null = null;
      let campaignDeputyId: string | null = null;
      if (tracking.campaignId) {
        const campaign = await this.prisma.campaign.findUnique({
          where: { id: tracking.campaignId },
          select: { leaderId: true, deputyId: true },
        });
        if (campaign) {
          campaignLeaderId = campaign.leaderId;
          campaignDeputyId = campaign.deputyId;
        }
      }

      const targetUserIds = new Set<string>();
      if (tracking.assignedUserId) targetUserIds.add(tracking.assignedUserId);
      if (campaignLeaderId) targetUserIds.add(campaignLeaderId);
      if (campaignDeputyId && campaignDeputyId !== campaignLeaderId)
        targetUserIds.add(campaignDeputyId);

      // Process each milestone
      const milestoneMap: Record<
        string,
        { status: 'normal' | 'at_risk' | 'overdue' | null; label: string }
      > = {
        forwarding: {
          status: metrics.slaPerMilestone.forwarding,
          label: 'مرحلة التوجيه',
        },
        processingStart: {
          status: metrics.slaPerMilestone.processingStart,
          label: 'مرحلة بدء المعالجة',
        },
        resolution: {
          status: metrics.slaPerMilestone.resolution,
          label: 'مرحلة الإنجاز',
        },
        verification: {
          status: metrics.slaPerMilestone.verification,
          label: 'مرحلة التحقق',
        },
        closure: {
          status: metrics.slaPerMilestone.closure,
          label: 'مرحلة الإغلاق',
        },
      };

      for (const [milestoneType, info] of Object.entries(milestoneMap)) {
        if (!info.status || info.status === 'normal') continue;

        const isOverdue = info.status === 'overdue';
        const notifType = isOverdue ? 'SLA_OVERDUE' : 'SLA_AT_RISK';
        const severity = isOverdue ? 'CRITICAL' : 'WARNING';

        // Dedup check
        const alreadySent =
          await this.notificationService.hasExistingSlaNotification(
            tracking.id,
            notifType,
            milestoneType,
          );
        if (alreadySent) continue;

        const title = isOverdue
          ? `تجاوز المهلة الزمنية للتوصية ${tracking.recommendationNumber}`
          : `تنبيه: اقتراب المهلة الزمنية للتوصية ${tracking.recommendationNumber}`;

        const message = isOverdue
          ? `تم تجاوز المهلة المحددة لـ ${info.label} للتوصية الرقابية رقم ${tracking.recommendationNumber}.`
          : `يقترب موعد انتهاء المهلة المحددة لـ ${info.label} للتوصية الرقابية رقم ${tracking.recommendationNumber}.`;

        for (const userId of targetUserIds) {
          const result = await this.notificationService.create({
            userId,
            type: notifType,
            severity,
            title,
            message,
            link: `/recommendations/tracking/${tracking.id}`,
            trackingId: tracking.id,
            metadata: { milestoneType, status: info.status },
          });
          if (result) created++;
        }
      }
    }

    this.logger.log(`SLA Engine: ${created} SLA notifications created`);
    return { created };
  }

  private computeMetrics(tracking: any, logs: any[]): SlaMetricsResult {
    const now = new Date();
    const issuedDate = new Date(tracking.issuedAt);
    const dueDate = tracking.dueDate ? new Date(tracking.dueDate) : null;

    // Extract first occurrence of each status milestone from ActionLog
    const firstStatusDate = (status: string): Date | null => {
      const entry = logs.find((l: any) => l.toStatus === status);
      return entry ? new Date(entry.createdAt) : null;
    };

    const forwardedDate = firstStatusDate('FORWARDED');
    const processingDate = firstStatusDate('UNDER_PROCESSING');
    const completedDate = firstStatusDate('COMPLETED');
    const verifiedDate = firstStatusDate('VERIFIED');
    const closedDate = firstStatusDate('CLOSED');
    const rejectedDate = firstStatusDate('REJECTED');

    // Use rejection date as effective end date for REJECTED
    const effectiveEndDate =
      tracking.status === RecommendationStatus.REJECTED && rejectedDate
        ? rejectedDate
        : tracking.status === RecommendationStatus.CLOSED && closedDate
          ? closedDate
          : tracking.status === RecommendationStatus.VERIFIED && verifiedDate
            ? verifiedDate
            : null;

    const diffDays = (d1: Date | null, d2: Date | null): number | null => {
      if (!d1 || !d2) return null;
      return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
    };

    const daysSince = (date: Date | null): number | null => {
      if (!date) return null;
      return Math.round(
        (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
      );
    };

    // Time-based durations (from completed milestones)
    const forwardingLag = diffDays(issuedDate, forwardedDate);
    const processingLag = diffDays(forwardedDate, processingDate);
    const processingDuration = diffDays(processingDate, completedDate);
    const verificationDuration = diffDays(completedDate, verifiedDate);
    const closureDuration = diffDays(verifiedDate, closedDate);

    // Total age: from issued to effective end (for closed/rejected) or now
    const totalAge = effectiveEndDate
      ? diffDays(issuedDate, effectiveEndDate)!
      : daysSince(issuedDate)!;

    // Overdue days: past dueDate and not in a final resolved state
    const isFinalState = [
      RecommendationStatus.CLOSED,
      RecommendationStatus.VERIFIED,
      RecommendationStatus.REJECTED,
    ].includes(tracking.status);
    const overdueDays =
      dueDate && !isFinalState && now > dueDate
        ? Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

    // ── Assess SLA per milestone ──
    const assess = (
      duration: number | null,
      normalThresh: number,
      atRiskThresh: number,
    ): 'normal' | 'at_risk' | 'overdue' | null => {
      if (duration === null) return null;
      if (duration > atRiskThresh) return 'overdue';
      if (duration > normalThresh) return 'at_risk';
      return 'normal';
    };

    // forwarding: completed or waiting
    let forwarding: 'normal' | 'at_risk' | 'overdue' | null = null;
    if (forwardedDate) {
      forwarding = assess(forwardingLag, 5, 7);
    } else if (tracking.status === RecommendationStatus.ISSUED) {
      forwarding = assess(daysSince(issuedDate), 5, 7);
    }

    // processingStart: completed or waiting
    let processingStart: 'normal' | 'at_risk' | 'overdue' | null = null;
    if (processingDate && forwardedDate) {
      processingStart = assess(processingLag, 3, 5);
    } else if (
      tracking.status === RecommendationStatus.FORWARDED &&
      forwardedDate
    ) {
      processingStart = assess(daysSince(forwardedDate), 3, 5);
    }

    // resolution: based on dueDate
    let resolution: 'normal' | 'at_risk' | 'overdue' | null = null;
    if (isFinalState) {
      resolution = 'normal';
    } else if (dueDate) {
      const daysUntilDue = Math.round(
        (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysUntilDue < 0) {
        resolution = 'overdue';
      } else if (daysUntilDue <= 7) {
        resolution = 'at_risk';
      } else {
        resolution = 'normal';
      }
    }

    // verification: completed or waiting
    let verification: 'normal' | 'at_risk' | 'overdue' | null = null;
    if (verifiedDate) {
      verification = assess(verificationDuration, 5, 7);
    } else if (
      tracking.status === RecommendationStatus.COMPLETED &&
      completedDate
    ) {
      verification = assess(daysSince(completedDate), 5, 7);
    }

    // closure: completed or waiting
    let closure: 'normal' | 'at_risk' | 'overdue' | null = null;
    if (closedDate) {
      closure = assess(closureDuration, 3, 5);
    } else if (
      tracking.status === RecommendationStatus.VERIFIED &&
      verifiedDate
    ) {
      closure = assess(daysSince(verifiedDate), 3, 5);
    }

    // ── Overall SLA ──
    const allStatuses = [
      forwarding,
      processingStart,
      resolution,
      verification,
      closure,
    ].filter((s) => s !== null);

    let overallSla: 'normal' | 'at_risk' | 'overdue';
    if (allStatuses.some((s) => s === 'overdue')) {
      overallSla = 'overdue';
    } else if (allStatuses.some((s) => s === 'at_risk')) {
      overallSla = 'at_risk';
    } else {
      overallSla = 'normal';
    }

    return {
      trackingId: tracking.id,
      recommendationNumber: tracking.recommendationNumber,
      status: tracking.status,
      riskLevel: tracking.riskLevel,
      dueDate: tracking.dueDate,
      milestones: {
        forwardingLag,
        processingLag,
        processingDuration,
        verificationDuration,
        closureDuration,
      },
      totalAge,
      overdueDays,
      slaPerMilestone: {
        forwarding,
        processingStart,
        resolution,
        verification,
        closure,
      },
      overallSla,
    };
  }
}
