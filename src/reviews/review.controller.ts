import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Res,
  HttpCode,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ReviewService } from './review.service';
import { RolesGuard } from '../auth/roles.guard';

@ApiTags('Official Print Review')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('reports')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  @Post('campaign/:campaignId/review')
  @HttpCode(200)
  @ApiOperation({
    summary: 'توليد مراجعة التقرير (PDF + بيانات الصفحات + التحذيرات)',
    description:
      'يولد مراجعة التقرير باستخدام نفس pipeline التصدير الرسمي. ' +
      'يعيد PDF مع بيانات وصفية للصفحات (بداية/نهاية كل صفحة، تحذيرات). ' +
      'يمكن استدعاؤه بنفس حمولة POST /:id/pdf.',
  })
  async generateReview(
    @Param('campaignId') campaignId: string,
    @Body() payload: Record<string, unknown> | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const effectivePayload = payload && typeof payload === 'object' && Object.keys(payload).length > 0
      ? payload
      : undefined;

    const artifact = await this.reviewService.generateReview(campaignId, effectivePayload);

    const session = {
      id: artifact.id,
      campaignId: artifact.campaignId,
      state: artifact.state,
      pageCount: artifact.metadata.pageCount,
      warnings: artifact.metadata.warnings,
      pages: artifact.metadata.pages.map((p) => ({
        pageNumber: p.pageNumber,
        startsWith: p.startsWith,
        endsWith: p.endsWith,
        textLength: p.textLength,
      })),
      generationDurationMs: artifact.generationDurationMs,
      createdAt: artifact.createdAt,
      confirmedAt: artifact.confirmedAt,
    };

    res.set({
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify({
      pdf: artifact.pdf.toString('base64'),
      session,
    }));
  }

  @Get('campaign/:campaignId/review/session')
  @ApiOperation({
    summary: 'الحصول على جلسة المراجعة الحالية',
    description: 'يعيد بيانات جلسة المراجعة المخزنة مؤقتاً (دون PDF).',
  })
  async getReviewSession(
    @Param('campaignId') campaignId: string,
  ): Promise<unknown> {
    const session = await this.reviewService.getSession(campaignId);
    if (!session) {
      throw new NotFoundException(`No review session found for campaign ${campaignId}. Generate one first via POST /reports/campaign/:id/review.`);
    }
    return session;
  }

  @Post('campaign/:campaignId/review/confirm')
  @HttpCode(200)
  @ApiOperation({
    summary: 'تأكيد المراجعة والموافقة على التقرير',
    description: 'تأكيد أن التقرير جاهز للتصدير الرسمي. يحول حالة المراجعة إلى confirmed.',
  })
  async confirmReview(
    @Param('campaignId') campaignId: string,
  ): Promise<unknown> {
    return await this.reviewService.confirmReview(campaignId);
  }

  @Delete('campaign/:campaignId/review')
  @HttpCode(204)
  @ApiOperation({
    summary: 'حذف جلسة المراجعة الحالية',
    description: 'يلغي جلسة المراجعة ويعود إلى مرحلة التحرير.',
  })
  async discardReview(
    @Param('campaignId') campaignId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.reviewService.discardReview(campaignId);
    res.status(204).end();
  }
}
