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
exports.InspectionsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const inspections_service_1 = require("./inspections.service");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
let InspectionsController = class InspectionsController {
    inspectionsService;
    constructor(inspectionsService) {
        this.inspectionsService = inspectionsService;
    }
    async findAll() {
        return this.inspectionsService.findAll();
    }
    async getCriteriaTemplate(campaignId) {
        return this.inspectionsService.getCriteriaTemplate(campaignId);
    }
    async findOne(id) {
        return this.inspectionsService.findOne(id);
    }
    async findByCampaign(campaignId) {
        return this.inspectionsService.findByCampaign(campaignId);
    }
    async create(body) {
        return this.inspectionsService.create(body);
    }
    async updateStatus(id, body) {
        return this.inspectionsService.updateStatus(id, body.status, body.findings);
    }
    async remove(id) {
        return this.inspectionsService.remove(id);
    }
    async createPrimary(body) {
        return this.inspectionsService.createPrimary(body);
    }
    async updatePrimary(id, body) {
        return this.inspectionsService.updatePrimary(parseInt(id), body);
    }
    async removePrimary(id) {
        return this.inspectionsService.removePrimary(parseInt(id));
    }
    async createSecondary(body) {
        return this.inspectionsService.createSecondary(body);
    }
    async updateSecondary(id, body) {
        return this.inspectionsService.updateSecondary(parseInt(id), body);
    }
    async removeSecondary(id) {
        return this.inspectionsService.removeSecondary(parseInt(id));
    }
    async createDetail(body) {
        return this.inspectionsService.createDetail(body);
    }
    async createOption(body) {
        return this.inspectionsService.createOption(body);
    }
    async updateDetail(id, body) {
        return this.inspectionsService.updateDetail(parseInt(id), body);
    }
    async removeDetail(id) {
        return this.inspectionsService.removeDetail(parseInt(id));
    }
    async reorderPrimary(body) {
        return this.inspectionsService.reorderPrimary(body.ids, body.templateId);
    }
    async reorderSecondary(body) {
        return this.inspectionsService.reorderSecondary(body.ids);
    }
    async reorderDetail(body) {
        return this.inspectionsService.reorderDetail(body.ids);
    }
};
exports.InspectionsController = InspectionsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'استعراض جميع عمليات التفتيش' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('criteria-template'),
    (0, swagger_1.ApiOperation)({ summary: 'الحصول على قالب الأسئلة والبنود المعيارية لنموذج التفتيش' }),
    __param(0, (0, common_1.Query)('campaignId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "getCriteriaTemplate", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'تفاصيل عملية تفتيش محددة بجميع درجات الكيان' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)('campaign/:campaignId'),
    (0, swagger_1.ApiOperation)({ summary: 'الحصول على تقييم التفتيش الخاص بحملة تفتيشية محددة' }),
    __param(0, (0, common_1.Param)('campaignId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "findByCampaign", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EVALUATOR'),
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'إدخال وحساب تقييم تفتيش جديد لكيان محدد' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "create", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Put)(':id/status'),
    (0, swagger_1.ApiOperation)({ summary: 'مراجعة واعتماد أو رفض تقييم التفتيش' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "updateStatus", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'حذف عملية تفتيش' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "remove", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Post)('primary-criteria'),
    (0, swagger_1.ApiOperation)({ summary: 'إضافة محور رئيسي جديد' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "createPrimary", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Put)('primary-criteria/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'تعديل محور رئيسي' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "updatePrimary", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Delete)('primary-criteria/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'حذف محور رئيسي' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "removePrimary", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Post)('secondary-criteria'),
    (0, swagger_1.ApiOperation)({ summary: 'إضافة محور فرعي جديد' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "createSecondary", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Put)('secondary-criteria/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'تعديل محور فرعي' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "updateSecondary", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Delete)('secondary-criteria/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'حذف محور فرعي' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "removeSecondary", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR', 'EVALUATOR'),
    (0, common_1.Post)('criteria-detail'),
    (0, swagger_1.ApiOperation)({ summary: 'إضافة بند تفتيش تفصيلي جديد' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "createDetail", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR', 'EVALUATOR'),
    (0, common_1.Post)('criteria-option'),
    (0, swagger_1.ApiOperation)({ summary: 'إضافة خيار تقييم جديد' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "createOption", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Put)('criteria-detail/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'تعديل بند تفتيش تفصيلي' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "updateDetail", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Delete)('criteria-detail/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'حذف بند تفتيش تفصيلي' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "removeDetail", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Post)('primary-criteria/reorder'),
    (0, swagger_1.ApiOperation)({ summary: 'إعادة ترتيب المحاور الرئيسية' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "reorderPrimary", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Post)('secondary-criteria/reorder'),
    (0, swagger_1.ApiOperation)({ summary: 'إعادة ترتيب المحاور الفرعية' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "reorderSecondary", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Post)('criteria-detail/reorder'),
    (0, swagger_1.ApiOperation)({ summary: 'إعادة ترتيب البنود التفصيلية' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], InspectionsController.prototype, "reorderDetail", null);
exports.InspectionsController = InspectionsController = __decorate([
    (0, swagger_1.ApiTags)('Inspection Execution & Scores'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, common_1.Controller)('inspections'),
    __metadata("design:paramtypes", [inspections_service_1.InspectionsService])
], InspectionsController);
//# sourceMappingURL=inspections.controller.js.map