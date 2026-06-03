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
var KpiEngineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KpiEngineService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const schedule_1 = require("@nestjs/schedule");
const health_analytics_service_1 = require("./health-analytics.service");
const sla_monitoring_service_1 = require("./sla-monitoring.service");
let KpiEngineService = KpiEngineService_1 = class KpiEngineService {
    prisma;
    healthService;
    slaService;
    logger = new common_1.Logger(KpiEngineService_1.name);
    cacheStore = new Map();
    CACHE_TTLS = {
        EXECUTIVE_SUMMARY: 10 * 60 * 1000,
        HEALTH_ANALYTICS: 5 * 60 * 1000,
        ESCALATION_SUMMARY: 5 * 60 * 1000,
    };
    constructor(prisma, healthService, slaService) {
        this.prisma = prisma;
        this.healthService = healthService;
        this.slaService = slaService;
    }
    async onApplicationBootstrap() {
        this.logger.log('Checking database for initial historical backfill...');
        try {
            const snapshotCount = await this.prisma.executiveKpiSnapshot.count();
            if (snapshotCount === 0) {
                this.logger.log('ExecutiveKpiSnapshot table is empty. Initiating Initial Historical Backfill Strategy...');
                await this.slaService.checkSlaBreaches();
                await this.healthService.recordAllHealthScores();
                await this.generateDailySnapshot();
                this.logger.log('Initial Historical Backfill completed successfully!');
            }
            else {
                this.logger.log(`Found ${snapshotCount} snapshots. Skipping historical backfill.`);
            }
        }
        catch (error) {
            this.logger.error('Failed to run initial historical backfill on startup:', error.stack);
        }
    }
    clearCache(key) {
        if (key) {
            this.cacheStore.delete(key);
            this.logger.log(`Cache cleared for key: ${key}`);
        }
        else {
            this.cacheStore.clear();
            this.logger.log('All analytics caches cleared.');
        }
    }
    async getCachedData(cacheKey, ttl, fetchFn) {
        const cached = this.cacheStore.get(cacheKey);
        const now = Date.now();
        if (cached && now < cached.expiresAt) {
            this.logger.log(`Cache Hit for key: ${cacheKey}`);
            return cached.data;
        }
        this.logger.log(`Cache Miss/Expired for key: ${cacheKey}. Fetching fresh data...`);
        const freshData = await fetchFn();
        this.cacheStore.set(cacheKey, {
            data: freshData,
            expiresAt: now + ttl,
        });
        return freshData;
    }
    getSecurityFilter(user) {
        const where = {};
        if (user && user.role !== 'ADMIN' && user.role !== 'EVALUATOR') {
            where.OR = [];
            if (user.department) {
                where.OR.push({
                    assignedEntityNameSnapshot: {
                        mode: 'insensitive',
                        equals: user.department.trim(),
                    },
                });
            }
            where.OR.push({ assignedUserId: user.userId });
            if (where.OR.length === 0) {
                where.id = 'none';
            }
        }
        return where;
    }
    async calculateKpiCatalog(user) {
        const filter = this.getSecurityFilter(user);
        const trackings = await this.prisma.recommendationTracking.findMany({ where: filter });
        const total = trackings.length;
        if (total === 0) {
            return {
                overallProgressRate: 0,
                closureRate: 0,
                averageResolutionTimeDays: null,
                slaAdherenceRate: null,
                escalationVolume: 0,
                criticalOverdueRate: 0,
                total,
            };
        }
        const sumProgress = trackings.reduce((sum, item) => sum + item.progressPercent, 0);
        const overallProgressRate = Number((sumProgress / total).toFixed(2));
        const closedCount = trackings.filter(item => item.status === client_1.RecommendationStatus.CLOSED || item.status === client_1.RecommendationStatus.VERIFIED).length;
        const closureRate = Number(((closedCount / total) * 100).toFixed(2));
        const closedItems = trackings.filter(item => (item.status === client_1.RecommendationStatus.CLOSED || item.status === client_1.RecommendationStatus.VERIFIED) &&
            item.closedAt);
        let averageResolutionTimeDays = null;
        if (closedItems.length > 0) {
            const totalResolutionTime = closedItems.reduce((sum, item) => {
                const issued = new Date(item.issuedAt);
                const closed = new Date(item.closedAt);
                return sum + (closed.getTime() - issued.getTime());
            }, 0);
            averageResolutionTimeDays = Number((totalResolutionTime / closedItems.length / (1000 * 60 * 60 * 24)).toFixed(2));
        }
        const closedWithDue = closedItems.filter(item => item.dueDate);
        let slaAdherenceRate = null;
        if (closedWithDue.length > 0) {
            const adheredCount = closedWithDue.filter(item => {
                const closed = new Date(item.closedAt);
                const due = new Date(item.dueDate);
                closed.setHours(0, 0, 0, 0);
                due.setHours(0, 0, 0, 0);
                return closed <= due;
            }).length;
            slaAdherenceRate = Number(((adheredCount / closedWithDue.length) * 100).toFixed(2));
        }
        const escalationVolume = trackings.filter(item => item.escalationLevel > 0).length;
        const now = new Date();
        const criticalOverdueCount = trackings.filter(item => {
            if (!item.dueDate)
                return false;
            const isClosed = [client_1.RecommendationStatus.CLOSED, client_1.RecommendationStatus.VERIFIED, client_1.RecommendationStatus.REJECTED].includes(item.status);
            if (isClosed)
                return false;
            const due = new Date(item.dueDate);
            if (now <= due)
                return false;
            const diffTime = Math.abs(now.getTime() - due.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const isCriticalOrHigh = item.riskLevel === client_1.RiskLevel.CRITICAL || item.riskLevel === client_1.RiskLevel.HIGH;
            return isCriticalOrHigh && diffDays > 15;
        }).length;
        const criticalOverdueRate = Number(((criticalOverdueCount / total) * 100).toFixed(2));
        return {
            overallProgressRate,
            closureRate,
            averageResolutionTimeDays,
            slaAdherenceRate,
            escalationVolume,
            criticalOverdueRate,
            total,
        };
    }
    async getEntityBreakdown(user) {
        const filter = this.getSecurityFilter(user);
        const trackings = await this.prisma.recommendationTracking.findMany({
            where: filter,
            include: { assignedEntity: true },
        });
        const entityMap = new Map();
        for (const item of trackings) {
            const entityId = item.assignedEntityId || 'unassigned';
            const entityName = item.assignedEntity ? item.assignedEntity.name : 'غير معين';
            const existing = entityMap.get(entityId) || {
                id: entityId,
                name: entityName,
                total: 0,
                closed: 0,
                sumProgress: 0,
            };
            existing.total++;
            existing.sumProgress += item.progressPercent;
            if (item.status === client_1.RecommendationStatus.CLOSED || item.status === client_1.RecommendationStatus.VERIFIED) {
                existing.closed++;
            }
            entityMap.set(entityId, existing);
        }
        const breakdown = [];
        entityMap.forEach(val => {
            breakdown.push({
                entityId: val.id,
                entityName: val.name,
                total: val.total,
                closed: val.closed,
                complianceRate: Number((val.sumProgress / val.total).toFixed(2)),
            });
        });
        return breakdown;
    }
    async generateDailySnapshot() {
        this.logger.log('Executing daily executive KPI snapshot generation job...');
        try {
            const kpis = await this.calculateKpiCatalog();
            const entityBreakdown = await this.getEntityBreakdown();
            const trackings = await this.prisma.recommendationTracking.findMany();
            const openRecommendations = trackings.filter(item => ![client_1.RecommendationStatus.CLOSED, client_1.RecommendationStatus.VERIFIED, client_1.RecommendationStatus.REJECTED].includes(item.status)).length;
            const closedRecommendations = trackings.length - openRecommendations;
            const overdueCount = trackings.filter(item => {
                if (!item.dueDate)
                    return false;
                const isOpen = ![client_1.RecommendationStatus.CLOSED, client_1.RecommendationStatus.VERIFIED, client_1.RecommendationStatus.REJECTED].includes(item.status);
                return isOpen && new Date(item.dueDate) < new Date();
            }).length;
            const escalationLevel3Count = trackings.filter(item => item.escalationLevel === 3).length;
            const criticalCount = trackings.filter(item => item.riskLevel === client_1.RiskLevel.CRITICAL).length;
            const snapshot = await this.prisma.executiveKpiSnapshot.create({
                data: {
                    totalRecommendations: kpis.total,
                    openRecommendations,
                    closedRecommendations,
                    overallComplianceRate: kpis.overallProgressRate,
                    closureRate: kpis.closureRate,
                    averageResolutionTimeDays: kpis.averageResolutionTimeDays,
                    slaAdherenceRate: kpis.slaAdherenceRate,
                    overdueCount,
                    escalationLevel3Count,
                    criticalCount,
                    entityBreakdown: entityBreakdown,
                },
            });
            this.logger.log(`Executive KPI Snapshot created successfully with ID: ${snapshot.id}`);
            return snapshot;
        }
        catch (error) {
            this.logger.error('Failed to generate daily KPI snapshot:', error.stack);
            throw error;
        }
    }
    async getExecutiveSummary(user) {
        const isRestricted = user && user.role !== 'ADMIN' && user.role !== 'EVALUATOR';
        const cacheKey = isRestricted
            ? `EXECUTIVE_SUMMARY_USER_${user.userId}`
            : 'EXECUTIVE_SUMMARY';
        return this.getCachedData(cacheKey, this.CACHE_TTLS.EXECUTIVE_SUMMARY, async () => {
            const catalog = await this.calculateKpiCatalog(user);
            const breakdown = await this.getEntityBreakdown(user);
            const activeCampaigns = await this.prisma.campaign.count({
                where: { status: 'active' },
            });
            const pendingInspections = await this.prisma.inspection.count({
                where: { status: 'pendingReview' },
            });
            const laggingEntities = [...breakdown]
                .filter(e => e.entityId !== 'unassigned')
                .sort((a, b) => a.complianceRate - b.complianceRate)
                .slice(0, 5);
            const performingEntities = [...breakdown]
                .filter(e => e.entityId !== 'unassigned')
                .sort((a, b) => b.complianceRate - a.complianceRate)
                .slice(0, 5);
            return {
                overallCompliance: catalog.overallProgressRate,
                closureRate: catalog.closureRate,
                averageResolutionTimeDays: catalog.averageResolutionTimeDays,
                slaAdherence: catalog.slaAdherenceRate,
                escalationVolume: catalog.escalationVolume,
                criticalOverdueRate: catalog.criticalOverdueRate,
                totalRecommendations: catalog.total,
                activeCampaigns,
                pendingInspections,
                laggingEntities,
                performingEntities,
            };
        });
    }
    async getHealthAnalyticsSummary(user) {
        const isRestricted = user && user.role !== 'ADMIN' && user.role !== 'EVALUATOR';
        const cacheKey = isRestricted
            ? `HEALTH_ANALYTICS_USER_${user.userId}`
            : 'HEALTH_ANALYTICS';
        return this.getCachedData(cacheKey, this.CACHE_TTLS.HEALTH_ANALYTICS, async () => {
            const filter = this.getSecurityFilter(user);
            const trackings = await this.prisma.recommendationTracking.findMany({
                where: filter,
                include: { evidence: true },
            });
            const matrix = {
                EXCELLENT: 0,
                GOOD: 0,
                NEEDS_ATTENTION: 0,
                AT_RISK: 0,
                CRITICAL: 0,
            };
            const listWithScores = trackings.map(t => {
                const score = this.healthService.calculateHealthScore(t);
                const status = this.healthService.getHealthStatus(score);
                matrix[status]++;
                return {
                    id: t.id,
                    recommendationNumber: t.recommendationNumber,
                    score,
                    status,
                    progress: t.progressPercent,
                };
            });
            return {
                matrix,
                recommendations: listWithScores,
            };
        });
    }
    async getEscalationSummary(user) {
        const isRestricted = user && user.role !== 'ADMIN' && user.role !== 'EVALUATOR';
        const cacheKey = isRestricted
            ? `ESCALATION_SUMMARY_USER_${user.userId}`
            : 'ESCALATION_SUMMARY';
        return this.getCachedData(cacheKey, this.CACHE_TTLS.ESCALATION_SUMMARY, async () => {
            const filter = this.getSecurityFilter(user);
            const trackings = await this.prisma.recommendationTracking.findMany({ where: filter });
            const levels = {
                level0: trackings.filter(t => t.escalationLevel === 0).length,
                level1: trackings.filter(t => t.escalationLevel === 1).length,
                level2: trackings.filter(t => t.escalationLevel === 2).length,
                level3: trackings.filter(t => t.escalationLevel === 3).length,
            };
            const breaches = await this.prisma.slaBreachLog.findMany({
                where: {
                    tracking: filter
                }
            });
            const drivers = {
                response: breaches.filter(b => b.milestoneType === 'RESPONSE').length,
                resolution: breaches.filter(b => b.milestoneType === 'RESOLUTION').length,
                closure: breaches.filter(b => b.milestoneType === 'CLOSURE').length,
            };
            return {
                levels,
                drivers,
            };
        });
    }
};
exports.KpiEngineService = KpiEngineService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_MIDNIGHT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], KpiEngineService.prototype, "generateDailySnapshot", null);
exports.KpiEngineService = KpiEngineService = KpiEngineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        health_analytics_service_1.HealthAnalyticsService,
        sla_monitoring_service_1.SlaMonitoringService])
], KpiEngineService);
//# sourceMappingURL=kpi-engine.service.js.map