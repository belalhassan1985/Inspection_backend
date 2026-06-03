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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const bcrypt = require("bcrypt");
let UsersService = class UsersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll() {
        return this.prisma.user.findMany({
            include: { role: true },
            orderBy: { fullName: 'asc' },
        });
    }
    async findRoles() {
        return this.prisma.role.findMany({
            orderBy: { id: 'asc' },
        });
    }
    async create(data) {
        const existing = await this.prisma.user.findUnique({ where: { username: data.username } });
        if (existing) {
            throw new common_1.BadRequestException('اسم المستخدم مسجل مسبقاً في النظام');
        }
        const passwordHash = await bcrypt.hash(data.password || '1234', 10);
        return this.prisma.user.create({
            data: {
                fullName: data.fullName,
                username: data.username,
                passwordHash,
                roleId: data.roleId,
                department: data.department,
                isActive: data.isActive !== undefined ? data.isActive : true,
            },
            include: { role: true },
        });
    }
    async update(id, data) {
        const user = await this.prisma.user.findUnique({ where: { id } });
        if (!user) {
            throw new common_1.NotFoundException('المستخدم غير موجود');
        }
        let passwordHash = user.passwordHash;
        if (data.password) {
            passwordHash = await bcrypt.hash(data.password, 10);
        }
        return this.prisma.user.update({
            where: { id },
            data: {
                fullName: data.fullName !== undefined ? data.fullName : user.fullName,
                username: data.username !== undefined ? data.username : user.username,
                passwordHash,
                roleId: data.roleId !== undefined ? data.roleId : user.roleId,
                department: data.department !== undefined ? data.department : user.department,
                isActive: data.isActive !== undefined ? data.isActive : user.isActive,
            },
            include: { role: true },
        });
    }
    async remove(id) {
        return this.prisma.user.delete({
            where: { id },
        });
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map