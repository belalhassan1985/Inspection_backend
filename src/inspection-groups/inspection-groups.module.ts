import { Module } from '@nestjs/common';
import { InspectionGroupsService } from './inspection-groups.service';
import { InspectionGroupsController } from './inspection-groups.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InspectionGroupsController],
  providers: [InspectionGroupsService],
  exports: [InspectionGroupsService],
})
export class InspectionGroupsModule {}
