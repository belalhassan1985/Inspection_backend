import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (request.method === 'OPTIONS') {
      return true;
    }
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = request;
    if (!user || !user.role) {
      throw new ForbiddenException('Access denied: no user role provided');
    }
    if (user.role === 'ADMIN') {
      return true; // ADMIN = Full System Access (Bypass All Roles Restrictions)
    }
    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied: requires roles ${requiredRoles.join(', ')}`,
      );
    }
    return true;
  }
}
