import { Module } from '@nestjs/common';
import { MatchingQueueService } from './matching-queue.service';
import { MatchingQueueController } from './matching-queue.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MatchingQueueController],
  providers: [MatchingQueueService],
})
export class MatchingQueueModule {}
