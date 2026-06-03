import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EntitiesService } from './entities.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Administrative Structure & Entities')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('entities')
export class EntitiesController {
  constructor(private entitiesService: EntitiesService) {}

  @Get()
  @ApiOperation({ summary: 'استعراض الهيكل الإداري بالكامل' })
  async findAll() {
    return this.entitiesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل كيان إداري محدد بجميع مناصبه' })
  async findOne(@Param('id') id: string) {
    return this.entitiesService.findOne(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post()
  @ApiOperation({ summary: 'إنشاء كيان إداري جديد' })
  async create(@Body() body: any) {
    return this.entitiesService.create(body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put(':id')
  @ApiOperation({ summary: 'تعديل بيانات كيان إداري' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.entitiesService.update(id, body);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @ApiOperation({ summary: 'حذف كيان إداري بالكامل' })
  async remove(@Param('id') id: string) {
    return this.entitiesService.remove(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/positions')
  @ApiOperation({ summary: 'إضافة منصب لكيان محدد' })
  async addPosition(@Param('id') id: string, @Body() body: any) {
    return this.entitiesService.addPosition(id, body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put('positions/:posId')
  @ApiOperation({ summary: 'تعديل منصب' })
  async updatePosition(@Param('posId') posId: string, @Body() body: any) {
    return this.entitiesService.updatePosition(posId, body);
  }

  @Roles('ADMIN')
  @Delete('positions/:posId')
  @ApiOperation({ summary: 'حذف منصب' })
  async deletePosition(@Param('posId') posId: string) {
    return this.entitiesService.deletePosition(posId);
  }
}
