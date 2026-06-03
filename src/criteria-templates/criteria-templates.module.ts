import { Module } from '@nestjs/common';
import { CriteriaTemplatesService } from './criteria-templates.service';
import { CriteriaTemplatesController } from './criteria-templates.controller';

@Module({
  providers: [CriteriaTemplatesService],
  controllers: [CriteriaTemplatesController],
  exports: [CriteriaTemplatesService],
})
export class CriteriaTemplatesModule {}
