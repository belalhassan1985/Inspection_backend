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
exports.CriteriaTemplatesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let CriteriaTemplatesService = class CriteriaTemplatesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll() {
        return this.prisma.criteriaTemplate.findMany({
            where: { isActive: true },
            include: {
                _count: { select: { items: true, campaigns: true } },
            },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        });
    }
    async findOne(id) {
        const template = await this.prisma.criteriaTemplate.findUnique({
            where: { id },
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
                _count: { select: { campaigns: true } },
            },
        });
        if (!template) {
            throw new common_1.NotFoundException('Criteria template not found');
        }
        return template;
    }
    async create(data) {
        if (!data.name || data.name.trim().length === 0) {
            throw new common_1.BadRequestException('Template name is required');
        }
        return this.prisma.criteriaTemplate.create({
            data: {
                name: data.name.trim(),
                description: data.description || null,
            },
        });
    }
    async update(id, data) {
        await this.findOne(id);
        return this.prisma.criteriaTemplate.update({
            where: { id },
            data: {
                ...(data.name !== undefined ? { name: data.name.trim() } : {}),
                ...(data.description !== undefined ? { description: data.description } : {}),
            },
        });
    }
    async remove(id) {
        const template = await this.findOne(id);
        if (template.isDefault) {
            throw new common_1.BadRequestException('Cannot delete the default template');
        }
        return this.prisma.criteriaTemplate.delete({ where: { id } });
    }
    async addItem(templateId, primaryId, sortOrder) {
        await this.findOne(templateId);
        const primary = await this.prisma.primaryCriteria.findUnique({ where: { id: primaryId } });
        if (!primary) {
            throw new common_1.NotFoundException(`Primary criteria with id ${primaryId} not found`);
        }
        const existing = await this.prisma.criteriaTemplateItem.findUnique({
            where: {
                templateId_primaryId: { templateId, primaryId },
            },
        });
        if (existing) {
            throw new common_1.BadRequestException('This primary criteria is already in the template');
        }
        const maxSortOrder = await this.prisma.criteriaTemplateItem.aggregate({
            where: { templateId },
            _max: { sortOrder: true },
        });
        return this.prisma.criteriaTemplateItem.create({
            data: {
                templateId,
                primaryId,
                sortOrder: sortOrder ?? (maxSortOrder._max.sortOrder ?? -1) + 1,
            },
            include: { primary: true },
        });
    }
    async removeItem(templateId, primaryId) {
        await this.findOne(templateId);
        try {
            await this.prisma.criteriaTemplateItem.delete({
                where: {
                    templateId_primaryId: { templateId, primaryId },
                },
            });
        }
        catch {
            throw new common_1.NotFoundException('Item not found in template');
        }
    }
    async setDefault(id) {
        await this.findOne(id);
        await this.prisma.criteriaTemplate.updateMany({
            where: { isDefault: true },
            data: { isDefault: false },
        });
        return this.prisma.criteriaTemplate.update({
            where: { id },
            data: { isDefault: true },
        });
    }
    async createFromAllCriteria(name, description) {
        const allPrimaries = await this.prisma.primaryCriteria.findMany({
            orderBy: { sortOrder: 'asc' },
        });
        if (allPrimaries.length === 0) {
            throw new common_1.BadRequestException('No primary criteria found to create template from');
        }
        return this.prisma.criteriaTemplate.create({
            data: {
                name: name || `قالب شامل (${new Date().toLocaleDateString('ar-IQ')})`,
                description: description || 'تم إنشاؤه تلقائياً من جميع الأسس الحالية',
                items: {
                    create: allPrimaries.map((p, i) => ({
                        primaryId: p.id,
                        sortOrder: i,
                    })),
                },
            },
            include: {
                items: {
                    orderBy: { sortOrder: 'asc' },
                    include: { primary: true },
                },
            },
        });
    }
};
exports.CriteriaTemplatesService = CriteriaTemplatesService;
exports.CriteriaTemplatesService = CriteriaTemplatesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CriteriaTemplatesService);
//# sourceMappingURL=criteria-templates.service.js.map