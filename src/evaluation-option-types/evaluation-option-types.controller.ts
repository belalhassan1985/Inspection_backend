import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { EvaluationOptionTypesService } from './evaluation-option-types.service';

@ApiTags('Evaluation Option Types')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('evaluation-option-types')
export class EvaluationOptionTypesController {
  constructor(private service: EvaluationOptionTypesService) {}

  @Get()
  async findAll(@Query('activeOnly') activeOnly?: string) {
    return this.service.findAll(activeOnly !== 'true');
  }

  @Get('active')
  async findActive() {
    return this.service.findActive();
  }

  @Roles('ADMIN')
  @Post()
  async create(@Body() body: any) {
    return this.service.create(body);
  }

  @Roles('ADMIN')
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.service.update(Number(id), body);
  }

  @Roles('ADMIN')
  @Patch(':id/toggle')
  async toggle(@Param('id') id: string, @Body() body: any) {
    return this.service.toggle(Number(id), body.isActive);
  }

  @Roles('ADMIN')
  @Post('reorder')
  async reorder(@Body() body: { ids: number[] }) {
    return this.service.reorder(body.ids);
  }
}
