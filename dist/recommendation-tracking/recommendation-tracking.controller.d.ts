import { RecommendationTrackingService } from './recommendation-tracking.service';
import { AssignRecommendationDto } from './dto/assign-recommendation.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { VerifyCloseRecommendationDto } from './dto/verify-close.dto';
export declare class RecommendationTrackingController {
    private readonly service;
    constructor(service: RecommendationTrackingService);
    getDashboardSummary(): Promise<{
        kpis: {
            total: number;
            open: number;
            closed: number;
            verified: number;
            rejected: number;
            inProgress: number;
            completed: number;
            overdue: number;
            closureRate: number;
            completionRate: number;
            avgTimeToCloseDays: number;
            byRisk: {
                CRITICAL: number;
                HIGH: number;
                MEDIUM: number;
                LOW: number;
            };
        };
        reconciliation: {
            total: number;
            sumOfParts: number;
            passed: boolean;
            formula: string;
            detail: {
                open: number;
                closed: number;
                verified: number;
                rejected: number;
            };
            subSets: {
                inProgress: {
                    count: number;
                    parent: string;
                };
                completed: {
                    count: number;
                    parent: string;
                };
                overdue: {
                    count: number;
                    parent: string;
                };
            };
        };
    }>;
    getStatsByRisk(): Promise<{
        riskLevel: import(".prisma/client").$Enums.RiskLevel;
        count: number;
        open: number;
        overdue: number;
    }[]>;
    getStatsByImpact(): Promise<{
        category: import(".prisma/client").$Enums.ImpactCategory;
        count: number;
        open: number;
    }[]>;
    getLaggingEntities(): Promise<{
        entityId: string | null;
        entityName: string;
        openCount: number;
        overdueCount: number;
    }[]>;
    runEscalations(req: any): Promise<{
        message: string;
        processedCount: number;
        escalatedCount: number;
    }>;
    findAll(query: any, req: any): Promise<{
        data: ({
            campaign: {
                name: string;
            };
            recommendation: {
                recommendationText: string;
                parentRecId: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            campaignId: string;
            status: import(".prisma/client").$Enums.RecommendationStatus;
            riskLevel: import(".prisma/client").$Enums.RiskLevel;
            impactCategory: import(".prisma/client").$Enums.ImpactCategory;
            recommendationNumber: string;
            assignedEntityNameSnapshot: string;
            progressPercent: number;
            escalationLevel: number;
            issuedAt: Date;
            dueDate: Date | null;
            completionDate: Date | null;
            closedAt: Date | null;
            recommendationId: string;
            assignedEntityId: string | null;
            assignedUserId: string | null;
            parentTrackingId: string | null;
        })[];
        meta: {
            totalItems: number;
            itemCount: number;
            itemsPerPage: number;
            totalPages: number;
            currentPage: number;
        };
    }>;
    findOne(id: string, req: any): Promise<{
        campaign: {
            id: string;
            name: string;
            createdAt: Date;
            entityId: string | null;
            type: string;
            assignmentText: string;
            assignmentReference: string;
            assignmentDate: Date;
            leaderId: string | null;
            deputyId: string | null;
            purpose: string | null;
            formationNumber: string | null;
            startDate: Date;
            endDate: Date | null;
            status: string;
            templateId: string | null;
        };
        actionLogs: ({
            actor: {
                username: string;
                fullName: string;
            };
        } & {
            id: string;
            actionType: import(".prisma/client").$Enums.RecommendationActionType;
            createdAt: Date;
            notes: string | null;
            trackingId: string;
            fromStatus: import(".prisma/client").$Enums.RecommendationStatus | null;
            toStatus: import(".prisma/client").$Enums.RecommendationStatus | null;
            actorId: string;
        })[];
        recommendation: {
            id: string;
            campaignId: string;
            sortOrder: number;
            authorityName: string;
            recommendationText: string;
            riskLevel: import(".prisma/client").$Enums.RiskLevel | null;
            impactCategory: import(".prisma/client").$Enums.ImpactCategory | null;
            parentRecId: string | null;
        };
        assignedEntity: {
            id: string;
            name: string;
            createdAt: Date;
            parentId: string | null;
            level: string;
            isAssistant: boolean;
        } | null;
        assignedUser: {
            id: string;
            username: string;
            fullName: string;
            passwordHash: string;
            roleId: number | null;
            department: string | null;
            isActive: boolean;
            securityClassification: import(".prisma/client").$Enums.SecurityClassificationLevel;
            createdAt: Date;
            updatedAt: Date;
        } | null;
        evidence: ({
            uploadedBy: {
                fullName: string;
            };
        } & {
            id: string;
            createdAt: Date;
            description: string | null;
            trackingId: string;
            fileName: string;
            filePath: string;
            fileSize: number;
            mimeType: string;
            actionLogId: string | null;
            uploadedById: string;
        })[];
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        campaignId: string;
        status: import(".prisma/client").$Enums.RecommendationStatus;
        riskLevel: import(".prisma/client").$Enums.RiskLevel;
        impactCategory: import(".prisma/client").$Enums.ImpactCategory;
        recommendationNumber: string;
        assignedEntityNameSnapshot: string;
        progressPercent: number;
        escalationLevel: number;
        issuedAt: Date;
        dueDate: Date | null;
        completionDate: Date | null;
        closedAt: Date | null;
        recommendationId: string;
        assignedEntityId: string | null;
        assignedUserId: string | null;
        parentTrackingId: string | null;
    }>;
    getTimeline(id: string, req: any): Promise<{
        trackingId: string;
        recommendationNumber: string;
        timeline: any[];
        durations: {
            forwardingLag: number | null;
            processingLag: number | null;
            processingDuration: number | null;
            verificationDuration: number | null;
            closureDuration: number | null;
            totalAge: number | null;
        };
    }>;
    assign(id: string, dto: AssignRecommendationDto, req: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        campaignId: string;
        status: import(".prisma/client").$Enums.RecommendationStatus;
        riskLevel: import(".prisma/client").$Enums.RiskLevel;
        impactCategory: import(".prisma/client").$Enums.ImpactCategory;
        recommendationNumber: string;
        assignedEntityNameSnapshot: string;
        progressPercent: number;
        escalationLevel: number;
        issuedAt: Date;
        dueDate: Date | null;
        completionDate: Date | null;
        closedAt: Date | null;
        recommendationId: string;
        assignedEntityId: string | null;
        assignedUserId: string | null;
        parentTrackingId: string | null;
    }>;
    updateProgress(id: string, dto: UpdateProgressDto, req: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        campaignId: string;
        status: import(".prisma/client").$Enums.RecommendationStatus;
        riskLevel: import(".prisma/client").$Enums.RiskLevel;
        impactCategory: import(".prisma/client").$Enums.ImpactCategory;
        recommendationNumber: string;
        assignedEntityNameSnapshot: string;
        progressPercent: number;
        escalationLevel: number;
        issuedAt: Date;
        dueDate: Date | null;
        completionDate: Date | null;
        closedAt: Date | null;
        recommendationId: string;
        assignedEntityId: string | null;
        assignedUserId: string | null;
        parentTrackingId: string | null;
    }>;
    getCommentsTree(id: string, req: any): Promise<any[]>;
    addComment(id: string, dto: AddCommentDto, req: any): Promise<{
        author: {
            username: string;
            fullName: string;
        };
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        parentCommentId: string | null;
        trackingId: string;
        authorId: string;
        commentText: string;
    }>;
    editComment(commentId: string, dto: {
        commentText: string;
    }, req: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        parentCommentId: string | null;
        trackingId: string;
        authorId: string;
        commentText: string;
    }>;
    deleteComment(commentId: string, req: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        parentCommentId: string | null;
        trackingId: string;
        authorId: string;
        commentText: string;
    }>;
    addEvidence(id: string, file: any, description: string, req: any): Promise<{
        id: string;
        createdAt: Date;
        description: string | null;
        trackingId: string;
        fileName: string;
        filePath: string;
        fileSize: number;
        mimeType: string;
        actionLogId: string | null;
        uploadedById: string;
    }>;
    verifyClose(id: string, dto: VerifyCloseRecommendationDto, req: any): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        campaignId: string;
        status: import(".prisma/client").$Enums.RecommendationStatus;
        riskLevel: import(".prisma/client").$Enums.RiskLevel;
        impactCategory: import(".prisma/client").$Enums.ImpactCategory;
        recommendationNumber: string;
        assignedEntityNameSnapshot: string;
        progressPercent: number;
        escalationLevel: number;
        issuedAt: Date;
        dueDate: Date | null;
        completionDate: Date | null;
        closedAt: Date | null;
        recommendationId: string;
        assignedEntityId: string | null;
        assignedUserId: string | null;
        parentTrackingId: string | null;
    }>;
}
