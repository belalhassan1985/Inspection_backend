import { Module } from '@nestjs/common';
import { RecommendationTrackingService } from './recommendation-tracking.service';
import { RecommendationTrackingController } from './recommendation-tracking.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WebsocketsModule } from '../websockets/websockets.module';
import { NotificationModule } from '../notifications/notification.module';

@Module({
  imports: [PrismaModule, WebsocketsModule, NotificationModule],
  controllers: [RecommendationTrackingController],
  providers: [RecommendationTrackingService],
  exports: [RecommendationTrackingService],
})
export class RecommendationTrackingModule {}
