import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InspectorSpecializationsService {
  constructor(private prisma: PrismaService) {}

  // --- Categories ---

  async getCategories() {
    return this.prisma.specializationCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        specializations: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async createCategory(data: {
    name: string;
    description?: string;
    sortOrder?: number;
  }) {
    return this.prisma.specializationCategory.create({ data });
  }

  async updateCategory(
    id: number,
    data: {
      name?: string;
      description?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const cat = await this.prisma.specializationCategory.findUnique({
      where: { id },
    });
    if (!cat) throw new NotFoundException('التصنيف غير موجود');
    return this.prisma.specializationCategory.update({ where: { id }, data });
  }

  async deleteCategory(id: number) {
    const cat = await this.prisma.specializationCategory.findUnique({
      where: { id },
    });
    if (!cat) throw new NotFoundException('التصنيف غير موجود');
    const count = await this.prisma.specialization.count({
      where: { categoryId: id },
    });
    if (count > 0)
      throw new BadRequestException('لا يمكن حذف تصنيف يحتوي على تخصصات');
    return this.prisma.specializationCategory.delete({ where: { id } });
  }

  // --- Specializations ---

  async getSpecializations(categoryId?: number) {
    const where = categoryId ? { categoryId } : {};
    return this.prisma.specialization.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      include: { category: true },
    });
  }

  async createSpecialization(data: {
    categoryId: number;
    name: string;
    description?: string;
    sortOrder?: number;
  }) {
    const cat = await this.prisma.specializationCategory.findUnique({
      where: { id: data.categoryId },
    });
    if (!cat) throw new NotFoundException('التصنيف غير موجود');
    return this.prisma.specialization.create({
      data,
      include: { category: true },
    });
  }

  async updateSpecialization(
    id: number,
    data: {
      name?: string;
      description?: string;
      sortOrder?: number;
      isActive?: boolean;
    },
  ) {
    const spec = await this.prisma.specialization.findUnique({ where: { id } });
    if (!spec) throw new NotFoundException('التخصص غير موجود');
    return this.prisma.specialization.update({
      where: { id },
      data,
      include: { category: true },
    });
  }

  async deleteSpecialization(id: number) {
    const spec = await this.prisma.specialization.findUnique({ where: { id } });
    if (!spec) throw new NotFoundException('التخصص غير موجود');
    const count = await this.prisma.inspectorSpecialization.count({
      where: { specializationId: id },
    });
    if (count > 0)
      throw new BadRequestException('لا يمكن حذف تخصص مرتبط بمفتشين');
    return this.prisma.specialization.delete({ where: { id } });
  }

  // --- Inspector Specializations ---

  async getInspectorSpecializations(inspectorId: string) {
    const insp = await this.prisma.inspector.findUnique({
      where: { id: inspectorId },
    });
    if (!insp) throw new NotFoundException('المفتش غير موجود');
    return this.prisma.inspectorSpecialization.findMany({
      where: { inspectorId },
      include: {
        specialization: { include: { category: true } },
        assignedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { proficiencyLevel: 'desc' }],
    });
  }

  async assignSpecialization(
    inspectorId: string,
    data: {
      specializationId: number;
      proficiencyLevel?: 'BASIC' | 'PRACTITIONER' | 'ADVANCED' | 'EXPERT';
      isPrimary?: boolean;
      notes?: string;
      assignedById?: string;
    },
  ) {
    const insp = await this.prisma.inspector.findUnique({
      where: { id: inspectorId },
    });
    if (!insp) throw new NotFoundException('المفتش غير موجود');

    const spec = await this.prisma.specialization.findUnique({
      where: { id: data.specializationId },
    });
    if (!spec) throw new NotFoundException('التخصص غير موجود');

    const existing = await this.prisma.inspectorSpecialization.findUnique({
      where: {
        inspectorId_specializationId: {
          inspectorId,
          specializationId: data.specializationId,
        },
      },
    });
    if (existing) throw new ConflictException('التخصص مضاف بالفعل لهذا المفتش');

    if (data.isPrimary) {
      await this.prisma.inspectorSpecialization.updateMany({
        where: { inspectorId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.inspectorSpecialization.create({
      data: {
        inspectorId,
        specializationId: data.specializationId,
        proficiencyLevel: data.proficiencyLevel || 'BASIC',
        isPrimary: data.isPrimary || false,
        notes: data.notes,
        assignedById: data.assignedById,
      },
      include: {
        specialization: { include: { category: true } },
        assignedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async updateInspectorSpecialization(
    id: number,
    data: {
      proficiencyLevel?: 'BASIC' | 'PRACTITIONER' | 'ADVANCED' | 'EXPERT';
      isPrimary?: boolean;
      notes?: string;
    },
  ) {
    const item = await this.prisma.inspectorSpecialization.findUnique({
      where: { id },
      include: { specialization: true },
    });
    if (!item) throw new NotFoundException('التخصص غير موجود');

    if (data.isPrimary) {
      await this.prisma.inspectorSpecialization.updateMany({
        where: { inspectorId: item.inspectorId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    return this.prisma.inspectorSpecialization.update({
      where: { id },
      data,
      include: {
        specialization: { include: { category: true } },
        assignedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async removeInspectorSpecialization(id: number) {
    const item = await this.prisma.inspectorSpecialization.findUnique({
      where: { id },
    });
    if (!item) throw new NotFoundException('التخصص غير موجود');
    return this.prisma.inspectorSpecialization.delete({ where: { id } });
  }

  // --- Seed Data ---
  async seedDefaults() {
    const existing = await this.prisma.specializationCategory.count();
    if (existing > 0)
      return { message: 'التصنيفات موجودة مسبقاً', count: existing };

    const categories = [
      { name: 'التفتيش المالي', sortOrder: 1 },
      { name: 'التفتيش الإداري', sortOrder: 2 },
      { name: 'التفتيش الفني', sortOrder: 3 },
      { name: 'التفتيش الجنائي', sortOrder: 4 },
      { name: 'التفتيش الهندسي', sortOrder: 5 },
      { name: 'تكنولوجيا المعلومات', sortOrder: 6 },
    ];

    const specsByCategory: Record<string, string[]> = {
      'التفتيش المالي': ['تدقيق مالي', 'تدقيق ضرائب', 'تدقيق جمركي'],
      'التفتيش الإداري': ['تدقيق إداري', 'تدقيق موارد بشرية', 'تدقيق إجراءات'],
      'التفتيش الفني': ['تفتيش فني عام', 'تفتيش السلامة', 'تفتيش جودة'],
      'التفتيش الجنائي': ['تحقيق جنائي', 'تدقيق أدلة', 'تفتيش أمني'],
      'التفتيش الهندسي': ['تفتيش إنشائي', 'تفتيش معماري', 'تفتيش طرق وجسور'],
      'تكنولوجيا المعلومات': ['تدقيق نظم', 'أمن سيبراني', 'تدقيق تقني'],
    };

    for (const cat of categories) {
      const created = await this.prisma.specializationCategory.create({
        data: cat,
      });
      const specs = specsByCategory[cat.name] || [];
      for (let i = 0; i < specs.length; i++) {
        await this.prisma.specialization.create({
          data: { categoryId: created.id, name: specs[i], sortOrder: i + 1 },
        });
      }
    }

    const totalCats = await this.prisma.specializationCategory.count();
    const totalSpecs = await this.prisma.specialization.count();
    return {
      message: 'تم إنشاء التصنيفات والتخصصات الافتراضية',
      categories: totalCats,
      specializations: totalSpecs,
    };
  }
}
