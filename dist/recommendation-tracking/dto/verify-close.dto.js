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
exports.VerifyCloseRecommendationDto = void 0;
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
const swagger_1 = require("@nestjs/swagger");
class VerifyCloseRecommendationDto {
    resolutionStatus;
    notes;
}
exports.VerifyCloseRecommendationDto = VerifyCloseRecommendationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'الحالة المعتمدة للاعتماد: CLOSED أو VERIFIED أو REJECTED' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'حالة الاعتماد مطلوبة' }),
    (0, class_validator_1.IsEnum)(client_1.RecommendationStatus, { message: 'الحالة المحددة للاعتماد غير صالحة' }),
    __metadata("design:type", String)
], VerifyCloseRecommendationDto.prototype, "resolutionStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'المبررات وملاحظات المفتش للإغلاق' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'المبررات وملاحظات الإغلاق مطلوبة' }),
    (0, class_validator_1.IsString)({ message: 'الملاحظات يجب أن تكون نصية' }),
    __metadata("design:type", String)
], VerifyCloseRecommendationDto.prototype, "notes", void 0);
//# sourceMappingURL=verify-close.dto.js.map