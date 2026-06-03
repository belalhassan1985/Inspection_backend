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
exports.AssignRecommendationDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
class AssignRecommendationDto {
    assignedEntityId;
    assignedUserId;
    dueDate;
}
exports.AssignRecommendationDto = AssignRecommendationDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'معرف الكيان المسؤول عن التنفيذ' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4', { message: 'معرف الكيان يجب أن يكون UUID صالح' }),
    __metadata("design:type", String)
], AssignRecommendationDto.prototype, "assignedEntityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'معرف المستخدم المسؤول المباشر' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)('4', { message: 'معرف المستخدم يجب أن يكون UUID صالح' }),
    __metadata("design:type", String)
], AssignRecommendationDto.prototype, "assignedUserId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'تاريخ استحقاق التنفيذ والمعالجة' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'تاريخ الاستحقاق مطلوب' }),
    (0, class_validator_1.IsDateString)({}, { message: 'تاريخ الاستحقاق يجب أن يكون بصيغة تاريخ صالحة' }),
    __metadata("design:type", String)
], AssignRecommendationDto.prototype, "dueDate", void 0);
//# sourceMappingURL=assign-recommendation.dto.js.map