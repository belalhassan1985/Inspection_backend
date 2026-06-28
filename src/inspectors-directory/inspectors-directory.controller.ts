import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { InspectorsDirectoryService } from './inspectors-directory.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Inspectors Directory')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('inspectors-directory')
export class InspectorsDirectoryController {
  constructor(private service: InspectorsDirectoryService) {}

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get()
  @ApiOperation({ summary: 'دليل المفتشين مع الأعباء والنشاط والفرق' })
  @ApiQuery({ name: 'specializationId', required: false, type: Number })
  async getDirectory(@Query('specializationId') specializationId?: string) {
    return this.service.getDirectory(
      specializationId ? +specializationId : undefined,
    );
  }
}
