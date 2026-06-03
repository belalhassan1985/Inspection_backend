import { IsEnum, IsString, IsNotEmpty } from 'class-validator';
import { RecommendationStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyCloseRecommendationDto {
  @ApiProperty({ description: 'الحالة المعتمدة للاعتماد: CLOSED أو VERIFIED أو REJECTED' })
  @IsNotEmpty({ message: 'حالة الاعتماد مطلوبة' })
  @IsEnum(RecommendationStatus, { message: 'الحالة المحددة للاعتماد غير صالحة' })
  resolutionStatus: RecommendationStatus;

  @ApiProperty({ description: 'المبررات وملاحظات المفتش للإغلاق' })
  @IsNotEmpty({ message: 'المبررات وملاحظات الإغلاق مطلوبة' })
  @IsString({ message: 'الملاحظات يجب أن تكون نصية' })
  notes: string;
}
