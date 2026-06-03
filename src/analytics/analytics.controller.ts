import { Controller, Get, Post, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { KpiEngineService } from './kpi-engine.service';
import { SlaMonitoringService } from './sla-monitoring.service';
import { SlaEngineService } from './sla-engine.service';
import { HealthAnalyticsService } from './health-analytics.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SecurityClassificationGuard } from '../auth/classification.guard';
import { RequiredClassification } from '../auth/classification.decorator';
import { SecurityClassificationLevel } from '@prisma/client';

@ApiTags('Executive Intelligence & Analytics')
@ApiBearerAuth()
@UseGuards(RolesGuard, SecurityClassificationGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private kpiEngine: KpiEngineService,
    private slaService: SlaMonitoringService,
    private slaEngine: SlaEngineService,
    private healthService: HealthAnalyticsService
  ) {}
  @Roles('ADMIN', 'EVALUATOR', 'EDITOR', 'COORDINATOR', 'VIEWER')
  @RequiredClassification(SecurityClassificationLevel.SECRET)
  @Get('executive-summary')
  @ApiOperation({ summary: 'استرجاع المؤشرات الكلية ولوحة القيادة التنفيذية' })
  async getExecutiveSummary(@Request() req: any) {
    return this.kpiEngine.getExecutiveSummary(req.user);
  }

  @Roles('ADMIN', 'EVALUATOR', 'EDITOR', 'COORDINATOR', 'VIEWER')
  @RequiredClassification(SecurityClassificationLevel.CONFIDENTIAL)
  @Get('health-summary')
  @ApiOperation({ summary: 'استرجاع تحليلات ومؤشرات صحة التوصيات' })
  async getHealthSummary(@Request() req: any) {
    return this.kpiEngine.getHealthAnalyticsSummary(req.user);
  }

  @Roles('ADMIN', 'EVALUATOR', 'EDITOR', 'VIEWER')
  @RequiredClassification(SecurityClassificationLevel.CONFIDENTIAL)
  @Get('escalation-summary')
  @ApiOperation({ summary: 'استرجاع ملخص حالة ومسببات التصعيد' })
  async getEscalationSummary(@Request() req: any) {
    return this.kpiEngine.getEscalationSummary(req.user);
  }

  @Roles('ADMIN', 'EVALUATOR', 'EDITOR', 'COORDINATOR', 'VIEWER')
  @RequiredClassification(SecurityClassificationLevel.CONFIDENTIAL)
  @Get('sla/metrics')
  @ApiOperation({ summary: 'استرجاع جميع مقاييس SLA للتوصيات' })
  async getSlaMetrics(@Request() req: any) {
    return this.slaEngine.calculateForAll();
  }

  @Roles('ADMIN', 'EVALUATOR', 'EDITOR', 'COORDINATOR', 'VIEWER')
  @RequiredClassification(SecurityClassificationLevel.CONFIDENTIAL)
  @Get('sla/metrics/:id')
  @ApiOperation({ summary: 'استرجاع مقاييس SLA لتوصية محددة' })
  async getSlaMetricsById(@Param('id') id: string) {
    const result = await this.slaEngine.calculateForOne(id);
    if (!result) {
      return { message: 'التوصية غير موجودة' };
    }
    return result;
  }

  @Roles('ADMIN', 'EVALUATOR', 'EDITOR', 'COORDINATOR', 'VIEWER')
  @RequiredClassification(SecurityClassificationLevel.CONFIDENTIAL)
  @Get('sla/summary')
  @ApiOperation({ summary: 'استرجاع ملخص SLA الإجمالي' })
  async getSlaSummary(@Request() req: any) {
    return this.slaEngine.getSlaSummary();
  }

  @Roles('ADMIN')
  @RequiredClassification(SecurityClassificationLevel.SECRET)
  @Post('admin/trigger-snapshot')
  @ApiOperation({ summary: 'توليد لقطة إحصائية جديدة للمؤشرات يدوياً' })
  async triggerSnapshot() {
    const snapshot = await this.kpiEngine.generateDailySnapshot();
    this.kpiEngine.clearCache(); // Invalidate cache on snapshot update
    return {
      message: 'تم توليد اللقطة الإحصائية للمؤشرات وحفظها بنجاح',
      snapshotId: snapshot.id,
      date: snapshot.snapshotDate,
    };
  }

  @Roles('ADMIN')
  @RequiredClassification(SecurityClassificationLevel.SECRET)
  @Post('admin/trigger-sla')
  @ApiOperation({ summary: 'تشغيل فحص اتفاقية مستوى الخدمة SLA يدوياً لتسجيل الخروقات' })
  async triggerSlaCheck() {
    await this.slaService.checkSlaBreaches();
    this.kpiEngine.clearCache(); // Invalidate cache on SLA breach updates
    return {
      message: 'تم تشغيل فحص خروقات SLA وتحديث السجلات بنجاح',
    };
  }

  @Roles('ADMIN')
  @RequiredClassification(SecurityClassificationLevel.SECRET)
  @Post('admin/trigger-backfill')
  @ApiOperation({ summary: 'تشغيل التغذية التاريخية الأولية يدوياً' })
  async triggerBackfill() {
    await this.slaService.checkSlaBreaches();
    await this.healthService.recordAllHealthScores();
    await this.kpiEngine.generateDailySnapshot();
    this.kpiEngine.clearCache();
    return {
      message: 'تم تشغيل التغذية التاريخية الأولية وتوليد السجلات بنجاح',
    };
  }

  @Roles('ADMIN')
  @RequiredClassification(SecurityClassificationLevel.SECRET)
  @Post('admin/clear-cache')
  @ApiOperation({ summary: 'مسح التخزين المؤقت للمؤشرات واللوحات يدوياً' })
  async clearCache() {
    this.kpiEngine.clearCache();
    return {
      message: 'تم مسح التخزين المؤقت بالكامل بنجاح',
    };
  }
}
