import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CampaignsService } from './campaigns.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Campaigns Management')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('campaigns')
export class CampaignsController {
  constructor(private campaignsService: CampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'عرض كل الحملات التفتيشية' })
  async findAll() {
    return this.campaignsService.findAll();
  }

  @Get('types/all')
  @ApiOperation({ summary: 'عرض كل أنواع اللجان' })
  async findAllTypes() {
    return this.campaignsService.findAllTypes();
  }

  @Roles('ADMIN', 'EDITOR')
  @Post('types/create')
  @ApiOperation({ summary: 'إضافة نوع لجنة جديد' })
  async createType(@Body() body: any) {
    return this.campaignsService.createType(body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put('types/update/:id')
  @ApiOperation({ summary: 'تعديل نوع لجنة' })
  async updateType(@Param('id') id: string, @Body() body: any) {
    return this.campaignsService.updateType(id, body);
  }

  @Roles('ADMIN')
  @Delete('types/delete/:id')
  @ApiOperation({ summary: 'حذف نوع لجنة' })
  async removeType(@Param('id') id: string) {
    return this.campaignsService.removeType(id);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'تفاصيل حملة تفتيشية محددة بجميع نتائجها وملاحظاتها',
  })
  async findOne(@Param('id') id: string) {
    return this.campaignsService.findOne(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post()
  @ApiOperation({ summary: 'إنشاء حملة تفتيشية جديدة' })
  async create(@Body() body: any, @Req() req: any) {
    return this.campaignsService.create(body, req.user?.userId);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put(':id')
  @ApiOperation({ summary: 'تعديل بيانات حملة تفتيشية' })
  async update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.campaignsService.update(id, body, req.user?.userId);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @ApiOperation({ summary: 'حذف حملة تفتيشية' })
  async remove(@Param('id') id: string) {
    return this.campaignsService.remove(id);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR')
  @Post(':id/notes')
  @ApiOperation({
    summary: 'إضافة ملاحظة ختامية للحملة (إيجابية، سلبية، عائق، معضلة)',
  })
  async addNote(@Param('id') id: string, @Body() body: any) {
    return this.campaignsService.addNote(id, body);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR')
  @Put('notes/:noteId')
  @ApiOperation({ summary: 'تعديل ملاحظة ختامية' })
  async updateNote(@Param('noteId') noteId: string, @Body() body: any) {
    return this.campaignsService.updateNote(noteId, body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Delete('notes/:noteId')
  @ApiOperation({ summary: 'حذف ملاحظة ختامية' })
  async deleteNote(@Param('noteId') noteId: string) {
    return this.campaignsService.deleteNote(noteId);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR')
  @Post(':id/recommendations')
  @ApiOperation({ summary: 'إضافة توصية للحملة وجهتها المستهدفة' })
  async addRecommendation(@Param('id') id: string, @Body() body: any) {
    return this.campaignsService.addRecommendation(id, body);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR')
  @Put('recommendations/:recId')
  @ApiOperation({ summary: 'تعديل توصية' })
  async updateRecommendation(@Param('recId') recId: string, @Body() body: any) {
    return this.campaignsService.updateRecommendation(recId, body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Delete('recommendations/:recId')
  @ApiOperation({ summary: 'حذف توصية' })
  async deleteRecommendation(@Param('recId') recId: string) {
    return this.campaignsService.deleteRecommendation(recId);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR')
  @Post(':id/appendices')
  @ApiOperation({ summary: 'إضافة ملحق للحملة' })
  async addAppendix(@Param('id') id: string, @Body() body: any) {
    return this.campaignsService.addAppendix(id, body);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR')
  @Put('appendices/:appId')
  @ApiOperation({ summary: 'تعديل ملحق' })
  async updateAppendix(@Param('appId') appId: string, @Body() body: any) {
    return this.campaignsService.updateAppendix(appId, body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Delete('appendices/:appId')
  @ApiOperation({ summary: 'حذف ملحق' })
  async deleteAppendix(@Param('appId') appId: string) {
    return this.campaignsService.deleteAppendix(appId);
  }

  // Role-aware member management
  @Roles('ADMIN', 'EDITOR')
  @Put(':id/members/:inspectorId/role')
  @ApiOperation({ summary: 'تعيين دور عضو في الحملة' })
  async setMemberRole(
    @Param('id') id: string,
    @Param('inspectorId') inspectorId: string,
    @Body() body: { role: string },
    @Req() req: any,
  ) {
    return this.campaignsService.setMemberRole(
      id,
      inspectorId,
      body.role,
      req.user?.userId,
    );
  }

  @Roles('ADMIN', 'EDITOR')
  @Delete(':id/members/:inspectorId')
  @ApiOperation({ summary: 'إزالة عضو من الحملة' })
  async removeMember(
    @Param('id') id: string,
    @Param('inspectorId') inspectorId: string,
  ) {
    return this.campaignsService.removeMember(id, inspectorId);
  }

  // Group assignment endpoints
  @Roles('ADMIN', 'EDITOR')
  @Get(':id/groups')
  @ApiOperation({ summary: 'عرض المجموعات المرتبطة بالحملة' })
  async getGroupAssignments(@Param('id') id: string) {
    return this.campaignsService.getGroupAssignments(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/groups')
  @ApiOperation({ summary: 'ربط مجموعة بالحملة' })
  async assignGroup(
    @Param('id') id: string,
    @Body() body: { groupId: number; role?: string },
    @Req() req: any,
  ) {
    return this.campaignsService.assignGroup(
      id,
      body.groupId,
      body.role,
      req.user?.userId,
    );
  }

  @Roles('ADMIN', 'EDITOR')
  @Delete(':id/groups/:groupId')
  @ApiOperation({ summary: 'إزالة مجموعة من الحملة' })
  async removeGroupAssignment(
    @Param('id') id: string,
    @Param('groupId') groupId: number,
  ) {
    return this.campaignsService.removeGroupAssignment(id, groupId);
  }
}
