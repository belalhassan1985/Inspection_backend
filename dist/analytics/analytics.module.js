"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsModule = void 0;
const common_1 = require("@nestjs/common");
const prisma_module_1 = require("../prisma/prisma.module");
const notification_module_1 = require("../notifications/notification.module");
const kpi_engine_service_1 = require("./kpi-engine.service");
const health_analytics_service_1 = require("./health-analytics.service");
const sla_monitoring_service_1 = require("./sla-monitoring.service");
const sla_engine_service_1 = require("./sla-engine.service");
const analytics_controller_1 = require("./analytics.controller");
let AnalyticsModule = class AnalyticsModule {
};
exports.AnalyticsModule = AnalyticsModule;
exports.AnalyticsModule = AnalyticsModule = __decorate([
    (0, common_1.Module)({
        imports: [prisma_module_1.PrismaModule, notification_module_1.NotificationModule],
        controllers: [analytics_controller_1.AnalyticsController],
        providers: [
            kpi_engine_service_1.KpiEngineService,
            health_analytics_service_1.HealthAnalyticsService,
            sla_monitoring_service_1.SlaMonitoringService,
            sla_engine_service_1.SlaEngineService,
        ],
        exports: [
            kpi_engine_service_1.KpiEngineService,
            health_analytics_service_1.HealthAnalyticsService,
            sla_monitoring_service_1.SlaMonitoringService,
            sla_engine_service_1.SlaEngineService,
        ],
    })
], AnalyticsModule);
//# sourceMappingURL=analytics.module.js.map