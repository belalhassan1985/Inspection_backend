import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InspectionGroupsService } from './inspection-groups.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Inspection Groups')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('inspection-groups')
export class InspectionGroupsController {
  constructor(private service: InspectionGroupsService) {}

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get('readiness')
  @ApiOperation({ summary: 'مؤشر الجاهزية لجميع الفرق النشطة' })
  async getAllReadiness() {
    return this.service.getAllReadiness();
  }

  @Roles('ADMIN')
  @Post('readiness/snapshot')
  @ApiOperation({ summary: 'أخذ لقطة جاهزية للفرق' })
  async takeReadinessSnapshot() {
    return this.service.takeReadinessSnapshot();
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get(':id/readiness')
  @ApiOperation({ summary: 'تفاصيل جاهزية فرقة مع تحليل الأعضاء' })
  async getGroupReadiness(@Param('id', ParseIntPipe) id: number) {
    return this.service.getGroupReadiness(id);
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get()
  @ApiOperation({ summary: 'عرض قائمة الفرق' })
  async findAll() {
    return this.service.findAll();
  }

  @Roles('ADMIN', 'EDITOR', 'EVALUATOR', 'VIEWER', 'REPORT_VIEWER')
  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل فرقة مع أعضائها' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post()
  @ApiOperation({ summary: 'إضافة فرقة جديدة' })
  async create(@Body() body: any) {
    return this.service.create(body);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put(':id')
  @ApiOperation({ summary: 'تعديل بيانات فرقة' })
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @ApiOperation({ summary: 'حذف فرقة' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Roles('ADMIN', 'EDITOR')
  @Post(':id/members')
  @ApiOperation({ summary: 'إضافة عضو للفرقة' })
  async addMember(
    @Param('id', ParseIntPipe) groupId: number,
    @Body()
    body: {
      inspectorId: string;
      roleInGroup?: string;
      isLeader?: boolean;
      memberOrder?: number;
    },
  ) {
    return this.service.addMember(
      groupId,
      body.inspectorId,
      body.roleInGroup,
      body.isLeader,
      body.memberOrder,
    );
  }

  @Roles('ADMIN', 'EDITOR')
  @Delete(':id/members/:memberId')
  @ApiOperation({ summary: 'حذف عضو من الفرقة' })
  async removeMember(
    @Param('id', ParseIntPipe) groupId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.service.removeMember(groupId, memberId);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put(':id/primary/:inspectorId')
  @ApiOperation({ summary: 'تعيين فرقة رئيسية لمفتش' })
  async setPrimaryGroup(
    @Param('id', ParseIntPipe) groupId: number,
    @Param('inspectorId') inspectorId: string,
  ) {
    return this.service.setPrimaryGroup(inspectorId, groupId);
  }

  @Roles('ADMIN', 'EDITOR')
  @Delete(':inspectorId/primary')
  @ApiOperation({ summary: 'إلغاء الفرقة الرئيسية لمفتش' })
  async removePrimaryGroup(@Param('inspectorId') inspectorId: string) {
    return this.service.setPrimaryGroup(inspectorId, null);
  }

  @Roles('ADMIN', 'EDITOR')
  @Put('members/:memberId/toggle-leader')
  @ApiOperation({ summary: 'تبديل حالة قائد الزمرة' })
  async toggleLeader(@Param('memberId', ParseIntPipe) memberId: number) {
    return this.service.toggleLeader(memberId);
  }
}
