import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { InspectorProfileService } from './inspector-profile.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { existsSync, mkdirSync } from 'fs';

@ApiTags('Inspector Profile')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('inspector-profile')
export class InspectorProfileController {
  constructor(private service: InspectorProfileService) {}

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get(':id')
  @ApiOperation({ summary: 'الملف الكامل للمفتش' })
  async getProfile(@Param('id') id: string) {
    return this.service.getProfile(id);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get(':id/summary')
  @ApiOperation({ summary: 'ملخص الملف الشخصي للمفتش' })
  async getProfileSummary(@Param('id') id: string) {
    return this.service.getProfileSummary(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put(':id')
  @ApiOperation({ summary: 'تحديث بيانات الملف الشخصي للمفتش' })
  async updateProfile(@Param('id') id: string, @Body() body: any) {
    return this.service.updateProfile(id, body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/photo')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'رفع صورة المفتش' })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: (req: any, file: any, callback: any) => {
          const dir = './uploads/inspector-photos';
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          callback(null, dir);
        },
        filename: (req: any, file: any, callback: any) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `inspector-${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (req: any, file: any, callback: any) => {
        const allowedTypes = [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/jpg',
        ];
        if (!allowedTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'نوع الملف غير مدعوم. المسموح به: JPG, PNG, WEBP',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async uploadPhoto(@Param('id') id: string, @UploadedFile() file: any) {
    return this.service.uploadPhoto(id, file);
  }

  @Roles('ADMIN', 'EDITOR')
  @Delete(':id/photo')
  @ApiOperation({ summary: 'حذف صورة المفتش' })
  async deletePhoto(@Param('id') id: string) {
    return this.service.deletePhoto(id);
  }
}
