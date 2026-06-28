import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const READINESS_WEIGHTS = {
  AVAILABILITY: 0.4,
  WORKLOAD: 0.35,
  LEADERSHIP: 0.25,
};

@Injectable()
export class InspectionGroupsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const groups = await this.prisma.inspectionGroup.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { members: true } },
      },
    });
    return groups.map((g) => ({
      ...g,
      memberCount: g._count.members,
    }));
  }

  async findOne(id: number) {
    const group = await this.prisma.inspectionGroup.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            inspector: {
              select: {
                id: true,
                fullName: true,
                rank: true,
                department: true,
                availabilityStatus: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { members: true } },
      },
    });
    if (!group) {
      throw new NotFoundException('الفرقة غير موجودة');
    }
    const { _count, ...rest } = group;
    return { ...rest, memberCount: _count.members };
  }

  async create(data: any) {
    const existing = await this.prisma.inspectionGroup.findUnique({
      where: { name: data.name },
    });
    if (existing) {
      throw new ConflictException('يوجد فرقة بنفس الاسم بالفعل');
    }
    return this.prisma.inspectionGroup.create({
      data: {
        name: data.name,
        code: data.code || null,
        description: data.description || null,
        sourceReference: data.sourceReference || null,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
    });
  }

  async update(id: number, data: any) {
    await this.findOne(id);
    if (data.name) {
      const existing = await this.prisma.inspectionGroup.findUnique({
        where: { name: data.name },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('يوجد فرقة بنفس الاسم بالفعل');
      }
    }
    return this.prisma.inspectionGroup.update({
      where: { id },
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
        sourceReference: data.sourceReference,
        isActive: data.isActive,
      },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.inspectionGroup.delete({ where: { id } });
  }

  async addMember(
    groupId: number,
    inspectorId: string,
    roleInGroup?: string,
    isLeader?: boolean,
    memberOrder?: number,
  ) {
    const group = await this.prisma.inspectionGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException('الفرقة غير موجودة');
    }
    const inspector = await this.prisma.inspector.findUnique({
      where: { id: inspectorId },
    });
    if (!inspector) {
      throw new NotFoundException('المفتش غير موجود');
    }
    const existing = await this.prisma.inspectorGroupMember.findUnique({
      where: { inspectorId_groupId: { inspectorId, groupId } },
    });
    if (existing) {
      throw new ConflictException('المفتش عضو في هذه الفرقة بالفعل');
    }
    return this.prisma.inspectorGroupMember.create({
      data: {
        inspectorId,
        groupId,
        roleInGroup: roleInGroup || null,
        isLeader: isLeader || false,
        memberOrder: memberOrder || null,
      },
      include: {
        inspector: {
          select: { id: true, fullName: true, rank: true, department: true },
        },
      },
    });
  }

  async removeMember(groupId: number, memberId: number) {
    const member = await this.prisma.inspectorGroupMember.findUnique({
      where: { id: memberId },
    });
    if (!member || member.groupId !== groupId) {
      throw new NotFoundException('العضوية غير موجودة في هذه الفرقة');
    }
    return this.prisma.inspectorGroupMember.delete({ where: { id: memberId } });
  }

  async toggleLeader(memberId: number) {
    const member = await this.prisma.inspectorGroupMember.findUnique({
      where: { id: memberId },
    });
    if (!member) throw new NotFoundException('العضوية غير موجودة');
    return this.prisma.inspectorGroupMember.update({
      where: { id: memberId },
      data: { isLeader: !member.isLeader },
    });
  }

  async setPrimaryGroup(inspectorId: string, groupId: number | null) {
    const inspector = await this.prisma.inspector.findUnique({
      where: { id: inspectorId },
    });
    if (!inspector) {
      throw new NotFoundException('المفتش غير موجود');
    }
    if (groupId !== null) {
      const group = await this.prisma.inspectionGroup.findUnique({
        where: { id: groupId },
      });
      if (!group) {
        throw new NotFoundException('الفرقة غير موجودة');
      }
    }
    return this.prisma.inspector.update({
      where: { id: inspectorId },
      data: { primaryGroupId: groupId },
      select: { id: true, fullName: true, primaryGroupId: true },
    });
  }

  private async getLatestSnapshotDate(): Promise<Date | null> {
    const latest = await this.prisma.workloadSnapshot.findFirst({
      orderBy: { snapshotDate: 'desc' },
      select: { snapshotDate: true },
    });
    return latest?.snapshotDate || null;
  }

  private async getWorkloadMap(
    snapshotDate: Date | null,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!snapshotDate) return map;
    const snapshots = await this.prisma.workloadSnapshot.findMany({
      where: { snapshotDate },
      select: { inspectorId: true, level: true },
    });
    for (const s of snapshots) map.set(s.inspectorId, s.level);
    return map;
  }

  private async computeGroupReadiness(
    groupId: number,
    groupMembers: any[],
    workloadMap: Map<string, string>,
  ) {
    const members = groupMembers || [];
    const totalMembers = members.length;

    if (totalMembers === 0) {
      return {
        readinessScore: 0,
        readinessLevel: 'CRITICAL',
        availabilityScore: 0,
        workloadScore: 0,
        leaderScore: 0,
        totalMembers: 0,
        availableMembers: 0,
        overloadedMembers: 0,
        hasLeaderAssigned: false,
        leaderIsAvailable: false,
        issues: ['الفرقة لا تحتوي على أعضاء'],
      };
    }

    let availableMembers = 0;
    let overloadedMembers = 0;
    let leaderFound = false;
    let leaderAvailable = false;
    const issues: string[] = [];

    for (const m of members) {
      const insp = m.inspector;
      if (!insp) continue;

      // Availability
      if (insp.availabilityStatus === 'AVAILABLE') {
        availableMembers++;
      }

      // Workload
      const level = workloadMap.get(insp.id);
      if (level === 'OVERLOADED') {
        overloadedMembers++;
      }

      // Leadership
      if (m.isLeader) {
        leaderFound = true;
        if (insp.availabilityStatus === 'AVAILABLE') {
          leaderAvailable = true;
        }
      }
    }

    // Availability score
    const availableRatio =
      totalMembers > 0 ? availableMembers / totalMembers : 0;
    const availabilityScore = Math.round(availableRatio * 100);

    // Workload score
    const overloadedRatio =
      totalMembers > 0 ? overloadedMembers / totalMembers : 0;
    let workloadScore = Math.round(100 - overloadedRatio * 150);
    workloadScore = Math.max(0, Math.min(100, workloadScore));

    // Leader score
    const leaderScore = (leaderFound ? 50 : 0) + (leaderAvailable ? 50 : 0);

    // Readiness score
    const readinessScore = Math.round(
      availabilityScore * READINESS_WEIGHTS.AVAILABILITY +
        workloadScore * READINESS_WEIGHTS.WORKLOAD +
        leaderScore * READINESS_WEIGHTS.LEADERSHIP,
    );
    const readinessLevel =
      readinessScore >= 80
        ? 'READY'
        : readinessScore >= 50
          ? 'PARTIAL'
          : 'CRITICAL';

    // Build issues
    const unavailableCount = totalMembers - availableMembers;
    if (unavailableCount > 0)
      issues.push(`${unavailableCount} مفتشين غير متوفرين`);
    if (overloadedMembers > 0)
      issues.push(`${overloadedMembers} مفتشين محملين فوق الطاقة`);
    if (!leaderFound) issues.push('لا يوجد قائد للفرقة');
    else if (!leaderAvailable) issues.push('القائد غير متوفر حالياً');

    return {
      readinessScore,
      readinessLevel,
      availabilityScore,
      workloadScore,
      leaderScore,
      totalMembers,
      availableMembers,
      overloadedMembers,
      hasLeaderAssigned: leaderFound,
      leaderIsAvailable: leaderAvailable,
      issues,
    };
  }

  async getAllReadiness() {
    const groups = await this.prisma.inspectionGroup.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        members: {
          include: {
            inspector: {
              select: { id: true, availabilityStatus: true },
            },
          },
        },
      },
    });

    const snapshotDate = await this.getLatestSnapshotDate();
    const workloadMap = await this.getWorkloadMap(snapshotDate);

    const results = [];
    for (const g of groups) {
      const readiness = await this.computeGroupReadiness(
        g.id,
        g.members,
        workloadMap,
      );
      results.push({
        groupId: g.id,
        groupName: g.name,
        groupCode: g.code,
        ...readiness,
      });
    }
    return results;
  }

  async getGroupReadiness(id: number) {
    const group = await this.prisma.inspectionGroup.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            inspector: {
              select: {
                id: true,
                fullName: true,
                rank: true,
                department: true,
                availabilityStatus: true,
                availabilityReason: true,
                photoUrl: true,
                inspectorSpecializations: {
                  select: {
                    id: true,
                    specialization: { select: { id: true, name: true } },
                    isPrimary: true,
                    proficiencyLevel: true,
                  },
                },
              },
            },
          },
          orderBy: [{ isLeader: 'desc' }, { memberOrder: 'asc' }],
        },
      },
    });
    if (!group) throw new NotFoundException('الفرقة غير موجودة');

    const snapshotDate = await this.getLatestSnapshotDate();
    const workloadMap = await this.getWorkloadMap(snapshotDate);

    const readiness = await this.computeGroupReadiness(
      id,
      group.members,
      workloadMap,
    );

    const memberDetails = group.members.map((m) => {
      const insp = m.inspector;
      const level = workloadMap.get(insp.id);
      const isOverloaded = level === 'OVERLOADED';
      const isHeavy = level === 'HEAVY';
      const memberIssues: string[] = [];

      if (insp.availabilityStatus !== 'AVAILABLE') {
        const reason = insp.availabilityReason || 'غير متوفر';
        memberIssues.push(reason);
      }
      if (isOverloaded) memberIssues.push('عبء عمل زائد');
      if (isHeavy) memberIssues.push('عبء عمل عالي');

      return {
        inspectorId: insp.id,
        fullName: insp.fullName,
        rank: insp.rank,
        department: insp.department,
        photoUrl: insp.photoUrl,
        availabilityStatus: insp.availabilityStatus,
        workloadLevel: level || 'N/A',
        isLeader: m.isLeader,
        roleInGroup: m.roleInGroup,
        memberOrder: m.memberOrder,
        specializations: (insp.inspectorSpecializations || []).map((s) => ({
          id: s.specialization.id,
          name: s.specialization.name,
          isPrimary: s.isPrimary,
          proficiencyLevel: s.proficiencyLevel,
        })),
        issues: memberIssues,
      };
    });

    return {
      group: {
        id: group.id,
        name: group.name,
        code: group.code,
        description: group.description,
        isActive: group.isActive,
      },
      ...readiness,
      memberDetails,
    };
  }

  async takeReadinessSnapshot() {
    const groups = await this.prisma.inspectionGroup.findMany({
      where: { isActive: true },
      include: {
        members: {
          include: {
            inspector: {
              select: { id: true, availabilityStatus: true },
            },
          },
        },
      },
    });

    const snapshotDate = await this.getLatestSnapshotDate();
    const workloadMap = await this.getWorkloadMap(snapshotDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let created = 0;
    for (const g of groups) {
      const readiness = await this.computeGroupReadiness(
        g.id,
        g.members,
        workloadMap,
      );

      try {
        await this.prisma.groupReadinessSnapshot.create({
          data: {
            groupId: g.id,
            snapshotDate: today,
            readinessScore: readiness.readinessScore,
            readinessLevel: readiness.readinessLevel,
            availabilityScore: readiness.availabilityScore,
            workloadScore: readiness.workloadScore,
            leaderScore: readiness.leaderScore,
            totalMembers: readiness.totalMembers,
            availableMembers: readiness.availableMembers,
            overloadedMembers: readiness.overloadedMembers,
            hasLeaderAssigned: readiness.hasLeaderAssigned,
            leaderIsAvailable: readiness.leaderIsAvailable,
          },
        });
        created++;
      } catch (e: any) {
        if (e.code === 'P2002') continue; // Already exists for today
        throw e;
      }
    }
    return { message: `تم إنشاء ${created} سجل جاهزية`, count: created };
  }
}
