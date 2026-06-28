import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  WORKLOAD_WEIGHTS,
  calculateDaysOnDuty,
  calculateDutyDurationWeight,
  getWorkloadLevel,
  computeWorkloadScore,
} from '../inspector-workload/workload-formula';

const ACTIVITY_WEIGHTS: Record<string, { weight: number; max: number }> = {
  CAMPAIGN_PARTICIPATION: { weight: 3, max: 30 },
  RECOMMENDATIONS_ASSIGNED: { weight: 2, max: 20 },
  COMMENTS_ADDED: { weight: 1.5, max: 15 },
  EVIDENCE_UPLOADS: { weight: 2.5, max: 10 },
  VERIFICATION_ACTIONS: { weight: 5, max: 25 },
};

@Injectable()
export class InspectorsDirectoryService {
  constructor(private prisma: PrismaService) {}

  async getDirectory(specializationId?: number) {
    const [
      inspectors,
      campaignMemberships,
      inspectionCounts,
      openRecCounts,
      actionLogs,
      allSpecs,
    ] = await Promise.all([
      this.prisma.inspector.findMany({
        orderBy: { fullName: 'asc' },
        include: {
          primaryGroup: { select: { id: true, name: true, code: true } },
          inspectorSpecializations: {
            include: {
              specialization: {
                select: { id: true, name: true, categoryId: true },
              },
            },
            orderBy: [{ isPrimary: 'desc' }],
          },
        },
      }),
      this.prisma.campaignMember.findMany({
        select: {
          inspectorId: true,
          campaignId: true,
          role: true,
          campaign: { select: { status: true, startDate: true } },
        },
      }),
      this.prisma.inspection.groupBy({
        by: ['campaignId'],
        where: { status: { not: 'cancelled' } },
        _count: { id: true },
      }),
      this.prisma.recommendationTracking.groupBy({
        by: ['campaignId'],
        where: { status: { notIn: ['CLOSED', 'COMPLETED', 'VERIFIED'] } },
        _count: { id: true },
      }),
      this.prisma.recommendationActionLog.findMany({
        select: {
          actionType: true,
          tracking: { select: { campaignId: true } },
        },
      }),
      this.prisma.specialization.findMany({
        where: { isActive: true },
        select: { id: true, name: true, categoryId: true },
      }),
    ]);

    const inspCountByCamp = new Map(
      inspectionCounts.map((i) => [i.campaignId, i._count.id]),
    );
    const recCountByCamp = new Map(
      openRecCounts.map((r) => [r.campaignId, r._count.id]),
    );

    const actionLogsByCamp = new Map<
      string,
      { comments: number; evidence: number; statusChanges: number }
    >();
    for (const log of actionLogs) {
      const campId = log.tracking.campaignId;
      if (!actionLogsByCamp.has(campId)) {
        actionLogsByCamp.set(campId, {
          comments: 0,
          evidence: 0,
          statusChanges: 0,
        });
      }
      const e = actionLogsByCamp.get(campId)!;
      if (log.actionType === 'COMMENT') e.comments++;
      else if (log.actionType === 'EVIDENCE_UPLOAD') e.evidence++;
      else if (log.actionType === 'STATUS_CHANGE') e.statusChanges++;
    }

    const campaignDateMap = new Map<string, Date>();
    const membershipsByInsp = new Map<
      string,
      {
        campaignId: string;
        role: string;
        status: string;
        startDate: Date | null;
      }[]
    >();
    for (const m of campaignMemberships) {
      if (!campaignDateMap.has(m.campaignId) && m.campaign.startDate) {
        campaignDateMap.set(m.campaignId, m.campaign.startDate);
      }
      if (!membershipsByInsp.has(m.inspectorId))
        membershipsByInsp.set(m.inspectorId, []);
      membershipsByInsp.get(m.inspectorId)!.push({
        campaignId: m.campaignId,
        role: m.role,
        status: m.campaign.status,
        startDate: m.campaign.startDate,
      });
    }

    const result = [];

    for (const insp of inspectors) {
      const memberships = membershipsByInsp.get(insp.id) || [];
      const activeMemberships = memberships.filter(
        (m) => m.status === 'active',
      );
      const allCampaignIds = new Set(memberships.map((m) => m.campaignId));

      let leaderCount = 0;
      let deputyCount = 0;
      let memberCount = 0;

      const duties: {
        role: 'LEADER' | 'DEPUTY' | 'MEMBER';
        daysOnDuty: number;
        baseWeight: number;
      }[] = [];

      for (const m of activeMemberships) {
        const role = m.role as 'LEADER' | 'DEPUTY' | 'MEMBER';
        if (role === 'LEADER') leaderCount++;
        else if (role === 'DEPUTY') deputyCount++;
        else memberCount++;
        const daysOnDuty = m.startDate ? calculateDaysOnDuty(m.startDate) : 1;
        const roleWeightMap: Record<string, number> = {
          LEADER: WORKLOAD_WEIGHTS.CAMPAIGN_LEADER,
          DEPUTY: WORKLOAD_WEIGHTS.CAMPAIGN_DEPUTY,
          MEMBER: WORKLOAD_WEIGHTS.CAMPAIGN_MEMBER,
        };
        duties.push({ role, daysOnDuty, baseWeight: roleWeightMap[role] });
      }

      let inspectionSum = 0;
      let openRecSum = 0;
      for (const campId of allCampaignIds) {
        inspectionSum += inspCountByCamp.get(campId) || 0;
        openRecSum += recCountByCamp.get(campId) || 0;
      }

      const workloadScore = computeWorkloadScore({
        duties,
        inspectionSum,
        openRecSum,
      });
      const workloadLevel = getWorkloadLevel(workloadScore);

      let totalAssigned = 0;
      let commentsCount = 0;
      let evidenceCount = 0;
      let statusChanges = 0;
      for (const campId of allCampaignIds) {
        const al = actionLogsByCamp.get(campId);
        if (al) {
          commentsCount += al.comments;
          evidenceCount += al.evidence;
          statusChanges += al.statusChanges;
        }
        totalAssigned += recCountByCamp.get(campId) || 0;
      }

      const campaignParticipation = Math.min(
        ACTIVITY_WEIGHTS.CAMPAIGN_PARTICIPATION.max,
        allCampaignIds.size * ACTIVITY_WEIGHTS.CAMPAIGN_PARTICIPATION.weight,
      );
      const recsAssigned = Math.min(
        ACTIVITY_WEIGHTS.RECOMMENDATIONS_ASSIGNED.max,
        totalAssigned * ACTIVITY_WEIGHTS.RECOMMENDATIONS_ASSIGNED.weight,
      );
      const comments = Math.min(
        ACTIVITY_WEIGHTS.COMMENTS_ADDED.max,
        commentsCount * ACTIVITY_WEIGHTS.COMMENTS_ADDED.weight,
      );
      const evidence = Math.min(
        ACTIVITY_WEIGHTS.EVIDENCE_UPLOADS.max,
        evidenceCount * ACTIVITY_WEIGHTS.EVIDENCE_UPLOADS.weight,
      );
      const verification = Math.min(
        ACTIVITY_WEIGHTS.VERIFICATION_ACTIONS.max,
        statusChanges * ACTIVITY_WEIGHTS.VERIFICATION_ACTIONS.weight,
      );

      const activityScore = Math.round(
        campaignParticipation +
          recsAssigned +
          comments +
          evidence +
          verification,
      );

      let latestDate: Date | null = null;
      for (const campId of allCampaignIds) {
        const sd = campaignDateMap.get(campId);
        if (sd && (!latestDate || sd > latestDate)) latestDate = sd;
      }
      const lastFieldParticipationDays = latestDate
        ? Math.floor(
            (new Date().getTime() - latestDate.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : null;

      const activeDutiesCount = leaderCount + deputyCount + memberCount;

      const primarySpec = insp.inspectorSpecializations?.find(
        (s) => s.isPrimary,
      );
      const allSpecsList =
        insp.inspectorSpecializations?.map((s) => ({
          id: s.specialization.id,
          name: s.specialization.name,
          categoryId: s.specialization.categoryId,
          proficiencyLevel: s.proficiencyLevel,
          isPrimary: s.isPrimary,
        })) || [];

      result.push({
        id: insp.id,
        fullName: insp.fullName,
        rank: insp.rank,
        photoUrl: insp.photoUrl,
        department: insp.department,
        isActive: insp.isActive,
        availabilityStatus: insp.availabilityStatus,
        availabilityReason: insp.availabilityReason,
        availabilityUntil: insp.availabilityUntil,
        primaryGroup: insp.primaryGroup,
        activityScore,
        workloadScore: Math.round(workloadScore * 10) / 10,
        workloadLevel,
        activeDutiesCount,
        lastFieldParticipationDays,
        primarySpecialization: primarySpec
          ? {
              id: primarySpec.specialization.id,
              name: primarySpec.specialization.name,
            }
          : null,
        specializations: allSpecsList,
        _allSpecializations: allSpecsList.map((s) => s.id),
      });
    }

    // Server-side specialization filter
    if (specializationId) {
      return result.filter((r) =>
        r._allSpecializations?.includes(specializationId),
      );
    }
    return result;
  }
}
