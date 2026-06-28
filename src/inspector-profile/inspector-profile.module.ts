import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InspectorProfileService } from './inspector-profile.service';
import { InspectorProfileController } from './inspector-profile.controller';

@Module({
  imports: [PrismaModule],
  controllers: [InspectorProfileController],
  providers: [InspectorProfileService],
  exports: [InspectorProfileService],
})
export class InspectorProfileModule {}
