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
exports.NotificationService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const notifications_gateway_1 = require("../websockets/notifications.gateway");
let NotificationService = class NotificationService {
    prisma;
    gateway;
    constructor(prisma, gateway) {
        this.prisma = prisma;
        this.gateway = gateway;
    }
    async createNotification(input, db) {
        const userExists = await db.user.findUnique({
            where: { id: input.userId },
            select: { id: true },
        });
        if (!userExists) {
            console.warn(`[NotificationService] User ${input.userId} not found, skipping notification: ${input.title}`);
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
    async create(input) {
        return this.createNotification(input, this.prisma);
    }
    async createWithTx(tx, input) {
        return this.createNotification(input, tx);
    }
    async createBulk(inputs) {
        const results = [];
        for (const input of inputs) {
            const result = await this.create(input);
            if (result)
                results.push(result);
        }
        return results;
    }
    async hasExistingSlaNotification(trackingId, type, milestoneType) {
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
    async getMyNotifications(userId, options) {
        const where = { userId };
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
    async getUnreadCount(userId) {
        const count = await this.prisma.inboxNotification.count({
            where: { userId, isRead: false },
        });
        return { unreadCount: count };
    }
    async markAsRead(notifId, userId) {
        const notif = await this.prisma.inboxNotification.findUnique({
            where: { id: notifId },
        });
        if (!notif) {
            throw new common_1.NotFoundException('الإشعار غير موجود');
        }
        if (notif.userId !== userId) {
            throw new common_1.ForbiddenException('غير مخول لتعديل هذا الإشعار');
        }
        const updated = await this.prisma.inboxNotification.update({
            where: { id: notifId },
            data: { isRead: true, readAt: new Date() },
        });
        this.gateway.sendNotificationRead(userId, notifId);
        return updated;
    }
    async markAllAsRead(userId) {
        const result = await this.prisma.inboxNotification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true, readAt: new Date() },
        });
        this.gateway.sendNotificationReadAll(userId);
        return { count: result.count };
    }
};
exports.NotificationService = NotificationService;
exports.NotificationService = NotificationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_gateway_1.NotificationsGateway])
], NotificationService);
//# sourceMappingURL=notification.service.js.map