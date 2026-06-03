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
var HealthAnalyticsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthAnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let HealthAnalyticsService = HealthAnalyticsService_1 = class HealthAnalyticsService {
    prisma;
    logger = new common_1.Logger(HealthAnalyticsService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    calculateHealthScore(tracking) {
        if (tracking.status === client_1.RecommendationStatus.CLOSED || tracking.status === client_1.RecommendationStatus.VERIFIED || tracking.status === client_1.RecommendationStatus.REJECTED) {
            return 100;
        }
        let score = 100;
        const now = new Date();
        if (tracking.dueDate && new Date(tracking.dueDate) < now) {
            const diffTime = Math.abs(now.getTime() - new Date(tracking.dueDate).getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays > 15) {
                score -= 60;
            }
            else {
                score -= 40;
            }
        }
        if (tracking.escalationLevel === 1) {
            score -= 15;
        }
        else if (tracking.escalationLevel === 2) {
            score -= 30;
        }
        else if (tracking.escalationLevel >= 3) {
            score -= 50;
        }
        const lastUpdate = new Date(tracking.updatedAt);
        const inactiveTime = Math.abs(now.getTime() - lastUpdate.getTime());
        const inactiveDays = Math.ceil(inactiveTime / (1000 * 60 * 60 * 24));
        if (inactiveDays > 30) {
            score -= 20;
        }
        const hasEvidence = tracking.evidence && tracking.evidence.length > 0;
        if (tracking.progressPercent > 50 && !hasEvidence) {
            score -= 15;
        }
        return Math.max(0, Math.min(100, score));
    }
    getHealthStatus(score) {
        if (score >= 90)
            return 'EXCELLENT';
        if (score >= 75)
            return 'GOOD';
        if (score >= 60)
            return 'NEEDS_ATTENTION';
        if (score >= 40)
            return 'AT_RISK';
        return 'CRITICAL';
    }
    async logHealthHistory(trackingId) {
        const tracking = await this.prisma.recommendationTracking.findUnique({
            where: { id: trackingId },
            include: { evidence: true },
        });
        if (!tracking) {
            this.logger.error(`Tracking record not found: ${trackingId}`);
            return;
        }
        const score = this.calculateHealthScore(tracking);
        await this.prisma.recommendationHealthHistory.create({
            data: {
                trackingId,
                score,
                statusSnapshot: tracking.status,
            },
        });
    }
    async recordAllHealthScores() {
        this.logger.log('Recording health scores history for all active recommendations...');
        const trackings = await this.prisma.recommendationTracking.findMany({
            include: { evidence: true },
        });
        for (const tracking of trackings) {
            const score = this.calculateHealthScore(tracking);
            await this.prisma.recommendationHealthHistory.create({
                data: {
                    trackingId: tracking.id,
                    score,
                    statusSnapshot: tracking.status,
                },
            });
        }
        this.logger.log(`Successfully recorded health history for ${trackings.length} recommendations.`);
    }
};
exports.HealthAnalyticsService = HealthAnalyticsService;
exports.HealthAnalyticsService = HealthAnalyticsService = HealthAnalyticsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], HealthAnalyticsService);
//# sourceMappingURL=health-analytics.service.js.map