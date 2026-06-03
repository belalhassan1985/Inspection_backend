import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  async log(
    userId: string,
    username: string,
    actionType: string,
    ipAddress?: string,
    userAgent?: string,
    details?: any,
  ) {
    try {
      await this.prisma.systemAuditLog.create({
        data: {
          userId,
          username,
          actionType,
          ipAddress: ipAddress || '127.0.0.1',
          userAgent: userAgent || 'Unknown',
          details: details ? JSON.parse(JSON.stringify(details)) : undefined,
        },
      });
    } catch (e) {
      console.error('Failed to write audit log:', e);
    }
  }

  async findAll() {
    const logs = await this.prisma.systemAuditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 200,
    });
    return logs.map((log) => ({
      ...log,
      id: log.id.toString(),
    }));
  }
}
