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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const reports_service_1 = require("./reports.service");
const roles_guard_1 = require("../auth/roles.guard");
let ReportsController = class ReportsController {
    reportsService;
    constructor(reportsService) {
        this.reportsService = reportsService;
    }
    async getCampaignReportPayload(campaignId) {
        return this.reportsService.getCampaignReportPayload(campaignId);
    }
    async getCampaignReportPdf(campaignId, res) {
        const pdfBuffer = await this.reportsService.generateCampaignReportPdf(campaignId);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename=inspection_report_${campaignId}.pdf`,
            'Content-Length': pdfBuffer.length.toString(),
        });
        res.end(pdfBuffer);
    }
    async postCampaignReportPdf(campaignId, payload, res) {
        const hasPayload = payload && typeof payload === 'object' && Object.keys(payload).length > 0;
        const pdfBuffer = hasPayload
            ? await this.reportsService.generateCampaignReportPdf(campaignId, payload)
            : await this.reportsService.generateCampaignReportPdf(campaignId);
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename=inspection_report_${campaignId}.pdf`,
            'Content-Length': pdfBuffer.length.toString(),
        });
        res.end(pdfBuffer);
    }
    async getCampaignReportWord(campaignId, res) {
        const wordBuffer = await this.reportsService.generateCampaignReportWord(campaignId);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename=inspection_report_${campaignId}.docx`,
            'Content-Length': wordBuffer.length.toString(),
        });
        res.end(wordBuffer);
    }
    async postCampaignReportWord(campaignId, payload, res) {
        const hasPayload = payload && typeof payload === 'object' && Object.keys(payload).length > 0;
        const wordBuffer = hasPayload
            ? await this.reportsService.generateCampaignReportWord(campaignId, payload)
            : await this.reportsService.generateCampaignReportWord(campaignId);
        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename=inspection_report_${campaignId}.docx`,
            'Content-Length': wordBuffer.length.toString(),
        });
        res.end(wordBuffer);
    }
    async saveCampaignReportPresentation(campaignId, payload) {
        return this.reportsService.saveReportPresentation(campaignId, payload);
    }
    async deleteCampaignReportPresentation(campaignId) {
        return this.reportsService.deleteReportPresentation(campaignId);
    }
    async debugCampaignReportPayload(campaignId) {
        const rawPayload = await this.reportsService.getCampaignReportPayload(campaignId);
        const payload = rawPayload;
        const debug = {
            campaignId,
            totalSections: payload.sections?.length || 0,
            totalSubsections: 0,
            hasSavedPresentation: payload.hasSavedPresentation,
            isStale: payload.isStale,
            sections: (payload.sections || []).map((sec, sIdx) => ({
                index: sIdx,
                title: sec.title || '',
                isEmpty: !!sec.isEmpty,
                visible: !!sec.visible,
                isManual: !!sec.isManual,
                narrativeTextExists: !!sec.narrativeText,
                totalSubsections: sec.subsections?.length || 0,
                nonEmptySubsections: sec.subsections?.filter((s) => !s.isEmpty)
                    .length || 0,
                willRender: !!sec.visible && !sec.isEmpty,
                subsections: (sec.subsections || []).map((sub, subIdx) => {
                    const hasFindings = !!(sub.findings && sub.findings.length > 0);
                    const hasEarnedScores = !!(sub.earnedSum && sub.earnedSum > 0);
                    const hasNotesText = !!sub.detailsList?.some((d) => d.includes('ملاحظة:'));
                    const hasQuantData = sub.hasQuantData === true;
                    const realUserData = hasFindings ||
                        hasEarnedScores ||
                        hasNotesText ||
                        hasQuantData;
                    return {
                        index: subIdx,
                        title: sub.title || '',
                        isEmpty: !!sub.isEmpty,
                        visible: !!sub.visible,
                        findings: sub.findings?.length || 0,
                        earnedSum: sub.earnedSum || 0,
                        maxSum: sub.maxSum || 0,
                        detailsListLength: sub.detailsList?.length || 0,
                        hasNotesInDetails: hasNotesText,
                        hasQuantInDetails: hasQuantData,
                        hasOfficerInfo: !!sub.officerInfo,
                        hasRealUserData: realUserData,
                        entityName: sub.detailedTables?.[0]?.entityName || '',
                        detailId: sub.detailedTables?.[0]?.detailId || null,
                        detailedTablesLength: sub.detailedTables?.length || 0,
                        rowsLength: sub.detailedTables?.reduce((sum, t) => sum + (t.rows?.length || 0), 0) || 0,
                        willRender: !!sub.visible && !sub.isEmpty,
                    };
                }) || [],
            })),
            filteredPositionsCount: payload.positions?.length || 0,
            positions: (payload.positions || []).map((p) => ({
                positionName: p.positionName || '',
                positionHolder: p.positionHolder || '',
            })),
        };
        debug.totalSubsections = debug.sections.reduce((sum, s) => sum + s.totalSubsections, 0);
        return debug;
    }
};
exports.ReportsController = ReportsController;
__decorate([
    (0, common_1.Get)('campaign/:campaignId/payload'),
    (0, swagger_1.ApiOperation)({
        summary: 'الحصول على حمولة التقرير المعدة مسبقاً (بيانات مفلترة ومنظمة)',
    }),
    __param(0, (0, common_1.Param)('campaignId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getCampaignReportPayload", null);
__decorate([
    (0, common_1.Get)('campaign/:campaignId/pdf'),
    (0, swagger_1.ApiOperation)({ summary: 'توليد وتحميل تقرير PDF من بيانات قاعدة البيانات' }),
    __param(0, (0, common_1.Param)('campaignId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getCampaignReportPdf", null);
__decorate([
    (0, common_1.Post)('campaign/:campaignId/pdf'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'توليد PDF من حمولة معدلة (قابلة للتحرير)' }),
    __param(0, (0, common_1.Param)('campaignId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "postCampaignReportPdf", null);
__decorate([
    (0, common_1.Get)('campaign/:campaignId/word'),
    (0, swagger_1.ApiOperation)({ summary: 'توليد وتحميل تقرير Word من بيانات قاعدة البيانات' }),
    __param(0, (0, common_1.Param)('campaignId')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "getCampaignReportWord", null);
__decorate([
    (0, common_1.Post)('campaign/:campaignId/word'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'توليد Word من حمولة معدلة (قابلة للتحرير)' }),
    __param(0, (0, common_1.Param)('campaignId')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "postCampaignReportWord", null);
__decorate([
    (0, common_1.Post)('campaign/:campaignId/presentation'),
    (0, swagger_1.ApiOperation)({ summary: 'حفظ عرض التقرير المخصص (حفظ التعديلات)' }),
    __param(0, (0, common_1.Param)('campaignId')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "saveCampaignReportPresentation", null);
__decorate([
    (0, common_1.Delete)('campaign/:campaignId/presentation'),
    (0, swagger_1.ApiOperation)({
        summary: 'إعادة تعيين عرض التقرير (حذف التعديلات والرجوع للأصل)',
    }),
    __param(0, (0, common_1.Param)('campaignId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "deleteCampaignReportPresentation", null);
__decorate([
    (0, common_1.Get)('campaign/:campaignId/payload/debug'),
    (0, swagger_1.ApiOperation)({
        summary: 'تصحيح: عرض ملخص أقسام التقرير مع detailed visibility',
    }),
    __param(0, (0, common_1.Param)('campaignId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ReportsController.prototype, "debugCampaignReportPayload", null);
exports.ReportsController = ReportsController = __decorate([
    (0, swagger_1.ApiTags)('Reports Engine'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, common_1.Controller)('reports'),
    __metadata("design:paramtypes", [reports_service_1.ReportsService])
], ReportsController);
//# sourceMappingURL=reports.controller.js.map