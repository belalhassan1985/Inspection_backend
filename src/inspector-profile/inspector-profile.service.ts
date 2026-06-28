import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
  WORKLOAD_WEIGHTS,
  calculateDaysOnDuty,
  calculateDutyDurationWeight,
  getWorkloadLevel,
  computeWorkloadScore,
} from '../inspector-workload/workload-formula';

const ACTIVITY_WEIGHTS = {
  CAMPAIGN_PARTICIPATION: { weight: 30, unitPoints: 3, max: 30 },
  RECOMMENDATIONS_ASSIGNED: { weight: 20, unitPoints: 2, max: 20 },
  COMMENTS_ADDED: { weight: 15, unitPoints: 1.5, max: 15 },
  EVIDENCE_UPLOADS: { weight: 10, unitPoints: 2.5, max: 10 },
  VERIFICATION_ACTIONS: { weight: 15, unitPoints: 5, max: 15 },
  CLOSURE_ACTIONS: { weight: 10, unitPoints: 5, max: 10 },
};

const PHOTO_DIR = './uploads/inspector-photos';

@Injectable()
export class InspectorProfileService {
  constructor(private prisma: PrismaService) {}

  async getProfile(id: string) {
    const inspector = await this.prisma.inspector.findUnique({
      where: { id },
      include: {
        primaryGroup: true,
        groupMemberships: { include: { group: true } },
        assignmentMemberships: { include: { assignment: true } },
        campaignMembers: {
          include: {
            campaign: { include: { entity: true } },
          },
          orderBy: { campaign: { startDate: 'desc' } },
        },
      },
    });

    if (!inspector) {
      throw new NotFoundException('المفتش غير موجود');
    }

    const workloadData = await this.calculateWorkload(id);
    const activityScore = await this.calculateActivityScore(id);
    const campaignSummary = this.buildCampaignSummary(inspector);
    const recommendationStats = await this.buildRecommendationStats(id);
    const lastFieldParticipation =
      this.calculateLastFieldParticipation(inspector);

    const groups = inspector.groupMemberships.map((gm) => ({
      id: gm.group.id,
      name: gm.group.name,
      roleInGroup: gm.roleInGroup,
      isLeader: gm.isLeader,
      memberOrder: gm.memberOrder,
      sourceRawName: gm.sourceRawName,
      isPrimary: inspector.primaryGroupId === gm.group.id,
    }));

    const assignments = inspector.assignmentMemberships.map((am) => ({
      id: am.assignment.id,
      name: am.assignment.name,
      assignmentType: am.assignment.assignmentType,
      note: am.note,
    }));

    const duties = this.buildDutiesList(inspector);

    return {
      id: inspector.id,
      fullName: inspector.fullName,
      rank: inspector.rank,
      title: inspector.title,
      specialization: inspector.specialization,
      photoUrl: inspector.photoUrl,
      photoUpdatedAt: inspector.photoUpdatedAt,
      email: inspector.email,
      office: inspector.office,
      yearsOfService: inspector.yearsOfService,
      profileNotes: inspector.profileNotes,
      department: inspector.department,
      phone: inspector.phone,
      isActive: inspector.isActive,
      availabilityStatus: inspector.availabilityStatus,
      availabilityReason: inspector.availabilityReason,
      availabilityUntil: inspector.availabilityUntil,
      availabilityUpdatedAt: inspector.availabilityUpdatedAt,
      availabilityChangedBy: inspector.availabilityChangedBy,
      primaryGroup: inspector.primaryGroup
        ? {
            id: inspector.primaryGroup.id,
            name: inspector.primaryGroup.name,
            code: inspector.primaryGroup.code,
          }
        : null,
      groups,
      assignments,
      campaignSummary,
      recommendationStats,
      activityScore,
      workloadScore: workloadData.score,
      workloadLevel: workloadData.level,
      lastFieldParticipationDays: lastFieldParticipation,
      duties,
      specializations: await this.prisma.inspectorSpecialization.findMany({
        where: { inspectorId: id },
        include: {
          specialization: { include: { category: true } },
          assignedBy: { select: { id: true, fullName: true } },
        },
        orderBy: [{ isPrimary: 'desc' }, { proficiencyLevel: 'desc' }],
      }),
      createdAt: inspector.createdAt,
      updatedAt: inspector.updatedAt,
    };
  }

