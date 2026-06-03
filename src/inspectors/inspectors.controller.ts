import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InspectorsService } from './inspectors.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Inspectors Management')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('inspectors')
export class InspectorsController {
  constructor(private inspectorsService: InspectorsService) {}

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get()
  @ApiOperation({ summary: 'عرض قائمة كافة المفتشين' })
  async findAll() {
    return this.inspectorsService.findAll();
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل مفتش معين' })
  async findOne(@Param('id') id: string) {
    return this.inspectorsService.findOne(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post()
  @ApiOperation({ summary: 'إضافة مفتش جديد' })
  async create(@Body() body: any) {
    return this.inspectorsService.create(body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put(':id')
  @ApiOperation({ summary: 'تعديل بيانات مفتش' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.inspectorsService.update(id, body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Delete(':id')
  @ApiOperation({ summary: 'حذف مفتش' })
  async remove(@Param('id') id: string) {
    return this.inspectorsService.remove(id);
  }
}
