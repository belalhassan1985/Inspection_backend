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
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'قائمة المفتشين مع دعم البحث والترقيم والفلترة' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'رقم الصفحة (يبدأ من 1)',
  })
  @ApiQuery({
    name: 'pageItemsCount',
    required: false,
    type: Number,
    description: 'عدد العناصر في الصفحة (10, 25, 50, 100)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'بحث في الاسم/الرتبة/الهاتف/اسم المجموعة',
  })
  @ApiQuery({
    name: 'availabilityStatus',
    required: false,
    type: String,
    description: 'فلترة حسب حالة التوفر (AVAILABLE, ON_LEAVE, MEDICAL, ...)',
  })
  @ApiQuery({
    name: 'inspectionGroup',
    required: false,
    type: Number,
    description: 'فلترة حسب معرف المجموعة التفتيشية',
  })
  @ApiQuery({
    name: 'specialization',
    required: false,
    type: Number,
    description: 'فلترة حسب معرف التخصص',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    description: 'فلترة حسب حالة النشاط',
  })
  async findAll(
    @Query('page') page?: string,
    @Query('pageItemsCount') pageItemsCount?: string,
    @Query('search') search?: string,
    @Query('availabilityStatus') availabilityStatus?: string,
    @Query('inspectionGroup') inspectionGroup?: string,
    @Query('specialization') specialization?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.inspectorsService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      pageItemsCount: pageItemsCount ? parseInt(pageItemsCount, 10) : undefined,
      search,
      availabilityStatus,
      inspectionGroup: inspectionGroup
        ? parseInt(inspectionGroup, 10)
        : undefined,
      specialization: specialization ? parseInt(specialization, 10) : undefined,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
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

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get(':id/availability')
  @ApiOperation({ summary: 'حالة التوفر للمفتش' })
  async getAvailability(@Param('id') id: string) {
    return this.inspectorsService.getAvailability(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put(':id/availability')
  @ApiOperation({ summary: 'تحديث حالة التوفر للمفتش' })
  async updateAvailability(
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    return this.inspectorsService.updateAvailability(id, body, req.user.userId);
  }
}
