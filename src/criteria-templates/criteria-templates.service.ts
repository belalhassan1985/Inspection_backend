import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CriteriaTemplatesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.criteriaTemplate.findMany({
      where: { isActive: true },
      include: {
        _count: { select: { items: true, campaigns: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const template = await this.prisma.criteriaTemplate.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            primary: {
              include: {
                secondaryCriteria: {
                  orderBy: { sortOrder: 'asc' },
                  include: {
                    details: {
                      orderBy: { sortOrder: 'asc' },
                      include: { options: { include: { optionType: true } } },
                    },
                  },
                },
              },
            },
          },
        },
        _count: { select: { campaigns: true } },
      },
    });
    if (!template) {
      throw new NotFoundException('Criteria template not found');
    }
    return template;
  }

  async create(data: { name: string; description?: string }) {
    if (!data.name || data.name.trim().length === 0) {
      throw new BadRequestException('Template name is required');
    }
    return this.prisma.criteriaTemplate.create({
      data: {
        name: data.name.trim(),
        description: data.description || null,
      },
    });
  }

  async update(id: string, data: { name?: string; description?: string }) {
    await this.findOne(id);
    return this.prisma.criteriaTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
    });
  }

  async remove(id: string) {
    const template = await this.findOne(id);
    if (template.isDefault) {
      throw new BadRequestException('Cannot delete the default template');
    }
    return this.prisma.criteriaTemplate.delete({ where: { id } });
  }

  async addItem(templateId: string, primaryId: number, sortOrder?: number) {
    await this.findOne(templateId);

    const primary = await this.prisma.primaryCriteria.findUnique({ where: { id: primaryId } });
    if (!primary) {
      throw new NotFoundException(`Primary criteria with id ${primaryId} not found`);
    }

    const existing = await this.prisma.criteriaTemplateItem.findUnique({
      where: {
        templateId_primaryId: { templateId, primaryId },
      },
    });
    if (existing) {
      throw new BadRequestException('This primary criteria is already in the template');
    }

    const maxSortOrder = await this.prisma.criteriaTemplateItem.aggregate({
      where: { templateId },
      _max: { sortOrder: true },
    });

    return this.prisma.criteriaTemplateItem.create({
      data: {
        templateId,
        primaryId,
        sortOrder: sortOrder ?? (maxSortOrder._max.sortOrder ?? -1) + 1,
      },
      include: { primary: true },
    });
  }

  async removeItem(templateId: string, primaryId: number) {
    await this.findOne(templateId);
    try {
      await this.prisma.criteriaTemplateItem.delete({
        where: {
          templateId_primaryId: { templateId, primaryId },
        },
      });
    } catch {
      throw new NotFoundException('Item not found in template');
    }
  }

  async setDefault(id: string) {
    await this.findOne(id);
    await this.prisma.criteriaTemplate.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
    return this.prisma.criteriaTemplate.update({
      where: { id },
      data: { isDefault: true },
    });
  }

  async createFromAllCriteria(name?: string, description?: string) {
    const allPrimaries = await this.prisma.primaryCriteria.findMany({
      orderBy: { sortOrder: 'asc' },
    });
    if (allPrimaries.length === 0) {
      throw new BadRequestException('No primary criteria found to create template from');
    }

    return this.prisma.criteriaTemplate.create({
      data: {
        name: name || `قالب شامل (${new Date().toLocaleDateString('ar-IQ')})`,
        description: description || 'تم إنشاؤه تلقائياً من جميع الأسس الحالية',
        items: {
          create: allPrimaries.map((p, i) => ({
            primaryId: p.id,
            sortOrder: i,
          })),
        },
      },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { primary: true },
        },
      },
    });
  }
}
