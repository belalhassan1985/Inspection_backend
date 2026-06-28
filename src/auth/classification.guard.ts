import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SecurityClassificationLevel } from '@prisma/client';
import { CLASSIFICATION_KEY } from './classification.decorator';

export const ClassificationHierarchy: Record<
  SecurityClassificationLevel,
  number
> = {
  [SecurityClassificationLevel.RESTRICTED]: 1,
  [SecurityClassificationLevel.CONFIDENTIAL]: 2,
  [SecurityClassificationLevel.SECRET]: 3,
  [SecurityClassificationLevel.TOP_SECRET]: 4,
};

@Injectable()
export class SecurityClassificationGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredLevel =
      this.reflector.getAllAndOverride<SecurityClassificationLevel>(
        CLASSIFICATION_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (!requiredLevel) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const { user } = request;

    if (!user) {
      throw new ForbiddenException('Access denied: user not authenticated');
    }

    if (user.role === 'ADMIN') {
      return true; // ADMIN = Full System Access (Bypass All Restrictions)
    }

    if (!user.securityClassification) {
      throw new ForbiddenException(
        'Access denied: no security classification level provided',
      );
    }

    const userWeight =
      ClassificationHierarchy[
        user.securityClassification as SecurityClassificationLevel
      ] || 0;
    const requiredWeight = ClassificationHierarchy[requiredLevel] || 0;

    if (userWeight < requiredWeight) {
      throw new ForbiddenException(
        `Access denied: Insufficient security classification clearance. Requires ${requiredLevel} or higher.`,
      );
    }

    return true;
  }
}