  async getProfileSummary(id: string) {
    const inspector = await this.prisma.inspector.findUnique({
      where: { id },
      include: { primaryGroup: true },
    });
    if (!inspector) throw new NotFoundException('المفتش غير موجود');

    const workloadData = await this.calculateWorkload(id);
    const activityScore = await this.calculateActivityScore(id);
    const lastFieldParticipation =
      await this.calculateLastFieldParticipationFromDb(id);

    return {
      id: inspector.id,
      fullName: inspector.fullName,
      rank: inspector.rank,
      title: inspector.title,
      specialization: inspector.specialization,
      photoUrl: inspector.photoUrl,
      photoUpdatedAt: inspector.photoUpdatedAt,
      department: inspector.department,
      isActive: inspector.isActive,
      availabilityStatus: inspector.availabilityStatus,
      availabilityReason: inspector.availabilityReason,
      availabilityUntil: inspector.availabilityUntil,
      primaryGroup: inspector.primaryGroup
        ? {
            id: inspector.primaryGroup.id,
            name: inspector.primaryGroup.name,
          }
        : null,
      activityScore,
      workloadScore: workloadData.score,
      workloadLevel: workloadData.level,
      lastFieldParticipationDays: lastFieldParticipation,
    };
  }

  async updateProfile(id: string, data: any) {
    const inspector = await this.prisma.inspector.findUnique({ where: { id } });
    if (!inspector) throw new NotFoundException('المفتش غير موجود');

    return this.prisma.inspector.update({
      where: { id },
      data: {
        rank: data.rank !== undefined ? data.rank : inspector.rank,
        title: data.title !== undefined ? data.title : inspector.title,
        specialization:
          data.specialization !== undefined
            ? data.specialization
            : inspector.specialization,
        email: data.email !== undefined ? data.email : inspector.email,
        office: data.office !== undefined ? data.office : inspector.office,
        yearsOfService:
          data.yearsOfService !== undefined
            ? data.yearsOfService
            : inspector.yearsOfService,
        profileNotes:
          data.profileNotes !== undefined
            ? data.profileNotes
            : inspector.profileNotes,
        department:
          data.department !== undefined
            ? data.department
            : inspector.department,
        phone: data.phone !== undefined ? data.phone : inspector.phone,
        isActive:
          data.isActive !== undefined ? data.isActive : inspector.isActive,
        availabilityStatus:
          data.availabilityStatus !== undefined
            ? data.availabilityStatus
            : inspector.availabilityStatus,
        availabilityReason:
          data.availabilityReason !== undefined
            ? data.availabilityReason
            : inspector.availabilityReason,
        availabilityUntil:
          data.availabilityUntil !== undefined
            ? data.availabilityUntil
              ? new Date(data.availabilityUntil)
              : null
            : inspector.availabilityUntil,
      },
    });
  }

  async uploadPhoto(id: string, file: any) {
    const inspector = await this.prisma.inspector.findUnique({ where: { id } });
    if (!inspector) throw new NotFoundException('المفتش غير موجود');

    if (!file) {
      throw new BadRequestException('يجب اختيار صورة لرفعها');
    }

    if (!existsSync(PHOTO_DIR)) {
      mkdirSync(PHOTO_DIR, { recursive: true });
    }

    if (inspector.photoUrl) {
      const oldPath = join(PHOTO_DIR, inspector.photoUrl.split('/').pop()!);
      if (existsSync(oldPath)) {
        unlinkSync(oldPath);
      }
    }

    const photoUrl = `/uploads/inspector-photos/${file.filename}`;

    return this.prisma.inspector.update({
      where: { id },
      data: {
        photoUrl,
        photoUpdatedAt: new Date(),
      },
    });
  }

  async deletePhoto(id: string) {
    const inspector = await this.prisma.inspector.findUnique({ where: { id } });
    if (!inspector) throw new NotFoundException('المفتش غير موجود');

    if (inspector.photoUrl) {
      const oldPath = join(PHOTO_DIR, inspector.photoUrl.split('/').pop()!);
      if (existsSync(oldPath)) {
        unlinkSync(oldPath);
      }
    }

    return this.prisma.inspector.update({
      where: { id },
      data: {
        photoUrl: null,
        photoUpdatedAt: null,
      },
    });
  }

