import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InspectionsService } from './inspections.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Inspection Execution & Scores')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('inspections')
export class InspectionsController {
  constructor(private inspectionsService: InspectionsService) {}

  @Get()
  @ApiOperation({ summary: 'استعراض جميع عمليات التفتيش' })
  async findAll() {
    return this.inspectionsService.findAll();
  }

  @Get('criteria-template')
  @ApiOperation({
    summary: 'الحصول على قالب الأسئلة والبنود المعيارية لنموذج التفتيش',
  })
  async getCriteriaTemplate(@Query('campaignId') campaignId?: string) {
    return this.inspectionsService.getCriteriaTemplate(campaignId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل عملية تفتيش محددة بجميع درجات الكيان' })
  async findOne(@Param('id') id: string) {
    return this.inspectionsService.findOne(id);
  }

  @Get('campaign/:campaignId')
  @ApiOperation({
    summary: 'الحصول على تقييم التفتيش الخاص بحملة تفتيشية محددة',
  })
  async findByCampaign(@Param('campaignId') campaignId: string) {
    return this.inspectionsService.findByCampaign(campaignId);
  }

  @Roles('ADMIN', 'EVALUATOR')
  @Post()
  @ApiOperation({ summary: 'إدخال وحساب تقييم تفتيش جديد لكيان محدد' })
  async create(@Body() body: any) {
    return this.inspectionsService.create(body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put(':id/status')
  @ApiOperation({ summary: 'مراجعة واعتماد أو رفض تقييم التفتيش' })
  async updateStatus(@Param('id') id: string, @Body() body: any) {
    return this.inspectionsService.updateStatus(id, body.status, body.findings);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @ApiOperation({ summary: 'حذف عملية تفتيش' })
  async remove(@Param('id') id: string) {
    return this.inspectionsService.remove(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post('primary-criteria')
  @ApiOperation({ summary: 'إضافة محور رئيسي جديد' })
  async createPrimary(@Body() body: any) {
    return this.inspectionsService.createPrimary(body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put('primary-criteria/:id')
  @ApiOperation({ summary: 'تعديل محور رئيسي' })
  async updatePrimary(@Param('id') id: string, @Body() body: any) {
    return this.inspectionsService.updatePrimary(parseInt(id), body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Delete('primary-criteria/:id')
  @ApiOperation({ summary: 'حذف محور رئيسي' })
  async removePrimary(@Param('id') id: string) {
    return this.inspectionsService.removePrimary(parseInt(id));
  }

  @Roles('ADMIN', 'EDITOR')
  @Post('secondary-criteria')
  @ApiOperation({ summary: 'إضافة محور فرعي جديد' })
  async createSecondary(@Body() body: any) {
    return this.inspectionsService.createSecondary(body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put('secondary-criteria/:id')
  @ApiOperation({ summary: 'تعديل محور فرعي' })
  async updateSecondary(@Param('id') id: string, @Body() body: any) {
    return this.inspectionsService.updateSecondary(parseInt(id), body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Delete('secondary-criteria/:id')
  @ApiOperation({ summary: 'حذف محور فرعي' })
  async removeSecondary(@Param('id') id: string) {
    return this.inspectionsService.removeSecondary(parseInt(id));
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR')
  @Post('criteria-detail')
  @ApiOperation({ summary: 'إضافة بند تفتيش تفصيلي جديد' })
  async createDetail(@Body() body: any) {
    return this.inspectionsService.createDetail(body);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR')
  @Post('criteria-option')
  @ApiOperation({ summary: 'إضافة خيار تقييم جديد' })
  async createOption(@Body() body: any) {
    return this.inspectionsService.createOption(body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put('criteria-detail/:id')
  @ApiOperation({ summary: 'تعديل بند تفتيش تفصيلي' })
  async updateDetail(@Param('id') id: string, @Body() body: any) {
    return this.inspectionsService.updateDetail(parseInt(id), body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Delete('criteria-detail/:id')
  @ApiOperation({ summary: 'حذف بند تفتيش تفصيلي' })
  async removeDetail(@Param('id') id: string) {
    return this.inspectionsService.removeDetail(parseInt(id));
  }

  @Roles('ADMIN', 'EDITOR')
  @Post('primary-criteria/reorder')
  @ApiOperation({ summary: 'إعادة ترتيب المحاور الرئيسية' })
  async reorderPrimary(@Body() body: { ids: number[]; templateId?: string }) {
    return this.inspectionsService.reorderPrimary(body.ids, body.templateId);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post('secondary-criteria/reorder')
  @ApiOperation({ summary: 'إعادة ترتيب المحاور الفرعية' })
  async reorderSecondary(@Body() body: { ids: number[] }) {
    return this.inspectionsService.reorderSecondary(body.ids);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post('criteria-detail/reorder')
  @ApiOperation({ summary: 'إعادة ترتيب البنود التفصيلية' })
  async reorderDetail(@Body() body: { ids: number[] }) {
    return this.inspectionsService.reorderDetail(body.ids);
  }
}
