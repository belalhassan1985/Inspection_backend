import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InspectorsService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    page?: number;
    pageItemsCount?: number;
    search?: string;
    availabilityStatus?: string;
    inspectionGroup?: number;
    specialization?: number;
    isActive?: boolean;
  }) {
    const {
      page,
      pageItemsCount,
      search,
      availabilityStatus,
      inspectionGroup,
      specialization,
      isActive,
    } = params;
    const isPaginated = page !== undefined || pageItemsCount !== undefined;
    const take = pageItemsCount || 25;
    const skip = page ? (page - 1) * take : 0;

    const where: any = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (availabilityStatus) {
      where.availabilityStatus = availabilityStatus;
    }

    if (specialization) {
      where.inspectorSpecializations = {
        some: { specializationId: specialization },
      };
    }

    if (inspectionGroup) {
      where.groupMemberships = {
        some: { groupId: inspectionGroup },
      };
    }

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { rank: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        {
          groupMemberships: {
            some: {
              group: { name: { contains: search, mode: 'insensitive' } },
            },
          },
        },
      ];
    }

    const include = {
      primaryGroup: { select: { id: true, name: true, code: true } },
      groupMemberships: {
        include: {
          group: {
            select: { id: true, name: true, code: true, isActive: true },
          },
        },
        orderBy: [
          { isLeader: 'desc' as const },
          { memberOrder: 'asc' as const },
        ],
      },
      inspectorSpecializations: {
        include: { specialization: { select: { id: true, name: true } } },
        orderBy: [{ isPrimary: 'desc' as const }],
      },
    };

    if (!isPaginated) {
      return this.prisma.inspector.findMany({
        where,
        include,
        orderBy: { fullName: 'asc' },
      });
    }

    const [items, totalCount] = await Promise.all([
      this.prisma.inspector.findMany({
        where,
        include,
        skip,
        take,
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.inspector.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / take) || 1;

    return {
      items,
      totalCount,
      totalPages,
      currentPage: page || 1,
    };
  }

  async findOne(id: string) {
    const inspector = await this.prisma.inspector.findUnique({
      where: { id },
      include: {
        primaryGroup: { select: { id: true, name: true, code: true } },
        groupMemberships: {
          include: {
            group: {
              select: { id: true, name: true, code: true, isActive: true },
            },
          },
          orderBy: [{ isLeader: 'desc' }, { memberOrder: 'asc' }],
        },
        inspectorSpecializations: {
          include: { specialization: { select: { id: true, name: true } } },
          orderBy: [{ isPrimary: 'desc' }],
        },
      },
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
        rank: data.rank || null,
        isActive: data.isActive !== undefined ? data.isActive : true,
      },
    });
  }

  async update(id: string, data: any) {
    const inspector = await this.findOne(id);
    return this.prisma.inspector.update({
      where: { id },
      data: {
        fullName:
          data.fullName !== undefined ? data.fullName : inspector.fullName,
        department:
          data.department !== undefined
            ? data.department
            : inspector.department,
        phone: data.phone !== undefined ? data.phone : inspector.phone,
        notes: data.notes !== undefined ? data.notes : inspector.notes,
        rank: data.rank !== undefined ? data.rank : inspector.rank,
        isActive:
          data.isActive !== undefined ? data.isActive : inspector.isActive,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.inspector.delete({
      where: { id },
    });
  }

  async getAvailability(id: string) {
    const inspector = await this.findOne(id);
    return {
      availabilityStatus: inspector.availabilityStatus,
      availabilityReason: inspector.availabilityReason,
      availabilityUntil: inspector.availabilityUntil,
      availabilityUpdatedAt: inspector.availabilityUpdatedAt,
      availabilityChangedBy: inspector.availabilityChangedBy,
    };
  }

  async updateAvailability(
    id: string,
    data: {
      availabilityStatus?: string;
      availabilityReason?: string;
      availabilityUntil?: string;
    },
    changedByUserId: string,
  ) {
    await this.findOne(id);
    const VALID_STATUSES = [
      'AVAILABLE',
      'ON_LEAVE',
      'ON_MISSION',
      'TRAINING',
      'MEDICAL',
      'UNAVAILABLE',
    ];
    if (
      data.availabilityStatus !== undefined &&
      !VALID_STATUSES.includes(data.availabilityStatus)
    ) {
      throw new BadRequestException(
        `حالة التوفر غير صالحة: ${data.availabilityStatus}. القيم المسموحة: ${VALID_STATUSES.join(', ')}`,
      );
    }
    const updateData: any = {
      availabilityChangedBy: changedByUserId,
      availabilityUpdatedAt: new Date(),
    };
    if (data.availabilityStatus !== undefined) {
      updateData.availabilityStatus = data.availabilityStatus;
    }
    if (data.availabilityReason !== undefined) {
      updateData.availabilityReason = data.availabilityReason;
    }
    if (data.availabilityUntil !== undefined) {
      if (data.availabilityUntil) {
        const untilDate = new Date(data.availabilityUntil);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (untilDate < today) {
          throw new BadRequestException(
            'تاريخ الانتهاء يجب أن يكون في المستقبل',
          );
        }
        updateData.availabilityUntil = untilDate;
      } else {
        updateData.availabilityUntil = null;
      }
    }
    return this.prisma.inspector.update({
      where: { id },
      data: updateData,
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async autoExpireAvailability() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = await this.prisma.inspector.updateMany({
      where: {
        availabilityUntil: { lt: today },
        availabilityStatus: { not: 'AVAILABLE' },
      },
      data: {
        availabilityStatus: 'AVAILABLE',
        availabilityReason: null,
        availabilityUntil: null,
        availabilityUpdatedAt: new Date(),
        availabilityChangedBy: null,
      },
    });
    if (result.count > 0) {
      console.log(
        `[Availability Cron] Auto-expired ${result.count} inspector(s) back to AVAILABLE`,
      );
    }
  }
}
