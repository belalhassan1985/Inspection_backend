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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EntitiesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const entities_service_1 = require("./entities.service");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
let EntitiesController = class EntitiesController {
    entitiesService;
    constructor(entitiesService) {
        this.entitiesService = entitiesService;
    }
    async findAll() {
        return this.entitiesService.findAll();
    }
    async findOne(id) {
        return this.entitiesService.findOne(id);
    }
    async create(body) {
        return this.entitiesService.create(body);
    }
    async update(id, body) {
        return this.entitiesService.update(id, body);
    }
    async remove(id) {
        return this.entitiesService.remove(id);
    }
    async addPosition(id, body) {
        return this.entitiesService.addPosition(id, body);
    }
    async updatePosition(posId, body) {
        return this.entitiesService.updatePosition(posId, body);
    }
    async deletePosition(posId) {
        return this.entitiesService.deletePosition(posId);
    }
};
exports.EntitiesController = EntitiesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'استعراض الهيكل الإداري بالكامل' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EntitiesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'تفاصيل كيان إداري محدد بجميع مناصبه' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EntitiesController.prototype, "findOne", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'إنشاء كيان إداري جديد' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], EntitiesController.prototype, "create", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'تعديل بيانات كيان إداري' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], EntitiesController.prototype, "update", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'حذف كيان إداري بالكامل' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EntitiesController.prototype, "remove", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Post)(':id/positions'),
    (0, swagger_1.ApiOperation)({ summary: 'إضافة منصب لكيان محدد' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], EntitiesController.prototype, "addPosition", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Put)('positions/:posId'),
    (0, swagger_1.ApiOperation)({ summary: 'تعديل منصب' }),
    __param(0, (0, common_1.Param)('posId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], EntitiesController.prototype, "updatePosition", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, common_1.Delete)('positions/:posId'),
    (0, swagger_1.ApiOperation)({ summary: 'حذف منصب' }),
    __param(0, (0, common_1.Param)('posId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], EntitiesController.prototype, "deletePosition", null);
exports.EntitiesController = EntitiesController = __decorate([
    (0, swagger_1.ApiTags)('Administrative Structure & Entities'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, common_1.Controller)('entities'),
    __metadata("design:paramtypes", [entities_service_1.EntitiesService])
], EntitiesController);
//# sourceMappingURL=entities.controller.js.map