import { Module } from '@nestjs/common';
import { InspectorSpecializationsService } from './inspector-specializations.service';
import { InspectorSpecializationsController } from './inspector-specializations.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InspectorSpecializationsController],
  providers: [InspectorSpecializationsService],
  exports: [InspectorSpecializationsService],
})
export class InspectorSpecializationsModule {}
