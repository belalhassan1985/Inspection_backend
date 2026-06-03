import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Res,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { RolesGuard } from '../auth/roles.guard';

// Interfaces for type-safe report payload mapping
interface ReportSubSection {
  title?: string;
  isEmpty?: boolean;
  visible?: boolean;
  findings?: string[];
  earnedSum?: number;
  maxSum?: number;
  detailsList?: string[];
  hasQuantData?: boolean;
  officerInfo?: unknown;
  detailedTables?: any[];
}

interface ReportSection {
  title?: string;
  isEmpty?: boolean;
  visible?: boolean;
  isManual?: boolean;
  narrativeText?: string;
  subsections?: ReportSubSection[];
}

interface ReportPosition {
  positionName?: string;
  positionHolder?: string;
}

interface ReportPayload {
  sections?: ReportSection[];
  positions?: ReportPosition[];
  hasSavedPresentation?: boolean;
  isStale?: boolean;
}

@ApiTags('Reports Engine')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Get('campaign/:campaignId/payload')
  @ApiOperation({
    summary: 'الحصول على حمولة التقرير المعدة مسبقاً (بيانات مفلترة ومنظمة)',
  })
  async getCampaignReportPayload(
    @Param('campaignId') campaignId: string,
  ): Promise<unknown> {
    return this.reportsService.getCampaignReportPayload(campaignId);
  }

  @Get('campaign/:campaignId/pdf')
  @ApiOperation({ summary: 'توليد وتحميل تقرير PDF من بيانات قاعدة البيانات' })
  async getCampaignReportPdf(
    @Param('campaignId') campaignId: string,
    @Res() res: Response,
  ): Promise<void> {
    const pdfBuffer =
      await this.reportsService.generateCampaignReportPdf(campaignId);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=inspection_report_${campaignId}.pdf`,
      'Content-Length': pdfBuffer.length.toString(),
    });

    res.end(pdfBuffer);
  }

  @Post('campaign/:campaignId/pdf')
  @HttpCode(200)
  @ApiOperation({ summary: 'توليد PDF من حمولة معدلة (قابلة للتحرير)' })
  async postCampaignReportPdf(
    @Param('campaignId') campaignId: string,
    @Body() payload: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    const hasPayload =
      payload && typeof payload === 'object' && Object.keys(payload).length > 0;
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

  @Get('campaign/:campaignId/word')
  @ApiOperation({ summary: 'توليد وتحميل تقرير Word من بيانات قاعدة البيانات' })
  async getCampaignReportWord(
    @Param('campaignId') campaignId: string,
    @Res() res: Response,
  ): Promise<void> {
    const wordBuffer =
      await this.reportsService.generateCampaignReportWord(campaignId);

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename=inspection_report_${campaignId}.docx`,
      'Content-Length': wordBuffer.length.toString(),
    });

    res.end(wordBuffer);
  }

  @Post('campaign/:campaignId/word')
  @HttpCode(200)
  @ApiOperation({ summary: 'توليد Word من حمولة معدلة (قابلة للتحرير)' })
  async postCampaignReportWord(
    @Param('campaignId') campaignId: string,
    @Body() payload: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    const hasPayload =
      payload && typeof payload === 'object' && Object.keys(payload).length > 0;
    const wordBuffer = hasPayload
      ? await this.reportsService.generateCampaignReportWord(
          campaignId,
          payload,
        )
      : await this.reportsService.generateCampaignReportWord(campaignId);

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename=inspection_report_${campaignId}.docx`,
      'Content-Length': wordBuffer.length.toString(),
    });

    res.end(wordBuffer);
  }

  @Post('campaign/:campaignId/presentation')
  @ApiOperation({ summary: 'حفظ عرض التقرير المخصص (حفظ التعديلات)' })
  async saveCampaignReportPresentation(
    @Param('campaignId') campaignId: string,
    @Body() payload: Record<string, unknown>,
  ): Promise<unknown> {
    return this.reportsService.saveReportPresentation(campaignId, payload);
  }

  @Delete('campaign/:campaignId/presentation')
  @ApiOperation({
    summary: 'إعادة تعيين عرض التقرير (حذف التعديلات والرجوع للأصل)',
  })
  async deleteCampaignReportPresentation(
    @Param('campaignId') campaignId: string,
  ): Promise<unknown> {
    return this.reportsService.deleteReportPresentation(campaignId);
  }

  @Get('campaign/:campaignId/payload/debug')
  @ApiOperation({
    summary: 'تصحيح: عرض ملخص أقسام التقرير مع detailed visibility',
  })
  async debugCampaignReportPayload(
    @Param('campaignId') campaignId: string,
  ): Promise<unknown> {
    const rawPayload: unknown =
      await this.reportsService.getCampaignReportPayload(campaignId);
    const payload = rawPayload as ReportPayload;

    const debug = {
      campaignId,
      totalSections: payload.sections?.length || 0,
      totalSubsections: 0,
      hasSavedPresentation: payload.hasSavedPresentation,
      isStale: payload.isStale,
      sections: (payload.sections || []).map(
        (sec: ReportSection, sIdx: number) => ({
          index: sIdx,
          title: sec.title || '',
          isEmpty: !!sec.isEmpty,
          visible: !!sec.visible,
          isManual: !!sec.isManual,
          narrativeTextExists: !!sec.narrativeText,
          totalSubsections: sec.subsections?.length || 0,
          nonEmptySubsections:
            sec.subsections?.filter((s: ReportSubSection) => !s.isEmpty)
              .length || 0,
          willRender: !!sec.visible && !sec.isEmpty,
          subsections:
            (sec.subsections || []).map(
              (sub: ReportSubSection, subIdx: number) => {
                const hasFindings = !!(sub.findings && sub.findings.length > 0);
                const hasEarnedScores = !!(sub.earnedSum && sub.earnedSum > 0);
                const hasNotesText = !!sub.detailsList?.some((d: string) =>
                  d.includes('ملاحظة:'),
                );
                const hasQuantData = sub.hasQuantData === true;
                const realUserData =
                  hasFindings ||
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
                  rowsLength: sub.detailedTables?.reduce((sum: number, t: any) => sum + (t.rows?.length || 0), 0) || 0,
                  willRender: !!sub.visible && !sub.isEmpty,
                };
              },
            ) || [],
        }),
      ),
      filteredPositionsCount: payload.positions?.length || 0,
      positions: (payload.positions || []).map((p: ReportPosition) => ({
        positionName: p.positionName || '',
        positionHolder: p.positionHolder || '',
      })),
    };
    debug.totalSubsections = debug.sections.reduce(
      (sum: number, s) => sum + s.totalSubsections,
      0,
    );
    return debug;
  }
}
