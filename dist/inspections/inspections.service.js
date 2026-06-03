"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InspectionsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let InspectionsService = class InspectionsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
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
    async findOne(id) {
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
            throw new common_1.NotFoundException('Inspection not found');
        }
        return inspection;
    }
    async findByCampaign(campaignId) {
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
    async getCriteriaTemplate(campaignId) {
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
    async create(data) {
        const { campaignId, entityId, inspectorId, location, findings, status, grades } = data;
        if (!campaignId || !entityId || !grades || !Array.isArray(grades) || grades.length === 0) {
            throw new common_1.BadRequestException('Campaign ID, Entity ID, and Grades array are required.');
        }
        const targetStatus = status || 'pendingReview';
        if (!['draft', 'pendingReview', 'approved', 'rejected'].includes(targetStatus)) {
            throw new common_1.BadRequestException('Invalid target status.');
        }
        const detailIds = grades.map((g) => g.detailId);
        const dbDetails = await this.prisma.criteriaDetail.findMany({
            where: { id: { in: detailIds } },
        });
        let sumEarned = 0;
        let sumMax = 0;
        for (const g of grades) {
            const dbDetail = dbDetails.find((d) => d.id === g.detailId);
            if (!dbDetail) {
                throw new common_1.BadRequestException(`Criteria detail ID ${g.detailId} not found in database.`);
            }
            const earned = parseFloat(g.gradeEarned);
            const max = parseFloat(dbDetail.maxGrade.toString());
            if (earned > max) {
                throw new common_1.BadRequestException(`Earned grade ${earned} for detail ID ${g.detailId} cannot exceed maximum grade ${max}.`);
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
            await this.prisma.inspectionGrade.deleteMany({
                where: { inspectionId: inspection.id }
            });
        }
        else {
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
                        create: g.selectedOptions.map((optId) => ({
                            optionId: optId
                        }))
                    } : undefined
                }
            });
        }
        return this.findOne(inspection.id);
    }
    async updateStatus(id, status, findings) {
        if (!['approved', 'rejected', 'pendingReview'].includes(status)) {
            throw new common_1.BadRequestException('Invalid inspection status.');
        }
        const inspection = await this.prisma.inspection.findUnique({ where: { id } });
        if (!inspection) {
            throw new common_1.NotFoundException('Inspection not found');
        }
        return this.prisma.inspection.update({
            where: { id },
            data: {
                status,
                findings: findings !== undefined ? findings : inspection.findings,
            },
        });
    }
    async remove(id) {
        return this.prisma.inspection.delete({
            where: { id },
        });
    }
    async createPrimary(data) {
        return this.prisma.primaryCriteria.create({
            data: {
                title: data.title,
                maxGrade: data.maxGrade,
            },
        });
    }
    async updatePrimary(id, data) {
        return this.prisma.primaryCriteria.update({
            where: { id },
            data: {
                title: data.title,
                maxGrade: data.maxGrade,
            },
        });
    }
    async removePrimary(id) {
        return this.prisma.primaryCriteria.delete({
            where: { id },
        });
    }
    async createSecondary(data) {
        return this.prisma.secondaryCriteria.create({
            data: {
                primaryId: data.primaryId,
                title: data.title,
                maxGrade: data.maxGrade,
            },
        });
    }
    async updateSecondary(id, data) {
        return this.prisma.secondaryCriteria.update({
            where: { id },
            data: {
                title: data.title,
                maxGrade: data.maxGrade,
            },
        });
    }
    async removeSecondary(id) {
        return this.prisma.secondaryCriteria.delete({
            where: { id },
        });
    }
    async createDetail(data) {
        const optionCreates = data.options && data.options.length > 0
            ? await Promise.all(data.options.map((opt) => this.buildOptionCreateData(this.prisma, opt)))
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
    async createOption(data) {
        const optionData = await this.buildOptionCreateData(this.prisma, data);
        return this.prisma.criteriaOption.create({
            data: {
                ...optionData,
                detailId: data.detailId,
            },
            include: { optionType: true },
        });
    }
    async updateDetail(id, data) {
        return this.prisma.$transaction(async (tx) => {
            if (data.options !== undefined) {
                await tx.criteriaOption.deleteMany({
                    where: { detailId: id },
                });
            }
            const optionCreates = data.options && data.options.length > 0
                ? await Promise.all(data.options.map((opt) => this.buildOptionCreateData(tx, opt)))
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
    async removeDetail(id) {
        return this.prisma.criteriaDetail.delete({
            where: { id },
        });
    }
    async reorderPrimary(ids, templateId) {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new common_1.BadRequestException('IDs array is required');
        }
        return this.prisma.$transaction(async (tx) => {
            await Promise.all(ids.map((id, index) => tx.primaryCriteria.update({
                where: { id },
                data: { sortOrder: index },
            })));
            if (templateId) {
                await Promise.all(ids.map((id, index) => tx.criteriaTemplateItem.updateMany({
                    where: { templateId, primaryId: id },
                    data: { sortOrder: index },
                })));
            }
        });
    }
    async reorderSecondary(ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new common_1.BadRequestException('IDs array is required');
        }
        return this.prisma.$transaction(ids.map((id, index) => this.prisma.secondaryCriteria.update({
            where: { id },
            data: { sortOrder: index },
        })));
    }
    async reorderDetail(ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new common_1.BadRequestException('IDs array is required');
        }
        return this.prisma.$transaction(ids.map((id, index) => this.prisma.criteriaDetail.update({
            where: { id },
            data: { sortOrder: index },
        })));
    }
    async buildOptionCreateData(client, opt) {
        const optionType = await this.resolveOptionType(client, opt.optionTypeId, opt.type);
        return {
            optionText: opt.optionText,
            type: optionType.code,
            optionTypeId: optionType.id,
            scoreValue: opt.scoreValue !== undefined && opt.scoreValue !== null ? parseFloat(opt.scoreValue) : null,
        };
    }
    async resolveOptionType(client, optionTypeId, legacyType) {
        if (optionTypeId !== undefined && optionTypeId !== null) {
            const optionType = await client.evaluationOptionType.findUnique({
                where: { id: Number(optionTypeId) },
            });
            if (!optionType) {
                throw new common_1.BadRequestException('Evaluation option type not found');
            }
            return optionType;
        }
        const code = legacyType || 'positive';
        const normalizedCode = code === 'dilemma' ? 'obstacle' : code;
        const optionType = await client.evaluationOptionType.findUnique({
            where: { code: normalizedCode },
        });
        if (!optionType) {
            throw new common_1.BadRequestException(`Evaluation option type code ${normalizedCode} not found`);
        }
        return optionType;
    }
    calculateRating(score) {
        if (score >= 90)
            return 'ممتاز';
        if (score >= 80)
            return 'جيد جداً';
        if (score >= 70)
            return 'جيد';
        if (score >= 65)
            return 'فوق الوسط';
        if (score >= 60)
            return 'وسط';
        if (score >= 50)
            return 'دون الوسط';
        return 'ضعيف';
    }
};
exports.InspectionsService = InspectionsService;
exports.InspectionsService = InspectionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InspectionsService);
//# sourceMappingURL=inspections.service.js.map