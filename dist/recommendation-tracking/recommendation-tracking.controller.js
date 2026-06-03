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
exports.RecommendationTrackingController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const swagger_1 = require("@nestjs/swagger");
const multer_1 = require("multer");
const path_1 = require("path");
const fs_1 = require("fs");
const recommendation_tracking_service_1 = require("./recommendation-tracking.service");
const assign_recommendation_dto_1 = require("./dto/assign-recommendation.dto");
const update_progress_dto_1 = require("./dto/update-progress.dto");
const add_comment_dto_1 = require("./dto/add-comment.dto");
const verify_close_dto_1 = require("./dto/verify-close.dto");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
let RecommendationTrackingController = class RecommendationTrackingController {
    service;
    constructor(service) {
        this.service = service;
    }
    async getDashboardSummary() {
        return this.service.getDashboardSummary();
    }
    async getStatsByRisk() {
        return this.service.getStatsByRisk();
    }
    async getStatsByImpact() {
        return this.service.getStatsByImpact();
    }
    async getLaggingEntities() {
        return this.service.getLaggingEntities();
    }
    async runEscalations(req) {
        return this.service.runEscalationCheck(req.user);
    }
    async findAll(query, req) {
        return this.service.findAll(query, req.user);
    }
    async findOne(id, req) {
        return this.service.findOne(id, req.user);
    }
    async getTimeline(id, req) {
        return this.service.getTimeline(id, req.user);
    }
    async assign(id, dto, req) {
        return this.service.assign(id, dto, req.user);
    }
    async updateProgress(id, dto, req) {
        return this.service.updateProgress(id, dto, req.user);
    }
    async getCommentsTree(id, req) {
        return this.service.getCommentsTree(id, req.user);
    }
    async addComment(id, dto, req) {
        return this.service.addComment(id, dto, req.user);
    }
    async editComment(commentId, dto, req) {
        return this.service.editComment(commentId, dto.commentText, req.user);
    }
    async deleteComment(commentId, req) {
        return this.service.deleteComment(commentId, req.user);
    }
    async addEvidence(id, file, description, req) {
        if (!file) {
            throw new common_1.BadRequestException('يجب اختيار ملف لرفعه كدليل إثبات');
        }
        return this.service.addEvidence(id, file, description, req.user);
    }
    async verifyClose(id, dto, req) {
        return this.service.verifyClose(id, dto, req.user);
    }
};
exports.RecommendationTrackingController = RecommendationTrackingController;
__decorate([
    (0, common_1.Get)('stats/summary'),
    (0, swagger_1.ApiOperation)({ summary: 'الحصول على ملخص مؤشرات الأداء الإجمالية لمتابعة التوصيات' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "getDashboardSummary", null);
__decorate([
    (0, common_1.Get)('stats/by-risk'),
    (0, swagger_1.ApiOperation)({ summary: 'توزيع التوصيات قيد المتابعة حسب مستوى الخطورة' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "getStatsByRisk", null);
__decorate([
    (0, common_1.Get)('stats/by-impact'),
    (0, swagger_1.ApiOperation)({ summary: 'توزيع التوصيات حسب مجالات وتصنيف الأثر بالوزارة' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "getStatsByImpact", null);
__decorate([
    (0, common_1.Get)('stats/by-entity'),
    (0, swagger_1.ApiOperation)({ summary: 'قائمة الجهات الأكثر تأخراً وتلكؤاً في إغلاق التوصيات' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "getLaggingEntities", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EVALUATOR'),
    (0, common_1.Post)('admin/run-escalations'),
    (0, swagger_1.ApiOperation)({ summary: 'تشغيل فحص التصعيد التلقائي الإداري للتوصيات المتأخرة' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "runEscalations", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'جلب وقفل وتصفية التوصيات قيد المتابعة' }),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'تفاصيل التوصية والخط الزمني الكامل وسجل المرفقات' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "findOne", null);
__decorate([
    (0, common_1.Get)(':id/timeline'),
    (0, swagger_1.ApiOperation)({ summary: 'الخط الزمني الكامل للتوصية منذ الإصدار وحتى الإغلاق' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "getTimeline", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EVALUATOR'),
    (0, common_1.Post)(':id/assign'),
    (0, swagger_1.ApiOperation)({ summary: 'تكليف جهة مسؤولة أو مستخدم وتحديد تاريخ استحقاق التوصية' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, assign_recommendation_dto_1.AssignRecommendationDto, Object]),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "assign", null);
__decorate([
    (0, common_1.Patch)(':id/progress'),
    (0, swagger_1.ApiOperation)({ summary: 'تحديث نسبة إنجاز التوصية وتوثيق الإجراء المتخذ من قبل الجهة المعنية' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_progress_dto_1.UpdateProgressDto, Object]),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "updateProgress", null);
__decorate([
    (0, common_1.Get)(':id/comments'),
    (0, swagger_1.ApiOperation)({ summary: 'جلب شجرة التعليقات الخاصة بالتوصية' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "getCommentsTree", null);
__decorate([
    (0, common_1.Post)(':id/comments'),
    (0, swagger_1.ApiOperation)({ summary: 'إضافة تعليق أو رد على الخط الزمني للتوصية' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, add_comment_dto_1.AddCommentDto, Object]),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "addComment", null);
__decorate([
    (0, common_1.Put)('comments/:commentId'),
    (0, swagger_1.ApiOperation)({ summary: 'تعديل تعليق مكتوب مسبقاً' }),
    __param(0, (0, common_1.Param)('commentId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "editComment", null);
__decorate([
    (0, common_1.Delete)('comments/:commentId'),
    (0, swagger_1.ApiOperation)({ summary: 'حذف تعليق ناعم مع الحفاظ على الهيكل التنظيمي' }),
    __param(0, (0, common_1.Param)('commentId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "deleteComment", null);
__decorate([
    (0, common_1.Post)(':id/evidence'),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, swagger_1.ApiOperation)({ summary: 'رفع ملفات أدلة إثبات المعالجة وإنجاز التوصية' }),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        storage: (0, multer_1.diskStorage)({
            destination: (req, file, callback) => {
                const dir = './uploads/evidence';
                if (!(0, fs_1.existsSync)(dir)) {
                    (0, fs_1.mkdirSync)(dir, { recursive: true });
                }
                callback(null, dir);
            },
            filename: (req, file, callback) => {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
                const ext = (0, path_1.extname)(file.originalname);
                callback(null, `evidence-${uniqueSuffix}${ext}`);
            },
        }),
        limits: { fileSize: 10 * 1024 * 1024 },
        fileFilter: (req, file, callback) => {
            const allowedTypes = [
                'application/pdf',
                'image/png',
                'image/jpeg',
                'image/jpg',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/msword',
                'application/zip',
                'application/x-zip-compressed',
            ];
            if (!allowedTypes.includes(file.mimetype)) {
                return callback(new common_1.BadRequestException('نوع الملف غير مدعوم. المسموح به: PDF, PNG, JPG, DOCX, ZIP'), false);
            }
            callback(null, true);
        },
    })),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Body)('description')),
    __param(3, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String, Object]),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "addEvidence", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EVALUATOR'),
    (0, common_1.Post)(':id/verify-close'),
    (0, swagger_1.ApiOperation)({ summary: 'تدقيق ومطابقة الأدلة ميدانياً وإغلاق أو رفض التوصية الرقابية' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, verify_close_dto_1.VerifyCloseRecommendationDto, Object]),
    __metadata("design:returntype", Promise)
], RecommendationTrackingController.prototype, "verifyClose", null);
exports.RecommendationTrackingController = RecommendationTrackingController = __decorate([
    (0, swagger_1.ApiTags)('Recommendation Tracking (متابعة التوصيات الرقابية)'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, common_1.Controller)('recommendations/tracking'),
    __metadata("design:paramtypes", [recommendation_tracking_service_1.RecommendationTrackingService])
], RecommendationTrackingController);
//# sourceMappingURL=recommendation-tracking.controller.js.map