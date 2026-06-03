"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityClassificationGuard = exports.ClassificationHierarchy = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const client_1 = require("@prisma/client");
const classification_decorator_1 = require("./classification.decorator");
exports.ClassificationHierarchy = {
    [client_1.SecurityClassificationLevel.RESTRICTED]: 1,
    [client_1.SecurityClassificationLevel.CONFIDENTIAL]: 2,
    [client_1.SecurityClassificationLevel.SECRET]: 3,
    [client_1.SecurityClassificationLevel.TOP_SECRET]: 4,
};
let SecurityClassificationGuard = class SecurityClassificationGuard {
    reflector;
    constructor(reflector) {
        this.reflector = reflector;
    }
    canActivate(context) {
        const requiredLevel = this.reflector.getAllAndOverride(classification_decorator_1.CLASSIFICATION_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!requiredLevel) {
            return true;
        }
        const request = context.switchToHttp().getRequest();
        const { user } = request;
        if (!user) {
            throw new common_1.ForbiddenException('Access denied: user not authenticated');
        }
        if (user.role === 'ADMIN') {
            return true;
        }
        if (!user.securityClassification) {
            throw new common_1.ForbiddenException('Access denied: no security classification level provided');
        }
        const userWeight = exports.ClassificationHierarchy[user.securityClassification] || 0;
        const requiredWeight = exports.ClassificationHierarchy[requiredLevel] || 0;
        if (userWeight < requiredWeight) {
            throw new common_1.ForbiddenException(`Access denied: Insufficient security classification clearance. Requires ${requiredLevel} or higher.`);
        }
        return true;
    }
};
exports.SecurityClassificationGuard = SecurityClassificationGuard;
exports.SecurityClassificationGuard = SecurityClassificationGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector])
], SecurityClassificationGuard);
//# sourceMappingURL=classification.guard.js.map