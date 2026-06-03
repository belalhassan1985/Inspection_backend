import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RiskLevelOptionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeInactive = true) {
    return this.prisma.riskLevelOption.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [
        { sortOrder: 'asc' },
        { id: 'asc' },
      ],
    });
  }

  async findActive() {
    return this.findAll(false);
  }

  async create(data: any) {
    this.normalizePayload(data, true);
    const maxSort = await this.prisma.riskLevelOption.aggregate({
      _max: { sortOrder: true },
    });
    return this.prisma.riskLevelOption.create({
      data: {
        ...data,
        sortOrder: data.sortOrder ?? ((maxSort._max.sortOrder ?? 0) + 1),
      },
    });
  }

  async update(id: number, data: any) {
    await this.ensureExists(id);
    return this.prisma.riskLevelOption.update({
      where: { id },
      data: this.normalizePayload(data, false),
    });
  }

  async toggle(id: number, isActive: boolean) {
    await this.ensureExists(id);
    return this.prisma.riskLevelOption.update({
      where: { id },
      data: { isActive: !!isActive },
    });
  }

  async reorder(ids: number[]) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array is required');
    }
    return this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.riskLevelOption.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );
  }

  private async ensureExists(id: number) {
    const existing = await this.prisma.riskLevelOption.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Risk level option not found');
    }
    return existing;
  }

  private normalizePayload(data: any, isCreate: boolean) {
    const code = typeof data.code === 'string' ? data.code.trim() : undefined;
    const nameAr = typeof data.nameAr === 'string' ? data.nameAr.trim() : undefined;

    if (isCreate && !code) {
      throw new BadRequestException('Code is required');
    }
    if (isCreate && !nameAr) {
      throw new BadRequestException('Arabic name is required');
    }
    if (code && !/^[a-zA-Z0-9_-]+$/i.test(code)) {
      throw new BadRequestException('Code must contain letters, numbers, underscores, or dashes only');
    }

    const payload: any = {};
    if (code !== undefined) payload.code = code;
    if (nameAr !== undefined) payload.nameAr = nameAr;
    if (data.color !== undefined) payload.color = data.color ? String(data.color).trim() : '#718096';
    if (data.sortOrder !== undefined && data.sortOrder !== null) payload.sortOrder = Number(data.sortOrder) || 0;
    if (data.isActive !== undefined) payload.isActive = !!data.isActive;
    if (data.severityWeight !== undefined) payload.severityWeight = data.severityWeight != null ? Number(data.severityWeight) : null;
    return payload;
  }
}
