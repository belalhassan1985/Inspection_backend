import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InspectorWorkloadService } from './inspector-workload.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Inspector Workload')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('inspector-workload')
export class InspectorWorkloadController {
  constructor(private service: InspectorWorkloadService) {}

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get('summary')
  @ApiOperation({ summary: 'إحصائيات ملخص أعباء عمل المفتشين' })
  async getSummary() {
    return this.service.getSummary();
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get('list')
  @ApiOperation({ summary: 'قائمة المفتشين مع أعباء العمل' })
  async getList(@Query('department') department?: string) {
    return this.service.getList(department);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get('list/:id')
  @ApiOperation({ summary: 'تفاصيل عبء عمل مفتش معين' })
  async getInspectorDetail(@Param('id') id: string) {
    return this.service.getInspectorDetail(id);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get('duties')
  @ApiOperation({ summary: 'الواجبات الحالية لجميع المفتشين' })
  async getDutiesList(@Query('department') department?: string) {
    return this.service.getDutiesList(department);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get('duties/:id')
  @ApiOperation({ summary: 'واجبات مفتش معين' })
  async getInspectorDuties(@Param('id') id: string) {
    return this.service.getInspectorDuties(id);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get('excellence')
  @ApiOperation({ summary: 'لوحة التميز والنشاط' })
  async getExcellence() {
    return this.service.getExcellence();
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get('balance')
  @ApiOperation({ summary: 'توازن أعباء العمل' })
  async getBalance() {
    return this.service.getBalance();
  }

  @Roles('ADMIN')
  @Post('snapshot')
  @ApiOperation({ summary: 'أخذ لقطة لحظةية لأعباء العمل' })
  async takeSnapshot() {
    return this.service.takeSnapshot();
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get('history/:id')
  @ApiOperation({ summary: 'تاريخ أعباء عمل مفتش معين' })
  async getHistory(@Param('id') id: string, @Query('days') days?: string) {
    return this.service.getHistory(id, days ? parseInt(days, 10) : 30);
  }
}
