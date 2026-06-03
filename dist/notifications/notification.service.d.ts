import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../websockets/notifications.gateway';
export type NotificationType = 'ASSIGNMENT' | 'STATUS_CHANGE' | 'PROGRESS_UPDATE' | 'COMMENT' | 'EVIDENCE_UPLOAD' | 'SLA_AT_RISK' | 'SLA_OVERDUE' | 'VERIFIED' | 'REJECTED' | 'REOPENED' | 'ESCALATION' | 'GENERAL';
export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';
export interface CreateNotificationInput {
    userId: string;
    type: NotificationType;
    severity: NotificationSeverity;
    title: string;
    message: string;
    link?: string;
    trackingId?: string;
    metadata?: Record<string, any>;
}
export declare class NotificationService {
    private prisma;
    private gateway;
    constructor(prisma: PrismaService, gateway: NotificationsGateway);
    private createNotification;
    create(input: CreateNotificationInput): Promise<any>;
    createWithTx(tx: any, input: CreateNotificationInput): Promise<any>;
    createBulk(inputs: CreateNotificationInput[]): Promise<any[]>;
    hasExistingSlaNotification(trackingId: string, type: NotificationType, milestoneType: string): Promise<boolean>;
    getMyNotifications(userId: string, options?: {
        type?: string;
        severity?: string;
        unreadOnly?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<{
        items: {
            id: string;
            userId: string;
            createdAt: Date;
            link: string | null;
            type: string;
            title: string;
            message: string;
            trackingId: string | null;
            severity: string;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            isRead: boolean;
            readAt: Date | null;
        }[];
        total: number;
    }>;
    getUnreadCount(userId: string): Promise<{
        unreadCount: number;
    }>;
    markAsRead(notifId: string, userId: string): Promise<any>;
    markAllAsRead(userId: string): Promise<{
        count: number;
    }>;
}
