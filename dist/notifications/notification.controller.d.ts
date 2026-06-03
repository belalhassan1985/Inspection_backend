import { NotificationService } from './notification.service';
export declare class NotificationController {
    private readonly notificationService;
    constructor(notificationService: NotificationService);
    getMyNotifications(req: any, type?: string, severity?: string, unreadOnly?: string, limit?: string, offset?: string): Promise<{
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
    getUnreadCount(req: any): Promise<{
        unreadCount: number;
    }>;
    markAsRead(id: string, req: any): Promise<any>;
    markAllAsRead(req: any): Promise<{
        count: number;
    }>;
}
