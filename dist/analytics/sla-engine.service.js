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
var SlaEngineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlaEngineService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const notification_service_1 = require("../notifications/notification.service");
let SlaEngineService = SlaEngineService_1 = class SlaEngineService {
    prisma;
    notificationService;
    logger = new common_1.Logger(SlaEngineService_1.name);
    constructor(prisma, notificationService) {
        this.prisma = prisma;
        this.notificationService = notificationService;
    }
    async calculateForOne(trackingId) {
        const tracking = await this.prisma.recommendationTracking.findUnique({
            where: { id: trackingId },
            include: {
                actionLogs: {
                    where: { actionType: 'STATUS_CHANGE' },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        if (!tracking)
            return null;
        return this.computeMetrics(tracking, tracking.actionLogs);
    }
    async calculateForAll(filter) {
        const trackings = await this.prisma.recommendationTracking.findMany({
            where: filter,
            include: {
                actionLogs: {
                    where: { actionType: 'STATUS_CHANGE' },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        return trackings.map((t) => this.computeMetrics(t, t.actionLogs));
    }
    async getSlaSummary(filter) {
        const allMetrics = await this.calculateForAll(filter);
        const total = allMetrics.length;
        if (total === 0) {
            return {
                total: 0,
                normal: 0,
                atRisk: 0,
                overdue: 0,
                avgForwardingLag: null,
                avgProcessingLag: null,
                avgProcessingDuration: null,
                avgVerificationDuration: null,
                avgClosureDuration: null,
                avgTotalAge: 0,
                avgOverdueDays: 0,
            };
        }
        const normal = allMetrics.filter((m) => m.overallSla === 'normal').length;
        const atRisk = allMetrics.filter((m) => m.overallSla === 'at_risk').length;
        const overdue = allMetrics.filter((m) => m.overallSla === 'overdue').length;
        const totalAgeSum = allMetrics.reduce((s, m) => s + m.totalAge, 0);
        const overdueDaysSum = allMetrics.reduce((s, m) => s + m.overdueDays, 0);
        const avgFromList = (extract) => {
            const values = allMetrics.map(extract).filter((v) => v !== null);
            if (values.length === 0)
                return null;
            return Number((values.reduce((s, v) => s + v, 0) / values.length).toFixed(1));
        };
        return {
            total,
            normal,
            atRisk,
            overdue,
            avgForwardingLag: avgFromList((m) => m.milestones.forwardingLag),
            avgProcessingLag: avgFromList((m) => m.milestones.processingLag),
            avgProcessingDuration: avgFromList((m) => m.milestones.processingDuration),
            avgVerificationDuration: avgFromList((m) => m.milestones.verificationDuration),
            avgClosureDuration: avgFromList((m) => m.milestones.closureDuration),
            avgTotalAge: Number((totalAgeSum / total).toFixed(1)),
            avgOverdueDays: Number((overdueDaysSum / total).toFixed(1)),
        };
    }
    async checkAndLogBreaches() {
        this.logger.log('SLA Engine: scan started...');
        const allMetrics = await this.calculateForAll();
        const totalScanned = allMetrics.length;
        this.logger.log(`SLA Engine: total scanned: ${totalScanned}`);
        const candidates = [];
        let responseBreaches = 0;
        let resolutionBreaches = 0;
        let closureBreaches = 0;
        for (const metrics of allMetrics) {
            if (metrics.overallSla === 'normal')
                continue;
            if (metrics.slaPerMilestone.forwarding === 'overdue') {
                candidates.push({ trackingId: metrics.trackingId, milestoneType: 'RESPONSE', durationDays: metrics.milestones.forwardingLag ?? metrics.totalAge });
                responseBreaches++;
            }
            if (metrics.slaPerMilestone.resolution === 'overdue' && metrics.overdueDays > 0) {
                candidates.push({ trackingId: metrics.trackingId, milestoneType: 'RESOLUTION', durationDays: metrics.overdueDays });
                resolutionBreaches++;
            }
            if (metrics.slaPerMilestone.verification === 'overdue') {
                candidates.push({ trackingId: metrics.trackingId, milestoneType: 'CLOSURE', durationDays: metrics.milestones.verificationDuration ?? 0 });
                closureBreaches++;
            }
            else if (metrics.slaPerMilestone.closure === 'overdue') {
                candidates.push({ trackingId: metrics.trackingId, milestoneType: 'CLOSURE', durationDays: metrics.milestones.closureDuration ?? 0 });
                closureBreaches++;
            }
        }
        const candidateTrackingIds = [...new Set(candidates.map((c) => c.trackingId))];
        const existingBreaches = candidateTrackingIds.length > 0
            ? await this.prisma.slaBreachLog.findMany({
                where: { trackingId: { in: candidateTrackingIds } },
            })
            : [];
        const existingKeySet = new Set(existingBreaches.map((b) => `${b.trackingId}|${b.milestoneType}`));
        let newBreaches = 0;
        let skippedBreaches = 0;
        for (const candidate of candidates) {
            const key = `${candidate.trackingId}|${candidate.milestoneType}`;
            if (existingKeySet.has(key)) {
                const existing = existingBreaches.find((b) => b.trackingId === candidate.trackingId && b.milestoneType === candidate.milestoneType);
                if (existing) {
                    await this.prisma.slaBreachLog.update({
                        where: { id: existing.id },
                        data: { breachDurationDays: candidate.durationDays },
                    });
                }
                skippedBreaches++;
                existingKeySet.delete(key);
            }
            else {
                await this.prisma.slaBreachLog.create({
                    data: {
                        trackingId: candidate.trackingId,
                        milestoneType: candidate.milestoneType,
                        breachDurationDays: candidate.durationDays,
                    },
                });
                newBreaches++;
            }
        }
        this.logger.log(`SLA Engine: scan completed. Total scanned: ${totalScanned}, New breaches: ${newBreaches}, Existing skipped: ${skippedBreaches}`);
        return { response: responseBreaches, resolution: resolutionBreaches, closure: closureBreaches, newBreaches, skippedBreaches, totalScanned };
    }
    async dailySlaCheck() {
        this.logger.log('SLA Engine: daily SLA breach check triggered (02:00)...');
        const result = await this.checkAndLogBreaches();
        await this.createSlaNotifications();
        this.logger.log(`SLA Engine: daily scan complete. Response: ${result.response}, Resolution: ${result.resolution}, Closure: ${result.closure}`);
    }
    async createSlaNotifications() {
        const allMetrics = await this.calculateForAll();
        const atRiskOrOverdue = allMetrics.filter((m) => m.overallSla !== 'normal');
        let created = 0;
        for (const metrics of atRiskOrOverdue) {
            const tracking = await this.prisma.recommendationTracking.findUnique({
                where: { id: metrics.trackingId },
                select: {
                    id: true,
                    recommendationNumber: true,
                    assignedUserId: true,
                    campaignId: true,
                },
            });
            if (!tracking)
                continue;
            let campaignLeaderId = null;
            let campaignDeputyId = null;
            if (tracking.campaignId) {
                const campaign = await this.prisma.campaign.findUnique({
                    where: { id: tracking.campaignId },
                    select: { leaderId: true, deputyId: true },
                });
                if (campaign) {
                    campaignLeaderId = campaign.leaderId;
                    campaignDeputyId = campaign.deputyId;
                }
            }
            const targetUserIds = new Set();
            if (tracking.assignedUserId)
                targetUserIds.add(tracking.assignedUserId);
            if (campaignLeaderId)
                targetUserIds.add(campaignLeaderId);
            if (campaignDeputyId && campaignDeputyId !== campaignLeaderId)
                targetUserIds.add(campaignDeputyId);
            const milestoneMap = {
                forwarding: { status: metrics.slaPerMilestone.forwarding, label: 'مرحلة التوجيه' },
                processingStart: { status: metrics.slaPerMilestone.processingStart, label: 'مرحلة بدء المعالجة' },
                resolution: { status: metrics.slaPerMilestone.resolution, label: 'مرحلة الإنجاز' },
                verification: { status: metrics.slaPerMilestone.verification, label: 'مرحلة التحقق' },
                closure: { status: metrics.slaPerMilestone.closure, label: 'مرحلة الإغلاق' },
            };
            for (const [milestoneType, info] of Object.entries(milestoneMap)) {
                if (!info.status || info.status === 'normal')
                    continue;
                const isOverdue = info.status === 'overdue';
                const notifType = isOverdue ? 'SLA_OVERDUE' : 'SLA_AT_RISK';
                const severity = isOverdue ? 'CRITICAL' : 'WARNING';
                const alreadySent = await this.notificationService.hasExistingSlaNotification(tracking.id, notifType, milestoneType);
                if (alreadySent)
                    continue;
                const title = isOverdue
                    ? `تجاوز المهلة الزمنية للتوصية ${tracking.recommendationNumber}`
                    : `تنبيه: اقتراب المهلة الزمنية للتوصية ${tracking.recommendationNumber}`;
                const message = isOverdue
                    ? `تم تجاوز المهلة المحددة لـ ${info.label} للتوصية الرقابية رقم ${tracking.recommendationNumber}.`
                    : `يقترب موعد انتهاء المهلة المحددة لـ ${info.label} للتوصية الرقابية رقم ${tracking.recommendationNumber}.`;
                for (const userId of targetUserIds) {
                    const result = await this.notificationService.create({
                        userId,
                        type: notifType,
                        severity,
                        title,
                        message,
                        link: `/recommendations/tracking/${tracking.id}`,
                        trackingId: tracking.id,
                        metadata: { milestoneType, status: info.status },
                    });
                    if (result)
                        created++;
                }
            }
        }
        this.logger.log(`SLA Engine: ${created} SLA notifications created`);
        return { created };
    }
    computeMetrics(tracking, logs) {
        const now = new Date();
        const issuedDate = new Date(tracking.issuedAt);
        const dueDate = tracking.dueDate ? new Date(tracking.dueDate) : null;
        const firstStatusDate = (status) => {
            const entry = logs.find((l) => l.toStatus === status);
            return entry ? new Date(entry.createdAt) : null;
        };
        const forwardedDate = firstStatusDate('FORWARDED');
        const processingDate = firstStatusDate('UNDER_PROCESSING');
        const completedDate = firstStatusDate('COMPLETED');
        const verifiedDate = firstStatusDate('VERIFIED');
        const closedDate = firstStatusDate('CLOSED');
        const rejectedDate = firstStatusDate('REJECTED');
        const effectiveEndDate = tracking.status === client_1.RecommendationStatus.REJECTED && rejectedDate
            ? rejectedDate
            : tracking.status === client_1.RecommendationStatus.CLOSED && closedDate
                ? closedDate
                : tracking.status === client_1.RecommendationStatus.VERIFIED && verifiedDate
                    ? verifiedDate
                    : null;
        const diffDays = (d1, d2) => {
            if (!d1 || !d2)
                return null;
            return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
        };
        const daysSince = (date) => {
            if (!date)
                return null;
            return Math.round((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
        };
        const forwardingLag = diffDays(issuedDate, forwardedDate);
        const processingLag = diffDays(forwardedDate, processingDate);
        const processingDuration = diffDays(processingDate, completedDate);
        const verificationDuration = diffDays(completedDate, verifiedDate);
        const closureDuration = diffDays(verifiedDate, closedDate);
        const totalAge = effectiveEndDate
            ? diffDays(issuedDate, effectiveEndDate)
            : daysSince(issuedDate);
        const isFinalState = [client_1.RecommendationStatus.CLOSED, client_1.RecommendationStatus.VERIFIED, client_1.RecommendationStatus.REJECTED].includes(tracking.status);
        const overdueDays = dueDate && !isFinalState && now > dueDate
            ? Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
            : 0;
        const assess = (duration, normalThresh, atRiskThresh) => {
            if (duration === null)
                return null;
            if (duration > atRiskThresh)
                return 'overdue';
            if (duration > normalThresh)
                return 'at_risk';
            return 'normal';
        };
        let forwarding = null;
        if (forwardedDate) {
            forwarding = assess(forwardingLag, 5, 7);
        }
        else if (tracking.status === client_1.RecommendationStatus.ISSUED) {
            forwarding = assess(daysSince(issuedDate), 5, 7);
        }
        let processingStart = null;
        if (processingDate && forwardedDate) {
            processingStart = assess(processingLag, 3, 5);
        }
        else if (tracking.status === client_1.RecommendationStatus.FORWARDED && forwardedDate) {
            processingStart = assess(daysSince(forwardedDate), 3, 5);
        }
        let resolution = null;
        if (isFinalState) {
            resolution = 'normal';
        }
        else if (dueDate) {
            const daysUntilDue = Math.round((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntilDue < 0) {
                resolution = 'overdue';
            }
            else if (daysUntilDue <= 7) {
                resolution = 'at_risk';
            }
            else {
                resolution = 'normal';
            }
        }
        let verification = null;
        if (verifiedDate) {
            verification = assess(verificationDuration, 5, 7);
        }
        else if (tracking.status === client_1.RecommendationStatus.COMPLETED && completedDate) {
            verification = assess(daysSince(completedDate), 5, 7);
        }
        let closure = null;
        if (closedDate) {
            closure = assess(closureDuration, 3, 5);
        }
        else if (tracking.status === client_1.RecommendationStatus.VERIFIED && verifiedDate) {
            closure = assess(daysSince(verifiedDate), 3, 5);
        }
        const allStatuses = [forwarding, processingStart, resolution, verification, closure].filter((s) => s !== null);
        let overallSla;
        if (allStatuses.some((s) => s === 'overdue')) {
            overallSla = 'overdue';
        }
        else if (allStatuses.some((s) => s === 'at_risk')) {
            overallSla = 'at_risk';
        }
        else {
            overallSla = 'normal';
        }
        return {
            trackingId: tracking.id,
            recommendationNumber: tracking.recommendationNumber,
            status: tracking.status,
            riskLevel: tracking.riskLevel,
            dueDate: tracking.dueDate,
            milestones: {
                forwardingLag,
                processingLag,
                processingDuration,
                verificationDuration,
                closureDuration,
            },
            totalAge,
            overdueDays,
            slaPerMilestone: {
                forwarding,
                processingStart,
                resolution,
                verification,
                closure,
            },
            overallSla,
        };
    }
};
exports.SlaEngineService = SlaEngineService;
__decorate([
    (0, schedule_1.Cron)('0 2 * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SlaEngineService.prototype, "dailySlaCheck", null);
exports.SlaEngineService = SlaEngineService = SlaEngineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notification_service_1.NotificationService])
], SlaEngineService);
//# sourceMappingURL=sla-engine.service.js.map