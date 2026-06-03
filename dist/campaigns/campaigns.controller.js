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
exports.CampaignsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const campaigns_service_1 = require("./campaigns.service");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
let CampaignsController = class CampaignsController {
    campaignsService;
    constructor(campaignsService) {
        this.campaignsService = campaignsService;
    }
    async findAll() {
        return this.campaignsService.findAll();
    }
    async findAllTypes() {
        return this.campaignsService.findAllTypes();
    }
    async createType(body) {
        return this.campaignsService.createType(body);
    }
    async updateType(id, body) {
        return this.campaignsService.updateType(id, body);
    }
    async removeType(id) {
        return this.campaignsService.removeType(id);
    }
    async findOne(id) {
        return this.campaignsService.findOne(id);
    }
    async create(body) {
        return this.campaignsService.create(body);
    }
    async update(id, body) {
        return this.campaignsService.update(id, body);
    }
    async remove(id) {
        return this.campaignsService.remove(id);
    }
    async addNote(id, body) {
        return this.campaignsService.addNote(id, body);
    }
    async updateNote(noteId, body) {
        return this.campaignsService.updateNote(noteId, body);
    }
    async deleteNote(noteId) {
        return this.campaignsService.deleteNote(noteId);
    }
    async addRecommendation(id, body) {
        return this.campaignsService.addRecommendation(id, body);
    }
    async updateRecommendation(recId, body) {
        return this.campaignsService.updateRecommendation(recId, body);
    }
    async deleteRecommendation(recId) {
        return this.campaignsService.deleteRecommendation(recId);
    }
    async addAppendix(id, body) {
        return this.campaignsService.addAppendix(id, body);
    }
    async updateAppendix(appId, body) {
        return this.campaignsService.updateAppendix(appId, body);
    }
    async deleteAppendix(appId) {
        return this.campaignsService.deleteAppendix(appId);
    }
};
exports.CampaignsController = CampaignsController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'عرض كل الحملات التفتيشية' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)('types/all'),
    (0, swagger_1.ApiOperation)({ summary: 'عرض كل أنواع اللجان' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "findAllTypes", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Post)('types/create'),
    (0, swagger_1.ApiOperation)({ summary: 'إضافة نوع لجنة جديد' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "createType", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Put)('types/update/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'تعديل نوع لجنة' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "updateType", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, common_1.Delete)('types/delete/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'حذف نوع لجنة' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "removeType", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'تفاصيل حملة تفتيشية محددة بجميع نتائجها وملاحظاتها' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "findOne", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'إنشاء حملة تفتيشية جديدة' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "create", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'تعديل بيانات حملة تفتيشية' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "update", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'حذف حملة تفتيشية' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "remove", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR', 'EVALUATOR'),
    (0, common_1.Post)(':id/notes'),
    (0, swagger_1.ApiOperation)({ summary: 'إضافة ملاحظة ختامية للحملة (إيجابية، سلبية، عائق، معضلة)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "addNote", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR', 'EVALUATOR'),
    (0, common_1.Put)('notes/:noteId'),
    (0, swagger_1.ApiOperation)({ summary: 'تعديل ملاحظة ختامية' }),
    __param(0, (0, common_1.Param)('noteId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "updateNote", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Delete)('notes/:noteId'),
    (0, swagger_1.ApiOperation)({ summary: 'حذف ملاحظة ختامية' }),
    __param(0, (0, common_1.Param)('noteId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "deleteNote", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR', 'EVALUATOR'),
    (0, common_1.Post)(':id/recommendations'),
    (0, swagger_1.ApiOperation)({ summary: 'إضافة توصية للحملة وجهتها المستهدفة' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "addRecommendation", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR', 'EVALUATOR'),
    (0, common_1.Put)('recommendations/:recId'),
    (0, swagger_1.ApiOperation)({ summary: 'تعديل توصية' }),
    __param(0, (0, common_1.Param)('recId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "updateRecommendation", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Delete)('recommendations/:recId'),
    (0, swagger_1.ApiOperation)({ summary: 'حذف توصية' }),
    __param(0, (0, common_1.Param)('recId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "deleteRecommendation", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR', 'EVALUATOR'),
    (0, common_1.Post)(':id/appendices'),
    (0, swagger_1.ApiOperation)({ summary: 'إضافة ملحق للحملة' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "addAppendix", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR', 'EVALUATOR'),
    (0, common_1.Put)('appendices/:appId'),
    (0, swagger_1.ApiOperation)({ summary: 'تعديل ملحق' }),
    __param(0, (0, common_1.Param)('appId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "updateAppendix", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EDITOR'),
    (0, common_1.Delete)('appendices/:appId'),
    (0, swagger_1.ApiOperation)({ summary: 'حذف ملحق' }),
    __param(0, (0, common_1.Param)('appId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CampaignsController.prototype, "deleteAppendix", null);
exports.CampaignsController = CampaignsController = __decorate([
    (0, swagger_1.ApiTags)('Campaigns Management'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, common_1.Controller)('campaigns'),
    __metadata("design:paramtypes", [campaigns_service_1.CampaignsService])
], CampaignsController);
//# sourceMappingURL=campaigns.controller.js.map