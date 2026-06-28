import { Module } from '@nestjs/common';
import { InspectorWorkloadService } from './inspector-workload.service';
import { InspectorWorkloadController } from './inspector-workload.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InspectorWorkloadController],
  providers: [InspectorWorkloadService],
  exports: [InspectorWorkloadService],
})
export class InspectorWorkloadModule {}
