import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InspectorsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.inspector.findMany({
      orderBy: { fullName: 'asc' },
    });
  }

  async findOne(id: string) {
    const inspector = await this.prisma.inspector.findUnique({
      where: { id },
    });
    if (!inspector) {
      throw new NotFoundException('المفتش غير موجود');
    }
    return inspector;
  }

  async create(data: any) {
    return this.prisma.inspector.create({
      data: {
        fullName: data.fullName,
        department: data.department || null,
        phone: data.phone || null,
        notes: data.notes || null,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
    });
  }

  async update(id: string, data: any) {
    const inspector = await this.findOne(id);
    return this.prisma.inspector.update({
      where: { id },
      data: {
        fullName: data.fullName !== undefined ? data.fullName : inspector.fullName,
        department: data.department !== undefined ? data.department : inspector.department,
        phone: data.phone !== undefined ? data.phone : inspector.phone,
        notes: data.notes !== undefined ? data.notes : inspector.notes,
        isActive: data.isActive !== undefined ? data.isActive : inspector.isActive,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.inspector.delete({
      where: { id },
    });
  }
}
