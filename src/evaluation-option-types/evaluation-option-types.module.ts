import { Module } from '@nestjs/common';
import { EvaluationOptionTypesController } from './evaluation-option-types.controller';
import { EvaluationOptionTypesService } from './evaluation-option-types.service';

@Module({
  controllers: [EvaluationOptionTypesController],
  providers: [EvaluationOptionTypesService],
  exports: [EvaluationOptionTypesService],
})
export class EvaluationOptionTypesModule {}
