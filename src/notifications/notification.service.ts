import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../websockets/notifications.gateway';

export type NotificationType =
  | 'ASSIGNMENT'
  | 'STATUS_CHANGE'
  | 'PROGRESS_UPDATE'
  | 'COMMENT'
  | 'EVIDENCE_UPLOAD'
  | 'SLA_AT_RISK'
  | 'SLA_OVERDUE'
  | 'VERIFIED'
  | 'REJECTED'
  | 'REOPENED'
  | 'ESCALATION'
  | 'GENERAL';

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

@Injectable()
export class NotificationService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationsGateway,
  ) {}

  private async createNotification(
    input: CreateNotificationInput,
    db: any,
  ): Promise<any> {
    const userExists = await db.user.findUnique({
      where: { id: input.userId },
      select: { id: true },
    });
    if (!userExists) {
      console.warn(
        `[NotificationService] User ${input.userId} not found, skipping notification: ${input.title}`,
      );
      return null;
    }

    const notification = await db.inboxNotification.create({
      data: {
        userId: input.userId,
        ...(input.trackingId ? { trackingId: input.trackingId } : {}),
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message,
        link: input.link || null,
        metadata: input.metadata || undefined,
      },
    });

    this.gateway.sendNotificationToUser(input.userId, notification);
    return notification;
  }

  async create(input: CreateNotificationInput): Promise<any> {
    return this.createNotification(input, this.prisma);
  }

  async createWithTx(tx: any, input: CreateNotificationInput): Promise<any> {
    return this.createNotification(input, tx);
  }

  async createBulk(inputs: CreateNotificationInput[]): Promise<any[]> {
    const results: any[] = [];
    for (const input of inputs) {
      const result = await this.create(input);
      if (result) results.push(result);
    }
    return results;
  }

  async hasExistingSlaNotification(
    trackingId: string,
    type: NotificationType,
    milestoneType: string,
  ): Promise<boolean> {
    const existing = await this.prisma.inboxNotification.findFirst({
      where: {
        trackingId,
        type,
        metadata: {
          path: ['milestoneType'],
          equals: milestoneType,
        },
      },
    });
    return !!existing;
  }

  async getMyNotifications(
    userId: string,
    options?: {
      type?: string;
      severity?: string;
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: any = { userId };

    if (options?.type) {
      where.type = options.type;
    }
    if (options?.severity) {
      where.severity = options.severity;
    }
    if (options?.unreadOnly) {
      where.isRead = false;
    }

    const [items, total] = await Promise.all([
      this.prisma.inboxNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
      }),
      this.prisma.inboxNotification.count({ where }),
    ]);

    return { items, total };
  }

  async getUnreadCount(userId: string): Promise<{ unreadCount: number }> {
    const count = await this.prisma.inboxNotification.count({
      where: { userId, isRead: false },
    });
    return { unreadCount: count };
  }

  async markAsRead(notifId: string, userId: string): Promise<any> {
    const notif = await this.prisma.inboxNotification.findUnique({
      where: { id: notifId },
    });
    if (!notif) {
      throw new NotFoundException('الإشعار غير موجود');
    }
    if (notif.userId !== userId) {
      throw new ForbiddenException('غير مخول لتعديل هذا الإشعار');
    }
    const updated = await this.prisma.inboxNotification.update({
      where: { id: notifId },
      data: { isRead: true, readAt: new Date() },
    });
    this.gateway.sendNotificationRead(userId, notifId);
    return updated;
  }

  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.inboxNotification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    this.gateway.sendNotificationReadAll(userId);
    return { count: result.count };
  }
}
