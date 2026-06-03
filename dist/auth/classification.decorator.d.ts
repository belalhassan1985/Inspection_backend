import { SecurityClassificationLevel } from '@prisma/client';
export declare const CLASSIFICATION_KEY = "securityClassification";
export declare const RequiredClassification: (level: SecurityClassificationLevel) => import("@nestjs/common").CustomDecorator<string>;
