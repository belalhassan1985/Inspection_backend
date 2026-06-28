import { Controller, Post, Body, Req, Get, UseGuards, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'تسجيل الدخول للنظام والحصول على رمز JWT' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        username: { type: 'string', example: 'ahmed' },
        password: { type: 'string', example: '1234' },
      },
      required: ['username', 'password'],
    },
  })
  async login(@Body() body: any, @Req() req: any) {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.authService.login(body, ip, userAgent);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @Post('seed')
  @ApiOperation({ summary: 'تهيئة وتغذية قاعدة البيانات بالبيانات الافتراضية' })
  async seed() {
    if (process.env.NODE_ENV === 'production') {
      throw new NotFoundException('Seed endpoint is disabled in production');
    }
    return this.authService.seed();
  }

  @ApiBearerAuth()
  @Get('profile')
  @ApiOperation({ summary: 'الحصول على بيانات الجلسة الحالية للمستخدم' })
  async getProfile(@Req() req: any) {
    return req.user;
  }
}
