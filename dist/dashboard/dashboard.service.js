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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let DashboardService = class DashboardService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getExecutiveSummary() {
        const approvedAvg = await this.prisma.inspection.aggregate({
            _avg: { totalScore: true },
            where: { status: 'approved' },
        });
        const overallCompliance = approvedAvg._avg.totalScore
            ? Number(Number(approvedAvg._avg.totalScore).toFixed(2))
            : 0;
        const activeCampaigns = await this.prisma.campaign.count({
            where: { status: 'active' },
        });
        const totalPositions = await this.prisma.entityPosition.count();
        const vacantPositions = await this.prisma.entityPosition.count({
            where: {
                OR: [
                    { positionStatus: 'vacant' },
                    { positionHolder: '' },
                    { isActive: false },
                ],
            },
        });
        const commandDeficitRate = totalPositions > 0
            ? Number(((vacantPositions / totalPositions) * 100).toFixed(2))
            : 0;
        const pendingInspections = await this.prisma.inspection.count({
            where: { status: 'pendingReview' },
        });
        const totalRecommendations = await this.prisma.campaignRecommendation.count({
            where: { campaign: { status: 'active' } },
        });
        const openRecommendations = await this.prisma.campaignRecommendation.count({
            where: { campaign: { status: 'active' } },
        });
        const closedRecommendations = await this.prisma.campaignRecommendation.count({
            where: { campaign: { NOT: { status: 'active' } } },
        });
        const topAuthoritiesGrouped = await this.prisma.campaignRecommendation.groupBy({
            by: ['authorityName'],
            _count: { id: true },
            orderBy: { _count: { id: 'desc' } },
            take: 5,
        });
        const topAuthorities = topAuthoritiesGrouped.map((item) => ({
            authorityName: item.authorityName || 'جهة غير محددة',
            count: item._count.id,
        }));
        const occupiedPositions = await this.prisma.entityPosition.count({
            where: {
                OR: [
                    { positionStatus: { in: ['اصالة', 'وكالة'] } },
                    { positionHolder: { not: '' } },
                ],
            },
        });
        const humanIntegrationRate = totalPositions > 0
            ? Number(((occupiedPositions / totalPositions) * 100).toFixed(2))
            : 0;
        const grades = await this.prisma.inspectionGrade.findMany();
        let totalWorking = 0;
        let totalBroken = 0;
        for (const g of grades) {
            const data = g.quantitativeData;
            if (data && Array.isArray(data)) {
                for (const row of data) {
                    if (row && typeof row === 'object') {
                        const workingVal = Number(row.working);
                        const brokenVal = Number(row.broken);
                        if (!isNaN(workingVal) && !isNaN(brokenVal)) {
                            totalWorking += workingVal;
                            totalBroken += brokenVal;
                        }
                    }
                }
            }
        }
        const vehicleReadinessRate = (totalWorking + totalBroken) > 0
            ? Number(((totalWorking / (totalWorking + totalBroken)) * 100).toFixed(2))
            : 85.0;
        const approvedInspections = await this.prisma.inspection.findMany({
            where: { status: 'approved' },
            orderBy: { totalScore: 'desc' },
            include: {
                entity: {
                    include: {
                        positions: {
                            where: { isActive: true },
                        },
                    },
                },
            },
        });
        const findCommander = (positions) => {
            if (!positions || positions.length === 0)
                return { rank: '', name: 'غير محدد' };
            const cmdKeywords = ['مدير', 'آمر', 'قائد', 'رئيس'];
            const commander = positions.find((pos) => cmdKeywords.some((keyword) => pos.positionName.includes(keyword)));
            const chosen = commander || positions[0];
            return {
                rank: chosen.rank || '',
                name: chosen.positionHolder || 'شاغر',
            };
        };
        let best = null;
        let worst = null;
        if (approvedInspections.length > 0) {
            const bestInsp = approvedInspections[0];
            const bestCmd = findCommander(bestInsp.entity.positions);
            best = {
                entityName: bestInsp.entity.name,
                score: Number(bestInsp.totalScore),
                leaderRank: bestCmd.rank,
                leaderName: bestCmd.name,
            };
            if (approvedInspections.length > 1) {
                const worstInsp = approvedInspections[approvedInspections.length - 1];
                const worstCmd = findCommander(worstInsp.entity.positions);
                worst = {
                    entityName: worstInsp.entity.name,
                    score: Number(worstInsp.totalScore),
                    leaderRank: worstCmd.rank,
                    leaderName: worstCmd.name,
                };
            }
        }
        const allEntities = await this.prisma.entity.findMany();
        const entityMap = new Map();
        for (const ent of allEntities) {
            entityMap.set(ent.id, ent);
        }
        const getLevel1AncestorName = (entityId) => {
            let current = entityMap.get(entityId);
            while (current) {
                if (current.level === 'LEVEL_1') {
                    return current.name;
                }
                if (!current.parentId)
                    break;
                current = entityMap.get(current.parentId);
            }
            const fallback = entityMap.get(entityId);
            return fallback ? fallback.name : 'الشرطة المحلية';
        };
        const sectorMap = new Map();
        const allApprovedInspections = await this.prisma.inspection.findMany({
            where: { status: 'approved' },
        });
        for (const insp of allApprovedInspections) {
            const sectorName = getLevel1AncestorName(insp.entityId);
            const score = Number(insp.totalScore || 0);
            const existing = sectorMap.get(sectorName) || { sum: 0, count: 0 };
            sectorMap.set(sectorName, {
                sum: existing.sum + score,
                count: existing.count + 1,
            });
        }
        const sectorPerformance = [];
        sectorMap.forEach((val, key) => {
            sectorPerformance.push({
                entityName: key,
                averageScore: Number((val.sum / val.count).toFixed(2)),
            });
        });
        const latestApprovedInspectionsMap = new Map();
        for (const insp of approvedInspections) {
            if (!latestApprovedInspectionsMap.has(insp.entityId)) {
                latestApprovedInspectionsMap.set(insp.entityId, insp);
            }
        }
        const red = [];
        const yellow = [];
        const green = [];
        for (const insp of latestApprovedInspectionsMap.values()) {
            const score = Number(insp.totalScore || 0);
            const cmd = findCommander(insp.entity.positions);
            const item = {
                entityName: insp.entity.name,
                score: score,
                leaderRank: cmd.rank,
                leaderName: cmd.name,
            };
            if (score < 50) {
                red.push(item);
            }
            else if (score < 80) {
                yellow.push(item);
            }
            else {
                green.push(item);
            }
        }
        const logs = await this.prisma.systemAuditLog.findMany({
            orderBy: { timestamp: 'desc' },
            take: 10,
        });
        const recentIntegrityLogs = logs.map((log) => ({
            id: Number(log.id),
            username: log.username,
            actionType: log.actionType,
            timestamp: log.timestamp,
            details: typeof log.details === 'string' ? JSON.parse(log.details) : log.details,
        }));
        return {
            kpis: {
                overallCompliance,
                activeCampaigns,
                commandDeficitRate,
                pendingInspections,
                totalRecommendations,
                humanIntegrationRate,
                vehicleReadinessRate,
            },
            recommendations: {
                open: openRecommendations,
                closed: closedRecommendations,
                topAuthorities,
            },
            performanceLeaders: {
                best,
                worst,
            },
            sectorPerformance,
            riskEntities: {
                red,
                yellow,
                green,
            },
            recentIntegrityLogs,
        };
    }
};
exports.DashboardService = DashboardService;
exports.DashboardService = DashboardService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DashboardService);
//# sourceMappingURL=dashboard.service.js.map