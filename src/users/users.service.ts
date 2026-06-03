import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      include: { role: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async findRoles() {
    return this.prisma.role.findMany({
      orderBy: { id: 'asc' },
    });
  }

  async create(data: any) {
    const existing = await this.prisma.user.findUnique({ where: { username: data.username } });
    if (existing) {
      throw new BadRequestException('اسم المستخدم مسجل مسبقاً في النظام');
    }

    const passwordHash = await bcrypt.hash(data.password || '1234', 10);
    return this.prisma.user.create({
      data: {
        fullName: data.fullName,
        username: data.username,
        passwordHash,
        roleId: data.roleId,
        department: data.department,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
      include: { role: true },
    });
  }

  async update(id: string, data: any) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }

    let passwordHash = user.passwordHash;
    if (data.password) {
      passwordHash = await bcrypt.hash(data.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        fullName: data.fullName !== undefined ? data.fullName : user.fullName,
        username: data.username !== undefined ? data.username : user.username,
        passwordHash,
        roleId: data.roleId !== undefined ? data.roleId : user.roleId,
        department: data.department !== undefined ? data.department : user.department,
        isActive: data.isActive !== undefined ? data.isActive : user.isActive,
      },
      include: { role: true },
    });
  }

  async remove(id: string) {
    return this.prisma.user.delete({
      where: { id },
    });
  }
}
