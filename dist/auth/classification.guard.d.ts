import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SecurityClassificationLevel } from '@prisma/client';
export declare const ClassificationHierarchy: Record<SecurityClassificationLevel, number>;
export declare class SecurityClassificationGuard implements CanActivate {
    private reflector;
    constructor(reflector: Reflector);
    canActivate(context: ExecutionContext): boolean;
}
