import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddCommentDto {
  @ApiProperty({ description: 'محتوى التعليق أو ملاحظة المتابعة' })
  @IsNotEmpty({ message: 'نص التعليق لا يمكن أن يكون فارغاً' })
  @IsString({ message: 'التعليق يجب أن يكون نصياً' })
  notes: string;

  @ApiProperty({ description: 'معرف التعليق الأب في حال الرد', required: false })
  @IsOptional()
  @IsString()
  parentCommentId?: string;
}
