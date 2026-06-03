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
exports.RecommendationTrackingService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const schedule_1 = require("@nestjs/schedule");
const notifications_gateway_1 = require("../websockets/notifications.gateway");
const notification_service_1 = require("../notifications/notification.service");
let RecommendationTrackingService = class RecommendationTrackingService {
    prisma;
    gateway;
    notificationService;
    constructor(prisma, gateway, notificationService) {
        this.prisma = prisma;
        this.gateway = gateway;
        this.notificationService = notificationService;
    }
    async checkAccess(tracking, user, isWrite = false) {
        if (user.role === 'ADMIN') {
            return;
        }
        if (user.role === 'EVALUATOR') {
            if (isWrite) {
                const campaign = await this.prisma.campaign.findUnique({
                    where: { id: tracking.campaignId },
                    include: { members: true },
                });
                const isLeader = campaign?.leaderId === user.userId;
                const isDeputy = campaign?.deputyId === user.userId;
                const isMember = campaign?.members?.some((m) => m.inspectorId === user.userId);
                const isAssigned = tracking.assignedUserId === user.userId;
                if (!isLeader && !isDeputy && !isMember && !isAssigned) {
                    throw new common_1.ForbiddenException('غير مخول بتعديل أو تدقيق هذه التوصية الرقابية');
                }
            }
            return;
        }
        const userDept = user.department?.trim();
        const trackingDept = tracking.assignedEntityNameSnapshot?.trim();
        const isAssignedUser = tracking.assignedUserId === user.userId;
        const isMatchingDept = userDept && trackingDept && (userDept.toLowerCase() === trackingDept.toLowerCase() ||
            trackingDept.toLowerCase().includes(userDept.toLowerCase()) ||
            userDept.toLowerCase().includes(trackingDept.toLowerCase()));
        if (!isAssignedUser && !isMatchingDept) {
            throw new common_1.ForbiddenException('غير مخول بالوصول إلى هذه التوصية الرقابية');
        }
    }
    async findAll(query, user) {
        const { status, statusIn, statusNotIn, riskLevel, impactCategory, assignedEntityId, campaignId, overdue, escalationLevel, search, page = 1, limit = 10, } = query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {};
        if (user.role !== 'ADMIN' && user.role !== 'EVALUATOR') {
            where.OR = [];
            if (user.department) {
                where.OR.push({
                    assignedEntityNameSnapshot: {
                        mode: 'insensitive',
                        equals: user.department.trim(),
                    },
                });
            }
            where.OR.push({ assignedUserId: user.userId });
            if (where.OR.length === 0) {
                where.id = 'none';
            }
        }
        if (status) {
            where.status = status;
        }
        if (statusIn) {
            const statuses = statusIn.split(',').map(s => s.trim());
            where.status = { in: statuses };
        }
        if (statusNotIn) {
            const statuses = statusNotIn.split(',').map(s => s.trim());
            where.status = { notIn: statuses };
        }
        if (riskLevel) {
            where.riskLevel = riskLevel;
        }
        if (impactCategory) {
            where.impactCategory = impactCategory;
        }
        if (assignedEntityId) {
            where.assignedEntityId = assignedEntityId;
        }
        if (campaignId) {
            where.campaignId = campaignId;
        }
        if (escalationLevel !== undefined) {
            where.escalationLevel = Number(escalationLevel);
        }
        if (overdue === 'true') {
            where.status = { notIn: ['CLOSED', 'VERIFIED', 'REJECTED'] };
            where.dueDate = { lt: new Date() };
        }
        if (search) {
            where.AND = [
                ...(where.AND || []),
                {
                    OR: [
                        { recommendationNumber: { contains: search, mode: 'insensitive' } },
                        { assignedEntityNameSnapshot: { contains: search, mode: 'insensitive' } },
                        {
                            recommendation: {
                                recommendationText: { contains: search, mode: 'insensitive' },
                            },
                        },
                    ],
                },
            ];
        }
        const [data, totalItems] = await Promise.all([
            this.prisma.recommendationTracking.findMany({
                where,
                skip,
                take,
                orderBy: { recommendationNumber: 'asc' },
                include: {
                    recommendation: {
                        select: {
                            recommendationText: true,
                            parentRecId: true,
                        },
                    },
                    campaign: {
                        select: {
                            name: true,
                        },
                    },
                },
            }),
            this.prisma.recommendationTracking.count({ where }),
        ]);
        const totalPages = Math.ceil(totalItems / take);
        return {
            data,
            meta: {
                totalItems,
                itemCount: data.length,
                itemsPerPage: take,
                totalPages,
                currentPage: Number(page),
            },
        };
    }
    async findOne(id, user) {
        const tracking = await this.prisma.recommendationTracking.findUnique({
            where: { id },
            include: {
                recommendation: true,
                campaign: true,
                assignedEntity: true,
                assignedUser: true,
                actionLogs: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        actor: {
                            select: {
                                fullName: true,
                                username: true,
                            },
                        },
                    },
                },
                evidence: {
                    orderBy: { createdAt: 'desc' },
                    include: {
                        uploadedBy: {
                            select: {
                                fullName: true,
                            },
                        },
                    },
                },
            },
        });
        if (!tracking) {
            throw new common_1.NotFoundException('سجل تتبع التوصية غير موجود');
        }
        await this.checkAccess(tracking, user);
        return tracking;
    }
    async assign(id, dto, user) {
        if (user.role !== 'ADMIN' && user.role !== 'EVALUATOR') {
            throw new common_1.ForbiddenException('غير مخول لتعيين أو تعديل تكليف التوصية');
        }
        const tracking = await this.prisma.recommendationTracking.findUnique({
            where: { id },
        });
        if (!tracking) {
            throw new common_1.NotFoundException('سجل تتبع التوصية غير موجود');
        }
        await this.checkAccess(tracking, user, true);
        let entityName = tracking.assignedEntityNameSnapshot;
        if (dto.assignedEntityId) {
            const entity = await this.prisma.entity.findUnique({
                where: { id: dto.assignedEntityId },
            });
            if (entity) {
                entityName = entity.name;
            }
        }
        const fromStatus = tracking.status;
        let toStatus = fromStatus;
        if (fromStatus === 'ISSUED') {
            toStatus = 'FORWARDED';
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.recommendationTracking.update({
                where: { id },
                data: {
                    assignedEntityId: dto.assignedEntityId || tracking.assignedEntityId,
                    assignedUserId: dto.assignedUserId || tracking.assignedUserId,
                    dueDate: new Date(dto.dueDate),
                    assignedEntityNameSnapshot: entityName,
                    status: toStatus,
                },
            });
            await tx.recommendationActionLog.create({
                data: {
                    trackingId: id,
                    actorId: user.userId,
                    actionType: 'REASSIGN',
                    fromStatus: fromStatus,
                    toStatus: toStatus,
                    notes: `تم إعادة تكليف الجهة وتحديد تاريخ الاستحقاق ليكون ${dto.dueDate}.`,
                },
            });
            await this.logAudit(user.userId, user.username, 'ASSIGN_RECOMMENDATION', {
                trackingId: id,
                recommendationNumber: tracking.recommendationNumber,
                assignedEntityId: dto.assignedEntityId,
                assignedUserId: dto.assignedUserId,
                dueDate: dto.dueDate,
                fromStatus,
                toStatus,
            });
            if (dto.assignedUserId) {
                await this.notificationService.createWithTx(tx, {
                    userId: dto.assignedUserId,
                    type: 'ASSIGNMENT',
                    severity: 'INFO',
                    title: `تكليف بمتابعة التوصية ${tracking.recommendationNumber}`,
                    message: `تم تكليفك رسمياً بمتابعة معالجة التوصية الرقابية. تاريخ الاستحقاق: ${dto.dueDate}`,
                    link: `/recommendations/tracking/${id}`,
                    trackingId: id,
                });
            }
            return updated;
        });
        if (this.gateway) {
            this.gateway.emitRecommendationUpdated(id, result);
        }
        return result;
    }
    async updateProgress(id, dto, user) {
        const tracking = await this.prisma.recommendationTracking.findUnique({
            where: { id },
        });
        if (!tracking) {
            throw new common_1.NotFoundException('سجل تتبع التوصية غير موجود');
        }
        await this.checkAccess(tracking, user, true);
        if ((tracking.status === 'CLOSED' || tracking.status === 'VERIFIED') && user.role !== 'ADMIN') {
            throw new common_1.ForbiddenException('لا يمكن تعديل تقدم توصية مغلقة أو تم التحقق منها');
        }
        const newStatus = dto.status;
        const progress = dto.progressPercent;
        const fromStatus = tracking.status;
        if (newStatus === 'CLOSED' || newStatus === 'VERIFIED') {
            throw new common_1.ForbiddenException('لا يمكن نقل التوصية إلى حالة منتهية أو إغلاقها ذاتياً');
        }
        const allowedProgressTransitions = {
            FORWARDED: ['UNDER_PROCESSING'],
            UNDER_PROCESSING: ['PARTIALLY_COMPLETED', 'COMPLETED', 'NEEDS_CLARIFICATION'],
            PARTIALLY_COMPLETED: ['UNDER_PROCESSING', 'COMPLETED'],
            NEEDS_CLARIFICATION: ['UNDER_PROCESSING', 'COMPLETED'],
        };
        if (!allowedProgressTransitions[fromStatus]?.includes(newStatus)) {
            throw new common_1.BadRequestException('لا يمكن الانتقال من الحالة الحالية إلى الحالة المطلوبة');
        }
        if (newStatus === 'COMPLETED') {
            if (progress !== 100) {
                throw new common_1.BadRequestException('يجب أن تكون نسبة الإنجاز 100% لإعلان اكتمال التوصية');
            }
            const evidenceCount = await this.prisma.recommendationEvidence.count({
                where: { trackingId: id },
            });
            if (evidenceCount === 0) {
                throw new common_1.BadRequestException('يجب إرفاق ملف إثبات أو دليل واحد على الأقل لإعلان اكتمال التوصية');
            }
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.recommendationTracking.update({
                where: { id },
                data: {
                    status: newStatus,
                    progressPercent: progress,
                    completionDate: newStatus === 'COMPLETED' ? new Date() : tracking.completionDate,
                },
            });
            await tx.recommendationActionLog.create({
                data: {
                    trackingId: id,
                    actorId: user.userId,
                    actionType: fromStatus !== newStatus ? 'STATUS_CHANGE' : 'PROGRESS_UPDATE',
                    fromStatus,
                    toStatus: newStatus,
                    notes: dto.notes,
                },
            });
            await this.logAudit(user.userId, user.username, 'UPDATE_PROGRESS', {
                trackingId: id,
                recommendationNumber: tracking.recommendationNumber,
                progressPercent: progress,
                fromStatus,
                toStatus: newStatus,
                notes: dto.notes,
            });
            if (tracking.campaignId) {
                const campaign = await tx.campaign.findUnique({
                    where: { id: tracking.campaignId },
                    select: { leaderId: true, deputyId: true },
                });
                const notifyPayload = {
                    title: `تحديث تقدم التوصية ${tracking.recommendationNumber}`,
                    message: `قامت الجهة بتحديث نسبة المعالجة إلى ${progress}% الحصيلة: ${dto.notes || '—'}`,
                    link: `/recommendations/tracking/${id}`,
                };
                if (campaign?.leaderId) {
                    await this.notificationService.createWithTx(tx, {
                        userId: campaign.leaderId,
                        type: 'PROGRESS_UPDATE',
                        severity: 'INFO',
                        ...notifyPayload,
                        trackingId: id,
                    });
                }
                if (campaign?.deputyId && campaign.deputyId !== campaign.leaderId) {
                    await this.notificationService.createWithTx(tx, {
                        userId: campaign.deputyId,
                        type: 'PROGRESS_UPDATE',
                        severity: 'INFO',
                        ...notifyPayload,
                        trackingId: id,
                    });
                }
            }
            return updated;
        });
        if (this.gateway) {
            this.gateway.emitRecommendationUpdated(id, result);
        }
        return result;
    }
    async getCommentsTree(id, user) {
        const tracking = await this.prisma.recommendationTracking.findUnique({
            where: { id },
        });
        if (!tracking) {
            throw new common_1.NotFoundException('سجل تتبع التوصية غير موجود');
        }
        await this.checkAccess(tracking, user);
        const comments = await this.prisma.recommendationComment.findMany({
            where: { trackingId: id },
            orderBy: { createdAt: 'asc' },
            include: {
                author: {
                    select: {
                        id: true,
                        fullName: true,
                        username: true,
                    },
                },
            },
        });
        const map = new Map();
        const roots = [];
        comments.forEach((c) => {
            map.set(c.id, { ...c, replies: [] });
        });
        comments.forEach((c) => {
            const commentNode = map.get(c.id);
            if (c.parentCommentId && map.has(c.parentCommentId)) {
                map.get(c.parentCommentId).replies.push(commentNode);
            }
            else {
                roots.push(commentNode);
            }
        });
        return roots;
    }
    async addComment(id, dto, user) {
        const tracking = await this.prisma.recommendationTracking.findUnique({
            where: { id },
        });
        if (!tracking) {
            throw new common_1.NotFoundException('سجل تتبع التوصية غير موجود');
        }
        await this.checkAccess(tracking, user, true);
        const text = dto.notes || '';
        const result = await this.prisma.$transaction(async (tx) => {
            const comment = await tx.recommendationComment.create({
                data: {
                    trackingId: id,
                    authorId: user.userId,
                    commentText: text,
                    parentCommentId: dto.parentCommentId || null,
                },
                include: {
                    author: {
                        select: {
                            fullName: true,
                            username: true,
                        },
                    },
                },
            });
            await tx.recommendationActionLog.create({
                data: {
                    trackingId: id,
                    actorId: user.userId,
                    actionType: 'COMMENT',
                    notes: dto.parentCommentId
                        ? `أضاف رداً: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`
                        : `أضاف تعليقاً: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
                },
            });
            await this.logAudit(user.userId, user.username, 'CREATE_COMMENT', {
                commentId: comment.id,
                trackingId: id,
                parentCommentId: dto.parentCommentId,
            });
            if (tracking.assignedUserId && tracking.assignedUserId !== user.userId) {
                await this.notificationService.createWithTx(tx, {
                    userId: tracking.assignedUserId,
                    type: 'COMMENT',
                    severity: 'INFO',
                    title: `تعليق جديد على التوصية ${tracking.recommendationNumber}`,
                    message: `أضاف المنسق ${user.fullName} تعليقاً: ${text.substring(0, 60)}`,
                    link: `/recommendations/tracking/${id}`,
                    trackingId: id,
                });
            }
            if (tracking.campaignId) {
                const campaign = await tx.campaign.findUnique({
                    where: { id: tracking.campaignId },
                    select: { leaderId: true },
                });
                if (campaign?.leaderId && campaign.leaderId !== user.userId && campaign.leaderId !== tracking.assignedUserId) {
                    await this.notificationService.createWithTx(tx, {
                        userId: campaign.leaderId,
                        type: 'COMMENT',
                        severity: 'INFO',
                        title: `تعليق جديد للتوصية ${tracking.recommendationNumber}`,
                        message: `تمت إضافة تعليق جديد للتوصية. الكاتب: ${user.fullName}`,
                        link: `/recommendations/tracking/${id}`,
                        trackingId: id,
                    });
                }
            }
            return comment;
        });
        if (this.gateway) {
            this.gateway.emitRecommendationUpdated(id, { id, action: 'comment_added' });
        }
        return result;
    }
    async editComment(commentId, commentText, user) {
        const comment = await this.prisma.recommendationComment.findUnique({
            where: { id: commentId },
        });
        if (!comment) {
            throw new common_1.NotFoundException('التعليق غير موجود');
        }
        if (comment.authorId !== user.userId && user.role !== 'ADMIN') {
            throw new common_1.ForbiddenException('غير مخول لتعديل هذا التعليق');
        }
        const tracking = await this.prisma.recommendationTracking.findUnique({
            where: { id: comment.trackingId },
        });
        if (tracking) {
            await this.checkAccess(tracking, user, true);
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.recommendationComment.update({
                where: { id: commentId },
                data: {
                    commentText,
                },
            });
            await this.logAudit(user.userId, user.username, 'EDIT_COMMENT', {
                commentId,
                oldText: comment.commentText,
                newText: commentText,
            });
            return updated;
        });
        if (this.gateway) {
            this.gateway.emitRecommendationUpdated(comment.trackingId, { id: comment.trackingId, action: 'comment_edited' });
        }
        return result;
    }
    async deleteComment(commentId, user) {
        const comment = await this.prisma.recommendationComment.findUnique({
            where: { id: commentId },
        });
        if (!comment) {
            throw new common_1.NotFoundException('التعليق غير موجود');
        }
        if (comment.authorId !== user.userId && user.role !== 'ADMIN') {
            throw new common_1.ForbiddenException('غير مخول لحذف هذا التعليق');
        }
        const tracking = await this.prisma.recommendationTracking.findUnique({
            where: { id: comment.trackingId },
        });
        if (tracking) {
            await this.checkAccess(tracking, user, true);
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const updated = await tx.recommendationComment.update({
                where: { id: commentId },
                data: {
                    commentText: '⚠️ [تم حذف هذا التعليق بواسطة صاحبه]',
                },
            });
            await this.logAudit(user.userId, user.username, 'DELETE_COMMENT', {
                commentId,
            });
            return updated;
        });
        if (this.gateway) {
            this.gateway.emitRecommendationUpdated(comment.trackingId, { id: comment.trackingId, action: 'comment_deleted' });
        }
        return result;
    }
    async addEvidence(id, file, description, user) {
        const tracking = await this.prisma.recommendationTracking.findUnique({
            where: { id },
        });
        if (!tracking) {
            throw new common_1.NotFoundException('سجل تتبع التوصية غير موجود');
        }
        await this.checkAccess(tracking, user, true);
        if ((tracking.status === 'CLOSED' || tracking.status === 'VERIFIED') && user.role !== 'ADMIN') {
            throw new common_1.ForbiddenException('لا يمكن رفع أدلة لتوصية مغلقة أو معتمدة');
        }
        const filePath = file.path.replace(/\\/g, '/');
        const result = await this.prisma.$transaction(async (tx) => {
            const log = await tx.recommendationActionLog.create({
                data: {
                    trackingId: id,
                    actorId: user.userId,
                    actionType: 'EVIDENCE_UPLOAD',
                    notes: `تم رفع ملف إثبات: ${file.originalname}. ${description || ''}`,
                },
            });
            const evidence = await tx.recommendationEvidence.create({
                data: {
                    trackingId: id,
                    actionLogId: log.id,
                    uploadedById: user.userId,
                    fileName: file.originalname,
                    filePath: filePath,
                    fileSize: file.size,
                    mimeType: file.mimetype,
                    description: description,
                },
            });
            await this.logAudit(user.userId, user.username, 'UPLOAD_EVIDENCE', {
                trackingId: id,
                evidenceId: evidence.id,
                fileName: file.originalname,
            });
            if (tracking.campaignId) {
                const campaign = await tx.campaign.findUnique({
                    where: { id: tracking.campaignId },
                    select: { leaderId: true, deputyId: true },
                });
                const notifyPayload = {
                    title: `رفع دليل إثبات جديد للتوصية ${tracking.recommendationNumber}`,
                    message: `تم رفع ملف ثبوتي جديد كدليل إنجاز: ${file.originalname}. المرفوع بواسطة: ${user.fullName}`,
                    link: `/recommendations/tracking/${id}`,
                };
                if (campaign?.leaderId) {
                    await this.notificationService.createWithTx(tx, {
                        userId: campaign.leaderId,
                        type: 'EVIDENCE_UPLOAD',
                        severity: 'INFO',
                        ...notifyPayload,
                        trackingId: id,
                    });
                }
                if (campaign?.deputyId && campaign.deputyId !== campaign.leaderId) {
                    await this.notificationService.createWithTx(tx, {
                        userId: campaign.deputyId,
                        type: 'EVIDENCE_UPLOAD',
                        severity: 'INFO',
                        ...notifyPayload,
                        trackingId: id,
                    });
                }
            }
            return evidence;
        });
        if (this.gateway) {
            this.gateway.emitRecommendationUpdated(id, { id, action: 'evidence_uploaded' });
        }
        return result;
    }
    async verifyClose(id, dto, user) {
        if (user.role !== 'ADMIN' && user.role !== 'EVALUATOR') {
            throw new common_1.ForbiddenException('غير مخول لتدقيق وإغلاق التوصية');
        }
        const tracking = await this.prisma.recommendationTracking.findUnique({
            where: { id },
        });
        if (!tracking) {
            throw new common_1.NotFoundException('سجل تتبع التوصية غير موجود');
        }
        await this.checkAccess(tracking, user, true);
        if ((tracking.status === 'CLOSED' || tracking.status === 'VERIFIED') && user.role !== 'ADMIN') {
            throw new common_1.ForbiddenException('لا يمكن تعديل حالة توصية مغلقة أو تم التحقق منها إلا من قبل المشرف (Admin)');
        }
        const fromStatus = tracking.status;
        const targetStatus = dto.resolutionStatus;
        const allowedVerifyTransitions = {
            COMPLETED: ['VERIFIED', 'REJECTED', 'NEEDS_CLARIFICATION'],
            VERIFIED: ['CLOSED'],
            NEEDS_CLARIFICATION: ['COMPLETED', 'REJECTED', 'UNDER_PROCESSING'],
            REJECTED: ['UNDER_PROCESSING'],
        };
        if (!allowedVerifyTransitions[fromStatus]?.includes(targetStatus)) {
            throw new common_1.BadRequestException('لا يمكن الانتقال من الحالة الحالية إلى الحالة المطلوبة');
        }
        if (targetStatus === 'UNDER_PROCESSING' && user.role !== 'ADMIN') {
            throw new common_1.ForbiddenException('فقط المشرف (Admin) يمكنه إعادة فتح توصية مرفوضة');
        }
        const result = await this.prisma.$transaction(async (tx) => {
            const dataToUpdate = {
                status: targetStatus,
            };
            if (targetStatus === 'CLOSED') {
                dataToUpdate.closedAt = new Date();
                dataToUpdate.progressPercent = 100;
            }
            if (targetStatus === 'UNDER_PROCESSING') {
                dataToUpdate.progressPercent = 0;
                dataToUpdate.completionDate = null;
                dataToUpdate.closedAt = null;
            }
            const updated = await tx.recommendationTracking.update({
                where: { id },
                data: dataToUpdate,
            });
            await tx.recommendationActionLog.create({
                data: {
                    trackingId: id,
                    actorId: user.userId,
                    actionType: 'STATUS_CHANGE',
                    fromStatus: fromStatus,
                    toStatus: targetStatus,
                    notes: dto.notes,
                },
            });
            await this.logAudit(user.userId, user.username, 'VERIFY_CLOSE_RECOMMENDATION', {
                trackingId: id,
                recommendationNumber: tracking.recommendationNumber,
                fromStatus,
                toStatus: targetStatus,
                notes: dto.notes,
            });
            if (tracking.assignedUserId) {
                const verifyType = targetStatus === 'REJECTED' ? 'REJECTED' : targetStatus === 'UNDER_PROCESSING' ? 'REOPENED' : 'VERIFIED';
                await this.notificationService.createWithTx(tx, {
                    userId: tracking.assignedUserId,
                    type: verifyType,
                    severity: targetStatus === 'REJECTED' ? 'CRITICAL' : 'SUCCESS',
                    title: `تحديث حالة تدقيق التوصية ${tracking.recommendationNumber}`,
                    message: `قام المفتش بتدقيق التوصية الرقابية ونقل حالتها إلى: ${targetStatus}. ملاحظات: ${dto.notes || '—'}`,
                    link: `/recommendations/tracking/${id}`,
                    trackingId: id,
                });
            }
            return updated;
        });
        if (this.gateway) {
            this.gateway.emitRecommendationUpdated(id, result);
        }
        return result;
    }
    async getTimeline(id, user) {
        const tracking = await this.prisma.recommendationTracking.findUnique({
            where: { id },
        });
        if (!tracking) {
            throw new common_1.NotFoundException('سجل تتبع التوصية غير موجود');
        }
        await this.checkAccess(tracking, user);
        const [actionLogs, comments] = await Promise.all([
            this.prisma.recommendationActionLog.findMany({
                where: { trackingId: id },
                orderBy: { createdAt: 'asc' },
                include: {
                    actor: { select: { id: true, fullName: true, username: true } },
                    evidence: {
                        select: { id: true, fileName: true, filePath: true, fileSize: true, mimeType: true, description: true },
                    },
                },
            }),
            this.prisma.recommendationComment.findMany({
                where: { trackingId: id, parentCommentId: null },
                orderBy: { createdAt: 'asc' },
                include: {
                    author: { select: { id: true, fullName: true, username: true } },
                    replies: {
                        include: {
                            author: { select: { id: true, fullName: true, username: true } },
                        },
                        orderBy: { createdAt: 'asc' },
                    },
                },
            }),
        ]);
        const entries = [];
        entries.push({
            id: 'issued',
            type: 'ISSUED',
            date: tracking.issuedAt,
            eventLabel: 'تم إصدار التوصية',
            fromStatus: null,
            toStatus: null,
            progressPercent: null,
            actorName: 'النظام',
            notes: null,
            evidenceFile: null,
        });
        for (const log of actionLogs) {
            if (log.actionType === 'COMMENT')
                continue;
            const entry = {
                id: log.id,
                type: log.actionType,
                date: log.createdAt,
                eventLabel: null,
                fromStatus: log.fromStatus,
                toStatus: log.toStatus,
                progressPercent: null,
                actorName: log.actor?.fullName || log.actor?.username || 'النظام',
                notes: log.notes || null,
                evidenceFile: null,
            };
            const statusLabels = {
                FORWARDED: 'تمت الإحالة إلى الجهة',
                UNDER_PROCESSING: 'بدأت المعالجة',
                PARTIALLY_COMPLETED: 'إنجاز جزئي',
                COMPLETED: 'أعلنت الجهة الإنجاز',
                VERIFIED: 'تم التحقق ميدانياً',
                CLOSED: 'تم الإغلاق المعتمد',
                NEEDS_CLARIFICATION: 'طلب توضيح',
                REJECTED: 'تم الرفض',
            };
            if (log.actionType === 'STATUS_CHANGE' && log.toStatus) {
                entry.eventLabel = statusLabels[log.toStatus] || `تغيير الحالة إلى ${log.toStatus}`;
            }
            else if (log.actionType === 'REASSIGN') {
                entry.eventLabel = 'إعادة تكليف أو إحالة';
            }
            else if (log.actionType === 'EVIDENCE_UPLOAD') {
                entry.eventLabel = 'رفع ملف دليل إثبات';
            }
            else if (log.actionType === 'EXTENSION_REQUEST') {
                entry.eventLabel = 'طلب تمديد المهلة';
            }
            else if (log.actionType === 'PROGRESS_UPDATE') {
                entry.eventLabel = 'تحديث نسبة الإنجاز';
            }
            if (log.actionType === 'EVIDENCE_UPLOAD' && log.evidence.length > 0) {
                const ev = log.evidence[0];
                entry.evidenceFile = { id: ev.id, fileName: ev.fileName, filePath: ev.filePath, fileSize: ev.fileSize, mimeType: ev.mimeType, description: ev.description };
            }
            entries.push(entry);
        }
        for (const comment of comments) {
            entries.push({
                id: comment.id,
                type: 'COMMENT',
                date: comment.createdAt,
                eventLabel: 'تعليق',
                fromStatus: null,
                toStatus: null,
                progressPercent: null,
                actorName: comment.author?.fullName || comment.author?.username || 'مستخدم',
                notes: comment.commentText,
                evidenceFile: null,
                replies: comment.replies.map((r) => ({
                    id: r.id,
                    authorName: r.author?.fullName || r.author?.username,
                    text: r.commentText,
                    date: r.createdAt,
                })),
            });
        }
        entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const getFirstDate = (status) => {
            const entry = entries.find((e) => e.type === 'STATUS_CHANGE' && e.toStatus === status);
            return entry ? new Date(entry.date) : null;
        };
        const issuedDate = new Date(tracking.issuedAt);
        const forwardedDate = getFirstDate('FORWARDED');
        const processingDate = getFirstDate('UNDER_PROCESSING');
        const completionDate = getFirstDate('COMPLETED') || tracking.completionDate;
        const verificationDate = getFirstDate('VERIFIED');
        const closedDate = getFirstDate('CLOSED') || tracking.closedAt;
        const now = new Date();
        const diffDays = (d1, d2) => {
            if (!d1 || !d2)
                return null;
            return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
        };
        const durations = {
            forwardingLag: diffDays(issuedDate, forwardedDate),
            processingLag: diffDays(forwardedDate, processingDate),
            processingDuration: diffDays(processingDate, completionDate ? new Date(completionDate) : null),
            verificationDuration: diffDays(completionDate ? new Date(completionDate) : null, verificationDate),
            closureDuration: diffDays(verificationDate, closedDate ? new Date(closedDate) : null),
            totalAge: diffDays(issuedDate, closedDate ? new Date(closedDate) : now),
        };
        return { trackingId: id, recommendationNumber: tracking.recommendationNumber, timeline: entries, durations };
    }
    async runEscalationCheck(user) {
        const escalatedList = [];
        let actor = user;
        if (!actor) {
            const adminUser = await this.prisma.user.findFirst({
                where: { role: { name: 'ADMIN' } },
            });
            const firstUser = adminUser || await this.prisma.user.findFirst();
            actor = {
                userId: firstUser?.id,
                username: 'SYSTEM',
                role: 'ADMIN',
            };
        }
        if (actor.role !== 'ADMIN' && actor.role !== 'EVALUATOR') {
            throw new common_1.ForbiddenException('غير مخول لتشغيل فحص التصعيد الإداري');
        }
        const openTrackings = await this.prisma.recommendationTracking.findMany({
            where: {
                status: { notIn: ['CLOSED', 'VERIFIED', 'REJECTED'] },
            },
            include: {
                recommendation: true,
                campaign: true,
                evidence: true,
            },
        });
        let processedCount = 0;
        let escalatedCount = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        for (const tracking of openTrackings) {
            let score = 0;
            const risk = tracking.riskLevel;
            if (risk === 'CRITICAL')
                score += 20;
            else if (risk === 'HIGH')
                score += 15;
            else if (risk === 'MEDIUM')
                score += 10;
            else if (risk === 'LOW')
                score += 5;
            const progress = tracking.progressPercent;
            if (progress < 10)
                score += 25;
            else if (progress < 40)
                score += 15;
            else if (progress < 70)
                score += 5;
            else if (progress >= 90)
                score -= 15;
            if (tracking.dueDate) {
                const target = new Date(tracking.dueDate);
                target.setHours(0, 0, 0, 0);
                const diffTime = target.getTime() - today.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays < 0) {
                    const overdue = Math.abs(diffDays);
                    if (overdue > 30)
                        score += 35;
                    else if (overdue > 7)
                        score += 25;
                    else
                        score += 15;
                }
                else if (diffDays < 7) {
                    score += 10;
                }
                else if (diffDays < 15) {
                    score += 5;
                }
            }
            try {
                const diffMs = today.getTime() - new Date(tracking.updatedAt).getTime();
                const inactiveDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                if (inactiveDays > 30)
                    score += 15;
                else if (inactiveDays > 15)
                    score += 8;
            }
            catch { }
            const evidenceCount = tracking.evidence.length;
            if (progress > 50 && evidenceCount === 0) {
                score += 10;
            }
            if (tracking.riskLevel === 'CRITICAL' || tracking.campaign?.type === 'regular') {
                score += 10;
            }
            let newLevel = 0;
            if (score >= 75)
                newLevel = 3;
            else if (score >= 50)
                newLevel = 2;
            else if (score >= 30)
                newLevel = 1;
            processedCount++;
            if (newLevel > tracking.escalationLevel) {
                escalatedCount++;
                const prevLevel = tracking.escalationLevel;
                const updated = await this.prisma.$transaction(async (tx) => {
                    const u = await tx.recommendationTracking.update({
                        where: { id: tracking.id },
                        data: { escalationLevel: newLevel },
                    });
                    const levelLabels = ['متابعة اعتيادية', 'تنبيه المنسق والجهة', 'متابعة خاصة من رئيس الهيئة', 'تصعيد للقيادة العليا 🚨'];
                    const noteText = `نظام التصعيد التلقائي: تم تصعيد مستوى التوصية من (${levelLabels[prevLevel]}) إلى (${levelLabels[newLevel]}) بناءً على مؤشر مخاطر الإهمال البالغ ${score}/100.`;
                    await tx.recommendationActionLog.create({
                        data: {
                            trackingId: tracking.id,
                            actorId: actor.userId,
                            actionType: 'STATUS_CHANGE',
                            notes: noteText,
                        },
                    });
                    await tx.systemAuditLog.create({
                        data: {
                            userId: actor.userId,
                            username: actor.username,
                            actionType: 'AUTO_ESCALATION',
                            details: {
                                trackingId: tracking.id,
                                recommendationNumber: tracking.recommendationNumber,
                                score,
                                prevLevel,
                                newLevel,
                            },
                        },
                    });
                    const escPayload = {
                        title: `تصعيد إداري للتوصية ${tracking.recommendationNumber}`,
                        message: `تم تصعيد مستوى التوصية إلى الدرجة (${newLevel}) بسبب مخاطر التقاعس الإداري.`,
                        link: `/recommendations/tracking/${tracking.id}`,
                    };
                    if (tracking.assignedUserId) {
                        await this.notificationService.createWithTx(tx, {
                            userId: tracking.assignedUserId,
                            type: 'ESCALATION',
                            severity: 'WARNING',
                            ...escPayload,
                            trackingId: tracking.id,
                        });
                    }
                    const campaign = await tx.campaign.findUnique({
                        where: { id: tracking.campaignId },
                        select: { leaderId: true },
                    });
                    if (campaign?.leaderId && campaign.leaderId !== tracking.assignedUserId) {
                        await this.notificationService.createWithTx(tx, {
                            userId: campaign.leaderId,
                            type: 'ESCALATION',
                            severity: 'WARNING',
                            ...escPayload,
                            trackingId: tracking.id,
                        });
                    }
                    return u;
                });
                escalatedList.push({ id: tracking.id, newLevel, tracking: updated });
            }
        }
        if (this.gateway) {
            for (const item of escalatedList) {
                this.gateway.emitRecommendationUpdated(item.id, item.tracking);
                this.gateway.emitEscalationCreated(item.id, { id: item.id, level: item.newLevel });
            }
        }
        return {
            message: 'اكتمل فحص التصعيد التلقائي بنجاح',
            processedCount,
            escalatedCount,
        };
    }
    async handleDailyEscalationCron() {
        console.log('[CronScheduler] Starting daily administrative escalation check...');
        try {
            const result = await this.runEscalationCheck();
            console.log(`[CronScheduler] Daily escalation check completed. Processed: ${result.processedCount}, Escalated: ${result.escalatedCount}`);
        }
        catch (err) {
            console.error('[CronScheduler] Error running daily escalation check:', err);
        }
    }
    async logAudit(userId, username, actionType, details) {
        try {
            await this.prisma.systemAuditLog.create({
                data: {
                    userId,
                    username,
                    actionType,
                    details,
                },
            });
        }
        catch (err) {
            console.error('Failed to write system audit log:', err);
        }
    }
    async getDashboardSummary() {
        const total = await this.prisma.recommendationTracking.count();
        const open = await this.prisma.recommendationTracking.count({
            where: { status: { notIn: ['CLOSED', 'VERIFIED', 'REJECTED'] } },
        });
        const closed = await this.prisma.recommendationTracking.count({
            where: { status: 'CLOSED' },
        });
        const verified = await this.prisma.recommendationTracking.count({
            where: { status: 'VERIFIED' },
        });
        const rejected = await this.prisma.recommendationTracking.count({
            where: { status: 'REJECTED' },
        });
        const inProgress = await this.prisma.recommendationTracking.count({
            where: { status: { in: ['UNDER_PROCESSING', 'PARTIALLY_COMPLETED'] } },
        });
        const completed = await this.prisma.recommendationTracking.count({
            where: { status: 'COMPLETED' },
        });
        const overdue = await this.prisma.recommendationTracking.count({
            where: {
                status: { notIn: ['CLOSED', 'VERIFIED', 'REJECTED'] },
                dueDate: { lt: new Date() },
            },
        });
        const closureRate = total > 0 ? Number(((closed + verified) / total * 100).toFixed(2)) : 0;
        const completionRate = closureRate;
        const closedRecs = await this.prisma.recommendationTracking.findMany({
            where: {
                status: 'CLOSED',
                closedAt: { not: null },
            },
            select: {
                createdAt: true,
                closedAt: true,
            },
        });
        let avgTimeToCloseDays = 0;
        if (closedRecs.length > 0) {
            const sumDiffMs = closedRecs.reduce((sum, rec) => {
                return sum + (new Date(rec.closedAt).getTime() - new Date(rec.createdAt).getTime());
            }, 0);
            const avgMs = sumDiffMs / closedRecs.length;
            avgTimeToCloseDays = Number((avgMs / (1000 * 60 * 60 * 24)).toFixed(1));
        }
        const byRisk = {
            CRITICAL: await this.prisma.recommendationTracking.count({
                where: { riskLevel: 'CRITICAL' },
            }),
            HIGH: await this.prisma.recommendationTracking.count({
                where: { riskLevel: 'HIGH' },
            }),
            MEDIUM: await this.prisma.recommendationTracking.count({
                where: { riskLevel: 'MEDIUM' },
            }),
            LOW: await this.prisma.recommendationTracking.count({
                where: { riskLevel: 'LOW' },
            }),
        };
        const reconciledTotal = open + closed + verified + rejected;
        const reconciliationPassed = total === reconciledTotal;
        return {
            kpis: {
                total,
                open,
                closed,
                verified,
                rejected,
                inProgress,
                completed,
                overdue,
                closureRate,
                completionRate,
                avgTimeToCloseDays,
                byRisk,
            },
            reconciliation: {
                total,
                sumOfParts: reconciledTotal,
                passed: reconciliationPassed,
                formula: 'total = open + closed + verified + rejected',
                detail: {
                    open,
                    closed,
                    verified,
                    rejected,
                },
                subSets: {
                    inProgress: { count: inProgress, parent: 'open' },
                    completed: { count: completed, parent: 'open' },
                    overdue: { count: overdue, parent: 'open (non-rejected, past due)' },
                },
            },
        };
    }
    async getStatsByRisk() {
        const risks = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
        const breakdown = await Promise.all(risks.map(async (risk) => {
            const count = await this.prisma.recommendationTracking.count({
                where: { riskLevel: risk },
            });
            const open = await this.prisma.recommendationTracking.count({
                where: { riskLevel: risk, status: { notIn: ['CLOSED', 'VERIFIED', 'REJECTED'] } },
            });
            const overdue = await this.prisma.recommendationTracking.count({
                where: {
                    riskLevel: risk,
                    status: { notIn: ['CLOSED', 'VERIFIED', 'REJECTED'] },
                    dueDate: { lt: new Date() },
                },
            });
            return {
                riskLevel: risk,
                count,
                open,
                overdue,
            };
        }));
        return breakdown;
    }
    async getStatsByImpact() {
        const categories = ['SECURITY', 'ADMINISTRATIVE', 'HUMAN_RESOURCES', 'LOGISTICS', 'INFRASTRUCTURE', 'TRAINING', 'LEGAL', 'TECHNICAL'];
        const breakdown = await Promise.all(categories.map(async (cat) => {
            const count = await this.prisma.recommendationTracking.count({
                where: { impactCategory: cat },
            });
            const open = await this.prisma.recommendationTracking.count({
                where: { impactCategory: cat, status: { notIn: ['CLOSED', 'VERIFIED', 'REJECTED'] } },
            });
            return {
                category: cat,
                count,
                open,
            };
        }));
        return breakdown;
    }
    async getLaggingEntities() {
        const topLagging = await this.prisma.recommendationTracking.groupBy({
            by: ['assignedEntityNameSnapshot', 'assignedEntityId'],
            where: {
                status: { notIn: ['CLOSED', 'VERIFIED', 'REJECTED'] },
            },
            _count: {
                id: true,
            },
            orderBy: {
                _count: {
                    id: 'desc',
                },
            },
            take: 5,
        });
        const result = await Promise.all(topLagging.map(async (item) => {
            const entityId = item.assignedEntityId;
            const entityName = item.assignedEntityNameSnapshot || 'جهة غير محددة';
            const overdueCount = await this.prisma.recommendationTracking.count({
                where: {
                    assignedEntityId: entityId,
                    assignedEntityNameSnapshot: entityName,
                    status: { notIn: ['CLOSED', 'VERIFIED', 'REJECTED'] },
                    dueDate: { lt: new Date() },
                },
            });
            return {
                entityId,
                entityName,
                openCount: item._count.id,
                overdueCount,
            };
        }));
        return result;
    }
};
exports.RecommendationTrackingService = RecommendationTrackingService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_DAY_AT_MIDNIGHT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], RecommendationTrackingService.prototype, "handleDailyEscalationCron", null);
exports.RecommendationTrackingService = RecommendationTrackingService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_gateway_1.NotificationsGateway,
        notification_service_1.NotificationService])
], RecommendationTrackingService);
//# sourceMappingURL=recommendation-tracking.service.js.map