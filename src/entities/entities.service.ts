import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EntitiesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.entity.findMany({
      include: {
        positions: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const entity = await this.prisma.entity.findUnique({
      where: { id },
      include: {
        positions: true,
        children: true,
      },
    });
    if (!entity) {
      throw new NotFoundException('Entity not found');
    }
    return entity;
  }

  async create(data: any) {
    return this.prisma.entity.create({
      data: {
        name: data.name,
        parentId: data.parentId || null,
        level: data.level,
        isAssistant: data.isAssistant || false,
      },
    });
  }

  async update(id: string, data: any) {
    return this.prisma.entity.update({
      where: { id },
      data: {
        name: data.name,
        parentId: data.parentId || null,
        level: data.level,
        isAssistant: data.isAssistant !== undefined ? data.isAssistant : false,
      },
    });
  }

  async remove(id: string) {
    return this.prisma.entity.delete({
      where: { id },
    });
  }

  private normalizeArabic(str: string): string {
    if (!str) return '';
    return str
      .trim()
      .replace(/[أإآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/\s+/g, ' ');
  }

  private async validatePositionUniqueness(
    campaignId: string,
    statisticalNumber: string,
    positionHolder: string,
    rank: string,
    excludePositionId?: string,
  ) {
    if (!campaignId || !statisticalNumber) return;

    const statNum = statisticalNumber.trim();
    if (!statNum || statNum === 'غير محدد' || statNum === 'غير حدد') return;

    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        inspections: {
          select: { entityId: true },
        },
      },
    });

    if (!campaign) return;

    const entityIds = new Set<string>();
    if (campaign.entityId) {
      entityIds.add(campaign.entityId);
    }
    campaign.inspections.forEach((ins) => {
      entityIds.add(ins.entityId);
    });

    if (entityIds.size === 0) return;

    const conflicts = await this.prisma.entityPosition.findMany({
      where: {
        entityId: { in: Array.from(entityIds) },
        statisticalNumber: statNum,
        isActive: true,
        NOT: excludePositionId ? { id: excludePositionId } : undefined,
      },
    });

    if (conflicts.length > 0) {
      const inputNameNorm = this.normalizeArabic(positionHolder || '');

      for (const conflict of conflicts) {
        const conflictNameNorm = this.normalizeArabic(
          conflict.positionHolder || '',
        );

        if (inputNameNorm !== conflictNameNorm) {
          throw new BadRequestException(
            'الرقم الإحصائي مستخدم مسبقاً داخل هذه اللجنة التفتيشية لشخص آخر، يرجى التحقق من البيانات.',
          );
        }
      }
    }
  }

  async addPosition(entityId: string, positionData: any) {
    if (positionData.campaignId) {
      await this.validatePositionUniqueness(
        positionData.campaignId,
        positionData.statisticalNumber,
        positionData.positionHolder,
        positionData.rank,
      );
    }

    return this.prisma.entityPosition.create({
      data: {
        entityId,
        positionName: positionData.positionName,
        positionStatus: positionData.positionStatus,
        statisticalNumber: positionData.statisticalNumber,
        positionHolder: positionData.positionHolder,
        joinedDate: positionData.joinedDate
          ? new Date(positionData.joinedDate)
          : null,
        isActive:
          positionData.isActive !== undefined ? positionData.isActive : true,
        rank: positionData.rank || null,
        education: positionData.education || null,
        notes: positionData.notes || null,
        yearsOfService: positionData.yearsOfService
          ? parseInt(positionData.yearsOfService, 10)
          : null,
        evaluation: positionData.evaluation || null,
        cadreStatus: positionData.cadreStatus || null,
      },
    });
  }

  async updatePosition(posId: string, positionData: any) {
    if (positionData.campaignId) {
      await this.validatePositionUniqueness(
        positionData.campaignId,
        positionData.statisticalNumber,
        positionData.positionHolder,
        positionData.rank,
        posId,
      );
    }

    return this.prisma.entityPosition.update({
      where: { id: posId },
      data: {
        positionName: positionData.positionName,
        positionStatus: positionData.positionStatus,
        statisticalNumber: positionData.statisticalNumber,
        positionHolder: positionData.positionHolder,
        joinedDate: positionData.joinedDate
          ? new Date(positionData.joinedDate)
          : null,
        isActive:
          positionData.isActive !== undefined ? positionData.isActive : true,
        rank: positionData.rank || null,
        education: positionData.education || null,
        notes: positionData.notes || null,
        yearsOfService: positionData.yearsOfService
          ? parseInt(positionData.yearsOfService, 10)
          : null,
        evaluation: positionData.evaluation || null,
        cadreStatus: positionData.cadreStatus || null,
      },
    });
  }

  async deletePosition(posId: string) {
    return this.prisma.entityPosition.delete({
      where: { id: posId },
    });
  }
}
