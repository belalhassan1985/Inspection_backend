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
exports.CriteriaTemplatesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const criteria_templates_service_1 = require("./criteria-templates.service");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
let CriteriaTemplatesController = class CriteriaTemplatesController {
    criteriaTemplatesService;
    constructor(criteriaTemplatesService) {
        this.criteriaTemplatesService = criteriaTemplatesService;
    }
    async findAll() {
        return this.criteriaTemplatesService.findAll();
    }
    async create(body) {
        return this.criteriaTemplatesService.create(body);
    }
    async createFromCurrent(body) {
        return this.criteriaTemplatesService.createFromAllCriteria(body?.name, body?.description);
    }
    async findOne(id) {
        return this.criteriaTemplatesService.findOne(id);
    }
    async update(id, body) {
        return this.criteriaTemplatesService.update(id, body);
    }
    async remove(id) {
        return this.criteriaTemplatesService.remove(id);
    }
    async addItem(id, body) {
        return this.criteriaTemplatesService.addItem(id, body.primaryId, body.sortOrder);
    }
    async removeItem(id, primaryId) {
        return this.criteriaTemplatesService.removeItem(id, primaryId);
    }
    async setDefault(id) {
        return this.criteriaTemplatesService.setDefault(id);
    }
};
exports.CriteriaTemplatesController = CriteriaTemplatesController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'عرض جميع قوالب أسس التفتيش' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CriteriaTemplatesController.prototype, "findAll", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'إنشاء قالب أسس جديد' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CriteriaTemplatesController.prototype, "create", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Post)('create-from-current'),
    (0, swagger_1.ApiOperation)({ summary: 'إنشاء قالب من جميع الأسس الحالية' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CriteriaTemplatesController.prototype, "createFromCurrent", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'تفاصيل قالب أسس معين' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CriteriaTemplatesController.prototype, "findOne", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'تعديل قالب أسس' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CriteriaTemplatesController.prototype, "update", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'حذف قالب أسس' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CriteriaTemplatesController.prototype, "remove", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Post)(':id/items'),
    (0, swagger_1.ApiOperation)({ summary: 'إضافة محور رئيسي إلى القالب' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CriteriaTemplatesController.prototype, "addItem", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Delete)(':id/items/:primaryId'),
    (0, swagger_1.ApiOperation)({ summary: 'إزالة محور رئيسي من القالب' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Param)('primaryId', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number]),
    __metadata("design:returntype", Promise)
], CriteriaTemplatesController.prototype, "removeItem", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, common_1.Post)(':id/set-default'),
    (0, swagger_1.ApiOperation)({ summary: 'تعيين قالب كافتراضي' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CriteriaTemplatesController.prototype, "setDefault", null);
exports.CriteriaTemplatesController = CriteriaTemplatesController = __decorate([
    (0, swagger_1.ApiTags)('Criteria Templates'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, common_1.Controller)('criteria-templates'),
    __metadata("design:paramtypes", [criteria_templates_service_1.CriteriaTemplatesService])
], CriteriaTemplatesController);
//# sourceMappingURL=criteria-templates.controller.js.map