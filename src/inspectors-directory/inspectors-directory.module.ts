import { Module } from '@nestjs/common';
import { InspectorsDirectoryService } from './inspectors-directory.service';
import { InspectorsDirectoryController } from './inspectors-directory.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [InspectorsDirectoryController],
  providers: [InspectorsDirectoryService],
})
export class InspectorsDirectoryModule {}
