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
exports.InspectorsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let InspectorsService = class InspectorsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll() {
        return this.prisma.inspector.findMany({
            orderBy: { fullName: 'asc' },
        });
    }
    async findOne(id) {
        const inspector = await this.prisma.inspector.findUnique({
            where: { id },
        });
        if (!inspector) {
            throw new common_1.NotFoundException('المفتش غير موجود');
        }
        return inspector;
    }
    async create(data) {
        return this.prisma.inspector.create({
            data: {
                fullName: data.fullName,
                department: data.department || null,
                phone: data.phone || null,
                notes: data.notes || null,
                isActive: data.isActive !== undefined ? data.isActive : true,
            },
        });
    }
    async update(id, data) {
        const inspector = await this.findOne(id);
        return this.prisma.inspector.update({
            where: { id },
            data: {
                fullName: data.fullName !== undefined ? data.fullName : inspector.fullName,
                department: data.department !== undefined ? data.department : inspector.department,
                phone: data.phone !== undefined ? data.phone : inspector.phone,
                notes: data.notes !== undefined ? data.notes : inspector.notes,
                isActive: data.isActive !== undefined ? data.isActive : inspector.isActive,
            },
        });
    }
    async remove(id) {
        await this.findOne(id);
        return this.prisma.inspector.delete({
            where: { id },
        });
    }
};
exports.InspectorsService = InspectorsService;
exports.InspectorsService = InspectorsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InspectorsService);
//# sourceMappingURL=inspectors.service.js.map