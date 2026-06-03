import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notifications/notification.module';
import { KpiEngineService } from './kpi-engine.service';
import { HealthAnalyticsService } from './health-analytics.service';
import { SlaMonitoringService } from './sla-monitoring.service';
import { SlaEngineService } from './sla-engine.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [AnalyticsController],
  providers: [
    KpiEngineService,
    HealthAnalyticsService,
    SlaMonitoringService,
    SlaEngineService,
  ],
  exports: [
    KpiEngineService,
    HealthAnalyticsService,
    SlaMonitoringService,
    SlaEngineService,
  ],
})
export class AnalyticsModule {}
