import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { EntitiesModule } from './entities/entities.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { InspectionsModule } from './inspections/inspections.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { ReportsModule } from './reports/reports.module';
import { CriteriaTemplatesModule } from './criteria-templates/criteria-templates.module';
import { InspectorsModule } from './inspectors/inspectors.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { RecommendationTrackingModule } from './recommendation-tracking/recommendation-tracking.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { WebsocketsModule } from './websockets/websockets.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { EvaluationOptionTypesModule } from './evaluation-option-types/evaluation-option-types.module';
import { RiskLevelOptionsModule } from './risk-level-options/risk-level-options.module';
import { NotificationModule } from './notifications/notification.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    EntitiesModule,
    CampaignsModule,
    InspectionsModule,
    AuditLogsModule,
    ReportsModule,
    CriteriaTemplatesModule,
    InspectorsModule,
    DashboardModule,
    RecommendationTrackingModule,
    WebsocketsModule,
    AnalyticsModule,
    EvaluationOptionTypesModule,
    RiskLevelOptionsModule,
    NotificationModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
