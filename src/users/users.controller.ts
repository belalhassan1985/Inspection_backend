import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@ApiTags('Users Management')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Roles('ADMIN')
  @Get()
  @ApiOperation({ summary: 'عرض قائمة كافة المستخدمين' })
  async findAll() {
    return this.usersService.findAll();
  }

  @Roles('ADMIN')
  @Get('roles')
  @ApiOperation({ summary: 'عرض كافة الأدوار المتاحة للنظام' })
  async findRoles() {
    return this.usersService.findRoles();
  }

  @Roles('ADMIN')
  @Post()
  @ApiOperation({ summary: 'إنشاء حساب مستخدم جديد وتعيين دوره' })
  async create(@Body() body: any) {
    return this.usersService.create(body);
  }

  @Put('profile')
  @ApiOperation({ summary: 'تعديل بيانات الملف الشخصي للمستخدم الحالي' })
  async updateProfile(@Req() req: any, @Body() body: any) {
    const userId = req.user.userId;
    return this.usersService.update(userId, {
      fullName: body.fullName,
      department: body.department,
      password: body.password,
    });
  }

  @Roles('ADMIN')
  @Put(':id')
  @ApiOperation({ summary: 'تعديل بيانات مستخدم' })
  async update(@Param('id') id: string, @Body() body: any) {
    return this.usersService.update(id, body);
  }

  @Roles('ADMIN')
  @Delete(':id')
  @ApiOperation({ summary: 'حذف حساب مستخدم' })
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
