import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  WORKLOAD_WEIGHTS,
  calculateDaysOnDuty,
  calculateDutyDurationWeight,
  getWorkloadLevel,
  computeWorkloadScore,
  DutyWeight,
} from './workload-formula';

@Injectable()
export class InspectorWorkloadService {
  constructor(private prisma: PrismaService) {}

  private async buildInspectorWorkloadRows() {
    const inspectors = await this.prisma.inspector.findMany({
      where: { isActive: true },
      include: {
        campaignMembers: {
          include: {
            campaign: {
              select: {
                id: true,
                name: true,
                status: true,
                entityId: true,
                startDate: true,
                endDate: true,
              },
            },
          },
        },
      },
    });

    const activeCampaignIds = new Set<string>();
    for (const insp of inspectors) {
      for (const cm of insp.campaignMembers) {
        if (cm.campaign.status === 'active')
          activeCampaignIds.add(cm.campaign.id);
      }
    }
    const campaignIdArray = [...activeCampaignIds];

    const [inspectionCounts, recCounts, actionLogCounts, entityMap] =
      await Promise.all([
        this.getInspectionCountsByCampaign(campaignIdArray),
        this.getOpenRecommendationCountsByCampaign(campaignIdArray),
        this.getActionLogCountsByCampaign(campaignIdArray),
        this.getEntityMap(),
      ]);

    return inspectors.map((insp) => {
      const activeMemberships = insp.campaignMembers.filter(
        (cm) => cm.campaign.status === 'active',
      );
      const totalCampaignIds = new Set(
        activeMemberships.map((cm) => cm.campaign.id),
      );

      let leaderCount = 0;
      let deputyCount = 0;
      let memberCount = 0;
      for (const cm of activeMemberships) {
        if (cm.role === 'LEADER') leaderCount++;
        else if (cm.role === 'DEPUTY') deputyCount++;
        else memberCount++;
      }
      const totalParticipation = leaderCount + deputyCount + memberCount;

      let inspectionSum = 0;
      let openRecSum = 0;
      let actionLogSum = 0;
      for (const cid of totalCampaignIds) {
        inspectionSum += inspectionCounts.get(cid) || 0;
        openRecSum += recCounts.get(cid) || 0;
        actionLogSum += actionLogCounts.get(cid) || 0;
      }

      const duties: DutyWeight[] = [...totalCampaignIds].map((cid) => {
        const cm = activeMemberships.find((m) => m.campaign.id === cid);
        const campaign = cm!.campaign;
        const role: 'LEADER' | 'DEPUTY' | 'MEMBER' = cm!.role;
        const entity = entityMap.get(campaign.entityId || '');
        const daysOnDuty = calculateDaysOnDuty(campaign.startDate);

        const roleWeightMap: Record<string, number> = {
          LEADER: WORKLOAD_WEIGHTS.CAMPAIGN_LEADER,
          DEPUTY: WORKLOAD_WEIGHTS.CAMPAIGN_DEPUTY,
          MEMBER: WORKLOAD_WEIGHTS.CAMPAIGN_MEMBER,
        };
        const baseWeight = roleWeightMap[role];
        const durationWeight = calculateDutyDurationWeight(
          daysOnDuty,
          baseWeight,
        );

        return {
          campaignId: campaign.id,
          campaignName: campaign.name,
          entityName: entity?.name || '—',
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          daysOnDuty,
          role,
          baseWeight,
          durationWeight,
        };
      });

      duties.sort((a, b) => b.daysOnDuty - a.daysOnDuty);

      const workloadScore = computeWorkloadScore({
        duties: duties.map((d) => ({
          role: d.role,
          daysOnDuty: d.daysOnDuty,
          baseWeight: d.baseWeight,
        })),
        inspectionSum,
        openRecSum,
      });

      const workloadLevel = getWorkloadLevel(workloadScore);

      const leaderWeighted = duties
        .filter((d) => d.role === 'LEADER')
        .reduce((s, d) => s + d.durationWeight, 0);
      const deputyWeighted = duties
        .filter((d) => d.role === 'DEPUTY')
        .reduce((s, d) => s + d.durationWeight, 0);
      const memberWeighted = duties
        .filter((d) => d.role === 'MEMBER')
        .reduce((s, d) => s + d.durationWeight, 0);

      return {
        inspectorId: insp.id,
        fullName: insp.fullName,
        department: insp.department,
        isActive: insp.isActive,
        workloadScore: Math.round(workloadScore * 10) / 10,
        workloadLevel,
        leaderCount,
        deputyCount,
        memberCount,
        totalParticipation,
        inspectionCount: inspectionSum,
        openRecommendationCount: openRecSum,
        actionLogCount: actionLogSum,
        leaderWeighted: Math.round(leaderWeighted * 10) / 10,
        deputyWeighted: Math.round(deputyWeighted * 10) / 10,
        memberWeighted: Math.round(memberWeighted * 10) / 10,
        duties,
      };
    });
  }

