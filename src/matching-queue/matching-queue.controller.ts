import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { MatchingQueueService } from './matching-queue.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Matching Queue')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('inspector-matching-queue')
export class MatchingQueueController {
  constructor(private service: MatchingQueueService) {}

  @Roles('ADMIN', 'EDITOR')
  @Post('import')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'استيراد ملف وورد أو إكسل لمطابقة المفتشين' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  async importFile(@UploadedFile() file: any) {
    if (!file) throw new BadRequestException('الملف مطلوب');
    return this.service.importFile(file.originalname, file.buffer);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get()
  @ApiOperation({ summary: 'قائمة جلسات الاستيراد' })
  async getSessions() {
    return this.service.getSessions();
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get('stats/:sessionId')
  @ApiOperation({ summary: 'إحصائيات جلسة الاستيراد' })
  async getStats(@Param('sessionId') sessionId: string) {
    return this.service.getStats(sessionId);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get(':sessionId')
  @ApiOperation({ summary: 'قائمة انتظار المطابقة لجلسة استيراد' })
  async getQueue(@Param('sessionId') sessionId: string) {
    return this.service.getQueue(sessionId);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/link')
  @ApiOperation({ summary: 'ربط عنصر بمفتش موجود' })
  async linkToInspector(
    @Param('id', ParseIntPipe) itemId: number,
    @Body() body: { inspectorId: string },
  ) {
    return this.service.linkToInspector(itemId, body.inspectorId);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/create')
  @ApiOperation({ summary: 'إنشاء مفتش جديد من العنصر' })
  async createInspector(@Param('id', ParseIntPipe) itemId: number) {
    return this.service.createInspector(itemId);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/skip')
  @ApiOperation({ summary: 'تخطي العنصر' })
  async skipItem(@Param('id', ParseIntPipe) itemId: number) {
    return this.service.skipItem(itemId);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post('import-preview/:sessionId')
  @ApiOperation({ summary: 'معاينة بيانات الاستيراد قبل الاعتماد' })
  async importPreview(@Param('sessionId') sessionId: string) {
    return this.service.getPreview(sessionId);
  }
}
