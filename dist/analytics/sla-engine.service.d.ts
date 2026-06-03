import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
export interface SlaMilestoneMetrics {
    forwardingLag: number | null;
    processingLag: number | null;
    processingDuration: number | null;
    verificationDuration: number | null;
    closureDuration: number | null;
}
export interface SlaPerMilestoneStatus {
    forwarding: 'normal' | 'at_risk' | 'overdue' | null;
    processingStart: 'normal' | 'at_risk' | 'overdue' | null;
    resolution: 'normal' | 'at_risk' | 'overdue' | null;
    verification: 'normal' | 'at_risk' | 'overdue' | null;
    closure: 'normal' | 'at_risk' | 'overdue' | null;
}
export interface SlaMetricsResult {
    trackingId: string;
    recommendationNumber: string;
    status: string;
    riskLevel: string;
    dueDate: Date | null;
    milestones: SlaMilestoneMetrics;
    totalAge: number;
    overdueDays: number;
    slaPerMilestone: SlaPerMilestoneStatus;
    overallSla: 'normal' | 'at_risk' | 'overdue';
}
export interface SlaSummaryResult {
    total: number;
    normal: number;
    atRisk: number;
    overdue: number;
    avgForwardingLag: number | null;
    avgProcessingLag: number | null;
    avgProcessingDuration: number | null;
    avgVerificationDuration: number | null;
    avgClosureDuration: number | null;
    avgTotalAge: number;
    avgOverdueDays: number;
}
export declare class SlaEngineService {
    private prisma;
    private notificationService;
    private readonly logger;
    constructor(prisma: PrismaService, notificationService: NotificationService);
    calculateForOne(trackingId: string): Promise<SlaMetricsResult | null>;
    calculateForAll(filter?: any): Promise<SlaMetricsResult[]>;
    getSlaSummary(filter?: any): Promise<SlaSummaryResult>;
    checkAndLogBreaches(): Promise<{
        response: number;
        resolution: number;
        closure: number;
        newBreaches: number;
        skippedBreaches: number;
        totalScanned: number;
    }>;
    dailySlaCheck(): Promise<void>;
    createSlaNotifications(): Promise<{
        created: number;
    }>;
    private computeMetrics;
}
