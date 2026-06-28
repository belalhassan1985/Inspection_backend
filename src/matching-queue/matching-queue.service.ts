import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseFile, ParseResult } from './file-parser';
import {
  normalizeName,
  extractRankAndName,
  computeConfidence,
} from './name-utils';

@Injectable()
export class MatchingQueueService {
  constructor(private prisma: PrismaService) {}

  async importFile(filename: string, buffer: Buffer) {
    let parsed: ParseResult;
    try {
      parsed = await parseFile(filename, buffer);
    } catch (e: any) {
      throw new BadRequestException(e.message || 'فشل قراءة الملف');
    }

    if (parsed.rows.length === 0) {
      throw new BadRequestException('لم يتم العثور على بيانات في الملف');
    }

    const allInspectors = await this.prisma.inspector.findMany({
      select: { id: true, fullName: true, rank: true },
    });

    const session = await this.prisma.importSession.create({
      data: {
        filename,
        totalEntries: parsed.totalEntries,
        status: 'pending',
      },
    });

    const normalizedNames = new Set<string>();
    let matchedCount = 0;

    for (const row of parsed.rows) {
      const { rankGuess, restName } = extractRankAndName(row.rawName);
      const normalized = normalizeName(restName);
      normalizedNames.add(normalized);

      let bestMatch: {
        id: string;
        fullName: string;
        confidence: number;
      } | null = null;

      for (const insp of allInspectors) {
        const conf = computeConfidence(normalized, insp.fullName);
        if (conf > 0 && (!bestMatch || conf > bestMatch.confidence)) {
          bestMatch = {
            id: insp.id,
            fullName: insp.fullName,
            confidence: conf,
          };
        }
      }

      if (bestMatch && bestMatch.confidence >= 70) matchedCount++;

      await this.prisma.importQueueItem.create({
        data: {
          sessionId: session.id,
          rawName: row.rawName,
          normalizedName: normalized,
          rankGuess: rankGuess,
          sourceGroup: row.sourceGroup || null,
          sourceAssignment: row.sourceAssignment || null,
          notes: row.notes || null,
          suggestedInspectorId:
            bestMatch && bestMatch.confidence >= 70 ? bestMatch.id : null,
          confidenceScore: bestMatch ? bestMatch.confidence : null,
          status: 'pending',
        },
      });
    }

    await this.prisma.importSession.update({
      where: { id: session.id },
      data: {
        normalizedCount: normalizedNames.size,
        matchedCount,
        unmatchedCount: parsed.rows.length - matchedCount,
        pendingCount: parsed.rows.length,
        status: 'processing',
      },
    });

    return { sessionId: session.id, totalEntries: parsed.totalEntries };
  }

  async getSessions() {
    return this.prisma.importSession.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStats(sessionId: string) {
    const session = await this.prisma.importSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');

    const items = await this.prisma.importQueueItem.findMany({
      where: { sessionId },
    });

    const normalizedNames = new Set(items.map((i) => i.normalizedName));
    const exactMatches = items.filter((i) => i.confidenceScore === 100).length;
    const partialMatches = items.filter(
      (i) =>
        i.confidenceScore && i.confidenceScore >= 70 && i.confidenceScore < 100,
    ).length;
    const unmatched = items.filter(
      (i) => !i.confidenceScore || i.confidenceScore < 70,
    ).length;
    const duplicates = items.length - normalizedNames.size;
    const nameCounts = new Map<string, number>();
    items.forEach((i) =>
      nameCounts.set(
        i.normalizedName,
        (nameCounts.get(i.normalizedName) || 0) + 1,
      ),
    );
    const multiGroupNames: string[] = [];
    const groupMap = new Map<string, Set<string>>();
    for (const item of items) {
      if (!groupMap.has(item.normalizedName))
        groupMap.set(item.normalizedName, new Set());
      if (item.sourceGroup)
        groupMap.get(item.normalizedName)!.add(item.sourceGroup);
    }
    for (const [name, groups] of groupMap) {
      if (groups.size > 1) multiGroupNames.push(name);
    }

    const groupItems = items.filter(
      (i) => i.sourceGroup && !i.sourceAssignment,
    );
    const assignmentItems = items.filter((i) => i.sourceAssignment);

    return {
      sessionId: session.id,
      filename: session.filename,
      status: session.status,
      totalEntries: session.totalEntries,
      normalizedCount: normalizedNames.size,
      exactMatches,
      partialMatches,
      unmatchedCount: unmatched,
      duplicates,
      multiGroupNamesCount: multiGroupNames.length,
      forGroups: { count: groupItems.length },
      forAssignments: { count: assignmentItems.length },
      groups: [
        ...new Set(items.map((i) => i.sourceGroup).filter(Boolean)),
      ] as string[],
    };
  }

  async getQueue(sessionId: string) {
    const session = await this.prisma.importSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new NotFoundException('الجلسة غير موجودة');

    const items = await this.prisma.importQueueItem.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      include: {
        suggestedInspector: {
          select: { id: true, fullName: true, rank: true, department: true },
        },
      },
    });

