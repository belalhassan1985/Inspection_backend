import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Put,
  Delete,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { RecommendationTrackingService } from './recommendation-tracking.service';
import { AssignRecommendationDto } from './dto/assign-recommendation.dto';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { VerifyCloseRecommendationDto } from './dto/verify-close.dto';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Recommendation Tracking (متابعة التوصيات الرقابية)')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('recommendations/tracking')
export class RecommendationTrackingController {
  constructor(private readonly service: RecommendationTrackingService) {}

  // 1. Get dashboard summary metrics (must be placed before generic /:id route)
  @Get('stats/summary')
  @ApiOperation({ summary: 'الحصول على ملخص مؤشرات الأداء الإجمالية لمتابعة التوصيات' })
  async getDashboardSummary() {
    return this.service.getDashboardSummary();
  }

  // 2. Get stats by risk level
  @Get('stats/by-risk')
  @ApiOperation({ summary: 'توزيع التوصيات قيد المتابعة حسب مستوى الخطورة' })
  async getStatsByRisk() {
    return this.service.getStatsByRisk();
  }

  // 3. Get stats by impact category
  @Get('stats/by-impact')
  @ApiOperation({ summary: 'توزيع التوصيات حسب مجالات وتصنيف الأثر بالوزارة' })
  async getStatsByImpact() {
    return this.service.getStatsByImpact();
  }

  // 4. Get lagging entities list
  @Get('stats/by-entity')
  @ApiOperation({ summary: 'قائمة الجهات الأكثر تأخراً وتلكؤاً في إغلاق التوصيات' })
  async getLaggingEntities() {
    return this.service.getLaggingEntities();
  }

  // 4.5. Admin Cron Escalation run (placed before generic :id)
  @Roles('ADMIN', 'EVALUATOR')
  @Post('admin/run-escalations')
  @ApiOperation({ summary: 'تشغيل فحص التصعيد التلقائي الإداري للتوصيات المتأخرة' })
  async runEscalations(@Req() req: any) {
    return this.service.runEscalationCheck(req.user);
  }

  // 5. Get list of tracked recommendations
  @Get()
  @ApiOperation({ summary: 'جلب وقفل وتصفية التوصيات قيد المتابعة' })
  async findAll(@Query() query: any, @Req() req: any) {
    return this.service.findAll(query, req.user);
  }

  // 6. Get details of a single tracked recommendation
  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل التوصية والخط الزمني الكامل وسجل المرفقات' })
  async findOne(@Param('id') id: string, @Req() req: any) {
    return this.service.findOne(id, req.user);
  }

  // 6.1. Get timeline of a tracked recommendation
  @Get(':id/timeline')
  @ApiOperation({ summary: 'الخط الزمني الكامل للتوصية منذ الإصدار وحتى الإغلاق' })
  async getTimeline(@Param('id') id: string, @Req() req: any) {
    return this.service.getTimeline(id, req.user);
  }

  // 7. Assign responsible entity/user and set due date
  @Roles('ADMIN', 'EVALUATOR')
  @Post(':id/assign')
  @ApiOperation({ summary: 'تكليف جهة مسؤولة أو مستخدم وتحديد تاريخ استحقاق التوصية' })
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignRecommendationDto,
    @Req() req: any,
  ) {
    return this.service.assign(id, dto, req.user);
  }

  // 8. Update progress percentage and implementation notes
  @Patch(':id/progress')
  @ApiOperation({ summary: 'تحديث نسبة إنجاز التوصية وتوثيق الإجراء المتخذ من قبل الجهة المعنية' })
  async updateProgress(
    @Param('id') id: string,
    @Body() dto: UpdateProgressDto,
    @Req() req: any,
  ) {
    return this.service.updateProgress(id, dto, req.user);
  }

  // 9. Fetch comments tree of recommendation
  @Get(':id/comments')
  @ApiOperation({ summary: 'جلب شجرة التعليقات الخاصة بالتوصية' })
  async getCommentsTree(@Param('id') id: string, @Req() req: any) {
    return this.service.getCommentsTree(id, req.user);
  }

  // 9.5. Add comment or reply
  @Post(':id/comments')
  @ApiOperation({ summary: 'إضافة تعليق أو رد على الخط الزمني للتوصية' })
  async addComment(
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
    @Req() req: any,
  ) {
    return this.service.addComment(id, dto, req.user);
  }

  // 9.6. Edit comment text
  @Put('comments/:commentId')
  @ApiOperation({ summary: 'تعديل تعليق مكتوب مسبقاً' })
  async editComment(
    @Param('commentId') commentId: string,
    @Body() dto: { commentText: string },
    @Req() req: any,
  ) {
    return this.service.editComment(commentId, dto.commentText, req.user);
  }

  // 9.7. Soft Delete comment
  @Delete('comments/:commentId')
  @ApiOperation({ summary: 'حذف تعليق ناعم مع الحفاظ على الهيكل التنظيمي' })
  async deleteComment(@Param('commentId') commentId: string, @Req() req: any) {
    return this.service.deleteComment(commentId, req.user);
  }

  // 10. Upload evidence attachment
  @Post(':id/evidence')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'رفع ملفات أدلة إثبات المعالجة وإنجاز التوصية' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req: any, file: any, callback: any) => {
          const dir = './uploads/evidence';
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          callback(null, dir);
        },
        filename: (req: any, file: any, callback: any) => {
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          callback(null, `evidence-${uniqueSuffix}${ext}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB Limit
      fileFilter: (req: any, file: any, callback: any) => {
        const allowedTypes = [
          'application/pdf',
          'image/png',
          'image/jpeg',
          'image/jpg',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
          'application/msword', // DOC
          'application/zip',
          'application/x-zip-compressed',
        ];
        if (!allowedTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException('نوع الملف غير مدعوم. المسموح به: PDF, PNG, JPG, DOCX, ZIP'),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async addEvidence(
    @Param('id') id: string,
    @UploadedFile() file: any,
    @Body('description') description: string,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('يجب اختيار ملف لرفعه كدليل إثبات');
    }
    return this.service.addEvidence(id, file, description, req.user);
  }

  // 11. Verify and close recommendation
  @Roles('ADMIN', 'EVALUATOR')
  @Post(':id/verify-close')
  @ApiOperation({ summary: 'تدقيق ومطابقة الأدلة ميدانياً وإغلاق أو رفض التوصية الرقابية' })
  async verifyClose(
    @Param('id') id: string,
    @Body() dto: VerifyCloseRecommendationDto,
    @Req() req: any,
  ) {
    return this.service.verifyClose(id, dto, req.user);
  }
}
