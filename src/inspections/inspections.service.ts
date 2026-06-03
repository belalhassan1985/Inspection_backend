import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InspectionsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.inspection.findMany({
      include: {
        campaign: { select: { id: true, name: true } },
        inspector: { select: { id: true, fullName: true, username: true } },
        entity: { select: { id: true, name: true, level: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { id },
      include: {
        campaign: { select: { id: true, name: true, type: true, formationNumber: true } },
        inspector: { select: { id: true, fullName: true, username: true } },
        entity: {
          select: {
            id: true,
            name: true,
            level: true,
            positions: {
              where: { isActive: true },
            },
          },
        },
        grades: {
          include: {
            selectedOptions: {
              include: {
                option: { include: { optionType: true } }
              }
            },
            criteriaDetail: {
              include: {
                options: { include: { optionType: true } },
                secondary: {
                  include: {
                    primary: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!inspection) {
      throw new NotFoundException('Inspection not found');
    }
    return inspection;
  }

  async findByCampaign(campaignId: string) {
    return this.prisma.inspection.findFirst({
      where: { campaignId },
      include: {
        campaign: { select: { id: true, name: true, type: true, formationNumber: true } },
        inspector: { select: { id: true, fullName: true, username: true } },
        entity: {
          select: {
            id: true,
            name: true,
            level: true,
            positions: {
              where: { isActive: true },
            },
          },
        },
        grades: {
          include: {
            selectedOptions: {
              include: {
                option: { include: { optionType: true } }
              }
            },
            criteriaDetail: {
              include: {
                options: { include: { optionType: true } },
                secondary: {
                  include: {
                    primary: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async getCriteriaTemplate(campaignId?: string) {
    if (campaignId) {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          template: {
            include: {
              items: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  primary: {
                    include: {
                      secondaryCriteria: {
                        orderBy: { sortOrder: 'asc' },
                        include: {
                          details: {
                            orderBy: { sortOrder: 'asc' },
                            include: { options: { include: { optionType: true } } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });

      // Sync default template with latest criteria for new inspections
      const tpl = campaign?.template;
      if (tpl?.isDefault) {
        const currentCount = await this.prisma.primaryCriteria.count();
        const linkedCount = await this.prisma.criteriaTemplateItem.count({
          where: { templateId: tpl.id },
        });
        if (currentCount !== linkedCount) {
          await this.prisma.criteriaTemplateItem.deleteMany({
            where: { templateId: tpl.id },
          });
          const allPrimaries = await this.prisma.primaryCriteria.findMany({
            orderBy: { sortOrder: 'asc' },
          });
          if (allPrimaries.length > 0) {
            await this.prisma.criteriaTemplateItem.createMany({
              data: allPrimaries.map((p, i) => ({
                templateId: tpl.id,
                primaryId: p.id,
                sortOrder: i,
              })),
            });
          }
          // Re-fetch after sync
          const refreshed = await this.prisma.campaign.findUnique({
            where: { id: campaignId },
            include: {
              template: {
                include: {
                  items: {
                    orderBy: { sortOrder: 'asc' },
                    include: {
                      primary: {
                        include: {
                          secondaryCriteria: {
                            orderBy: { sortOrder: 'asc' },
                            include: {
                              details: {
                                orderBy: { sortOrder: 'asc' },
                                include: { options: { include: { optionType: true } } },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          });
          if (refreshed?.template?.items?.length) {
            return refreshed.template.items.map((item) => item.primary);
          }
        }
      }

      if (campaign?.template) {
        return campaign.template.items.map((item) => item.primary);
      }
    }

    return this.prisma.primaryCriteria.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        secondaryCriteria: {
          orderBy: { sortOrder: 'asc' },
          include: {
            details: {
              orderBy: { sortOrder: 'asc' },
              include: {
                options: { include: { optionType: true } },
              },
            },
          },
        },
      },
    });
  }

  async create(data: any) {
    const { campaignId, entityId, inspectorId, location, findings, status, grades } = data;

    if (!campaignId || !entityId || !grades || !Array.isArray(grades) || grades.length === 0) {
      throw new BadRequestException('Campaign ID, Entity ID, and Grades array are required.');
    }

    const targetStatus = status || 'pendingReview';
    if (!['draft', 'pendingReview', 'approved', 'rejected'].includes(targetStatus)) {
      throw new BadRequestException('Invalid target status.');
    }

    const detailIds = grades.map((g: any) => g.detailId);
    const dbDetails = await this.prisma.criteriaDetail.findMany({
      where: { id: { in: detailIds } },
    });

    let sumEarned = 0;
    let sumMax = 0;

    for (const g of grades) {
      const dbDetail = dbDetails.find((d) => d.id === g.detailId);
      if (!dbDetail) {
        throw new BadRequestException(`Criteria detail ID ${g.detailId} not found in database.`);
      }
      const earned = parseFloat(g.gradeEarned);
      const max = parseFloat(dbDetail.maxGrade.toString());

      if (earned > max) {
        throw new BadRequestException(
          `Earned grade ${earned} for detail ID ${g.detailId} cannot exceed maximum grade ${max}.`,
        );
      }

      sumEarned += earned;
      sumMax += max;
    }

    const percentage = sumMax > 0 ? (sumEarned / sumMax) * 100 : 0;
    const rating = this.calculateRating(percentage);

    let inspection = await this.prisma.inspection.findFirst({
      where: { campaignId, entityId }
    });

    if (inspection) {
      // Temporarily disabled status locking/read-only mode per user request
      /*
      if (inspection.status === 'approved' || inspection.status === 'pendingReview') {
        throw new BadRequestException('لا يمكن تعديل هذا التفتيش لأنه قد تم تقديمه للمراجعة أو معتمد بالفعل.');
      }
      */
      
      inspection = await this.prisma.inspection.update({
        where: { id: inspection.id },
        data: {
          inspectorId: inspectorId || null,
          location,
          findings,
          totalScore: percentage,
          performanceRating: rating,
          status: targetStatus,
          officerCredentials: data.officerCredentials !== undefined ? data.officerCredentials : (inspection.officerCredentials || null),
        }
      });

      // Clear old grades (cascades to selectedOptions)
      await this.prisma.inspectionGrade.deleteMany({
        where: { inspectionId: inspection.id }
      });
    } else {
      inspection = await this.prisma.inspection.create({
        data: {
          campaignId,
          entityId,
          inspectorId: inspectorId || null,
          location,
          findings,
          totalScore: percentage,
          performanceRating: rating,
          status: targetStatus,
          officerCredentials: data.officerCredentials || null,
        },
      });
    }

    for (const g of grades) {
      await this.prisma.inspectionGrade.create({
        data: {
          inspectionId: inspection.id,
          detailId: g.detailId,
          gradeEarned: g.gradeEarned,
          notes: g.notes || '',
          quantitativeData: g.quantitativeData ? JSON.parse(JSON.stringify(g.quantitativeData)) : null,
          instanceName: g.instanceName || null,
          selectedOptions: g.selectedOptions && g.selectedOptions.length > 0 ? {
            create: g.selectedOptions.map((optId: number) => ({
              optionId: optId
            }))
          } : undefined
        }
      });
    }

    return this.findOne(inspection.id);
  }

  async updateStatus(id: string, status: string, findings?: string) {
    if (!['approved', 'rejected', 'pendingReview'].includes(status)) {
      throw new BadRequestException('Invalid inspection status.');
    }

    const inspection = await this.prisma.inspection.findUnique({ where: { id } });
    if (!inspection) {
      throw new NotFoundException('Inspection not found');
    }

    return this.prisma.inspection.update({
      where: { id },
      data: {
        status,
        findings: findings !== undefined ? findings : inspection.findings,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.inspection.delete({
      where: { id },
    });
  }

  // Primary Criteria CRUD
  async createPrimary(data: any) {
    return this.prisma.primaryCriteria.create({
      data: {
        title: data.title,
        maxGrade: data.maxGrade,
      },
    });
  }

  async updatePrimary(id: number, data: any) {
    return this.prisma.primaryCriteria.update({
      where: { id },
      data: {
        title: data.title,
        maxGrade: data.maxGrade,
      },
    });
  }

  async removePrimary(id: number) {
    return this.prisma.primaryCriteria.delete({
      where: { id },
    });
  }

  // Secondary Criteria CRUD
  async createSecondary(data: any) {
    return this.prisma.secondaryCriteria.create({
      data: {
        primaryId: data.primaryId,
        title: data.title,
        maxGrade: data.maxGrade,
      },
    });
  }

  async updateSecondary(id: number, data: any) {
    return this.prisma.secondaryCriteria.update({
      where: { id },
      data: {
        title: data.title,
        maxGrade: data.maxGrade,
      },
    });
  }

  async removeSecondary(id: number) {
    return this.prisma.secondaryCriteria.delete({
      where: { id },
    });
  }

  // Criteria Details CRUD
  async createDetail(data: any) {
    const optionCreates = data.options && data.options.length > 0
      ? await Promise.all(data.options.map((opt: any) => this.buildOptionCreateData(this.prisma, opt)))
      : [];
    return this.prisma.criteriaDetail.create({
      data: {
        secondaryId: data.secondaryId,
        detailText: data.detailText,
        maxGrade: data.maxGrade,
        inputType: data.inputType || 'single',
        tableSchema: data.tableSchema || null,
        options: optionCreates.length > 0 ? {
          create: optionCreates,
        } : undefined,
      },
      include: {
        options: { include: { optionType: true } },
      },
    });
  }

  async createOption(data: any) {
    const optionData = await this.buildOptionCreateData(this.prisma, data);
    return this.prisma.criteriaOption.create({
      data: {
        ...optionData,
        detailId: data.detailId,
      },
      include: { optionType: true },
    });
  }

  async updateDetail(id: number, data: any) {
    return this.prisma.$transaction(async (tx) => {
      if (data.options !== undefined) {
        await tx.criteriaOption.deleteMany({
          where: { detailId: id },
        });
      }
      const optionCreates = data.options && data.options.length > 0
        ? await Promise.all(data.options.map((opt: any) => this.buildOptionCreateData(tx, opt)))
        : [];
      return tx.criteriaDetail.update({
        where: { id },
        data: {
          detailText: data.detailText,
          maxGrade: data.maxGrade,
          inputType: data.inputType || 'single',
          tableSchema: data.tableSchema !== undefined ? data.tableSchema : undefined,
          options: optionCreates.length > 0 ? {
            create: optionCreates,
          } : undefined,
        },
        include: {
          options: { include: { optionType: true } },
        },
      });
    });
  }

  async removeDetail(id: number) {
    return this.prisma.criteriaDetail.delete({
      where: { id },
    });
  }

  async reorderPrimary(ids: number[], templateId?: string) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array is required');
    }
    return this.prisma.$transaction(async (tx) => {
      // 1. Update PrimaryCriteria sortOrder globally
      await Promise.all(
        ids.map((id, index) =>
          tx.primaryCriteria.update({
            where: { id },
            data: { sortOrder: index },
          })
        )
      );

      // 2. If templateId is provided, update CriteriaTemplateItem sortOrder for this template
      if (templateId) {
        await Promise.all(
          ids.map((id, index) =>
            tx.criteriaTemplateItem.updateMany({
              where: { templateId, primaryId: id },
              data: { sortOrder: index },
            })
          )
        );
      }
    });
  }

  async reorderSecondary(ids: number[]) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array is required');
    }
    return this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.secondaryCriteria.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
  }

  async reorderDetail(ids: number[]) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array is required');
    }
    return this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.criteriaDetail.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
  }

  private async buildOptionCreateData(client: any, opt: any) {
    const optionType = await this.resolveOptionType(client, opt.optionTypeId, opt.type);
    return {
      optionText: opt.optionText,
      type: optionType.code,
      optionTypeId: optionType.id,
      scoreValue: opt.scoreValue !== undefined && opt.scoreValue !== null ? parseFloat(opt.scoreValue) : null,
    };
  }

  private async resolveOptionType(client: any, optionTypeId?: number, legacyType?: string) {
    if (optionTypeId !== undefined && optionTypeId !== null) {
      const optionType = await client.evaluationOptionType.findUnique({
        where: { id: Number(optionTypeId) },
      });
      if (!optionType) {
        throw new BadRequestException('Evaluation option type not found');
      }
      return optionType;
    }

    const code = legacyType || 'positive';
    const normalizedCode = code === 'dilemma' ? 'obstacle' : code;
    const optionType = await client.evaluationOptionType.findUnique({
      where: { code: normalizedCode },
    });
    if (!optionType) {
      throw new BadRequestException(`Evaluation option type code ${normalizedCode} not found`);
    }
    return optionType;
  }

  private calculateRating(score: number): string {
    if (score >= 90) return 'ممتاز';
    if (score >= 80) return 'جيد جداً';
    if (score >= 70) return 'جيد';
    if (score >= 65) return 'فوق الوسط';
    if (score >= 60) return 'وسط';
    if (score >= 50) return 'دون الوسط';
    return 'ضعيف';
  }
}