  private async calculateWorkload(
    inspectorId: string,
  ): Promise<{ score: number; level: string }> {
    const insp = await this.prisma.inspector.findUnique({
      where: { id: inspectorId },
      include: {
        campaignMembers: {
          include: {
            campaign: { select: { id: true, status: true, startDate: true } },
          },
        },
      },
    });
    if (!insp) return { score: 0, level: 'FREE' };

    const activeMemberships = insp.campaignMembers.filter(
      (cm) => cm.campaign.status === 'active',
    );
    const totalCampaignIds = new Set(
      activeMemberships.map((cm) => cm.campaign.id),
    );
    const campaignIdArray = [...totalCampaignIds];

    let inspectionSum = 0;
    let openRecSum = 0;
    if (campaignIdArray.length > 0) {
      const [inspCounts, recCounts] = await Promise.all([
        this.getInspectionCounts(campaignIdArray),
        this.getOpenRecCounts(campaignIdArray),
      ]);
      for (const cid of campaignIdArray) {
        inspectionSum += inspCounts.get(cid) || 0;
        openRecSum += recCounts.get(cid) || 0;
      }
    }

    const duties = [...totalCampaignIds].map((cid) => {
      const cm = activeMemberships.find((m) => m.campaign.id === cid);
      const role: 'LEADER' | 'DEPUTY' | 'MEMBER' = cm!.role;
      const daysOnDuty = calculateDaysOnDuty(cm!.campaign.startDate);
      const roleWeightMap: Record<string, number> = {
        LEADER: WORKLOAD_WEIGHTS.CAMPAIGN_LEADER,
        DEPUTY: WORKLOAD_WEIGHTS.CAMPAIGN_DEPUTY,
        MEMBER: WORKLOAD_WEIGHTS.CAMPAIGN_MEMBER,
      };
      return { role, daysOnDuty, baseWeight: roleWeightMap[role] };
    });

    const score = computeWorkloadScore({ duties, inspectionSum, openRecSum });

    return {
      score: Math.round(score * 10) / 10,
      level: getWorkloadLevel(score),
    };
  }

  private async calculateActivityScore(inspectorId: string): Promise<number> {
    const insp = await this.prisma.inspector.findUnique({
      where: { id: inspectorId },
      include: {
        campaignMembers: {
          include: { campaign: { select: { id: true, status: true } } },
        },
      },
    });
    if (!insp) return 0;

    const activeMemberships = insp.campaignMembers.filter(
      (cm) => cm.campaign.status === 'active',
    );
    const totalCampaignIds = new Set(
      activeMemberships.map((cm) => cm.campaign.id),
    );
    const campaignCount = activeMemberships.length;

    const campaignIdArray = [...totalCampaignIds];

    let assignedRecs = 0;
    let commentsCount = 0;
    let evidenceCount = 0;
    let statusChanges = 0;

    if (campaignIdArray.length > 0) {
      const trackings = await this.prisma.recommendationTracking.findMany({
        where: { campaignId: { in: campaignIdArray } },
        include: {
          actionLogs: { select: { actionType: true } },
        },
      });

      assignedRecs = trackings.length;
      for (const t of trackings) {
        for (const log of t.actionLogs) {
          if (log.actionType === 'COMMENT') commentsCount++;
          else if (log.actionType === 'EVIDENCE_UPLOAD') evidenceCount++;
          else if (log.actionType === 'STATUS_CHANGE') statusChanges++;
        }
      }
    }

    const score =
      Math.min(30, campaignCount * 3) +
      Math.min(20, assignedRecs * 2) +
      Math.min(15, commentsCount * 1.5) +
      Math.min(10, evidenceCount * 2.5) +
      Math.min(25, statusChanges * 5);

    return Math.round(score * 100) / 100;
  }

  private buildCampaignSummary(inspector: any) {
    const activeMemberships = inspector.campaignMembers.filter(
      (cm: any) => cm.campaign.status === 'active',
    );
    let leaderCount = 0;
    let deputyCount = 0;
    let memberCount = 0;
    for (const cm of activeMemberships) {
      if (cm.role === 'LEADER') leaderCount++;
      else if (cm.role === 'DEPUTY') deputyCount++;
      else memberCount++;
    }

    return {
      asLeader: leaderCount,
      asDeputy: deputyCount,
      asMember: memberCount,
      totalCampaigns: leaderCount + deputyCount + memberCount,
      activeCampaigns: activeMemberships.length,
    };
  }

