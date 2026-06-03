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
exports.RiskLevelOptionsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let RiskLevelOptionsService = class RiskLevelOptionsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(includeInactive = true) {
        return this.prisma.riskLevelOption.findMany({
            where: includeInactive ? undefined : { isActive: true },
            orderBy: [
                { sortOrder: 'asc' },
                { id: 'asc' },
            ],
        });
    }
    async findActive() {
        return this.findAll(false);
    }
    async create(data) {
        this.normalizePayload(data, true);
        const maxSort = await this.prisma.riskLevelOption.aggregate({
            _max: { sortOrder: true },
        });
        return this.prisma.riskLevelOption.create({
            data: {
                ...data,
                sortOrder: data.sortOrder ?? ((maxSort._max.sortOrder ?? 0) + 1),
            },
        });
    }
    async update(id, data) {
        await this.ensureExists(id);
        return this.prisma.riskLevelOption.update({
            where: { id },
            data: this.normalizePayload(data, false),
        });
    }
    async toggle(id, isActive) {
        await this.ensureExists(id);
        return this.prisma.riskLevelOption.update({
            where: { id },
            data: { isActive: !!isActive },
        });
    }
    async reorder(ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new common_1.BadRequestException('IDs array is required');
        }
        return this.prisma.$transaction(ids.map((id, index) => this.prisma.riskLevelOption.update({
            where: { id },
            data: { sortOrder: index + 1 },
        })));
    }
    async ensureExists(id) {
        const existing = await this.prisma.riskLevelOption.findUnique({ where: { id } });
        if (!existing) {
            throw new common_1.NotFoundException('Risk level option not found');
        }
        return existing;
    }
    normalizePayload(data, isCreate) {
        const code = typeof data.code === 'string' ? data.code.trim() : undefined;
        const nameAr = typeof data.nameAr === 'string' ? data.nameAr.trim() : undefined;
        if (isCreate && !code) {
            throw new common_1.BadRequestException('Code is required');
        }
        if (isCreate && !nameAr) {
            throw new common_1.BadRequestException('Arabic name is required');
        }
        if (code && !/^[a-zA-Z0-9_-]+$/i.test(code)) {
            throw new common_1.BadRequestException('Code must contain letters, numbers, underscores, or dashes only');
        }
        const payload = {};
        if (code !== undefined)
            payload.code = code;
        if (nameAr !== undefined)
            payload.nameAr = nameAr;
        if (data.color !== undefined)
            payload.color = data.color ? String(data.color).trim() : '#718096';
        if (data.sortOrder !== undefined && data.sortOrder !== null)
            payload.sortOrder = Number(data.sortOrder) || 0;
        if (data.isActive !== undefined)
            payload.isActive = !!data.isActive;
        if (data.severityWeight !== undefined)
            payload.severityWeight = data.severityWeight != null ? Number(data.severityWeight) : null;
        return payload;
    }
};
exports.RiskLevelOptionsService = RiskLevelOptionsService;
exports.RiskLevelOptionsService = RiskLevelOptionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], RiskLevelOptionsService);
//# sourceMappingURL=risk-level-options.service.js.map