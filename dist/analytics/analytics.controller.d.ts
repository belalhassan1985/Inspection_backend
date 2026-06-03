import { KpiEngineService } from './kpi-engine.service';
import { SlaMonitoringService } from './sla-monitoring.service';
import { SlaEngineService } from './sla-engine.service';
import { HealthAnalyticsService } from './health-analytics.service';
export declare class AnalyticsController {
    private kpiEngine;
    private slaService;
    private slaEngine;
    private healthService;
    constructor(kpiEngine: KpiEngineService, slaService: SlaMonitoringService, slaEngine: SlaEngineService, healthService: HealthAnalyticsService);
    getExecutiveSummary(req: any): Promise<{
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
    getHealthSummary(req: any): Promise<{
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
    getEscalationSummary(req: any): Promise<{
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
    getSlaMetrics(req: any): Promise<import("./sla-engine.service").SlaMetricsResult[]>;
    getSlaMetricsById(id: string): Promise<import("./sla-engine.service").SlaMetricsResult | {
        message: string;
    }>;
    getSlaSummary(req: any): Promise<import("./sla-engine.service").SlaSummaryResult>;
    triggerSnapshot(): Promise<{
        message: string;
        snapshotId: string;
        date: Date;
    }>;
    triggerSlaCheck(): Promise<{
        message: string;
    }>;
    triggerBackfill(): Promise<{
        message: string;
    }>;
    clearCache(): Promise<{
        message: string;
    }>;
}