  private async buildRecommendationStats(inspectorId: string) {
    const insp = await this.prisma.inspector.findUnique({
      where: { id: inspectorId },
      include: {
        campaignMembers: {
          include: { campaign: { select: { id: true, status: true } } },
        },
      },
    });

    if (!insp) {
      return {
        totalAssigned: 0,
        open: 0,
        completed: 0,
        commentsAdded: 0,
        evidenceUploaded: 0,
        statusChanges: 0,
      };
    }

    const activeMemberships = insp.campaignMembers.filter(
      (cm) => cm.campaign.status === 'active',
    );
    const totalCampaignIds = new Set(
      activeMemberships.map((cm) => cm.campaign.id),
    );

    const campaignIdArray = [...totalCampaignIds];

    if (campaignIdArray.length === 0) {
      return {
        totalAssigned: 0,
        open: 0,
        completed: 0,
        commentsAdded: 0,
        evidenceUploaded: 0,
        statusChanges: 0,
      };
    }

    const trackings = await this.prisma.recommendationTracking.findMany({
      where: { campaignId: { in: campaignIdArray } },
      include: { actionLogs: { select: { actionType: true } } },
    });

    let commentsAdded = 0;
    let evidenceUploaded = 0;
    let statusChanges = 0;

    for (const t of trackings) {
      for (const log of t.actionLogs) {
        if (log.actionType === 'COMMENT') commentsAdded++;
        else if (log.actionType === 'EVIDENCE_UPLOAD') evidenceUploaded++;
        else if (log.actionType === 'STATUS_CHANGE') statusChanges++;
      }
    }

    const open = trackings.filter(
      (t) => !['CLOSED', 'COMPLETED', 'VERIFIED'].includes(t.status),
    ).length;
    const completed = trackings.filter((t) =>
      ['CLOSED', 'COMPLETED', 'VERIFIED'].includes(t.status),
    ).length;

    return {
      totalAssigned: trackings.length,
      open,
      completed,
      commentsAdded,
      evidenceUploaded,
      statusChanges,
    };
  }

  private calculateLastFieldParticipation(inspector: any): number | null {
    const dates: Date[] = [];

    for (const cm of inspector.campaignMembers) {
      if (cm.campaign.startDate) dates.push(new Date(cm.campaign.startDate));
    }

    if (dates.length === 0) return null;
    const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
    return Math.floor(
      (new Date().getTime() - latest.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  private async calculateLastFieldParticipationFromDb(
    inspectorId: string,
  ): Promise<number | null> {
    const insp = await this.prisma.inspector.findUnique({
      where: { id: inspectorId },
      include: {
        campaignMembers: {
          include: { campaign: { select: { startDate: true } } },
        },
      },
    });
    if (!insp) return null;

    const dates: Date[] = [];
    for (const cm of insp.campaignMembers) {
      if (cm.campaign.startDate) dates.push(new Date(cm.campaign.startDate));
    }

    if (dates.length === 0) return null;
    const latest = new Date(Math.max(...dates.map((d) => d.getTime())));
    return Math.floor(
      (new Date().getTime() - latest.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  private buildDutiesList(inspector: any) {
    const duties: any[] = [];
    const seen = new Set<string>();

    for (const cm of inspector.campaignMembers) {
      const c = cm.campaign;
      if (!seen.has(c.id)) {
        seen.add(c.id);
        const daysOnDuty = c.startDate
          ? Math.max(
              1,
              Math.floor(
                (new Date().getTime() - new Date(c.startDate).getTime()) /
                  (1000 * 60 * 60 * 24),
              ),
            )
          : 0;
        duties.push({
          campaignId: c.id,
          campaignName: c.name,
          entityName: c.entity?.name || '—',
          startDate: c.startDate,
          endDate: c.endDate,
          daysOnDuty,
          role: cm.role,
        });
      }
    }

    duties.sort((a, b) => b.daysOnDuty - a.daysOnDuty);
    return duties;
  }

  private async getInspectionCounts(
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

  private async getOpenRecCounts(
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
}
