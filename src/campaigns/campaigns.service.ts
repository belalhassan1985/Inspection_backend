import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.campaign.findMany({
      include: {
        leader: {
          select: { id: true, fullName: true, department: true, phone: true },
        },
        deputy: {
          select: { id: true, fullName: true, department: true, phone: true },
        },
        entity: true,
        template: { select: { id: true, name: true, isDefault: true } },
        members: {
          include: {
            inspector: {
              select: {
                id: true,
                fullName: true,
                department: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        leader: {
          select: { id: true, fullName: true, department: true, phone: true },
        },
        deputy: {
          select: { id: true, fullName: true, department: true, phone: true },
        },
        entity: true,
        template: { select: { id: true, name: true, isDefault: true } },
        members: {
          include: {
            inspector: {
              select: {
                id: true,
                fullName: true,
                department: true,
                phone: true,
              },
            },
          },
        },
        notes: true,
        recommendations: true,
        appendices: true,
        inspections: {
          include: {
            entity: {
              include: {
                positions: {
                  where: { isActive: true },
                },
              },
            },
            inspector: { select: { id: true, fullName: true, username: true } },
            grades: {
              include: {
                selectedOptions: {
                  include: {
                    option: true,
                  },
                },
                criteriaDetail: {
                  include: {
                    options: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  async create(data: any, userId?: string) {
    const { memberIds, leaderId, deputyId, ...rest } = data;

    // Auto-assign default template if none specified
    let templateId = rest.templateId || null;
    if (!templateId) {
      let defaultTemplate = await this.prisma.criteriaTemplate.findFirst({
        where: { isDefault: true },
      });
      if (!defaultTemplate) {
        defaultTemplate = await this.prisma.criteriaTemplate.create({
          data: {
            name: 'القالب الافتراضي الموحد',
            description: 'يشمل جميع أسس التفتيش المعيارية',
            isDefault: true,
          },
        });
      }

      const linkedCount = await this.prisma.criteriaTemplateItem.count({
        where: { templateId: defaultTemplate.id },
      });
      if (linkedCount === 0) {
        const allPrimaries = await this.prisma.primaryCriteria.findMany({
          orderBy: { id: 'asc' },
        });
        if (allPrimaries.length > 0) {
          await this.prisma.criteriaTemplateItem.createMany({
            data: allPrimaries.map((p, i) => ({
              templateId: defaultTemplate.id,
              primaryId: p.id,
              sortOrder: i,
            })),
          });
        }
      }

      templateId = defaultTemplate.id;
    }

    const campaign = await this.prisma.campaign.create({
      data: {
        name: rest.name,
        type: rest.type || 'regular',
        assignmentText: rest.assignmentText,
        assignmentReference: rest.assignmentReference,
        assignmentDate: new Date(rest.assignmentDate),
        leaderId: leaderId || null,
        deputyId: deputyId || null,
        purpose: rest.purpose,
        entityId: rest.entityId || null,
        formationNumber: rest.formationNumber,
        startDate: new Date(rest.startDate),
        endDate: rest.endDate ? new Date(rest.endDate) : null,
        status: rest.status || 'active',
        templateId,
      },
    });

    if (memberIds && memberIds.length > 0) {
      const members = memberIds.map((inspectorId: string) => {
        let role: string = 'MEMBER';
        if (inspectorId === leaderId) role = 'LEADER';
        else if (inspectorId === deputyId) role = 'DEPUTY';
        return {
          campaignId: campaign.id,
          inspectorId,
          role,
          assignedById: userId || undefined,
        };
      });
      await this.prisma.campaignMember.createMany({ data: members });
    }

    return this.findOne(campaign.id);
  }

  async update(id: string, data: any, userId?: string) {
    const { memberIds, leaderId, deputyId, ...rest } = data;
    await this.prisma.campaign.update({
      where: { id },
      data: {
        name: rest.name,
        type: rest.type,
        assignmentText: rest.assignmentText,
        assignmentReference: rest.assignmentReference,
        assignmentDate: rest.assignmentDate
          ? new Date(rest.assignmentDate)
          : undefined,
        leaderId: leaderId !== undefined ? leaderId : undefined,
        deputyId: deputyId !== undefined ? deputyId : undefined,
        purpose: rest.purpose,
        entityId: rest.entityId,
        formationNumber: rest.formationNumber,
        startDate: rest.startDate ? new Date(rest.startDate) : undefined,
        endDate: rest.endDate ? new Date(rest.endDate) : null,
        status: rest.status,
        templateId: rest.templateId,
      },
    });

    if (memberIds !== undefined) {
      await this.prisma.campaignMember.deleteMany({
        where: { campaignId: id },
      });
      if (memberIds.length > 0) {
        const members = memberIds.map((inspectorId: string) => {
          let role: string = 'MEMBER';
          if (inspectorId === leaderId) role = 'LEADER';
          else if (inspectorId === deputyId) role = 'DEPUTY';
          return {
            campaignId: id,
            inspectorId,
            role,
            assignedById: userId || undefined,
          };
        });
        await this.prisma.campaignMember.createMany({ data: members });
      }
    }

    return this.findOne(id);
  }

  // Role-aware member management
  async setMemberRole(
    campaignId: string,
    inspectorId: string,
    role: string,
    userId?: string,
  ) {
    await this.prisma.campaignMember.upsert({
      where: { campaignId_inspectorId: { campaignId, inspectorId } },
      update: { role: role as any, assignedById: userId || null },
      create: {
        campaignId,
        inspectorId,
        role: role as any,
        assignedById: userId || null,
      },
    });

    // Sync deprecated leaderId/deputyId from CampaignMember role rows
    await this.syncLeaderDeputyFromMembers(campaignId);
    return this.findOne(campaignId);
  }

  async removeMember(campaignId: string, inspectorId: string) {
    await this.prisma.campaignMember.delete({
      where: { campaignId_inspectorId: { campaignId, inspectorId } },
    });
    await this.syncLeaderDeputyFromMembers(campaignId);
    return this.findOne(campaignId);
  }

  private async syncLeaderDeputyFromMembers(campaignId: string) {
    const members = await this.prisma.campaignMember.findMany({
      where: { campaignId },
      select: { inspectorId: true, role: true },
    });
    const leaderId =
      members.find((m) => m.role === 'LEADER')?.inspectorId || null;
    const deputyId =
      members.find((m) => m.role === 'DEPUTY')?.inspectorId || null;
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { leaderId, deputyId },
    });
  }

  // Group assignment endpoints
  async assignGroup(
    campaignId: string,
    groupId: number,
    role?: string,
    userId?: string,
  ) {
    await this.prisma.campaignGroupAssignment.create({
      data: {
        campaignId,
        groupId,
        role: role || null,
        assignedById: userId || null,
      },
    });
    return this.findOne(campaignId);
  }

  async removeGroupAssignment(campaignId: string, groupId: number) {
    await this.prisma.campaignGroupAssignment.delete({
      where: { campaignId_groupId: { campaignId, groupId } },
    });
    return this.findOne(campaignId);
  }

  async getGroupAssignments(campaignId: string) {
    return this.prisma.campaignGroupAssignment.findMany({
      where: { campaignId },
      include: { group: true },
    });
  }

  async remove(id: string) {
    return this.prisma.campaign.delete({
      where: { id },
    });
  }

  // Campaign Notes
  async addNote(campaignId: string, noteData: any) {
    return this.prisma.campaignNote.create({
      data: {
        campaignId,
        type: noteData.type,
        text: noteData.text,
        parentNoteId: noteData.parentNoteId || null,
        sortOrder: noteData.sortOrder || 0,
      },
    });
  }

  async updateNote(noteId: string, noteData: any) {
    return this.prisma.campaignNote.update({
      where: { id: noteId },
      data: {
        text: noteData.text,
        sortOrder: noteData.sortOrder,
      },
    });
  }

  async deleteNote(noteId: string) {
    return this.prisma.campaignNote.delete({
      where: { id: noteId },
    });
  }

  // Recommendations
  async addRecommendation(campaignId: string, recData: any) {
    const rec = await this.prisma.campaignRecommendation.create({
      data: {
        campaignId,
        authorityName: recData.authorityName,
        recommendationText: recData.recommendationText,
        parentRecId: recData.parentRecId || null,
        sortOrder: recData.sortOrder || 0,
        riskLevel: recData.riskLevel || 'MEDIUM',
        impactCategory: recData.impactCategory || null,
      },
    });

    // Create tracking record for top-level recommendations
    if (!recData.parentRecId) {
      const recCount = await this.prisma.recommendationTracking.count();
      const recNumber = `REC-${String(recCount + 1).padStart(4, '0')}`;
      const entityName = recData.authorityName || 'غير محددة';

      await this.prisma.recommendationTracking.create({
        data: {
          recommendationId: rec.id,
          campaignId,
          recommendationNumber: recNumber,
          assignedEntityNameSnapshot: entityName,
          riskLevel: recData.riskLevel || 'MEDIUM',
          impactCategory: recData.impactCategory || 'ADMINISTRATIVE',
        },
      });
    }

    return rec;
  }

  async updateRecommendation(recId: string, recData: any) {
    const rec = await this.prisma.campaignRecommendation.update({
      where: { id: recId },
      data: {
        authorityName: recData.authorityName,
        recommendationText: recData.recommendationText,
        sortOrder: recData.sortOrder,
        riskLevel: recData.riskLevel || 'MEDIUM',
        impactCategory: recData.impactCategory || null,
      },
    });

    // Sync riskLevel to tracking record if one exists
    try {
      await this.prisma.recommendationTracking.updateMany({
        where: { recommendationId: recId },
        data: { riskLevel: recData.riskLevel || 'MEDIUM' },
      });
    } catch {
      // No tracking record exists for this recommendation
    }

    return rec;
  }

  async deleteRecommendation(recId: string) {
    return this.prisma.campaignRecommendation.delete({
      where: { id: recId },
    });
  }

  // Appendices
  async addAppendix(campaignId: string, appData: any) {
    return this.prisma.campaignAppendix.create({
      data: {
        campaignId,
        symbol: appData.symbol,
        text: appData.text,
      },
    });
  }

  async updateAppendix(appId: string, appData: any) {
    return this.prisma.campaignAppendix.update({
      where: { id: appId },
      data: {
        symbol: appData.symbol,
        text: appData.text,
      },
    });
  }

  async deleteAppendix(appId: string) {
    return this.prisma.campaignAppendix.delete({
      where: { id: appId },
    });
  }

  // Campaign/Committee Types CRUD
  async findAllTypes() {
    const types = await this.prisma.campaignType.findMany({
      orderBy: { createdAt: 'asc' },
    });
    if (types.length === 0) {
      await this.prisma.campaignType.createMany({
        data: [
          { name: 'تفتيشية اعتيادية وتقييم أداء', key: 'regular' },
          { name: 'تعليمية وتدريبية', key: 'education' },
        ],
      });
      return this.prisma.campaignType.findMany({
        orderBy: { createdAt: 'asc' },
      });
    }
    return types;
  }

  async createType(data: any) {
    return this.prisma.campaignType.create({
      data: {
        name: data.name,
        key: data.key || data.name.toLowerCase().trim().replace(/\s+/g, '-'),
      },
    });
  }

  async updateType(id: string, data: any) {
    return this.prisma.campaignType.update({
      where: { id },
      data: {
        name: data.name,
        key: data.key,
      },
    });
  }

  async removeType(id: string) {
    return this.prisma.campaignType.delete({
      where: { id },
    });
  }
}