  private async getInspectionCountsByCampaign(
    campaignIds: string[],
  ): Promise<Map<string, number>> {
    if (campaignIds.length === 0) return new Map();
    const rows = await this.prisma.inspection.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: campaignIds }, status: { not: 'cancelled' } },
      _count: { id: true },
    });
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.campaignId, r._count.id);
    return map;
  }

  private async getOpenRecommendationCountsByCampaign(
    campaignIds: string[],
  ): Promise<Map<string, number>> {
    if (campaignIds.length === 0) return new Map();
    const rows = await this.prisma.recommendationTracking.groupBy({
      by: ['campaignId'],
      where: {
        campaignId: { in: campaignIds },
        status: { notIn: ['CLOSED', 'COMPLETED', 'VERIFIED'] },
      },
      _count: { id: true },
    });
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.campaignId, r._count.id);
    return map;
  }

  private async getActionLogCountsByCampaign(
    campaignIds: string[],
  ): Promise<Map<string, number>> {
    if (campaignIds.length === 0) return new Map();
    const rows = await this.prisma.recommendationActionLog.findMany({
      where: { tracking: { campaignId: { in: campaignIds } } },
      include: { tracking: { select: { campaignId: true } } },
    });
    const map = new Map<string, number>();
    for (const r of rows) {
      const cid = r.tracking.campaignId;
      map.set(cid, (map.get(cid) || 0) + 1);
    }
    return map;
  }

  private async getEntityMap(): Promise<
    Map<string, { id: string; name: string }>
  > {
    const entities = await this.prisma.entity.findMany({
      select: { id: true, name: true },
    });
    const map = new Map<string, { id: string; name: string }>();
    for (const e of entities) map.set(e.id, e);
    return map;
  }

  async takeSnapshot() {
    const rows = await this.buildInspectorWorkloadRows();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const data = rows.map((r) => ({
      inspectorId: r.inspectorId,
      score: r.workloadScore,
      level: r.workloadLevel,
      leaderCount: r.leaderCount,
      deputyCount: r.deputyCount,
      memberCount: r.memberCount,
      leaderWeighted: r.leaderWeighted,
      deputyWeighted: r.deputyWeighted,
      memberWeighted: r.memberWeighted,
      inspectionSum: r.inspectionCount,
      openRecSum: r.openRecommendationCount,
      snapshotDate: today,
    }));

    await this.prisma.$transaction(
      data.map((d) =>
        this.prisma.workloadSnapshot.upsert({
          where: {
            inspectorId_snapshotDate: {
              inspectorId: d.inspectorId,
              snapshotDate: d.snapshotDate,
            },
          },
          update: d,
          create: {
            id: undefined,
            ...d,
          },
        }),
      ),
    );

    return { snapshotCount: data.length, snapshotDate: today };
  }

  async getHistory(inspectorId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const snapshots = await this.prisma.workloadSnapshot.findMany({
      where: {
        inspectorId,
        snapshotDate: { gte: since },
      },
      orderBy: { snapshotDate: 'asc' },
      select: {
        score: true,
        level: true,
        leaderWeighted: true,
        deputyWeighted: true,
        memberWeighted: true,
        inspectionSum: true,
        openRecSum: true,
        snapshotDate: true,
      },
    });

    return snapshots;
  }

  async getSummary() {
    const rows = await this.buildInspectorWorkloadRows();
    const distribution: Record<string, number> = {
      FREE: 0,
      LIGHT: 0,
      NORMAL: 0,
      HEAVY: 0,
      OVERLOADED: 0,
    };
    let totalScore = 0;
    const deptStats = new Map<
      string,
      { count: number; scoreSum: number; heavyOver: number }
    >();

    for (const r of rows) {
      distribution[r.workloadLevel] = (distribution[r.workloadLevel] || 0) + 1;
      totalScore += r.workloadScore;
      const dept = r.department || 'غير محدد';
      if (!deptStats.has(dept))
        deptStats.set(dept, { count: 0, scoreSum: 0, heavyOver: 0 });
      const d = deptStats.get(dept)!;
      d.count++;
      d.scoreSum += r.workloadScore;
      if (r.workloadLevel === 'HEAVY' || r.workloadLevel === 'OVERLOADED')
        d.heavyOver++;
    }

    const departmentStats = [...deptStats.entries()]
      .map(([name, s]) => ({
        department: name,
        inspectorCount: s.count,
        avgWorkload: Math.round((s.scoreSum / s.count) * 10) / 10,
        heavyOverloadedCount: s.heavyOver,
      }))
      .sort((a, b) => b.inspectorCount - a.inspectorCount);

    return {
      distribution,
      totalInspectors: rows.length,
      avgWorkloadScore:
        rows.length > 0 ? Math.round((totalScore / rows.length) * 10) / 10 : 0,
      avgWorkloadLevel:
        rows.length > 0 ? getWorkloadLevel(totalScore / rows.length) : 'FREE',
      departmentStats,
    };
  }

  async getList(department?: string) {
    let rows = await this.buildInspectorWorkloadRows();
    if (department) {
      rows = rows.filter((r) => r.department === department);
    }
    rows.sort((a, b) => b.workloadScore - a.workloadScore);
    return rows.map((r) => ({
      inspectorId: r.inspectorId,
      fullName: r.fullName,
      department: r.department,
      isActive: r.isActive,
      workloadScore: r.workloadScore,
      workloadLevel: r.workloadLevel,
      leaderCount: r.leaderCount,
      deputyCount: r.deputyCount,
      memberCount: r.memberCount,
      totalParticipation: r.totalParticipation,
      inspectionCount: r.inspectionCount,
      openRecommendationCount: r.openRecommendationCount,
      actionLogCount: r.actionLogCount,
      leaderWeighted: r.leaderWeighted,
      deputyWeighted: r.deputyWeighted,
      memberWeighted: r.memberWeighted,
    }));
  }

  async getInspectorDetail(inspectorId: string) {
    const rows = await this.buildInspectorWorkloadRows();
    const found = rows.find((r) => r.inspectorId === inspectorId);
    if (!found) return null;
    return found;
  }

  async getDutiesList(department?: string) {
    const rows = await this.buildInspectorWorkloadRows();
    const filtered = department
      ? rows.filter((r) => r.department === department)
      : rows;
    filtered.sort((a, b) => b.workloadScore - a.workloadScore);
    return filtered.map((r) => ({
      inspectorId: r.inspectorId,
      fullName: r.fullName,
      department: r.department,
      workloadScore: r.workloadScore,
      workloadLevel: r.workloadLevel,
      duties: r.duties,
    }));
  }

  async getInspectorDuties(inspectorId: string) {
    const rows = await this.buildInspectorWorkloadRows();
    const found = rows.find((r) => r.inspectorId === inspectorId);
    if (!found) return null;
    return {
      inspectorId: found.inspectorId,
      fullName: found.fullName,
      department: found.department,
      duties: found.duties,
    };
  }

  async getExcellence() {
    const rows = await this.buildInspectorWorkloadRows();

    const topLeaders = [...rows]
      .sort(
        (a, b) =>
          b.leaderCount + b.deputyCount - (a.leaderCount + a.deputyCount),
      )
      .slice(0, 10)
      .map((r) => ({
        inspectorId: r.inspectorId,
        fullName: r.fullName,
        department: r.department,
        leadershipCount: r.leaderCount + r.deputyCount,
      }));

    const topParticipants = [...rows]
      .sort((a, b) => b.totalParticipation - a.totalParticipation)
      .slice(0, 10)
      .map((r) => ({
        inspectorId: r.inspectorId,
        fullName: r.fullName,
        department: r.department,
        campaignCount: r.totalParticipation,
      }));

    const topInspections = [...rows]
      .sort((a, b) => b.inspectionCount - a.inspectionCount)
      .slice(0, 10)
      .map((r) => ({
        inspectorId: r.inspectorId,
        fullName: r.fullName,
        department: r.department,
        inspectionCount: r.inspectionCount,
      }));

    const topRecActivity = [...rows]
      .sort((a, b) => b.actionLogCount - a.actionLogCount)
      .slice(0, 10)
      .map((r) => ({
        inspectorId: r.inspectorId,
        fullName: r.fullName,
        department: r.department,
        actionLogCount: r.actionLogCount,
      }));

    return { topLeaders, topParticipants, topInspections, topRecActivity };
  }

  async getBalance() {
    const rows = await this.buildInspectorWorkloadRows();
    rows.sort((a, b) => b.workloadScore - a.workloadScore);

    const mostLoaded =
      rows.length > 0
        ? {
            inspectorId: rows[0].inspectorId,
            fullName: rows[0].fullName,
            department: rows[0].department,
            workloadScore: rows[0].workloadScore,
            workloadLevel: rows[0].workloadLevel,
            totalParticipation: rows[0].totalParticipation,
            duties: rows[0].duties,
          }
        : null;

    const leastLoaded =
      rows.length > 0
        ? {
            inspectorId: rows[rows.length - 1].inspectorId,
            fullName: rows[rows.length - 1].fullName,
            department: rows[rows.length - 1].department,
            workloadScore: rows[rows.length - 1].workloadScore,
            workloadLevel: rows[rows.length - 1].workloadLevel,
            totalParticipation: rows[rows.length - 1].totalParticipation,
            duties: rows[rows.length - 1].duties,
          }
        : null;

    const deptMap = new Map<string, { total: number; heavyOver: number }>();
    for (const r of rows) {
      const d = r.department || 'غير محدد';
      if (!deptMap.has(d)) deptMap.set(d, { total: 0, heavyOver: 0 });
      const s = deptMap.get(d)!;
      s.total++;
      if (r.workloadLevel === 'HEAVY' || r.workloadLevel === 'OVERLOADED')
        s.heavyOver++;
    }
    const departmentImbalance = [...deptMap.entries()]
      .map(([name, s]) => ({
        department: name,
        totalInspectors: s.total,
        heavyOverloadedCount: s.heavyOver,
        isBalanced: s.total === 0 ? true : s.heavyOver / s.total < 0.3,
      }))
      .sort((a, b) => b.totalInspectors - a.totalInspectors);

    return { mostLoaded, leastLoaded, departmentImbalance };
  }
}
