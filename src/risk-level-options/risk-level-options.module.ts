import { Module } from '@nestjs/common';
import { RiskLevelOptionsController } from './risk-level-options.controller';
import { RiskLevelOptionsService } from './risk-level-options.service';

@Module({
  controllers: [RiskLevelOptionsController],
  providers: [RiskLevelOptionsService],
  exports: [RiskLevelOptionsService],
})
export class RiskLevelOptionsModule {}
