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
var SlaMonitoringService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlaMonitoringService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const sla_engine_service_1 = require("./sla-engine.service");
let SlaMonitoringService = SlaMonitoringService_1 = class SlaMonitoringService {
    prisma;
    slaEngine;
    logger = new common_1.Logger(SlaMonitoringService_1.name);
    constructor(prisma, slaEngine) {
        this.prisma = prisma;
        this.slaEngine = slaEngine;
    }
    async checkSlaBreaches() {
        this.logger.log('Starting SLA monitoring breach scan (via SlaEngineService)...');
        const result = await this.slaEngine.checkAndLogBreaches();
        const notifResult = await this.slaEngine.createSlaNotifications();
        this.logger.log(`SLA breach scan completed. Active breaches: Response: ${result.response}, Resolution: ${result.resolution}, Closure: ${result.closure}. Notifications: ${notifResult.created}`);
    }
    async logOrUpdateBreach(trackingId, milestoneType, durationDays) {
        const existing = await this.prisma.slaBreachLog.findFirst({
            where: {
                trackingId,
                milestoneType
            }
        });
        if (existing) {
            await this.prisma.slaBreachLog.update({
                where: { id: existing.id },
                data: { breachDurationDays: durationDays }
            });
        }
        else {
            await this.prisma.slaBreachLog.create({
                data: {
                    trackingId,
                    milestoneType,
                    breachDurationDays: durationDays
                }
            });
        }
    }
};
exports.SlaMonitoringService = SlaMonitoringService;
exports.SlaMonitoringService = SlaMonitoringService = SlaMonitoringService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        sla_engine_service_1.SlaEngineService])
], SlaMonitoringService);
//# sourceMappingURL=sla-monitoring.service.js.map