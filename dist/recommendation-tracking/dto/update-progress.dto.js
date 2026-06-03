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
exports.UpdateProgressDto = void 0;
const class_validator_1 = require("class-validator");
const client_1 = require("@prisma/client");
const swagger_1 = require("@nestjs/swagger");
class UpdateProgressDto {
    progressPercent;
    status;
    notes;
}
exports.UpdateProgressDto = UpdateProgressDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'نسبة الإنجاز والتقدم من 0 إلى 100' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'نسبة التقدم مطلوبة' }),
    (0, class_validator_1.IsInt)({ message: 'نسبة التقدم يجب أن تكون رقماً صحيحاً' }),
    (0, class_validator_1.Min)(0, { message: 'نسبة التقدم لا تقل عن 0' }),
    (0, class_validator_1.Max)(100, { message: 'نسبة التقدم لا تزيد عن 100' }),
    __metadata("design:type", Number)
], UpdateProgressDto.prototype, "progressPercent", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'حالة المعالجة المحدثة بالتتبع' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'حالة المعالجة مطلوبة' }),
    (0, class_validator_1.IsEnum)(client_1.RecommendationStatus, { message: 'الحالة غير صالحة' }),
    __metadata("design:type", String)
], UpdateProgressDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'تفاصيل وملاحظات تحديث الإجراء' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'الملاحظات مطلوبة لتوضيح التقدم' }),
    (0, class_validator_1.IsString)({ message: 'الملاحظات يجب أن تكون نصية' }),
    __metadata("design:type", String)
], UpdateProgressDto.prototype, "notes", void 0);
//# sourceMappingURL=update-progress.dto.js.map