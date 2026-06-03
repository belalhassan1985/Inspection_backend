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
exports.CampaignsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let CampaignsService = class CampaignsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll() {
        return this.prisma.campaign.findMany({
            include: {
                leader: { select: { id: true, fullName: true, department: true, phone: true } },
                deputy: { select: { id: true, fullName: true, department: true, phone: true } },
                entity: true,
                template: { select: { id: true, name: true, isDefault: true } },
                members: { include: { inspector: { select: { id: true, fullName: true, department: true, phone: true } } } },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(id) {
        const campaign = await this.prisma.campaign.findUnique({
            where: { id },
            include: {
                leader: { select: { id: true, fullName: true, department: true, phone: true } },
                deputy: { select: { id: true, fullName: true, department: true, phone: true } },
                entity: true,
                template: { select: { id: true, name: true, isDefault: true } },
                members: { include: { inspector: { select: { id: true, fullName: true, department: true, phone: true } } } },
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
            throw new common_1.NotFoundException('Campaign not found');
        }
        return campaign;
    }
    async create(data) {
        const { memberIds, ...rest } = data;
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
                leaderId: rest.leaderId || null,
                deputyId: rest.deputyId || null,
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
            await this.prisma.campaignMember.createMany({
                data: memberIds.map((inspectorId) => ({
                    campaignId: campaign.id,
                    inspectorId,
                })),
            });
        }
        return this.findOne(campaign.id);
    }
    async update(id, data) {
        const { memberIds, ...rest } = data;
        await this.prisma.campaign.update({
            where: { id },
            data: {
                name: rest.name,
                type: rest.type,
                assignmentText: rest.assignmentText,
                assignmentReference: rest.assignmentReference,
                assignmentDate: rest.assignmentDate ? new Date(rest.assignmentDate) : undefined,
                leaderId: rest.leaderId,
                deputyId: rest.deputyId,
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
            await this.prisma.campaignMember.deleteMany({ where: { campaignId: id } });
            if (memberIds.length > 0) {
                await this.prisma.campaignMember.createMany({
                    data: memberIds.map((inspectorId) => ({
                        campaignId: id,
                        inspectorId,
                    })),
                });
            }
        }
        return this.findOne(id);
    }
    async remove(id) {
        return this.prisma.campaign.delete({
            where: { id },
        });
    }
    async addNote(campaignId, noteData) {
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
    async updateNote(noteId, noteData) {
        return this.prisma.campaignNote.update({
            where: { id: noteId },
            data: {
                text: noteData.text,
                sortOrder: noteData.sortOrder,
            },
        });
    }
    async deleteNote(noteId) {
        return this.prisma.campaignNote.delete({
            where: { id: noteId },
        });
    }
    async addRecommendation(campaignId, recData) {
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
    async updateRecommendation(recId, recData) {
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
        try {
            await this.prisma.recommendationTracking.updateMany({
                where: { recommendationId: recId },
                data: { riskLevel: recData.riskLevel || 'MEDIUM' },
            });
        }
        catch {
        }
        return rec;
    }
    async deleteRecommendation(recId) {
        return this.prisma.campaignRecommendation.delete({
            where: { id: recId },
        });
    }
    async addAppendix(campaignId, appData) {
        return this.prisma.campaignAppendix.create({
            data: {
                campaignId,
                symbol: appData.symbol,
                text: appData.text,
            },
        });
    }
    async updateAppendix(appId, appData) {
        return this.prisma.campaignAppendix.update({
            where: { id: appId },
            data: {
                symbol: appData.symbol,
                text: appData.text,
            },
        });
    }
    async deleteAppendix(appId) {
        return this.prisma.campaignAppendix.delete({
            where: { id: appId },
        });
    }
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
    async createType(data) {
        return this.prisma.campaignType.create({
            data: {
                name: data.name,
                key: data.key || data.name.toLowerCase().trim().replace(/\s+/g, '-'),
            },
        });
    }
    async updateType(id, data) {
        return this.prisma.campaignType.update({
            where: { id },
            data: {
                name: data.name,
                key: data.key,
            },
        });
    }
    async removeType(id) {
        return this.prisma.campaignType.delete({
            where: { id },
        });
    }
};
exports.CampaignsService = CampaignsService;
exports.CampaignsService = CampaignsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CampaignsService);
//# sourceMappingURL=campaigns.service.js.map