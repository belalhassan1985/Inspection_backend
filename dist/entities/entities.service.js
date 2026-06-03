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
exports.EntitiesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let EntitiesService = class EntitiesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll() {
        return this.prisma.entity.findMany({
            include: {
                positions: true,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
    }
    async findOne(id) {
        const entity = await this.prisma.entity.findUnique({
            where: { id },
            include: {
                positions: true,
                children: true,
            },
        });
        if (!entity) {
            throw new common_1.NotFoundException('Entity not found');
        }
        return entity;
    }
    async create(data) {
        return this.prisma.entity.create({
            data: {
                name: data.name,
                parentId: data.parentId || null,
                level: data.level,
                isAssistant: data.isAssistant || false,
            },
        });
    }
    async update(id, data) {
        return this.prisma.entity.update({
            where: { id },
            data: {
                name: data.name,
                parentId: data.parentId || null,
                level: data.level,
                isAssistant: data.isAssistant !== undefined ? data.isAssistant : false,
            },
        });
    }
    async remove(id) {
        return this.prisma.entity.delete({
            where: { id },
        });
    }
    normalizeArabic(str) {
        if (!str)
            return '';
        return str
            .trim()
            .replace(/[أإآ]/g, 'ا')
            .replace(/ى/g, 'ي')
            .replace(/ة/g, 'ه')
            .replace(/\s+/g, ' ');
    }
    async validatePositionUniqueness(campaignId, statisticalNumber, positionHolder, rank, excludePositionId) {
        if (!campaignId || !statisticalNumber)
            return;
        const statNum = statisticalNumber.trim();
        if (!statNum || statNum === 'غير محدد' || statNum === 'غير حدد')
            return;
        const campaign = await this.prisma.campaign.findUnique({
            where: { id: campaignId },
            include: {
                inspections: {
                    select: { entityId: true },
                },
            },
        });
        if (!campaign)
            return;
        const entityIds = new Set();
        if (campaign.entityId) {
            entityIds.add(campaign.entityId);
        }
        campaign.inspections.forEach((ins) => {
            entityIds.add(ins.entityId);
        });
        if (entityIds.size === 0)
            return;
        const conflicts = await this.prisma.entityPosition.findMany({
            where: {
                entityId: { in: Array.from(entityIds) },
                statisticalNumber: statNum,
                isActive: true,
                NOT: excludePositionId ? { id: excludePositionId } : undefined,
            },
        });
        if (conflicts.length > 0) {
            const inputNameNorm = this.normalizeArabic(positionHolder || '');
            for (const conflict of conflicts) {
                const conflictNameNorm = this.normalizeArabic(conflict.positionHolder || '');
                if (inputNameNorm !== conflictNameNorm) {
                    throw new common_1.BadRequestException('الرقم الإحصائي مستخدم مسبقاً داخل هذه اللجنة التفتيشية لشخص آخر، يرجى التحقق من البيانات.');
                }
            }
        }
    }
    async addPosition(entityId, positionData) {
        if (positionData.campaignId) {
            await this.validatePositionUniqueness(positionData.campaignId, positionData.statisticalNumber, positionData.positionHolder, positionData.rank);
        }
        return this.prisma.entityPosition.create({
            data: {
                entityId,
                positionName: positionData.positionName,
                positionStatus: positionData.positionStatus,
                statisticalNumber: positionData.statisticalNumber,
                positionHolder: positionData.positionHolder,
                joinedDate: positionData.joinedDate ? new Date(positionData.joinedDate) : null,
                isActive: positionData.isActive !== undefined ? positionData.isActive : true,
                rank: positionData.rank || null,
                education: positionData.education || null,
                notes: positionData.notes || null,
                yearsOfService: positionData.yearsOfService ? parseInt(positionData.yearsOfService, 10) : null,
                evaluation: positionData.evaluation || null,
                cadreStatus: positionData.cadreStatus || null,
            },
        });
    }
    async updatePosition(posId, positionData) {
        if (positionData.campaignId) {
            await this.validatePositionUniqueness(positionData.campaignId, positionData.statisticalNumber, positionData.positionHolder, positionData.rank, posId);
        }
        return this.prisma.entityPosition.update({
            where: { id: posId },
            data: {
                positionName: positionData.positionName,
                positionStatus: positionData.positionStatus,
                statisticalNumber: positionData.statisticalNumber,
                positionHolder: positionData.positionHolder,
                joinedDate: positionData.joinedDate ? new Date(positionData.joinedDate) : null,
                isActive: positionData.isActive !== undefined ? positionData.isActive : true,
                rank: positionData.rank || null,
                education: positionData.education || null,
                notes: positionData.notes || null,
                yearsOfService: positionData.yearsOfService ? parseInt(positionData.yearsOfService, 10) : null,
                evaluation: positionData.evaluation || null,
                cadreStatus: positionData.cadreStatus || null,
            },
        });
    }
    async deletePosition(posId) {
        return this.prisma.entityPosition.delete({
            where: { id: posId },
        });
    }
};
exports.EntitiesService = EntitiesService;
exports.EntitiesService = EntitiesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], EntitiesService);
//# sourceMappingURL=entities.service.js.map