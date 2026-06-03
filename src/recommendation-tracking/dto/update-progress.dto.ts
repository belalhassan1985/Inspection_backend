import { IsEnum, IsInt, Min, Max, IsString, IsNotEmpty } from 'class-validator';
import { RecommendationStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateProgressDto {
  @ApiProperty({ description: 'نسبة الإنجاز والتقدم من 0 إلى 100' })
  @IsNotEmpty({ message: 'نسبة التقدم مطلوبة' })
  @IsInt({ message: 'نسبة التقدم يجب أن تكون رقماً صحيحاً' })
  @Min(0, { message: 'نسبة التقدم لا تقل عن 0' })
  @Max(100, { message: 'نسبة التقدم لا تزيد عن 100' })
  progressPercent: number;

  @ApiProperty({ description: 'حالة المعالجة المحدثة بالتتبع' })
  @IsNotEmpty({ message: 'حالة المعالجة مطلوبة' })
  @IsEnum(RecommendationStatus, { message: 'الحالة غير صالحة' })
  status: RecommendationStatus;

  @ApiProperty({ description: 'تفاصيل وملاحظات تحديث الإجراء' })
  @IsNotEmpty({ message: 'الملاحظات مطلوبة لتوضيح التقدم' })
  @IsString({ message: 'الملاحظات يجب أن تكون نصية' })
  notes: string;
}
