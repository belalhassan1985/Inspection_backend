import { IsUUID, IsDateString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignRecommendationDto {
  @ApiPropertyOptional({ description: 'معرف الكيان المسؤول عن التنفيذ' })
  @IsOptional()
  @IsUUID('4', { message: 'معرف الكيان يجب أن يكون UUID صالح' })
  assignedEntityId?: string;

  @ApiPropertyOptional({ description: 'معرف المستخدم المسؤول المباشر' })
  @IsOptional()
  @IsUUID('4', { message: 'معرف المستخدم يجب أن يكون UUID صالح' })
  assignedUserId?: string;

  @ApiProperty({ description: 'تاريخ استحقاق التنفيذ والمعالجة' })
  @IsNotEmpty({ message: 'تاريخ الاستحقاق مطلوب' })
  @IsDateString(
    {},
    { message: 'تاريخ الاستحقاق يجب أن يكون بصيغة تاريخ صالحة' },
  )
  dueDate: string;
}
