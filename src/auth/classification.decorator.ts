import { SetMetadata } from '@nestjs/common';
import { SecurityClassificationLevel } from '@prisma/client';

export const CLASSIFICATION_KEY = 'securityClassification';
export const RequiredClassification = (level: SecurityClassificationLevel) =>
  SetMetadata(CLASSIFICATION_KEY, level);
