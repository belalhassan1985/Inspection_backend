import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';
import { ReviewCacheService } from './review-cache.service';
import { ReportsModule } from '../reports/reports.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ReportsModule, PrismaModule],
  controllers: [ReviewController],
  providers: [ReviewService, ReviewCacheService],
  exports: [ReviewService, ReviewCacheService],
})
export class ReviewModule {}
