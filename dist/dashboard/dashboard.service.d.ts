import { PrismaService } from '../prisma/prisma.service';
export declare class DashboardService {
    private prisma;
    constructor(prisma: PrismaService);
    getExecutiveSummary(): Promise<{
        kpis: {
            overallCompliance: number;
            activeCampaigns: number;
            commandDeficitRate: number;
            pendingInspections: number;
            totalRecommendations: number;
            humanIntegrationRate: number;
            vehicleReadinessRate: number;
        };
        recommendations: {
            open: number;
            closed: number;
            topAuthorities: {
                authorityName: string;
                count: number;
            }[];
        };
        performanceLeaders: {
            best: {
                entityName: string;
                score: number;
                leaderRank: any;
                leaderName: any;
            } | null;
            worst: {
                entityName: string;
                score: number;
                leaderRank: any;
                leaderName: any;
            } | null;
        };
        sectorPerformance: {
            entityName: string;
            averageScore: number;
        }[];
        riskEntities: {
            red: {
                entityName: any;
                score: number;
                leaderRank: any;
                leaderName: any;
            }[];
            yellow: {
                entityName: any;
                score: number;
                leaderRank: any;
                leaderName: any;
            }[];
            green: {
                entityName: any;
                score: number;
                leaderRank: any;
                leaderName: any;
            }[];
        };
        recentIntegrityLogs: {
            id: number;
            username: string;
            actionType: string;
            timestamp: Date;
            details: any;
        }[];
    }>;
}
