import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Req,
  Body,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { Roles } from '../auth/roles.decorator';

@ApiTags('الإشعارات')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'جلب إشعارات المستخدم الحالي مع التصفية' })
  async getMyNotifications(
    @Req() req: any,
    @Query('type') type?: string,
    @Query('severity') severity?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.notificationService.getMyNotifications(req.user.userId, {
      type,
      severity,
      unreadOnly: unreadOnly === 'true',
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'عدد الإشعارات غير المقروءة للمستخدم الحالي' })
  async getUnreadCount(@Req() req: any) {
    return this.notificationService.getUnreadCount(req.user.userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'تحديد إشعار كمقروء' })
  async markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.notificationService.markAsRead(id, req.user.userId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'تحديد جميع الإشعارات كمقروءة' })
  async markAllAsRead(@Req() req: any) {
    return this.notificationService.markAllAsRead(req.user.userId);
  }
}
