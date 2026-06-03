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
exports.AnalyticsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const kpi_engine_service_1 = require("./kpi-engine.service");
const sla_monitoring_service_1 = require("./sla-monitoring.service");
const sla_engine_service_1 = require("./sla-engine.service");
const health_analytics_service_1 = require("./health-analytics.service");
const roles_guard_1 = require("../auth/roles.guard");
const roles_decorator_1 = require("../auth/roles.decorator");
const classification_guard_1 = require("../auth/classification.guard");
const classification_decorator_1 = require("../auth/classification.decorator");
const client_1 = require("@prisma/client");
let AnalyticsController = class AnalyticsController {
    kpiEngine;
    slaService;
    slaEngine;
    healthService;
    constructor(kpiEngine, slaService, slaEngine, healthService) {
        this.kpiEngine = kpiEngine;
        this.slaService = slaService;
        this.slaEngine = slaEngine;
        this.healthService = healthService;
    }
    async getExecutiveSummary(req) {
        return this.kpiEngine.getExecutiveSummary(req.user);
    }
    async getHealthSummary(req) {
        return this.kpiEngine.getHealthAnalyticsSummary(req.user);
    }
    async getEscalationSummary(req) {
        return this.kpiEngine.getEscalationSummary(req.user);
    }
    async getSlaMetrics(req) {
        return this.slaEngine.calculateForAll();
    }
    async getSlaMetricsById(id) {
        const result = await this.slaEngine.calculateForOne(id);
        if (!result) {
            return { message: 'التوصية غير موجودة' };
        }
        return result;
    }
    async getSlaSummary(req) {
        return this.slaEngine.getSlaSummary();
    }
    async triggerSnapshot() {
        const snapshot = await this.kpiEngine.generateDailySnapshot();
        this.kpiEngine.clearCache();
        return {
            message: 'تم توليد اللقطة الإحصائية للمؤشرات وحفظها بنجاح',
            snapshotId: snapshot.id,
            date: snapshot.snapshotDate,
        };
    }
    async triggerSlaCheck() {
        await this.slaService.checkSlaBreaches();
        this.kpiEngine.clearCache();
        return {
            message: 'تم تشغيل فحص خروقات SLA وتحديث السجلات بنجاح',
        };
    }
    async triggerBackfill() {
        await this.slaService.checkSlaBreaches();
        await this.healthService.recordAllHealthScores();
        await this.kpiEngine.generateDailySnapshot();
        this.kpiEngine.clearCache();
        return {
            message: 'تم تشغيل التغذية التاريخية الأولية وتوليد السجلات بنجاح',
        };
    }
    async clearCache() {
        this.kpiEngine.clearCache();
        return {
            message: 'تم مسح التخزين المؤقت بالكامل بنجاح',
        };
    }
};
exports.AnalyticsController = AnalyticsController;
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EVALUATOR', 'EDITOR', 'COORDINATOR', 'VIEWER'),
    (0, classification_decorator_1.RequiredClassification)(client_1.SecurityClassificationLevel.SECRET),
    (0, common_1.Get)('executive-summary'),
    (0, swagger_1.ApiOperation)({ summary: 'استرجاع المؤشرات الكلية ولوحة القيادة التنفيذية' }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getExecutiveSummary", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EVALUATOR', 'EDITOR', 'COORDINATOR', 'VIEWER'),
    (0, classification_decorator_1.RequiredClassification)(client_1.SecurityClassificationLevel.CONFIDENTIAL),
    (0, common_1.Get)('health-summary'),
    (0, swagger_1.ApiOperation)({ summary: 'استرجاع تحليلات ومؤشرات صحة التوصيات' }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getHealthSummary", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EVALUATOR', 'EDITOR', 'VIEWER'),
    (0, classification_decorator_1.RequiredClassification)(client_1.SecurityClassificationLevel.CONFIDENTIAL),
    (0, common_1.Get)('escalation-summary'),
    (0, swagger_1.ApiOperation)({ summary: 'استرجاع ملخص حالة ومسببات التصعيد' }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getEscalationSummary", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EVALUATOR', 'EDITOR', 'COORDINATOR', 'VIEWER'),
    (0, classification_decorator_1.RequiredClassification)(client_1.SecurityClassificationLevel.CONFIDENTIAL),
    (0, common_1.Get)('sla/metrics'),
    (0, swagger_1.ApiOperation)({ summary: 'استرجاع جميع مقاييس SLA للتوصيات' }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getSlaMetrics", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EVALUATOR', 'EDITOR', 'COORDINATOR', 'VIEWER'),
    (0, classification_decorator_1.RequiredClassification)(client_1.SecurityClassificationLevel.CONFIDENTIAL),
    (0, common_1.Get)('sla/metrics/:id'),
    (0, swagger_1.ApiOperation)({ summary: 'استرجاع مقاييس SLA لتوصية محددة' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getSlaMetricsById", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN', 'EVALUATOR', 'EDITOR', 'COORDINATOR', 'VIEWER'),
    (0, classification_decorator_1.RequiredClassification)(client_1.SecurityClassificationLevel.CONFIDENTIAL),
    (0, common_1.Get)('sla/summary'),
    (0, swagger_1.ApiOperation)({ summary: 'استرجاع ملخص SLA الإجمالي' }),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "getSlaSummary", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, classification_decorator_1.RequiredClassification)(client_1.SecurityClassificationLevel.SECRET),
    (0, common_1.Post)('admin/trigger-snapshot'),
    (0, swagger_1.ApiOperation)({ summary: 'توليد لقطة إحصائية جديدة للمؤشرات يدوياً' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "triggerSnapshot", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, classification_decorator_1.RequiredClassification)(client_1.SecurityClassificationLevel.SECRET),
    (0, common_1.Post)('admin/trigger-sla'),
    (0, swagger_1.ApiOperation)({ summary: 'تشغيل فحص اتفاقية مستوى الخدمة SLA يدوياً لتسجيل الخروقات' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "triggerSlaCheck", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, classification_decorator_1.RequiredClassification)(client_1.SecurityClassificationLevel.SECRET),
    (0, common_1.Post)('admin/trigger-backfill'),
    (0, swagger_1.ApiOperation)({ summary: 'تشغيل التغذية التاريخية الأولية يدوياً' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "triggerBackfill", null);
__decorate([
    (0, roles_decorator_1.Roles)('ADMIN'),
    (0, classification_decorator_1.RequiredClassification)(client_1.SecurityClassificationLevel.SECRET),
    (0, common_1.Post)('admin/clear-cache'),
    (0, swagger_1.ApiOperation)({ summary: 'مسح التخزين المؤقت للمؤشرات واللوحات يدوياً' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AnalyticsController.prototype, "clearCache", null);
exports.AnalyticsController = AnalyticsController = __decorate([
    (0, swagger_1.ApiTags)('Executive Intelligence & Analytics'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard, classification_guard_1.SecurityClassificationGuard),
    (0, common_1.Controller)('analytics'),
    __metadata("design:paramtypes", [kpi_engine_service_1.KpiEngineService,
        sla_monitoring_service_1.SlaMonitoringService,
        sla_engine_service_1.SlaEngineService,
        health_analytics_service_1.HealthAnalyticsService])
], AnalyticsController);
//# sourceMappingURL=analytics.controller.js.map