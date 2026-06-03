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
exports.EvaluationOptionTypesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let EvaluationOptionTypesService = class EvaluationOptionTypesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(includeInactive = true) {
        return this.prisma.evaluationOptionType.findMany({
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
        const payload = this.normalizePayload(data, true);
        const maxSort = await this.prisma.evaluationOptionType.aggregate({
            _max: { sortOrder: true },
        });
        return this.prisma.evaluationOptionType.create({
            data: {
                ...payload,
                sortOrder: payload.sortOrder ?? ((maxSort._max.sortOrder ?? 0) + 1),
            },
        });
    }
    async update(id, data) {
        await this.ensureExists(id);
        return this.prisma.evaluationOptionType.update({
            where: { id },
            data: this.normalizePayload(data, false),
        });
    }
    async toggle(id, isActive) {
        await this.ensureExists(id);
        return this.prisma.evaluationOptionType.update({
            where: { id },
            data: { isActive: !!isActive },
        });
    }
    async reorder(ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new common_1.BadRequestException('IDs array is required');
        }
        return this.prisma.$transaction(ids.map((id, index) => this.prisma.evaluationOptionType.update({
            where: { id },
            data: { sortOrder: index + 1 },
        })));
    }
    async ensureExists(id) {
        const existing = await this.prisma.evaluationOptionType.findUnique({ where: { id } });
        if (!existing) {
            throw new common_1.NotFoundException('Evaluation option type not found');
        }
        return existing;
    }
    normalizePayload(data, isCreate) {
        const code = typeof data.code === 'string' ? data.code.trim() : undefined;
        const nameAr = typeof data.nameAr === 'string' ? data.nameAr.trim() : undefined;
        const scoreMultiplier = data.scoreMultiplier !== undefined && data.scoreMultiplier !== null
            ? Number(data.scoreMultiplier)
            : undefined;
        if (isCreate && !code) {
            throw new common_1.BadRequestException('Code is required');
        }
        if (isCreate && !nameAr) {
            throw new common_1.BadRequestException('Arabic name is required');
        }
        if (code && !/^[a-z0-9_-]+$/i.test(code)) {
            throw new common_1.BadRequestException('Code must contain letters, numbers, underscores, or dashes only');
        }
        if (scoreMultiplier !== undefined && (Number.isNaN(scoreMultiplier) || scoreMultiplier < 0)) {
            throw new common_1.BadRequestException('Score multiplier must be a non-negative number');
        }
        const payload = {};
        if (code !== undefined)
            payload.code = code;
        if (nameAr !== undefined)
            payload.nameAr = nameAr;
        if (data.nameEn !== undefined)
            payload.nameEn = data.nameEn ? String(data.nameEn).trim() : null;
        if (data.color !== undefined)
            payload.color = data.color ? String(data.color).trim() : null;
        if (data.icon !== undefined)
            payload.icon = data.icon ? String(data.icon).trim() : null;
        if (data.sortOrder !== undefined && data.sortOrder !== null)
            payload.sortOrder = Number(data.sortOrder) || 0;
        if (data.affectsScore !== undefined)
            payload.affectsScore = !!data.affectsScore;
        if (scoreMultiplier !== undefined)
            payload.scoreMultiplier = scoreMultiplier;
        if (data.isActive !== undefined)
            payload.isActive = !!data.isActive;
        return payload;
    }
};
exports.EvaluationOptionTypesService = EvaluationOptionTypesService;
exports.EvaluationOptionTypesService = EvaluationOptionTypesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], EvaluationOptionTypesService);
//# sourceMappingURL=evaluation-option-types.service.js.map