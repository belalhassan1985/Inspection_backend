import { OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthAnalyticsService } from './health-analytics.service';
import { SlaMonitoringService } from './sla-monitoring.service';
export declare class KpiEngineService implements OnApplicationBootstrap {
    private prisma;
    private healthService;
    private slaService;
    private readonly logger;
    private cacheStore;
    private readonly CACHE_TTLS;
    constructor(prisma: PrismaService, healthService: HealthAnalyticsService, slaService: SlaMonitoringService);
    onApplicationBootstrap(): Promise<void>;
    clearCache(key?: string): void;
    private getCachedData;
    private getSecurityFilter;
    calculateKpiCatalog(user?: any): Promise<{
        overallProgressRate: number;
        closureRate: number;
        averageResolutionTimeDays: number | null;
        slaAdherenceRate: number | null;
        escalationVolume: number;
        criticalOverdueRate: number;
        total: number;
    }>;
    getEntityBreakdown(user?: any): Promise<any[]>;
    generateDailySnapshot(): Promise<{
        id: string;
        overdueCount: number;
        snapshotDate: Date;
        totalRecommendations: number;
        openRecommendations: number;
        closedRecommendations: number;
        overallComplianceRate: import("@prisma/client/runtime/library").Decimal;
        closureRate: import("@prisma/client/runtime/library").Decimal;
        averageResolutionTimeDays: import("@prisma/client/runtime/library").Decimal | null;
        slaAdherenceRate: import("@prisma/client/runtime/library").Decimal | null;
        escalationLevel3Count: number;
        criticalCount: number;
        entityBreakdown: import("@prisma/client/runtime/library").JsonValue;
    }>;
    getExecutiveSummary(user?: any): Promise<{
        overallCompliance: number;
        closureRate: number;
        averageResolutionTimeDays: number | null;
        slaAdherence: number | null;
        escalationVolume: number;
        criticalOverdueRate: number;
        totalRecommendations: number;
        activeCampaigns: number;
        pendingInspections: number;
        laggingEntities: any[];
        performingEntities: any[];
    }>;
    getHealthAnalyticsSummary(user?: any): Promise<{
        matrix: {
            EXCELLENT: number;
            GOOD: number;
            NEEDS_ATTENTION: number;
            AT_RISK: number;
            CRITICAL: number;
        };
        recommendations: {
            id: string;
            recommendationNumber: string;
            score: number;
            status: "CRITICAL" | "EXCELLENT" | "GOOD" | "NEEDS_ATTENTION" | "AT_RISK";
            progress: number;
        }[];
    }>;
    getEscalationSummary(user?: any): Promise<{
        levels: {
            level0: number;
            level1: number;
            level2: number;
            level3: number;
        };
        drivers: {
            response: number;
            resolution: number;
            closure: number;
        };
    }>;
}
