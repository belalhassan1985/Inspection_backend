import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getExecutiveSummary() {
    // 1. التقييم الأمني العام للوزارة (متوسط الزيارات المعتمدة)
    const approvedAvg = await this.prisma.inspection.aggregate({
      _avg: { totalScore: true },
      where: { status: 'approved' },
    });
    const overallCompliance = approvedAvg._avg.totalScore 
      ? Number(Number(approvedAvg._avg.totalScore).toFixed(2)) 
      : 0;

    // 2. الحملات التفتيشية النشطة
    const activeCampaigns = await this.prisma.campaign.count({
      where: { status: 'active' },
    });

    // 3. معدل الشواغر القيادية العسكرية
    const totalPositions = await this.prisma.entityPosition.count();
    const vacantPositions = await this.prisma.entityPosition.count({
      where: {
        OR: [
          { positionStatus: 'vacant' },
          { positionHolder: '' },
          { isActive: false },
        ],
      },
    });
    const commandDeficitRate = totalPositions > 0 
      ? Number(((vacantPositions / totalPositions) * 100).toFixed(2)) 
      : 0;

    // 4. التفتيشات المعلقة بانتظار الاعتماد
    const pendingInspections = await this.prisma.inspection.count({
      where: { status: 'pendingReview' },
    });

    // 5. التوصيات: المفتوحة والمغلقة وأعلى الجهات تكراراً
    const totalRecommendations = await this.prisma.campaignRecommendation.count({
      where: { campaign: { status: 'active' } },
    });

    const openRecommendations = await this.prisma.campaignRecommendation.count({
      where: { campaign: { status: 'active' } },
    });

    const closedRecommendations = await this.prisma.campaignRecommendation.count({
      where: { campaign: { NOT: { status: 'active' } } },
    });

    const topAuthoritiesGrouped = await this.prisma.campaignRecommendation.groupBy({
      by: ['authorityName'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const topAuthorities = topAuthoritiesGrouped.map((item) => ({
      authorityName: item.authorityName || 'جهة غير محددة',
      count: item._count.id,
    }));

    // 6. معدل الامتثال البشري العام (Human Integration Rate)
    const occupiedPositions = await this.prisma.entityPosition.count({
      where: {
        OR: [
          { positionStatus: { in: ['اصالة', 'وكالة'] } },
          { positionHolder: { not: '' } },
        ],
      },
    });
    const humanIntegrationRate = totalPositions > 0 
      ? Number(((occupiedPositions / totalPositions) * 100).toFixed(2)) 
      : 0;

    // 7. معدل جاهزية العجلات من الجداول الديناميكية
    const grades = await this.prisma.inspectionGrade.findMany();
    let totalWorking = 0;
    let totalBroken = 0;
    for (const g of grades) {
      const data = g.quantitativeData;
      if (data && Array.isArray(data)) {
        for (const row of data) {
          if (row && typeof row === 'object') {
            const workingVal = Number((row as any).working);
            const brokenVal = Number((row as any).broken);
            if (!isNaN(workingVal) && !isNaN(brokenVal)) {
              totalWorking += workingVal;
              totalBroken += brokenVal;
            }
          }
        }
      }
    }
    const vehicleReadinessRate = (totalWorking + totalBroken) > 0 
      ? Number(((totalWorking / (totalWorking + totalBroken)) * 100).toFixed(2)) 
      : 85.0; // قيمة افتراضية في حال عدم توفر سجلات

    // 8. أفضل وأسوأ التشكيلات أداءً
    const approvedInspections = await this.prisma.inspection.findMany({
      where: { status: 'approved' },
      orderBy: { totalScore: 'desc' },
      include: {
        entity: {
          include: {
            positions: {
              where: { isActive: true },
            },
          },
        },
      },
    });

    const findCommander = (positions: any[]) => {
      if (!positions || positions.length === 0) return { rank: '', name: 'غير محدد' };
      const cmdKeywords = ['مدير', 'آمر', 'قائد', 'رئيس'];
      const commander = positions.find((pos) =>
        cmdKeywords.some((keyword) => pos.positionName.includes(keyword)),
      );
      const chosen = commander || positions[0];
      return {
        rank: chosen.rank || '',
        name: chosen.positionHolder || 'شاغر',
      };
    };

    let best = null;
    let worst = null;

    if (approvedInspections.length > 0) {
      const bestInsp = approvedInspections[0];
      const bestCmd = findCommander(bestInsp.entity.positions);
      best = {
        entityName: bestInsp.entity.name,
        score: Number(bestInsp.totalScore),
        leaderRank: bestCmd.rank,
        leaderName: bestCmd.name,
      };

      if (approvedInspections.length > 1) {
        const worstInsp = approvedInspections[approvedInspections.length - 1];
        const worstCmd = findCommander(worstInsp.entity.positions);
        worst = {
          entityName: worstInsp.entity.name,
          score: Number(worstInsp.totalScore),
          leaderRank: worstCmd.rank,
          leaderName: worstCmd.name,
        };
      }
    }

    // 9. أداء القطاعات الأمنية (مجمع حسب الكيان الأعلى المستوى 1)
    const allEntities = await this.prisma.entity.findMany();
    const entityMap = new Map<string, any>();
    for (const ent of allEntities) {
      entityMap.set(ent.id, ent);
    }

    const getLevel1AncestorName = (entityId: string): string => {
      let current = entityMap.get(entityId);
      while (current) {
        if (current.level === 'LEVEL_1') {
          return current.name;
        }
        if (!current.parentId) break;
        current = entityMap.get(current.parentId);
      }
      const fallback = entityMap.get(entityId);
      return fallback ? fallback.name : 'الشرطة المحلية';
    };

    const sectorMap = new Map<string, { sum: number; count: number }>();
    const allApprovedInspections = await this.prisma.inspection.findMany({
      where: { status: 'approved' },
    });

    for (const insp of allApprovedInspections) {
      const sectorName = getLevel1AncestorName(insp.entityId);
      const score = Number(insp.totalScore || 0);
      const existing = sectorMap.get(sectorName) || { sum: 0, count: 0 };
      sectorMap.set(sectorName, {
        sum: existing.sum + score,
        count: existing.count + 1,
      });
    }

    const sectorPerformance: { entityName: string; averageScore: number }[] = [];
    sectorMap.forEach((val, key) => {
      sectorPerformance.push({
        entityName: key,
        averageScore: Number((val.sum / val.count).toFixed(2)),
      });
    });

    // 10. تصنيف مخاطر الكيانات (Risk Entities) - محاسب بالكامل بالباك إند
    const latestApprovedInspectionsMap = new Map<string, any>();
    for (const insp of approvedInspections) {
      if (!latestApprovedInspectionsMap.has(insp.entityId)) {
        latestApprovedInspectionsMap.set(insp.entityId, insp);
      }
    }

    const red = [];
    const yellow = [];
    const green = [];

    for (const insp of latestApprovedInspectionsMap.values()) {
      const score = Number(insp.totalScore || 0);
      const cmd = findCommander(insp.entity.positions);
      const item = {
        entityName: insp.entity.name,
        score: score,
        leaderRank: cmd.rank,
        leaderName: cmd.name,
      };
      if (score < 50) {
        red.push(item);
      } else if (score < 80) {
        yellow.push(item);
      } else {
        green.push(item);
      }
    }

    // 11. سجل النزاهة والتدقيق الأمني (أحدث 10 سجلات)
    const logs = await this.prisma.systemAuditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 10,
    });

    const recentIntegrityLogs = logs.map((log) => ({
      id: Number(log.id),
      username: log.username,
      actionType: log.actionType,
      timestamp: log.timestamp,
      details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details,
    }));

    return {
      kpis: {
        overallCompliance,
        activeCampaigns,
        commandDeficitRate,
        pendingInspections,
        totalRecommendations,
        humanIntegrationRate,
        vehicleReadinessRate,
      },
      recommendations: {
        open: openRecommendations,
        closed: closedRecommendations,
        topAuthorities,
      },
      performanceLeaders: {
        best,
        worst,
      },
      sectorPerformance,
      riskEntities: {
        red,
        yellow,
        green,
      },
      recentIntegrityLogs,
    };
  }
}
