import { Module } from '@nestjs/common';
import { InspectorsService } from './inspectors.service';
import { InspectorsController } from './inspectors.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InspectorsController],
  providers: [InspectorsService],
  exports: [InspectorsService],
})
export class InspectorsModule {}
