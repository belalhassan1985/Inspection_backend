import { PrismaService } from '../prisma/prisma.service';
export declare class HealthAnalyticsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    calculateHealthScore(tracking: any): number;
    getHealthStatus(score: number): 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'CRITICAL';
    logHealthHistory(trackingId: string): Promise<void>;
    recordAllHealthScores(): Promise<void>;
}