    return items.map((item) => ({
      id: item.id,
      rawName: item.rawName,
      normalizedName: item.normalizedName,
      rankGuess: item.rankGuess,
      sourceGroup: item.sourceGroup,
      sourceAssignment: item.sourceAssignment,
      notes: item.notes,
      suggestedInspector: item.suggestedInspector,
      confidenceScore: item.confidenceScore,
      status: item.status,
    }));
  }

  async linkToInspector(itemId: number, inspectorId: string) {
    const item = await this.prisma.importQueueItem.findUnique({
      where: { id: itemId },
    });
    if (!item) throw new NotFoundException('العنصر غير موجود');
    if (item.status !== 'pending')
      throw new BadRequestException('تم معالجة هذا العنصر مسبقاً');

    const inspector = await this.prisma.inspector.findUnique({
      where: { id: inspectorId },
    });
    if (!inspector) throw new NotFoundException('المفتش غير موجود');

    await this.prisma.importQueueItem.update({
      where: { id: itemId },
      data: {
        suggestedInspectorId: inspectorId,
        status: 'linked',
        confidenceScore: 100,
      },
    });

    // Create group/assignment memberships
    if (item.sourceGroup) {
      let group = await this.prisma.inspectionGroup.findFirst({
        where: { name: item.sourceGroup },
      });
      if (!group) {
        group = await this.prisma.inspectionGroup.create({
          data: {
            name: item.sourceGroup,
            code: null,
            description: `مستورد من ملف ${item.sessionId}`,
          },
        });
      }
      const existing = await this.prisma.inspectorGroupMember.findUnique({
        where: { inspectorId_groupId: { inspectorId, groupId: group.id } },
      });
      if (!existing) {
        await this.prisma.inspectorGroupMember.create({
          data: {
            inspectorId,
            groupId: group.id,
            roleInGroup: item.rankGuess || item.sourceAssignment || null,
          },
        });
      }
    }

    if (item.sourceAssignment) {
      let assignment = await this.prisma.inspectorAssignment.findFirst({
        where: { name: item.sourceAssignment },
      });
      if (!assignment) {
        assignment = await this.prisma.inspectorAssignment.create({
          data: {
            name: item.sourceAssignment,
            assignmentType: 'committee',
            description: `مستورد من ملف ${item.sessionId}`,
          },
        });
      }
      const existing = await this.prisma.inspectorAssignmentMember.findUnique({
        where: {
          inspectorId_assignmentId: {
            inspectorId,
            assignmentId: assignment.id,
          },
        },
      });
      if (!existing) {
        await this.prisma.inspectorAssignmentMember.create({
          data: {
            inspectorId,
            assignmentId: assignment.id,
            note: item.notes || null,
          },
        });
      }
    }

    // Update session counters
    await this.updateSessionCounts(item.sessionId);
    return { success: true, status: 'linked' };
  }

  async createInspector(itemId: number) {
    const item = await this.prisma.importQueueItem.findUnique({
      where: { id: itemId },
    });
    if (!item) throw new NotFoundException('العنصر غير موجود');
    if (item.status !== 'pending')
      throw new BadRequestException('تم معالجة هذا العنصر مسبقاً');

    // Check duplicate by normalized name
    const existing = await this.prisma.inspector.findFirst({
      where: {
        fullName: { contains: item.normalizedName, mode: 'insensitive' },
      },
    });
    if (existing) {
      throw new ConflictException(
        'يوجد مفتش بنفس الاسم. استخدم خاصية الربط بدلاً من الإنشاء.',
      );
    }

    const inspector = await this.prisma.inspector.create({
      data: {
        fullName: item.rawName,
        rank: item.rankGuess || null,
        department: item.sourceGroup || null,
        isActive: true,
      },
    });

    // Create group membership
    if (item.sourceGroup) {
      let group = await this.prisma.inspectionGroup.findFirst({
        where: { name: item.sourceGroup },
      });
      if (!group) {
        group = await this.prisma.inspectionGroup.create({
          data: {
            name: item.sourceGroup,
            code: null,
            description: `مستورد من ملف ${item.sessionId}`,
          },
        });
      }
      await this.prisma.inspectorGroupMember.create({
        data: {
          inspectorId: inspector.id,
          groupId: group.id,
          roleInGroup: item.rankGuess || null,
        },
      });
    }

    if (item.sourceAssignment) {
      let assignment = await this.prisma.inspectorAssignment.findFirst({
        where: { name: item.sourceAssignment },
      });
      if (!assignment) {
        assignment = await this.prisma.inspectorAssignment.create({
          data: {
            name: item.sourceAssignment,
            assignmentType: 'committee',
            description: `مستورد من ملف ${item.sessionId}`,
          },
        });
      }
      await this.prisma.inspectorAssignmentMember.create({
        data: {
          inspectorId: inspector.id,
          assignmentId: assignment.id,
          note: item.notes || null,
        },
      });
    }

    await this.prisma.importQueueItem.update({
      where: { id: itemId },
      data: {
        suggestedInspectorId: inspector.id,
        status: 'created',
        confidenceScore: 100,
      },
    });

    await this.updateSessionCounts(item.sessionId);
    return { success: true, status: 'created', inspectorId: inspector.id };
  }

  async skipItem(itemId: number) {
    const item = await this.prisma.importQueueItem.findUnique({
      where: { id: itemId },
    });
    if (!item) throw new NotFoundException('العنصر غير موجود');
    if (item.status !== 'pending')
      throw new BadRequestException('تم معالجة هذا العنصر مسبقاً');

    await this.prisma.importQueueItem.update({
      where: { id: itemId },
      data: { status: 'skipped' },
    });

    await this.updateSessionCounts(item.sessionId);
    return { success: true, status: 'skipped' };
  }

  async getPreview(sessionId: string) {
    return this.getStats(sessionId);
  }

  private async updateSessionCounts(sessionId: string) {
    const items = await this.prisma.importQueueItem.findMany({
      where: { sessionId },
      select: { status: true },
    });
    const pendingCount = items.filter((i) => i.status === 'pending').length;
    const linkedCount = items.filter((i) => i.status === 'linked').length;
    const createdCount = items.filter((i) => i.status === 'created').length;
    const skippedCount = items.filter((i) => i.status === 'skipped').length;

    await this.prisma.importSession.update({
      where: { id: sessionId },
      data: {
        pendingCount,
        linkedCount,
        createdCount,
        skippedCount,
        status: pendingCount === 0 ? 'completed' : 'processing',
      },
    });
  }
}
