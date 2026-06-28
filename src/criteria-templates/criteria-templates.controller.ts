import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CriteriaTemplatesService } from './criteria-templates.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Criteria Templates')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('criteria-templates')
export class CriteriaTemplatesController {
  constructor(private criteriaTemplatesService: CriteriaTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'عرض جميع قوالب أسس التفتيش' })
  async findAll() {
    return this.criteriaTemplatesService.findAll();
  }

  @Roles('ADMIN', 'EDITOR')
  @Post()
  @ApiOperation({ summary: 'إنشاء قالب أسس جديد' })
  async create(@Body() body: { name: string; description?: string }) {
    return this.criteriaTemplatesService.create(body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post('create-from-current')
  @ApiOperation({ summary: 'إنشاء قالب من جميع الأسس الحالية' })
  async createFromCurrent(
    @Body() body: { name?: string; description?: string },
  ) {
    return this.criteriaTemplatesService.createFromAllCriteria(
      body?.name,
      body?.description,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل قالب أسس معين' })
  async findOne(@Param('id') id: string) {
    return this.criteriaTemplatesService.findOne(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put(':id')
  @ApiOperation({ summary: 'تعديل قالب أسس' })
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
  ) {
    return this.criteriaTemplatesService.update(id, body);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @ApiOperation({ summary: 'حذف قالب أسس' })
  async remove(@Param('id') id: string) {
    return this.criteriaTemplatesService.remove(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/items')
  @ApiOperation({ summary: 'إضافة محور رئيسي إلى القالب' })
  async addItem(
    @Param('id') id: string,
    @Body() body: { primaryId: number; sortOrder?: number },
  ) {
    return this.criteriaTemplatesService.addItem(
      id,
      body.primaryId,
      body.sortOrder,
    );
  }

  @Roles('ADMIN', 'EDITOR')
  @Delete(':id/items/:primaryId')
  @ApiOperation({ summary: 'إزالة محور رئيسي من القالب' })
  async removeItem(
    @Param('id') id: string,
    @Param('primaryId', ParseIntPipe) primaryId: number,
  ) {
    return this.criteriaTemplatesService.removeItem(id, primaryId);
  }

  @Roles('ADMIN')
  @Post(':id/set-default')
  @ApiOperation({ summary: 'تعيين قالب كافتراضي' })
  async setDefault(@Param('id') id: string) {
    return this.criteriaTemplatesService.setDefault(id);
  }
}
