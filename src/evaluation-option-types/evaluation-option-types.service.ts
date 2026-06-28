import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EvaluationOptionTypesService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeInactive = true) {
    return this.prisma.evaluationOptionType.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async findActive() {
    return this.findAll(false);
  }

  async create(data: any) {
    const payload = this.normalizePayload(data, true);
    const maxSort = await this.prisma.evaluationOptionType.aggregate({
      _max: { sortOrder: true },
    });
    return this.prisma.evaluationOptionType.create({
      data: {
        ...payload,
        sortOrder: payload.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
  }

  async update(id: number, data: any) {
    await this.ensureExists(id);
    return this.prisma.evaluationOptionType.update({
      where: { id },
      data: this.normalizePayload(data, false),
    });
  }

  async toggle(id: number, isActive: boolean) {
    await this.ensureExists(id);
    return this.prisma.evaluationOptionType.update({
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
        this.prisma.evaluationOptionType.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );
  }

  private async ensureExists(id: number) {
    const existing = await this.prisma.evaluationOptionType.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Evaluation option type not found');
    }
    return existing;
  }

  private normalizePayload(data: any, isCreate: boolean) {
    const code = typeof data.code === 'string' ? data.code.trim() : undefined;
    const nameAr =
      typeof data.nameAr === 'string' ? data.nameAr.trim() : undefined;
    const scoreMultiplier =
      data.scoreMultiplier !== undefined && data.scoreMultiplier !== null
        ? Number(data.scoreMultiplier)
        : undefined;

    if (isCreate && !code) {
      throw new BadRequestException('Code is required');
    }
    if (isCreate && !nameAr) {
      throw new BadRequestException('Arabic name is required');
    }
    if (code && !/^[a-z0-9_-]+$/i.test(code)) {
      throw new BadRequestException(
        'Code must contain letters, numbers, underscores, or dashes only',
      );
    }
    if (
      scoreMultiplier !== undefined &&
      (Number.isNaN(scoreMultiplier) || scoreMultiplier < 0)
    ) {
      throw new BadRequestException(
        'Score multiplier must be a non-negative number',
      );
    }

    const payload: any = {};
    if (code !== undefined) payload.code = code;
    if (nameAr !== undefined) payload.nameAr = nameAr;
    if (data.nameEn !== undefined)
      payload.nameEn = data.nameEn ? String(data.nameEn).trim() : null;
    if (data.color !== undefined)
      payload.color = data.color ? String(data.color).trim() : null;
    if (data.icon !== undefined)
      payload.icon = data.icon ? String(data.icon).trim() : null;
    if (data.sortOrder !== undefined && data.sortOrder !== null)
      payload.sortOrder = Number(data.sortOrder) || 0;
    if (data.affectsScore !== undefined)
      payload.affectsScore = !!data.affectsScore;
    if (scoreMultiplier !== undefined)
      payload.scoreMultiplier = scoreMultiplier;
    if (data.isActive !== undefined) payload.isActive = !!data.isActive;
    return payload;
  }
}
