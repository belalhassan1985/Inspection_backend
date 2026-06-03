import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import {
  getLevel1Number,
  getLevel2ArabicLetter,
  getLevel3Ordinal,
  getLevel4Number,
  getLevel5ArabicLetter,
  getIndentation,
  DEFAULT_FORMATTING_CONFIG,
  ReportFormattingConfig,
} from '../utils/reportNumbering';
import { pruneTemplateTree, hasMeaningfulQuantitativeData } from '../utils/reportFilter';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  WidthType,
  ImageRun,
  PageBreak,
  BorderStyle,
} from 'docx';

function parseCommitteeMember(member: string): { name: string; role: string } {
  const cleanMember = member.replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim();
  const parts = cleanMember.split(/\s{2,}/);
  if (parts.length >= 2) {
    return {
      name: parts[0].trim(),
      role: parts.slice(1).join(' ').trim(),
    };
  }
  const roles = [
    'رئيس اللجنة',
    'رئيـس اللجنة',
    'معاون اللجنة',
    'معـاون اللجنة',
    'عضو اللجنة',
    'عضو',
    'عضواً',
    'عضـــــــــواً',
  ];
  for (const role of roles) {
    if (cleanMember.endsWith(role)) {
      const name = cleanMember.substring(0, cleanMember.length - role.length).trim();
      return { name, role };
    }
  }
  return { name: cleanMember, role: '' };
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  constructor(private prisma: PrismaService) { }

  private toNumber(value: any): number {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private getOptionTypeCode(option: any): string {
    return option?.optionType?.code || option?.type || 'positive';
  }

  private addOptionTextToBuckets(
    option: any,
    buckets: {
      positives: string[];
      negatives: string[];
      impediments: string[];
      obstacles: string[];
      dynamic: Record<string, { code: string; nameAr: string; color?: string | null; icon?: string | null; items: string[] }>;
    },
  ) {
    const text = option?.optionText;
    if (!text) return;
    const type = this.getOptionTypeCode(option);
    if (type === 'positive') buckets.positives.push(text);
    else if (type === 'negative') buckets.negatives.push(text);
    else if (type === 'impediment') buckets.impediments.push(text);
    else if (type === 'obstacle') buckets.obstacles.push(text);
    else {
      const key = type;
      const meta = option?.optionType;
      if (!buckets.dynamic[key]) {
        buckets.dynamic[key] = {
          code: key,
          nameAr: meta?.nameAr || key,
          color: meta?.color || null,
          icon: meta?.icon || null,
          items: [],
        };
      }
      buckets.dynamic[key].items.push(text);
    }
  }

  private getFinalEvaluationRating(percentage: number): string {
    if (percentage >= 90) return 'ممتاز';
    if (percentage >= 80) return 'جيد جداً';
    if (percentage >= 70) return 'جيد';
    if (percentage >= 60) return 'وسط';
    return 'ضعيف';
  }

  private buildFinalEvaluationSummary(entityName: string | null | undefined, earnedSum: number, maxSum: number): any {
    const percentage = maxSum > 0 ? (earnedSum / maxSum) * 100 : 0;
    const roundedPercentage = Number(percentage.toFixed(2));
    const rating = this.getFinalEvaluationRating(roundedPercentage);
    const targetName = entityName || 'الجهة';

    return {
      entityName: targetName,
      earnedSum: Number(earnedSum.toFixed(2)),
      maxSum: Number(maxSum.toFixed(2)),
      percentage: roundedPercentage,
      rating,
      statement: `تقييم ${targetName} (${rating})`,
    };
  }

  private dedupeTexts(items: any[] = []): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    items.forEach((item) => {
      const text = String(item ?? '').trim();
      if (!text || seen.has(text)) return;
      seen.add(text);
      result.push(text);
    });

    return result;
  }

  private buildObservationSectionFromLists(
    title: string,
    positives: any[] = [],
    negatives: any[] = [],
    impediments: any[] = [],
    obstacles: any[] = [],
    dynamicOptionTypeLists: Array<{ code: string; nameAr: string; color?: string | null; icon?: string | null; items: string[] }> = [],
  ): any | null {
    const positivesList = this.dedupeTexts(positives);
    const negativesList = this.dedupeTexts(negatives);
    const impedimentsList = this.dedupeTexts(impediments);
    const obstaclesList = this.dedupeTexts(obstacles);
    const optionTypeLists = dynamicOptionTypeLists
      .map((item) => ({ ...item, items: this.dedupeTexts(item.items) }))
      .filter((item) => item.items.length > 0);
    const hasItems = positivesList.length > 0 || negativesList.length > 0 || impedimentsList.length > 0 || obstaclesList.length > 0 || optionTypeLists.length > 0;

    if (!hasItems) return null;

    return {
      id: 'manual-notes',
      title,
      visible: true,
      isManual: true,
      positivesList,
      negativesList,
      impedimentsList,
      obstaclesList,
      showPositives: positivesList.length > 0,
      showNegatives: negativesList.length > 0,
      showImpediments: impedimentsList.length > 0,
      showObstacles: obstaclesList.length > 0,
      optionTypeLists,
      narrativeText: '',
      numbering: '',
      officerInfo: null,
      assessment: null,
      detailsList: [],
      earnedSum: 0,
      maxSum: 0,
      generatedObservationSource: {
        positivesList: [...positivesList],
        negativesList: [...negativesList],
        impedimentsList: [...impedimentsList],
        obstaclesList: [...obstaclesList],
        optionTypeLists,
      },
      isEmpty: false,
    };
  }

  private mergeObservationSection(payload: any, sourceSection: any | null): void {
    if (!payload || !sourceSection) return;
    if (!Array.isArray(payload.sections)) {
      payload.sections = [];
    }

    const existingIndex = payload.sections.findIndex((section: any) => section?.id === 'manual-notes' || section?.isManual);
    if (existingIndex === -1) {
      payload.sections.unshift(sourceSection);
      return;
    }

    const existing = payload.sections[existingIndex];
    const previousSource = existing.generatedObservationSource || null;
    const mergeList = (existingList: any[] = [], sourceList: any[] = [], previousSourceList: any[] = []) => {
      if (!previousSource) {
        return this.dedupeTexts([...existingList, ...sourceList]);
      }

      const existingTrimmed = new Set(this.dedupeTexts(existingList).map((item) => item.trim()));
      const previousTrimmed = new Set(this.dedupeTexts(previousSourceList).map((item) => item.trim()));
      const newSourceItems = this.dedupeTexts(sourceList).filter((item) => {
        const text = item.trim();
        return !previousTrimmed.has(text) && !existingTrimmed.has(text);
      });

      return this.dedupeTexts([...existingList, ...newSourceItems]);
    };

    const merged = {
      ...existing,
      id: existing.id || 'manual-notes',
      title: existing.title || sourceSection.title,
      visible: existing.visible !== false,
      isManual: true,
      positivesList: mergeList(existing.positivesList || [], sourceSection.positivesList || [], previousSource?.positivesList || []),
      negativesList: mergeList(existing.negativesList || [], sourceSection.negativesList || [], previousSource?.negativesList || []),
      impedimentsList: mergeList(existing.impedimentsList || [], sourceSection.impedimentsList || [], previousSource?.impedimentsList || []),
      obstaclesList: mergeList(existing.obstaclesList || [], sourceSection.obstaclesList || [], previousSource?.obstaclesList || []),
      narrativeText: existing.narrativeText || '',
      numbering: existing.numbering || '',
      officerInfo: existing.officerInfo || null,
      assessment: existing.assessment || null,
      detailsList: existing.detailsList || [],
      earnedSum: existing.earnedSum || 0,
      maxSum: existing.maxSum || 0,
      generatedObservationSource: {
        positivesList: [...(sourceSection.generatedObservationSource?.positivesList || sourceSection.positivesList || [])],
        negativesList: [...(sourceSection.generatedObservationSource?.negativesList || sourceSection.negativesList || [])],
        impedimentsList: [...(sourceSection.generatedObservationSource?.impedimentsList || sourceSection.impedimentsList || [])],
        obstaclesList: [...(sourceSection.generatedObservationSource?.obstaclesList || sourceSection.obstaclesList || [])],
      },
    };

    merged.showPositives = merged.positivesList.length > 0;
    merged.showNegatives = merged.negativesList.length > 0;
    merged.showImpediments = merged.impedimentsList.length > 0;
    merged.showObstacles = merged.obstaclesList.length > 0;
    merged.isEmpty = !(merged.showPositives || merged.showNegatives || merged.showImpediments || merged.showObstacles);

    payload.sections[existingIndex] = merged;
  }

  private async buildCampaignObservationSection(campaignId: string): Promise<any | null> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        notes: {
          orderBy: { sortOrder: 'asc' },
        },
        inspections: {
          where: { status: { in: ['approved', 'pendingReview', 'draft'] } },
          include: {
            grades: {
              include: {
                selectedOptions: {
                  include: {
                    option: { include: { optionType: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const positives: string[] = campaign.notes.filter((note) => note.type === 'positive').map((note) => note.text);
    const negatives: string[] = campaign.notes.filter((note) => note.type === 'negative').map((note) => note.text);
    const impediments: string[] = campaign.notes.filter((note) => note.type === 'impediment').map((note) => note.text);
    const obstacles: string[] = campaign.notes.filter((note) => note.type === 'obstacle').map((note) => note.text);
    const dynamicOptionTypes: Record<string, { code: string; nameAr: string; color?: string | null; icon?: string | null; items: string[] }> = {};

    campaign.inspections.forEach((inspection) => {
      inspection.grades.forEach((grade) => {
        grade.selectedOptions.forEach((selected) => {
          this.addOptionTextToBuckets(selected.option, {
            positives,
            negatives,
            impediments,
            obstacles,
            dynamic: dynamicOptionTypes,
          });
        });
      });
    });

    return this.buildObservationSectionFromLists(
      'الملاحظات والنتائج العامة للجنة التفتيشية',
      positives,
      negatives,
      impediments,
      obstacles,
      Object.values(dynamicOptionTypes),
    );
  }

  private calculateFinalEvaluationFromInspections(campaign: any): any {
    let earnedSum = 0;
    let maxSum = 0;

    (campaign.inspections || [])
      .filter((inspection: any) => ['approved', 'pendingReview', 'draft'].includes(inspection.status))
      .forEach((inspection: any) => {
        (inspection.grades || []).forEach((grade: any) => {
          earnedSum += this.toNumber(grade.gradeEarned);
          maxSum += this.toNumber(grade.criteriaDetail?.maxGrade);
        });
      });

    return this.buildFinalEvaluationSummary(campaign.entity?.name, earnedSum, maxSum);
  }

  private async calculateCampaignFinalEvaluation(campaignId: string): Promise<any> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        entity: true,
        inspections: {
          where: { status: { in: ['approved', 'pendingReview', 'draft'] } },
          include: {
            grades: {
              include: {
                criteriaDetail: true,
              },
            },
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return this.calculateFinalEvaluationFromInspections(campaign);
  }

  /**
   * Normalize section visibility across the entire payload:
   * - Recomputes isEmpty for all sections based on real data only.
   * - Removes empty/invisible subsections from the array entirely.
   * - Hides (visible=false, isEmpty=true) primary sections with no remaining subsections.
   * - Preserves manual sections (never hidden, but recomputes isEmpty).
   * Safe to call multiple times; idempotent.
   */
  private normalizeReportSectionsVisibility(payload: any): void {
    if (!payload) return;

    if (!payload.signatures) {
      payload.signatures = {};
    }
    if (payload.signatures.leaderRank === 'هيئة تفتيش قوى الامن الداخلي' || !payload.signatures.leaderRank) {

    }
    if (payload.signatures.deputyRank === 'هيئة الرقابة والتفتيش' || !payload.signatures.deputyRank) {
      payload.signatures.deputyRank = 'الفريق الحقوقي المفتش';
    }
    if (payload.signatures.deputyRole === 'عضو ومقرر اللجنة' || !payload.signatures.deputyRole) {
      payload.signatures.deputyRole = 'رئيس هيئة تفتيش قوى الامن الداخلي';
    }
    if (!payload.signatures.leaderRole) {
      payload.signatures.leaderRole = 'رئيس اللجنة';
    }
    if (!payload.signatures.leaderName) {
      payload.signatures.leaderName = 'ليث محمد عبيد';
    }
    if (!payload.signatures.deputyName) {
      payload.signatures.deputyName = 'عاطف عبد الحسين راضي';
    }

    if (!payload.sections) return;

    payload.sections.forEach((sec: any) => {
      if (sec.isManual) {
        // Backward compatibility: convert old findings-only schema to new categorized schema
        if (sec.findings && sec.findings.length > 0 && !sec.positivesList) {
          sec.positivesList = [...sec.findings];
          sec.negativesList = [];
          sec.impedimentsList = [];
          sec.obstaclesList = [];
          sec.showPositives = true;
          sec.showNegatives = false;
          sec.showImpediments = false;
          sec.showObstacles = false;
          sec.narrativeText = sec.narrativeText || '';
          sec.numbering = sec.numbering || '';
        }
        sec.isEmpty = !(
          (sec.positivesList && sec.positivesList.length > 0) ||
          (sec.negativesList && sec.negativesList.length > 0) ||
          (sec.impedimentsList && sec.impedimentsList.length > 0) ||
          (sec.obstaclesList && sec.obstaclesList.length > 0)
        );
        sec.visible = sec.visible !== false;
      } else if (sec.subsections) {
        // Recompute isEmpty for each subsection — only real data counts
        sec.subsections.forEach((sub: any) => {
          const hasFindings = sub.findings && sub.findings.length > 0;
          const hasEarnedScores = sub.earnedSum > 0;
          const hasNotesText = sub.detailsList?.some((d: string) => d.includes('ملاحظة:'));
          // Use stored hasQuantData flag (computed via hasMeaningfulQuantitativeData)
          // Fall back to false for old saved presentations without this flag
          const hasQuantData = sub.hasQuantData === true;
          sub.isEmpty = !hasFindings && !hasEarnedScores && !hasNotesText && !hasQuantData;
          // officerInfo alone is never sufficient to show a subsection
          sub.visible = sub.visible !== false && !sub.isEmpty;
        });

        // Remove empty/invisible subsections from the array entirely
        sec.subsections = sec.subsections.filter((sub: any) => sub.visible);

        // Primary section is empty if no subsections remain
        sec.isEmpty = sec.subsections.length === 0;
        sec.visible = sec.visible !== false && !sec.isEmpty;
      }
    });
  }

  async getCampaignReportPayload(campaignId: string): Promise<any> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        leader: true,
        deputy: true,
        members: {
          include: {
            inspector: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const saved = await this.prisma.reportPresentation.findUnique({
      where: { campaignId },
    });

    const latestGrade = await this.prisma.inspectionGrade.findFirst({
      where: {
        inspection: {
          campaignId,
          status: { in: ['approved', 'pendingReview', 'draft'] }
        }
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    });

    const leaderName = campaign.leader?.fullName || 'ليث محمد عبيد';
    const deputyName = campaign.deputy?.fullName || 'عاطف عبد الحسين راضي';
    const currentCommitteeMembers = [
      `${leaderName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; رئيـس اللجنة`,
      `${deputyName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; معـاون اللجنة`,
      ...campaign.members.map((m) => `${m.inspector.fullName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; عضـــــــــواً`),
    ];

    if (saved) {
      const savedPayload = typeof saved.payload === 'string'
        ? JSON.parse(saved.payload)
        : saved.payload;
      const isStale = latestGrade && (latestGrade.createdAt.getTime() > saved.updatedAt.getTime() + 1000);

      // Recompute visibility for all sections — normalizes old saved presentations
      this.normalizeReportSectionsVisibility(savedPayload);

      // Sync committee members & signatures if campaign info changed
      const savedMemberNames = (savedPayload.committeeMembers || []).map((m: string) => parseCommitteeMember(m).name.trim());
      const currentMemberNames = [leaderName, deputyName, ...campaign.members.map(m => m.inspector.fullName)];
      const isMismatch = savedMemberNames.length !== currentMemberNames.length ||
        !currentMemberNames.every(name => savedMemberNames.includes(name.trim()));

      if (isMismatch || savedPayload.signatures?.leaderName !== leaderName) {
        savedPayload.committeeMembers = currentCommitteeMembers;
        if (!savedPayload.signatures) {
          savedPayload.signatures = {};
        }
        savedPayload.signatures.leaderName = leaderName;
      }

      // Enforce that the left signature column (deputy) remains static
      if (!savedPayload.signatures) {
        savedPayload.signatures = {};
      }
      savedPayload.signatures.deputyName = 'عاطف عبد الحسين راضي';
      savedPayload.signatures.deputyRank = 'الفريق الحقوقي المفتش';
      savedPayload.signatures.deputyRole = 'رئيس هيئة تفتيش قوى الامن الداخلي';

      if (!savedPayload.finalEvaluation) {
        savedPayload.finalEvaluation = await this.calculateCampaignFinalEvaluation(campaignId);
      }
      const currentObservationSection = await this.buildCampaignObservationSection(campaignId);
      this.mergeObservationSection(savedPayload, currentObservationSection);
      this.normalizeReportSectionsVisibility(savedPayload);

      return {
        ...savedPayload,
        hasSavedPresentation: true,
        savedAt: saved.updatedAt,
        isStale: !!isStale,
        history: saved.history || [],
      };
    }
    const defaultPayload = await this.buildDefaultReportPayload(campaignId);
    this.normalizeReportSectionsVisibility(defaultPayload);
    return {
      ...defaultPayload,
      hasSavedPresentation: false,
      isStale: false,
      history: [],
    };
  }

  async saveReportPresentation(campaignId: string, payload: any): Promise<any> {
    const existing = await this.prisma.reportPresentation.findUnique({
      where: { campaignId },
    });

    let history: any[] = [];
    if (existing) {
      const oldHistory = Array.isArray(existing.history) ? existing.history : [];
      const historyEntry = {
        version: oldHistory.length + 1,
        updatedAt: existing.updatedAt.toISOString(),
        payload: existing.payload,
      };
      history = [historyEntry, ...oldHistory].slice(0, 5);

      return this.prisma.reportPresentation.update({
        where: { campaignId },
        data: {
          payload: payload as any,
          history: history as any,
        },
      });
    } else {
      return this.prisma.reportPresentation.create({
        data: {
          campaignId,
          payload: payload as any,
          history: [] as any,
        },
      });
    }
  }

  async deleteReportPresentation(campaignId: string): Promise<any> {
    try {
      return await this.prisma.reportPresentation.delete({
        where: { campaignId },
      });
    } catch (e) {
      return null;
    }
  }

  async buildDefaultReportPayload(campaignId: string): Promise<any> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        leader: true,
        deputy: true,
        entity: {
          include: {
            parent: true,
            positions: {
              where: { isActive: true },
            },
          },
        },
        members: {
          include: {
            inspector: true,
          },
        },
        notes: {
          orderBy: { sortOrder: 'asc' },
        },
        recommendations: {
          orderBy: { sortOrder: 'asc' },
        },
        appendices: true,
        inspections: {
          where: { status: { in: ['approved', 'pendingReview', 'draft'] } },
          include: {
            entity: {
              include: {
                positions: {
                  where: { isActive: true },
                },
              },
            },
            inspector: true,
            grades: {
              include: {
                selectedOptions: {
                  include: {
                    option: { include: { optionType: true } },
                  },
                },
                criteriaDetail: true,
              },
            },
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const isEducational = campaign.type === 'education';
    const governorate = campaign.entity?.parent?.name || 'بغداد';
    const zoneName = campaign.entity?.name || '';

    const validInspections = campaign.inspections.filter(i => ['approved', 'pendingReview', 'draft'].includes(i.status));
    const targetInspections = validInspections.length > 0 ? validInspections : campaign.inspections;

    // Find main inspection for Section 6 (Legacy) matching campaign.entityId
    const mainInspection = campaign.inspections.find(i => i.entityId === campaign.entityId) ||
      campaign.inspections.find((i) => i.status === 'approved') ||
      campaign.inspections.find((i) => i.status === 'pendingReview') ||
      campaign.inspections.find((i) => i.status === 'draft') ||
      campaign.inspections[0];

    const activeInspection = mainInspection;

    const pruningGradesMap = new Map<number, any>();
    const gradesMap = new Map<string, any>();
    const secondaryInstancesMap = new Map<number, Set<string>>();

    targetInspections.forEach((insp) => {
      if (insp.grades) {
        insp.grades.forEach((g) => {
          pruningGradesMap.set(g.detailId, g);

          const suffixKey = g.instanceName || 'default';
          const key = `${g.detailId}_${suffixKey}`;
          gradesMap.set(key, {
            ...g,
            inspectionId: insp.id,
            entityId: insp.entityId,
            entityName: insp.entity?.name,
          });

          const secId = g.criteriaDetail.secondaryId;
          let instSet = secondaryInstancesMap.get(secId);
          if (!instSet) {
            instSet = new Set<string>();
            secondaryInstancesMap.set(secId, instSet);
          }
          if (g.instanceName) {
            instSet.add(g.instanceName);
          }
        });
      }
    });

    // Load criteria template associated with the campaign
    let template: any[] = [];
    if (campaign.templateId) {
      const dbTemplate = await this.prisma.criteriaTemplate.findUnique({
        where: { id: campaign.templateId },
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
        },
      });
      if (dbTemplate && dbTemplate.items) {
        template = dbTemplate.items.map((item) => item.primary);
      }
    } else {
      template = await this.prisma.primaryCriteria.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          secondaryCriteria: {
            orderBy: { sortOrder: 'asc' },
            include: {
              details: {
                orderBy: { sortOrder: 'asc' },
                include: {
                  options: { include: { optionType: true } },
                },
              },
            },
          },
        },
      });
    }

    // Prune tree recursively using reportFilter helper using the pruning map
    const prunedTemplate = pruneTemplateTree(template, pruningGradesMap);

    let personnelTableRows: any[] = [];
    if (mainInspection && mainInspection.grades) {
      mainInspection.grades.forEach((grade) => {
        if ((grade.criteriaDetail.detailText.includes('المواقف الرسمية') || grade.criteriaDetail.detailText.includes('نسب التكامل')) && hasMeaningfulQuantitativeData(grade.quantitativeData)) {
          try {
            const parsed = typeof grade.quantitativeData === 'string'
              ? JSON.parse(grade.quantitativeData)
              : grade.quantitativeData;
            if (Array.isArray(parsed)) {
              personnelTableRows = parsed;
            } else if (parsed && Array.isArray(parsed.rows)) {
              personnelTableRows = parsed.rows;
            }
          } catch (e) {
            console.error('Error parsing quantitative data', e);
          }
        }
      });
    }

    const leaderName = campaign.leader?.fullName || 'ليث محمد عبيد';
    const deputyName = campaign.deputy?.fullName || 'عاطف عبد الحسين راضي';
    const committeeMembers = [
      `${leaderName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; رئيـس اللجنة`,
      `${deputyName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; معـاون اللجنة`,
      ...campaign.members.map((m) => `${m.inspector.fullName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; عضـــــــــواً`),
    ];

    const campaignPositions = campaign.entity?.positions || [];
    const inspectionPositions = campaign.inspections.flatMap(insp => insp.entity?.positions || []);
    const allPositions = [...campaignPositions, ...inspectionPositions];
    const positionsList = allPositions.map((pos) => ({
      id: pos.id,
      positionName: pos.positionName,
      rank: pos.rank || '—',
      positionHolder: pos.positionHolder || '—',
      statisticalNumber: pos.statisticalNumber || '—',
      joinedDate: pos.joinedDate ? new Date(pos.joinedDate).toLocaleDateString('ar-EG') : '—',
      positionStatus: pos.positionStatus || '—',
      education: pos.education || '—',
      notes: pos.notes || '—',
    }));

    const personnelRows = personnelTableRows.map((row) => {
      const nominal = row.authorized !== undefined ? row.authorized : (row.nominal || 0);
      const actual = row.present !== undefined ? row.present : (row.actual || 0);
      const increase = row.excess !== undefined ? row.excess : Math.max(0, actual - nominal);
      const deficit = row.shortage !== undefined ? row.shortage : Math.max(0, nominal - actual);
      const percentage = row.percentage !== undefined ? row.percentage : (nominal > 0 ? (actual / nominal * 100).toFixed(0) : '0');
      return {
        category: row.category,
        nominal,
        actual,
        increase,
        deficit,
        percentage: parseFloat(percentage),
      };
    });

    const manualPositives = campaign.notes.filter((n) => n.type === 'positive').map((n) => n.text);
    const manualNegatives = campaign.notes.filter((n) => n.type === 'negative').map((n) => n.text);
    const manualImpediments = campaign.notes.filter((n) => n.type === 'impediment').map((n) => n.text);
    const manualObstacles = campaign.notes.filter((n) => n.type === 'obstacle').map((n) => n.text);

    const evaluations = campaign.inspections
      .filter(i => ['approved', 'pendingReview', 'draft'].includes(i.status))
      .map(insp => {
        const commander = insp.entity?.positions?.find(
          p => p.positionName.includes('آمر') || p.positionName.includes('مدير')
        );
        return {
          entityName: insp.entity?.name || '',
          commanderName: commander ? commander.positionHolder : 'غير متوفر',
          location: insp.location,
          totalScore: insp.totalScore,
          performanceRating: insp.performanceRating,
        };
      });

    const checklistPositives: string[] = [];
    const checklistNegatives: string[] = [];
    const checklistImpediments: string[] = [];
    const checklistObstacles: string[] = [];
    const checklistDynamicTypes: Record<string, { code: string; nameAr: string; color?: string | null; icon?: string | null; items: string[] }> = {};

    targetInspections.forEach((insp) => {
      if (insp.grades) {
        insp.grades.forEach((grade) => {
          if (grade.selectedOptions) {
            grade.selectedOptions.forEach((sel: any) => {
              this.addOptionTextToBuckets(sel.option, {
                positives: checklistPositives,
                negatives: checklistNegatives,
                impediments: checklistImpediments,
                obstacles: checklistObstacles,
                dynamic: checklistDynamicTypes,
              });
            });
          }
        });
      }
    });

    /**
     * Match a section title to an officer position.
     * Uses strict matching only — no fuzzy guessing — because officer info
     * appears in official reports and must correspond to a real position.
     * Returns null unless there is a high-confidence match.
     */
    function matchOfficerInfo(criterionTitle: string): any {
      const titleClean = criterionTitle.replace(/[^\w\s]/g, '').trim();
      if (!titleClean || titleClean.length < 1) return null;

      const positionPrefixes = ['مدير', 'آمر', 'قائد', 'معاون', 'رئيس', 'نائب', 'مقرر'];
      const prefixPattern = new RegExp(`^(${positionPrefixes.join('|')})\\s+`);

      let bestMatch: any = null;
      let bestScore = 0;

      for (const pos of allPositions) {
        const posName = pos.positionName || '';
        // Remove job-title prefix to get the core entity name
        const posClean = posName.replace(prefixPattern, '').trim();
        if (!posClean) continue;

        let score = 0;

        // Exact match after stripping job title prefix
        if (posClean === titleClean) {
          score = 10;
        }
        // Strong contains match — one string is fully contained in the other
        else if (posClean.length >= 3 && titleClean.includes(posClean)) {
          score = 8;
        }
        else if (titleClean.length >= 3 && posClean.includes(titleClean)) {
          score = 8;
        }

        if (score > bestScore) {
          bestScore = score;
          bestMatch = pos;
        }
      }

      // High confidence threshold: no guessing for official reports
      if (!bestMatch || bestScore < 5) return null;

      return {
        positionName: bestMatch.positionName,
        rank: bestMatch.rank || '—',
        fullName: bestMatch.positionHolder || '—',
        statisticalNumber: bestMatch.statisticalNumber || '—',
        positionStatus: bestMatch.positionStatus || '—',
        joinedDate: bestMatch.joinedDate ? new Date(bestMatch.joinedDate).toLocaleDateString('ar-EG') : '—',
        education: bestMatch.education || '—',
        notes: bestMatch.notes || '—',
      };
    }

    function mapPerformanceToAssessment(score: any): string {
      if (score === null || score === undefined) return '';
      const s = typeof score === 'string' ? parseFloat(score) : score;
      if (s >= 90) return 'جيد جداً';
      if (s >= 75) return 'جيد';
      if (s >= 60) return 'فوق الوسط';
      if (s >= 45) return 'وسط';
      return 'دون الوسط';
    }

    const sections: any[] = [];

    if (false && isEducational) {
      if (manualPositives.length > 0 || manualNegatives.length > 0 || manualImpediments.length > 0 || manualObstacles.length > 0) {
        sections.push({
          id: 'manual-notes',
          title: 'الملاحظات والمشاهدات العامة للجنة',
          visible: true,
          isManual: true,
          positivesList: manualPositives,
          negativesList: manualNegatives,
          impedimentsList: manualImpediments,
          obstaclesList: manualObstacles,
          showPositives: manualPositives.length > 0,
          showNegatives: manualNegatives.length > 0,
          showImpediments: manualImpediments.length > 0,
          showObstacles: manualObstacles.length > 0,
          narrativeText: '',
          numbering: '',
          officerInfo: null,
          assessment: null,
          detailsList: [],
          earnedSum: 0,
          maxSum: 0,
          isEmpty: false,
        });
      }
    } else {
      const allPositives = this.dedupeTexts([...manualPositives, ...checklistPositives]);
      const allNegatives = this.dedupeTexts([...manualNegatives, ...checklistNegatives]);
      const allImpediments = this.dedupeTexts([...manualImpediments, ...checklistImpediments]);
      const allObstacles = this.dedupeTexts([...manualObstacles, ...checklistObstacles]);
      const optionTypeLists = Object.values(checklistDynamicTypes)
        .map((item) => ({ ...item, items: this.dedupeTexts(item.items) }))
        .filter((item) => item.items.length > 0);

      if (allPositives.length > 0 || allNegatives.length > 0 || allImpediments.length > 0 || allObstacles.length > 0 || optionTypeLists.length > 0) {
        sections.push({
          id: 'manual-notes',
          title: 'الملاحظات والنتائج العامة للجنة التفتيشية',
          visible: true,
          isManual: true,
          positivesList: allPositives,
          negativesList: allNegatives,
          impedimentsList: allImpediments,
          obstaclesList: allObstacles,
          showPositives: allPositives.length > 0,
          showNegatives: allNegatives.length > 0,
          showImpediments: allImpediments.length > 0,
          showObstacles: allObstacles.length > 0,
          optionTypeLists,
          narrativeText: '',
          numbering: '',
          officerInfo: null,
          assessment: null,
          detailsList: [],
          earnedSum: 0,
          maxSum: 0,
          isEmpty: false,
        });
      }
    }

    const DEFAULT_PERSONNEL_SCHEMA = [
      { key: 'category', label: 'الفئة', type: 'text', required: true, role: 'label' },
      { key: 'nominal', label: 'الملاك', type: 'number', required: true, role: 'nominal' },
      { key: 'actual', label: 'الموجود', type: 'number', required: true, role: 'actual' },
      { key: 'deficit', label: 'النقص', type: 'number', required: false, role: 'deficit' },
      { key: 'increase', label: 'الزيادة', type: 'number', required: false, role: 'increase' },
      { key: 'percentage', label: 'النسبة %', type: 'percentage', required: false, role: 'percentage' },
    ];

    prunedTemplate.forEach((pri) => {
      const cleanPriTitle = pri.title.replace(/^[أ-ي]\.\s*/, '');

      const subsections = pri.secondaryCriteria.flatMap((sec: any) => {
        const cleanSecTitle = sec.title.replace(/^(أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً|حادي عشر|ثاني عشر|ثالث عشر|رابع عشر|خامس عشر|سادس عشر|سابع عشر|ثامن عشر|تاسع عشر|عشرون)\.\s*/, '');

        const instancesSet = secondaryInstancesMap.get(sec.id);
        const instancesList = [
          null,
          ...((instancesSet && instancesSet.size > 0) ? Array.from(instancesSet) : [])
        ];

        return instancesList.map((instName) => {
          const suffixKey = instName || 'default';

          let earnedSum = 0;
          let maxSum = 0;
          sec.details.forEach((det: any) => {
            const grade = gradesMap.get(`${det.id}_${suffixKey}`);
            earnedSum += grade ? (parseFloat(grade.gradeEarned) || 0) : 0;
            maxSum += parseFloat(det.maxGrade);
          });

          const detailsList = sec.details.map((det: any) => {
            const grade = gradesMap.get(`${det.id}_${suffixKey}`);
            const rawScore = grade ? (parseFloat(grade.gradeEarned) || 0) : 0;
            const scoreText = `${rawScore.toFixed(1)} من ${parseFloat(det.maxGrade).toFixed(1)}`;
            const noteText = grade && grade.notes ? ` - ملاحظة: ${grade.notes}` : '';
            return `${det.detailText}: الدرجة المستحصلة ${scoreText} درجة${noteText}`;
          });

          // Merge all findings into one narrative array, preserving option order
          const findings: string[] = [];
          sec.details.forEach((det: any) => {
            const grade = gradesMap.get(`${det.id}_${suffixKey}`);
            if (grade && grade.selectedOptions) {
              grade.selectedOptions.forEach((sel: any) => {
                findings.push(sel.option.optionText);
              });
            }
          });

          // Find which inspection evaluated this secondary criteria section instance
          let subInspection = targetInspections.find(i => i.entityId === campaign.entityId) || targetInspections[0];
          for (const det of sec.details) {
            const grade = gradesMap.get(`${det.id}_${suffixKey}`);
            if (grade) {
              const insp = targetInspections.find(i => i.id === grade.inspectionId);
              if (insp) {
                subInspection = insp;
                break;
              }
            }
          }
          const assessment = subInspection ? mapPerformanceToAssessment(subInspection.totalScore) : '';

          let officerInfo = null;
          if (subInspection?.officerCredentials) {
            try {
              const credentialsObj = typeof subInspection.officerCredentials === 'string'
                ? JSON.parse(subInspection.officerCredentials)
                : subInspection.officerCredentials;
              const key = `${sec.id}_${suffixKey}`;
              if (credentialsObj && credentialsObj[key]) {
                const oCred = credentialsObj[key];
                officerInfo = {
                  positionName: oCred.positionName || cleanSecTitle || '—',
                  rank: oCred.rank || '—',
                  fullName: oCred.name || '—',
                  statisticalNumber: oCred.statisticalNumber || '—',
                  positionStatus: oCred.positionStatus || 'اصالة',
                  joinedDate: oCred.joinedDate ? new Date(oCred.joinedDate).toLocaleDateString('ar-EG') : '—',
                  education: oCred.education || '—',
                  notes: oCred.notes || '—',
                };
              }
            } catch (err) {
              console.error("Error parsing officerCredentials from subInspection:", err);
            }
          }

          if (!officerInfo) {
            officerInfo = matchOfficerInfo(cleanSecTitle);
          }

          // Check for notes and meaningful quantitative data in any detail grade
          let hasNotes = false;
          let hasQuant = false;
          sec.details.forEach((det: any) => {
            const grade = gradesMap.get(`${det.id}_${suffixKey}`);
            if (grade) {
              if (grade.notes) hasNotes = true;
              if (hasMeaningfulQuantitativeData(grade.quantitativeData)) hasQuant = true;
            }
          });

          // Map detailedTables array specifically for this subsection instance
          const detailedTables: any[] = [];
          targetInspections.forEach((insp) => {
            if (!insp.grades) return;
            insp.grades.forEach((grade) => {
              const belongsToSec = sec.details.some((d: any) => d.id === grade.detailId);
              if (!belongsToSec) return;

              // Only pull tables that match the current instanceName
              const matchesInstance = (grade.instanceName || 'default') === suffixKey;
              if (!matchesInstance) return;

              const hasQuantData = hasMeaningfulQuantitativeData(grade.quantitativeData);
              const isDetailedTable = grade.criteriaDetail.inputType === 'detailed_table';

              if (hasQuantData || isDetailedTable) {
                const schema = grade.criteriaDetail.tableSchema
                  ? (typeof grade.criteriaDetail.tableSchema === 'string' ? JSON.parse(grade.criteriaDetail.tableSchema) : grade.criteriaDetail.tableSchema)
                  : DEFAULT_PERSONNEL_SCHEMA;

                let rawRows = [];
                if (grade.quantitativeData) {
                  const parsed = typeof grade.quantitativeData === 'string'
                    ? JSON.parse(grade.quantitativeData)
                    : grade.quantitativeData;
                  if (Array.isArray(parsed)) {
                    rawRows = parsed;
                  } else if (parsed && Array.isArray(parsed.rows)) {
                    rawRows = parsed.rows;
                  }
                }

                // Normalize row keys for backward compatibility
                const normalizedRows = rawRows.map((row: any) => {
                  const nominalCol = schema.find((c: any) => c.role === 'nominal');
                  const actualCol = schema.find((c: any) => c.role === 'actual');
                  const deficitCol = schema.find((c: any) => c.role === 'deficit');
                  const increaseCol = schema.find((c: any) => c.role === 'increase');
                  const percentageCol = schema.find((c: any) => c.role === 'percentage');

                  const nominalKey = nominalCol?.key || 'nominal';
                  const actualKey = actualCol?.key || 'actual';
                  const deficitKey = deficitCol?.key || 'deficit';
                  const increaseKey = increaseCol?.key || 'increase';
                  const percentageKey = percentageCol?.key || 'percentage';

                  const nominalVal = row[nominalKey] !== undefined ? row[nominalKey] : (row.authorized !== undefined ? row.authorized : (row.nominal || 0));
                  const actualVal = row[actualKey] !== undefined ? row[actualKey] : (row.present !== undefined ? row.present : (row.actual || 0));
                  const deficitVal = row[deficitKey] !== undefined ? row[deficitKey] : (row.shortage !== undefined ? row.shortage : Math.max(0, nominalVal - actualVal));
                  const increaseVal = row[increaseKey] !== undefined ? row[increaseKey] : (row.excess !== undefined ? row.excess : Math.max(0, actualVal - nominalVal));
                  const percentageVal = row[percentageKey] !== undefined ? row[percentageKey] : (row.percentage !== undefined ? row.percentage : (nominalVal > 0 ? Math.round((actualVal / nominalVal) * 100) : 0));

                  const normalized: Record<string, any> = { ...row };
                  normalized[nominalKey] = nominalVal;
                  normalized[actualKey] = actualVal;
                  normalized[deficitKey] = deficitVal;
                  normalized[increaseKey] = increaseVal;
                  normalized[percentageKey] = percentageVal;

                  return normalized;
                });

                detailedTables.push({
                  entityId: insp.entityId,
                  entityName: insp.entity?.name || 'غير معروف',
                  inspectionId: insp.id,
                  detailId: grade.detailId,
                  title: grade.criteriaDetail.detailText,
                  schema,
                  rows: normalizedRows,
                  visible: true,
                });
              }
            });
          });

          const fullTitle = instName ? `${cleanSecTitle} / ${instName}` : cleanSecTitle;

          return {
            id: instName ? `sec-${sec.id}-${instName}` : `sec-${sec.id}`,
            title: fullTitle,
            visible: true,
            detailsList,
            findings,
            officerInfo,
            assessment,
            showDetails: false,
            earnedSum,
            maxSum,
            isEmpty: findings.length === 0 && !(earnedSum > 0) && !hasNotes && !hasQuant && detailedTables.length === 0,
            hasQuantData: hasQuant || detailedTables.length > 0,
            detailedTables,
          };
        });
      });

      const visibleSubsections = subsections.filter((sub: any) => sub.visible !== false && !sub.isEmpty);

      if (visibleSubsections.length > 0) {
        sections.push({
          id: `pri-${pri.id}`,
          title: cleanPriTitle,
          visible: true,
          isManual: false,
          isEmpty: false,
          subsections: visibleSubsections,
        });
      }
    });

    // Filter positionsList to only include positions with actual inspection data
    const collectedPositions: any[] = [];
    const seenHolders = new Set<string>();

    const getOfficerKey = (fullName: string, statisticalNumber: string, positionName: string) => {
      const cleanName = (fullName || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const cleanStat = (statisticalNumber && statisticalNumber !== '—' && statisticalNumber !== 'غير متوفر') 
        ? statisticalNumber.replace(/\s+/g, '').trim().toLowerCase() 
        : '';
      const cleanPos = (positionName || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return `${cleanName}_${cleanStat}_${cleanPos}`;
    };

    // 1. Gather all positions from subsections (inspection data & officerInfo & officerCredentials)
    sections.forEach((sec: any) => {
      if (sec.subsections) {
        sec.subsections.forEach((sub: any) => {
          if (sub.officerInfo) {
            const oi = sub.officerInfo;
            const fullName = (oi.fullName || oi.name || '').trim();
            const statisticalNumber = (oi.statisticalNumber || '—').trim();
            
            if (fullName && fullName !== '—') {
              // Clean the position name
              const rawPosName = oi.positionName || sub.title || '—';
              const positionName = rawPosName.replace(/^(أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً|حادي عشر|ثاني عشر|ثالث عشر|رابع عشر|خامس عشر|سادس عشر|سابع عشر|ثامن عشر|تاسع عشر|عشرون)\.\s*/, '').trim();

              const key = getOfficerKey(fullName, statisticalNumber, positionName);
              if (!seenHolders.has(key)) {
                seenHolders.add(key);
                collectedPositions.push({
                  id: `col-${Date.now()}-${Math.random()}`,
                  positionName,
                  rank: oi.rank || '—',
                  positionHolder: fullName,
                  statisticalNumber,
                  joinedDate: oi.joinedDate || '—',
                  positionStatus: oi.positionStatus || 'اصالة',
                  education: oi.education || '—',
                  notes: oi.notes || '—',
                });
              }
            }
          }
        });
      }
    });

    // 2. Merge with campaign member names and other positions from allPositions matching the campaign
    const campaignMemberNames = new Set(
      campaign.members.map((m) => m.inspector.fullName.trim().toLowerCase())
    );
    if (campaign.leader) campaignMemberNames.add(campaign.leader.fullName.trim().toLowerCase());
    if (campaign.deputy) campaignMemberNames.add(campaign.deputy.fullName.trim().toLowerCase());

    const nonEmptySectionTitles = new Set<string>();
    sections.forEach((sec: any) => {
      if (sec.subsections) {
        sec.subsections.forEach((sub: any) => {
          if (!sub.isEmpty && sub.title) {
            nonEmptySectionTitles.add(sub.title.trim().toLowerCase());
          }
        });
      }
    });

    allPositions.forEach((pos) => {
      const holderName = (pos.positionHolder || '').trim();
      if (!holderName || holderName === '—') return;

      const posName = pos.positionName.trim().toLowerCase();
      const cleanHolderName = holderName.toLowerCase();
      const matchesSection = Array.from(nonEmptySectionTitles).some((title) =>
        posName.includes(title) || title.includes(posName.replace('مدير ', '').replace('قسم ', '').trim())
      );
      const isCampaignMember = campaignMemberNames.has(cleanHolderName);

      if (matchesSection || isCampaignMember) {
        const key = getOfficerKey(holderName, pos.statisticalNumber || '', pos.positionName);
        if (!seenHolders.has(key)) {
          seenHolders.add(key);
          collectedPositions.push({
            id: pos.id,
            positionName: pos.positionName,
            rank: pos.rank || '—',
            positionHolder: holderName,
            statisticalNumber: pos.statisticalNumber || '—',
            joinedDate: pos.joinedDate ? new Date(pos.joinedDate).toLocaleDateString('ar-EG') : '—',
            positionStatus: pos.positionStatus || '—',
            education: pos.education || '—',
            notes: pos.notes || '—',
          });
        }
      }
    });

    const filteredPositionsList = collectedPositions;

    // DEBUG: Log section visibility for every section/subsection
    sections.forEach((sec: any) => {
      if (sec.subsections) {
        sec.subsections.forEach((sub: any, subIdx: number) => {
          this.logger.warn(
            `[SECTION DEBUG] section="${sec.title}" subsection="${sub.title}" ` +
            `findings=${sub.findings?.length || 0} ` +
            `earnedSum=${sub.earnedSum} ` +
            `hasNotes=${sub.detailsList?.some((d: string) => d.includes('ملاحظة:')) || false} ` +
            `hasQuant=${sub.hasQuantData === true} ` +
            `isEmpty=${sub.isEmpty} ` +
            `officerInfo=${!!sub.officerInfo} ` +
            `visible=${sub.visible} ` +
            `willRender=${sub.visible && !sub.isEmpty}`
          );
        });
        this.logger.warn(
          `[SECTION DEBUG] PRIMARY section="${sec.title}" ` +
          `nonEmptySubs=${sec.subsections.filter((s: any) => !s.isEmpty).length}/${sec.subsections.length} ` +
          `isEmpty=${sec.isEmpty} ` +
          `visible=${sec.visible} ` +
          `willRender=${sec.visible && !sec.isEmpty}`
        );
      }
    });

    const recommendations = campaign.recommendations
      .filter((r) => !r.parentRecId)
      .map((auth) => {
        const level1 = campaign.recommendations
          .filter((r) => r.parentRecId === auth.id)
          .map((rec) => {
            const level2 = campaign.recommendations
              .filter((r) => r.parentRecId === rec.id)
              .map((sub) => ({
                id: sub.id,
                text: sub.recommendationText,
              }));
            return {
              id: rec.id,
              text: rec.recommendationText,
              children: level2,
            };
          });
        return {
          id: auth.id,
          authority: auth.authorityName,
          visible: true,
          recs: level1,
        };
      });

    const appendices = campaign.appendices.map((app) => ({
      id: app.id,
      symbol: app.symbol,
      text: app.text,
      visible: true,
    }));
    const finalEvaluation = this.calculateFinalEvaluationFromInspections(campaign);

    return {
      isEducation: isEducational,
      campaignName: campaign.name,
      formationNumber: campaign.formationNumber || '',
      targetEntityName: campaign.entity?.name,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      assignmentReference: campaign.assignmentReference,
      assignmentDate: campaign.assignmentDate,
      evaluations,
      finalEvaluation,
      title: isEducational
        ? `تقرير تفتيش المنطقة الأمنية (${zoneName}) لقيادة شرطة محافظة (${governorate})`
        : `تقرير تفتيش رسمي موحد للجنة التفتيشية`,
      assignmentText: campaign.assignmentText || `تنفيذاً لأمـــر السيد الـــــوزير المحترم وبنـــاءً على مــــــا جـــــــاء بكتـــاب مكتب الــــوزير ذي العدد (ش/أ.س ${campaign.assignmentReference}) في ${new Date(campaign.assignmentDate).toLocaleDateString('ar-EG')}.`,
      committeeMembers,
      purposeText: campaign.purpose || (isEducational
        ? `اجراء التفتيش التعليمي للمنطقة الأمنية (${zoneName}) في قيادة شرطة محافظة (${governorate}) لغرض بسط الأمن وفرض القانون وفقاً للمعايير الموحدة لتفتيش التشكيلات والمناطق الأمنية في اطار تطوير الأداء المؤسسي لوزارة الداخلية، والوقوف على كافة متطلبات القيادة والسيطرة والانفتاح لكافة الأجهزة الأمنية العائدة لوزارتنا التي تقع ضمن أمرة المنطقة الأمنية المعنية.`
        : `الوقوف على الجاهزية القتالية والأداء الإداري والعمل التنظيمي والمهني للكيان المفتش وتحديد الثغرات ونقاط القوة والضعف وأسلوب معالجتها.`),
      durationText: `للفترة مـــــــــــــن تـــــــــــــــــاريخ ${new Date(campaign.startDate).toLocaleDateString('ar-EG')} لغـــــــــــــــــــاية ${campaign.endDate ? new Date(campaign.endDate).toLocaleDateString('ar-EG') : 'إتمام مهام التفتيش'}.`,
      positions: filteredPositionsList,
      personnelRows,
      sections,
      recommendations,
      appendices,
      signatures: {
        leaderName,
        deputyName: 'عاطف عبد الحسين راضي',
        leaderRank: '',
        deputyRank: 'الفريق الحقوقي المفتش',
        leaderRole: 'رئيس اللجنة',
        deputyRole: 'رئيس هيئة تفتيش قوى الامن الداخلي',
        leaderDate: '٢٠٢٦/ /',
        deputyDate: '٢٠٢٦/ /',
        showMinisterSign: true,
        ministerTitle: 'اصادق اصوليا',
        ministerName: 'وزيـــــــر الداخلية',
        ministerDate: '٢٠٢٦/    / ',
      },
      formatting: DEFAULT_FORMATTING_CONFIG,
    };
  }

  generateHtmlFromPayload(payload: any): string {
    const isEducational = payload.isEducation;
    const formatting = payload.formatting || DEFAULT_FORMATTING_CONFIG;
    const sections = payload.sections || [];
    const finalEvaluationStatement = payload.finalEvaluation?.statement || '';
    const finalEvaluationSectionNumHtml = finalEvaluationStatement
      ? `<div class="section-num page-break-inside-avoid">${getLevel1Number(10, formatting)} ${finalEvaluationStatement}</div>`
      : '';
    const finalEvaluationSectionTitleHtml = finalEvaluationStatement
      ? `<div class="section-title page-break-inside-avoid">${getLevel1Number(10, formatting)} ${finalEvaluationStatement}</div>`
      : '';
    const manualObservationSection = sections.find((sec: any) => sec.isManual);
    const renderObservationItems = (items: string[] = []) => items.length > 0
      ? items.map((text: string, idx: number) => `
        <div style="margin-right: ${getIndentation(3, formatting)}; margin-bottom: 6px; font-size: 13.5px; text-align: justify;">
          ${getLevel3Ordinal(idx + 1, formatting)} ${text}
        </div>
      `).join('')
      : `<div style="margin-right: ${getIndentation(3, formatting)}; margin-bottom: 6px; font-size: 13.5px; color: #718096;">لا توجد ملاحظات ضمن هذا التصنيف.</div>`;
    const officialObservationsHtml = `
      <div class="section-num page-break-inside-avoid">${getLevel1Number(8, formatting)} الملاحظات</div>
      <div class="section-body page-break-inside-avoid">
        <div style="font-weight: bold; margin-top: 12px; font-size: 14px; margin-right: ${getIndentation(2, formatting)};">
          ${getLevel2ArabicLetter(1, formatting)} الإيجابيات
        </div>
        ${renderObservationItems(manualObservationSection?.positivesList || [])}

        <div style="font-weight: bold; margin-top: 12px; font-size: 14px; margin-right: ${getIndentation(2, formatting)};">
          ${getLevel2ArabicLetter(2, formatting)} السلبيات
        </div>
        ${renderObservationItems(manualObservationSection?.negativesList || [])}

        <div style="font-weight: bold; margin-top: 12px; font-size: 14px; margin-right: ${getIndentation(2, formatting)};">
          ${getLevel2ArabicLetter(3, formatting)} المعوقات
        </div>
        ${renderObservationItems(manualObservationSection?.impedimentsList || [])}

        <div style="font-weight: bold; margin-top: 12px; font-size: 14px; margin-right: ${getIndentation(2, formatting)};">
          ${getLevel2ArabicLetter(4, formatting)} المعاضل
        </div>
        ${renderObservationItems(manualObservationSection?.obstaclesList || [])}
      </div>
    `;
    const officialRecommendationsHtml = `
      <div class="section-num page-break-inside-avoid">${getLevel1Number(9, formatting)} التوصيات</div>
      <div class="section-body page-break-inside-avoid">
        ${payload.recommendations && payload.recommendations.length > 0 ? `
          ${payload.recommendations.filter((r: any) => r.visible).map((recGroup: any, idx: number) => `
            <div style="font-weight: bold; margin-top: 15px; font-size: 14px; margin-right: ${getIndentation(2, formatting)};">
              ${getLevel2ArabicLetter(idx + 1, formatting)} ${recGroup.authority}
            </div>
            <div style="margin-right: ${getIndentation(3, formatting)};">
              ${recGroup.recs && recGroup.recs.length > 0 ? recGroup.recs.map((rec: any, recIdx: number) => `
                <div style="margin-bottom: 8px;">
                  <div style="margin-bottom: 4px; font-size: 13.5px; font-weight: 500;">
                    ${getLevel3Ordinal(recIdx + 1, formatting).replace('.', ':')} ${rec.text}
                  </div>
                  ${rec.children && rec.children.length > 0 ? `
                    <div style="margin-right: ${getIndentation(4, formatting)}; display: flex; flex-direction: column; gap: 4px;">
                      ${rec.children.map((child: any) => `
                        <div style="font-size: 13px; color: #4a5568;">• ${child.text}</div>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              `).join('') : `<div style="font-size: 13.5px; color: #718096; font-style: italic; margin-bottom: 10px;">لا توجد توصيات مدخلة تحت هذه الجهة.</div>`}
            </div>
          `).join('')}
        ` : `<div style="margin-right: ${getIndentation(2, formatting)}; font-size: 13.5px; color: #718096;">لا توجد توصيات مدخلة.</div>`}
      </div>
    `;

    // Load ministry logo from static path to base64 if available
    let logoBase64 = '';
    try {
      const logoPath = path.join(__dirname, '..', '..', 'uploads', 'system', 'ministry-logo.png');
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
      }
    } catch (e) {
      console.error('Failed to load logo in PDF generation', e);
    }

    let detailSectionHtml = '';

    // Level 2 (Primary Categories) Indexing
    let level2Idx = 1;

    const visibleSections = sections.filter((sec: any) => !sec.isManual && sec.visible && !sec.isEmpty);
    if (visibleSections.length === 0) {
      detailSectionHtml += `
        <div style="text-align: center; padding: 40px; margin-top: 30px; border: 2px dashed #cbd5e0; border-radius: 8px; background-color: #fafbfc; font-size: 15px; color: #c53030; font-family: 'Cairo', sans-serif; font-weight: bold; direction: rtl;">
          ⚠️ لا توجد أسس مرتبطة بهذا القالب التفتيشي
        </div>
      `;
    }

    sections.forEach((sec: any) => {
      if (sec.isManual) return;
      if (!sec.visible || sec.isEmpty) return;

      const priTitlePrefix = sec.numbering ? sec.numbering : getLevel2ArabicLetter(level2Idx++, formatting);
      const priTitleFormatted = `${priTitlePrefix} ${sec.title}`;

      let sectionNarrativeHtml = '';
      if (sec.narrativeText) {
        sectionNarrativeHtml = `
          <div style="margin-right: ${getIndentation(3, formatting)}; margin-bottom: 10px; font-size: 13.5px; white-space: pre-line; text-align: justify;">
            ${sec.narrativeText}
          </div>
        `;
      }

      detailSectionHtml += `
        <div class="page-break-inside-avoid" style="margin-top: 25px; margin-right: ${getIndentation(2, formatting)};">
          <div style="font-weight: bold; font-size: 15px; color: #0c2340; border-bottom: 1.5px solid #0c2340; padding-bottom: 3px; margin-bottom: 10px;">
            ${priTitleFormatted}
          </div>
          ${sectionNarrativeHtml}
      `;

      if (sec.isManual) {
        let catIdx = 1;

        if (sec.showPositives && sec.positivesList?.length > 0) {
          detailSectionHtml += `
            <div style="font-weight: bold; font-size: 14px; color: #1a5235; margin-right: ${getIndentation(3, formatting)}; margin-top: 12px; margin-bottom: 6px;">
              ${getLevel3Ordinal(catIdx++, formatting)} الإيجابيات وعوامل القوة العامة:
            </div>`;
          sec.positivesList.forEach((text: string, idx: number) => {
            detailSectionHtml += `
              <div style="margin-right: ${getIndentation(4, formatting)}; font-size: 13.5px; margin-bottom: 4px; text-align: justify;">
                ${getLevel5ArabicLetter(idx + 1, formatting)} ${text}
              </div>`;
          });
        }

        if (sec.showNegatives && sec.negativesList?.length > 0) {
          detailSectionHtml += `
            <div style="font-weight: bold; font-size: 14px; color: #742a2a; margin-right: ${getIndentation(3, formatting)}; margin-top: 12px; margin-bottom: 6px;">
              ${getLevel3Ordinal(catIdx++, formatting)} السلبيات ونقاط التقصير العامة:
            </div>`;
          sec.negativesList.forEach((text: string, idx: number) => {
            detailSectionHtml += `
              <div style="margin-right: ${getIndentation(4, formatting)}; font-size: 13.5px; margin-bottom: 4px; text-align: justify;">
                ${getLevel5ArabicLetter(idx + 1, formatting)} ${text}
              </div>`;
          });
        }

        if (sec.showImpediments && sec.impedimentsList?.length > 0) {
          detailSectionHtml += `
            <div style="font-weight: bold; font-size: 14px; color: #7b341e; margin-right: ${getIndentation(3, formatting)}; margin-top: 12px; margin-bottom: 6px;">
              ${getLevel3Ordinal(catIdx++, formatting)} المعوقات العامة:
            </div>`;
          sec.impedimentsList.forEach((text: string, idx: number) => {
            detailSectionHtml += `
              <div style="margin-right: ${getIndentation(4, formatting)}; font-size: 13.5px; margin-bottom: 4px; text-align: justify;">
                ${getLevel5ArabicLetter(idx + 1, formatting)} ${text}
              </div>`;
          });
        }

        if (sec.showObstacles && sec.obstaclesList?.length > 0) {
          detailSectionHtml += `
            <div style="font-weight: bold; font-size: 14px; color: #5a3e2b; margin-right: ${getIndentation(3, formatting)}; margin-top: 12px; margin-bottom: 6px;">
              ${getLevel3Ordinal(catIdx++, formatting)} المعاضل العامة:
            </div>`;
          sec.obstaclesList.forEach((text: string, idx: number) => {
            detailSectionHtml += `
              <div style="margin-right: ${getIndentation(4, formatting)}; font-size: 13.5px; margin-bottom: 4px; text-align: justify;">
                ${getLevel5ArabicLetter(idx + 1, formatting)} ${text}
              </div>`;
          });
        }

        // Fallback for old saved data with only findings (pre-schema-migration)
        if (!sec.positivesList && sec.findings && sec.findings.length > 0) {
          sec.findings.forEach((text: string, idx: number) => {
            const findingNum = getLevel3Ordinal(idx + 1, formatting);
            detailSectionHtml += `
              <div style="margin-right: ${getIndentation(3, formatting)}; font-size: 13.5px; margin-bottom: 6px; text-align: justify;">
                ${findingNum} ${text}
              </div>
            `;
          });
        }
      } else if (sec.subsections) {
        // Template section: each subsection is an officer position with narrative findings
        let secOrdinalIdx = 1;
        sec.subsections.forEach((sub: any) => {
          if (!sub.visible || sub.isEmpty) return;

          // Helper to convert to Eastern Arabic digits
          const toAr = (n: number) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)]);

          // Render subsection title as officer position heading
          const subTitlePrefix = sub.numbering ? sub.numbering : getLevel3Ordinal(secOrdinalIdx++, formatting);
          detailSectionHtml += `
            <div class="page-break-inside-avoid" style="margin-top: 18px; margin-right: ${getIndentation(3, formatting)};">
              <div style="font-weight: bold; font-size: 14px; color: #1a202c; margin-bottom: 10px; border-right: 3px solid #0c2340; padding-right: 8px;">
                ${subTitlePrefix} ${sub.title}
              </div>
          `;

          // Build all numbered items in one unified list
          let itemIdx = 1;

          // Officer info items: (١)(٢)(٣)(٤)
          if (sub.officerInfo) {
            const oi = sub.officerInfo;
            const oiItems: string[] = [
              `الرتبة والاسم الكامل / ${oi.rank} ${oi.fullName}.`,
              `الرقم الإحصائي/ (${oi.statisticalNumber}).`,
              `تاريخ استلام المنصب/ ${oi.joinedDate} (${oi.positionStatus}).`,
            ];
            if (oi.education && oi.education !== '—') {
              oiItems.push(`التحصيل الدراسي/ ${oi.education}.`);
            }
            oiItems.forEach(text => {
              detailSectionHtml += `
                <div style="margin-right: ${getIndentation(4, formatting)}; font-size: 13.5px; margin-bottom: 5px; display: flex; gap: 6px; line-height: 1.8;">
                  <span style="font-weight: bold; min-width: 30px; color: #0c2340;">(${toAr(itemIdx++)})</span>
                  <span>${text}</span>
                </div>
              `;
            });
          }

          // Findings items: continue numbering
          if (sub.findings && sub.findings.length > 0) {
            sub.findings.forEach((text: string) => {
              detailSectionHtml += `
                <div style="margin-right: ${getIndentation(4, formatting)}; font-size: 13.5px; margin-bottom: 5px; display: flex; gap: 6px; text-align: justify; line-height: 1.8;">
                  <span style="font-weight: bold; min-width: 30px; color: #0c2340;">(${toAr(itemIdx++)})</span>
                  <span>${text}</span>
                </div>
              `;
            });
          }

          // Narrative text if any
          if (sub.narrativeText) {
            detailSectionHtml += `
              <div style="margin-right: ${getIndentation(4, formatting)}; font-size: 13px; margin-top: 6px; white-space: pre-line; color: #4a5568; text-align: justify;">
                ${sub.narrativeText}
              </div>
            `;
          }

          if (sub.detailedTables && sub.detailedTables.length > 0) {
            sub.detailedTables.forEach((table: any) => {
              detailSectionHtml += `
                <div class="page-break-inside-avoid" style="margin-top: 15px; margin-bottom: 20px; margin-right: ${getIndentation(4, formatting)};">
                  <div style="font-weight: bold; font-size: 13px; color: #0c2340; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    <span>📊 ${table.title}</span>
                    <span style="font-size: 11px; font-weight: normal; color: #718096; margin-right: auto;">(${table.entityName})</span>
                  </div>
                  <div style="overflow-x: auto; width: 100%;">
                    <table class="military-table" style="margin: 5px 0 10px 0; width: 100%; border-collapse: collapse;">
                      <thead>
                        <tr style="background-color: #f2f2f2;">
                          ${table.schema.map((col: any) => `
                            <th style="padding: 6px 8px; border: 1px solid #000000; font-weight: bold; text-align: center; font-size: 12px;">
                              ${col.label}
                            </th>
                          `).join('')}
                        </tr>
                      </thead>
                      <tbody>
                        ${table.rows.map((row: any) => `
                          <tr>
                            ${table.schema.map((col: any) => {
                const cellVal = row[col.key] !== undefined ? row[col.key] : '';
                const isPercentage = col.role === 'percentage';
                const formattedVal = isPercentage ? `${cellVal}%` : cellVal;

                let textColor = '#000000';
                if (col.role === 'deficit' && Number(cellVal) > 0) textColor = '#c53030';
                if (col.role === 'increase' && Number(cellVal) > 0) textColor = '#2b6cb0';

                const isBold = col.role === 'label' || col.role === 'percentage' || col.role === 'deficit' || col.role === 'increase';
                const fontWeight = isBold ? 'bold' : 'normal';

                return `
                                <td style="padding: 6px; border: 1px solid #000000; text-align: center; font-size: 12px; color: ${textColor}; font-weight: ${fontWeight};">
                                  ${formattedVal}
                                </td>
                              `;
              }).join('')}
                          </tr>
                        `).join('')}
                        ${table.rows.length === 0 ? `<tr><td colspan="${table.schema.length}" style="padding: 10px; color: #a0aec0; text-align: center;">لا توجد سجلات.</td></tr>` : ''}
                      </tbody>
                    </table>
                  </div>
                </div>
              `;
            });
          }

          detailSectionHtml += `</div>`; // Close subsection
        });
      }


      detailSectionHtml += `</div>`; // Close section
    });

    let mainContentHtml = '';

    if (isEducational) {
      mainContentHtml = `
        <table style="width: 100%; border-collapse: collapse; border: none; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 15px;">
          <tr>
            <td style="width: 35%; border: none; font-size: 13.5px; font-weight: bold; text-align: right; vertical-align: middle; line-height: 1.5; font-family: 'Cairo', sans-serif;">
              جمهورية العراق<br />
              وزارة الداخلية<br />
              هيئة تفتيش قوى الامن الداخلي
            </td>
            <td style="width: 30%; border: none; text-align: center; vertical-align: middle;">
              ${logoBase64 ? `<img src="${logoBase64}" alt="وزارة الداخلية" style="height: 85px; width: auto;" />` : ''}
            </td>
            <td style="width: 35%; border: none; font-size: 13.5px; text-align: left; direction: rtl; vertical-align: middle; line-height: 1.6; font-weight: bold; font-family: 'Cairo', sans-serif;">
              <div>التاريخ: ${payload.startDateText || (payload.startDate ? new Date(payload.startDate).toLocaleDateString('ar-EG') : '—')}</div>
              <div style="margin-top: 5px;">العدد: ${payload.formationNumber || '—'}</div>
            </td>
          </tr>
        </table>

        <div class="report-title">
          ${payload.title}
        </div>

        <div class="section-num">${getLevel1Number(1, formatting)} التكلـــــيف</div>
        <div class="section-body">
          ${payload.assignmentText}
        </div>

        <div class="section-num">${getLevel1Number(2, formatting)} التــــأليف</div>
        <div class="section-body">
          <table style="width: 100%; max-width: 650px; border-collapse: collapse; border: none; margin-top: 10px;">
            <tbody>
              ${payload.committeeMembers.map((member: string) => {
        const parsed = parseCommitteeMember(member);
        return `
                  <tr>
                    <td style="border: none; padding: 4px 0; font-size: 15px; width: 60%; text-align: right;">${parsed.name}</td>
                    <td style="border: none; padding: 4px 0; font-size: 15px; width: 40%; text-align: right;">${parsed.role}</td>
                  </tr>
                `;
      }).join('')}
            </tbody>
          </table>
        </div>

        <div class="section-num">${getLevel1Number(3, formatting)} الغــــاية</div>
        <div class="section-body">
          ${payload.purposeText}
        </div>

        <div class="section-num">${getLevel1Number(4, formatting)} تاريخ التفتيش</div>
        <div class="section-body">
          ${payload.durationText}
        </div>

        <div class="section-num page-break-inside-avoid">${getLevel1Number(5, formatting)} جدول المدراء والآمرين وشاغلي المناصب الأساسية</div>
        <div class="section-body page-break-inside-avoid">
          <table class="military-table">
            <thead>
              <tr>
                <th style="width: 5%">ت</th>
                <th style="width: 20%">المنصب</th>
                <th style="width: 10%">الرتبة</th>
                <th style="width: 15%">الاسم الكامل</th>
                <th style="width: 10%">الرقم الإحصائي</th>
                <th style="width: 15%">تاريخ إشغال المنصب</th>
                <th style="width: 10%">نوع الإشغال</th>
                <th style="width: 10%">التحصيل الدراسي</th>
                <th style="width: 15%">الملاحظات</th>
              </tr>
            </thead>
            <tbody>
              ${payload.positions.map((pos: any, idx: number) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td><strong>${pos.positionName}</strong></td>
                  <td>${pos.rank}</td>
                  <td>${pos.positionHolder}</td>
                  <td>${pos.statisticalNumber}</td>
                  <td>${pos.joinedDate}</td>
                  <td>${pos.positionStatus}</td>
                  <td>${pos.education}</td>
                  <td>${pos.notes}</td>
                </tr>
              `).join('')}
              ${payload.positions.length === 0 ? '<tr><td colspan="9">لم يتم العثور على سجلات المدراء والآمرين للكيان.</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        ${payload.personnelRows && payload.personnelRows.length > 0 ? `
          <div class="section-num page-break-inside-avoid">${getLevel1Number(6, formatting)} المواقف الرسمية ونسب التكامل الفعلي</div>
          <div class="section-body page-break-inside-avoid">
            <table class="military-table">
              <thead>
                <tr>
                  <th>الفئة</th>
                  <th>الملاك</th>
                  <th>الموجود</th>
                  <th>الزيادة</th>
                  <th>النقص</th>
                  <th>نسبة التكامل</th>
                </tr>
              </thead>
              <tbody>
                ${payload.personnelRows.map((row: any) => `
                  <tr>
                    <td><strong>${row.category}</strong></td>
                    <td>${row.nominal}</td>
                    <td>${row.actual}</td>
                    <td>${row.increase}</td>
                    <td>${row.deficit}</td>
                    <td><strong>${parseFloat(row.percentage).toFixed(1)}%</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        <div class="page-break"></div>

        <div class="section-num">${getLevel1Number(7, formatting)} تفاصيل التفتيش</div>
        <div class="section-body">
          ${detailSectionHtml}
        </div>

        ${officialObservationsHtml}

        ${officialRecommendationsHtml}

        ${finalEvaluationSectionNumHtml}

        ${false && payload.recommendations && payload.recommendations.some((r: any) => r.visible && r.recs.length > 0) ? `
          <div class="section-num page-break-inside-avoid">${getLevel1Number(8, formatting)} التوصيات والمقترحات المرفوعة للمصادقة</div>
          <div class="section-body page-break-inside-avoid">
            ${payload.recommendations.filter((r: any) => r.visible).map((recGroup: any, idx: number) => `
              <div style="font-weight: bold; margin-top: 15px; font-size: 14px; margin-right: ${getIndentation(2, formatting)};">
                ${getLevel2ArabicLetter(idx + 1, formatting)} الموجهة إلى (${recGroup.authority}):
              </div>
              <div style="margin-right: ${getIndentation(3, formatting)};">
                ${recGroup.recs.map((r: string, rIdx: number) => `
                  <div style="margin-bottom: 6px; font-size: 13.5px;">${getLevel3Ordinal(rIdx + 1, formatting)} ${r}</div>
                `).join('')}
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${payload.appendices && payload.appendices.some((a: any) => a.visible) ? `
          <div class="page-break"></div>
          <div class="section-num">${getLevel1Number(11, formatting)} ملاحق التقرير التفتيشي</div>
          <div class="section-body">
            ${payload.appendices.filter((a: any) => a.visible).map((app: any, idx: number) => `
              <div class="page-break-inside-avoid" style="margin-bottom: 20px; margin-right: ${getIndentation(2, formatting)};">
                <div style="font-weight: bold; color: #0c2340; border-bottom: 1px dashed #cbd5e0; padding-bottom: 3px; margin-bottom: 8px;">
                  ${getLevel2ArabicLetter(idx + 1, formatting)} ملحق (${app.symbol})
                </div>
                <div style="white-space: pre-line; font-size: 13px;">${app.text}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <br><br>
        <div class="signatures-container page-break-inside-avoid" style="margin-top: 40px; font-family: 'Cairo', sans-serif;">
          ${(payload.signatures?.showMinisterSign !== false) ? `
            <div style="display: flex; justify-content: flex-end; margin-bottom: 25px; padding-left: 5%;">
              <div style="text-align: center; width: 45%;">
                <p style="margin: 0 0 5px 0;"><strong>${payload.signatures?.ministerTitle || 'اصادق اصوليا'}</strong></p>
                <p style="margin: 0 0 5px 0; font-size: 15px;"><strong>${payload.signatures?.ministerName || 'وزيـــــــر الداخلية'}</strong></p>
                <p style="margin: 0; font-size: 12px; color: #4a5568;"><span dir="ltr" style="direction: ltr; display: inline-block;">${payload.signatures?.ministerDate || '٢٠٢٦/  / '}</span></p>
              </div>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-around; width: 100%;">
            <!-- Right Column: Leader -->
            <div class="signature-box" style="text-align: center; width: 45%;">
              <div style="height: 35px;"></div>
              <p style="margin: 0 0 5px 0;"><strong>${payload.signatures?.leaderRank || '&nbsp;'}</strong></p>
              <p style="margin: 0 0 5px 0;">${payload.signatures?.leaderName || ''}</p>
              <p style="margin: 0 0 5px 0;"><strong>${payload.signatures?.leaderRole || 'رئيس اللجنة'}</strong></p>
              <p style="margin: 0; font-size: 11px; color: #4a5568;"><span dir="ltr" style="direction: ltr; display: inline-block;">${payload.signatures?.leaderDate || ''}</span></p>
            </div>
            <!-- Left Column: Deputy -->
            <div class="signature-box" style="text-align: center; width: 45%;">
              <div style="height: 35px;"></div>
              <p style="margin: 0 0 5px 0;"><strong>${payload.signatures?.deputyRank || '&nbsp;'}</strong></p>
              <p style="margin: 0 0 5px 0;">${payload.signatures?.deputyName || ''}</p>
              <p style="margin: 0 0 5px 0;"><strong>${payload.signatures?.deputyRole || 'رئيس هيئة تفتيش قوى الامن الداخلي'}</strong></p>
              <p style="margin: 0; font-size: 11px; color: #4a5568;"><span dir="ltr" style="direction: ltr; display: inline-block;">${payload.signatures?.deputyDate || ''}</span></p>
            </div>
          </div>
        </div>
      `;
    } else {
      const manualSection = payload.sections.find((s: any) => s.isManual);
      const htmlManualPositives = (manualSection?.positivesList || []);
      const htmlManualNegatives = (manualSection?.negativesList || []);
      const htmlManualImpediments = (manualSection?.impedimentsList || []);
      const htmlManualObstacles = (manualSection?.obstaclesList || []);
      const htmlShowPositives = manualSection?.showPositives !== false && htmlManualPositives.length > 0;
      const htmlShowNegatives = manualSection?.showNegatives !== false && htmlManualNegatives.length > 0;
      const htmlShowImpediments = manualSection?.showImpediments !== false && htmlManualImpediments.length > 0;
      const htmlShowObstacles = manualSection?.showObstacles !== false && htmlManualObstacles.length > 0;
      // Fallback for old data: use findings as positives if no categorized lists exist
      const htmlOldFindings = (!htmlManualPositives.length && !htmlManualNegatives.length && !htmlManualImpediments.length && !htmlManualObstacles.length && manualSection?.findings?.length)
        ? manualSection.findings : [];

      mainContentHtml = `
        <table style="width: 100%; border-collapse: collapse; border: none; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 15px;">
          <tr>
            <td style="width: 35%; border: none; font-size: 13.5px; font-weight: bold; text-align: right; vertical-align: middle; line-height: 1.5; font-family: 'Cairo', sans-serif;">
              جمهورية العراق<br />
              وزارة الداخلية<br />
              هيئة تفتيش قوى الامن الداخلي
            </td>
            <td style="width: 30%; border: none; text-align: center; vertical-align: middle;">
              ${logoBase64 ? `<img src="${logoBase64}" alt="وزارة الداخلية" style="height: 85px; width: auto;" />` : ''}
            </td>
            <td style="width: 35%; border: none; font-size: 13.5px; text-align: left; direction: rtl; vertical-align: middle; line-height: 1.6; font-weight: bold; font-family: 'Cairo', sans-serif;">
              <div>التاريخ: ${payload.startDateText || (payload.startDate ? new Date(payload.startDate).toLocaleDateString('ar-EG') : '—')}</div>
              <div style="margin-top: 5px;">العدد: ${payload.formationNumber || '—'}</div>
            </td>
          </tr>
        </table>

        <div class="report-title">
          ${payload.title}
        </div>

        <div class="section-title">${getLevel1Number(1, formatting)} المعلومات الأساسية للحملة التفتيشية</div>
        <table class="meta-table">
          <tr>
            <td class="meta-title">اسم الحملة التفتيشية</td>
            <td>${payload.campaignName || ''}</td>
          </tr>
          <tr>
            <td class="meta-title">الأمر الإداري المكلف</td>
            <td>كتاب رقم ${payload.assignmentReference || ''} في ${payload.assignmentDate ? new Date(payload.assignmentDate).toLocaleDateString('ar-EG') : ''}</td>
          </tr>
          <tr>
            <td class="meta-title">الكيان المستهدف الرئيسي</td>
            <td>${payload.targetEntityName || ''}</td>
          </tr>
          <tr>
            <td class="meta-title">رئيس اللجنة التفتيشية</td>
            <td>${payload.signatures.leaderName}</td>
          </tr>
          <tr>
            <td class="meta-title">معاون رئيس اللجنة / المقرر</td>
            <td>${payload.signatures.deputyName}</td>
          </tr>
        </table>

        <div class="section-title">${getLevel1Number(2, formatting)} جدول تقييم الأداء الميداني للكيانات المفتشة</div>
        <table class="meta-table" style="text-align: center;">
          <thead>
            <tr style="background-color: #f2f2f2; font-weight: bold;">
              <td>ت</td>
              <td>الكيان المفتش</td>
              <td>الموقع الجغرافي</td>
              <td>النسبة المستحصلة</td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>${payload.targetEntityName || ''}</td>
              <td>مقر الكيان</td>
              <td>100.0%</td>
            </tr>
          </tbody>
        </table>

        ${(htmlShowPositives || htmlShowNegatives || htmlShowImpediments || htmlShowObstacles || htmlOldFindings.length > 0) ? `
        <div class="section-title">${getLevel1Number(3, formatting)} ${manualSection?.title || 'الملاحظات والنتائج العامة للجنة التفتيشية'}</div>
        <div style="margin-right: 15px;">
          ${htmlShowPositives ? `
            <div style="font-weight: bold; color: #0c2340; margin-top: 15px;">
              ${getLevel2ArabicLetter(1, formatting)} الإيجابيات ورصد كفاءة الأداء:
            </div>
            ${htmlManualPositives.map((note: string, idx: number) => `
              <div style="margin-right: 20px; margin-bottom: 4px;">
                ${getLevel3Ordinal(idx + 1, formatting)} ${note}
              </div>
            `).join('')}
          ` : ''}

          ${htmlShowNegatives ? `
            <div style="font-weight: bold; color: #0c2340; margin-top: 15px;">
              ${getLevel2ArabicLetter(htmlShowPositives ? 2 : 1, formatting)} السلبيات ونقاط الضعف المرصودة:
            </div>
            ${htmlManualNegatives.map((note: string, idx: number) => `
              <div style="margin-right: 20px; margin-bottom: 4px;">
                ${getLevel3Ordinal(idx + 1, formatting)} ${note}
              </div>
            `).join('')}
          ` : ''}

          ${(htmlShowImpediments || htmlShowObstacles) ? `
            <div style="font-weight: bold; color: #0c2340; margin-top: 15px;">
              ${getLevel2ArabicLetter((htmlShowPositives ? 1 : 0) + (htmlShowNegatives ? 1 : 0) + 1, formatting)} المعوقات والمعاضل الميدانية:
            </div>
            ${htmlShowObstacles ? htmlManualObstacles.map((note: string, idx: number) => `
              <div style="margin-right: 20px; margin-bottom: 4px;">
                ${getLevel3Ordinal(idx + 1, formatting)} ${note} (عائق)
              </div>
            `).join('') : ''}
            ${htmlShowImpediments ? htmlManualImpediments.map((note: string, idx: number) => `
              <div style="margin-right: 20px; margin-bottom: 4px;">
                ${getLevel3Ordinal((htmlShowObstacles ? htmlManualObstacles.length : 0) + idx + 1, formatting)} ${note} (معضلة حرجة)
              </div>
            `).join('') : ''}
          ` : ''}

          ${htmlOldFindings.length > 0 ? htmlOldFindings.map((text: string, idx: number) => `
            <div style="margin-right: 20px; margin-bottom: 4px;">
              ${getLevel3Ordinal(idx + 1, formatting)} ${text}
            </div>
          `).join('') : ''}
        </div>
        ` : ''}

        ${payload.recommendations && payload.recommendations.length > 0 ? `
          <div class="section-title">${getLevel1Number(4, formatting)} التوصيات</div>
          <div style="margin-right: 15px;">
            ${payload.recommendations.filter((r: any) => r.visible).map((recGroup: any, idx: number) => `
              <div style="font-weight: bold; color: #0c2340; margin-top: 15px;">
                ${getLevel2ArabicLetter(idx + 1, formatting)} ${recGroup.authority}
              </div>
              <div style="margin-right: 20px;">
                ${recGroup.recs && recGroup.recs.length > 0 ? recGroup.recs.map((rec: any, recIdx: number) => `
                  <div style="margin-bottom: 8px;">
                    <div style="margin-bottom: 4px; font-size: 13.5px; font-weight: 500;">
                      ${getLevel3Ordinal(recIdx + 1, formatting).replace('.', ':')} ${rec.text}
                    </div>
                    ${rec.children && rec.children.length > 0 ? `
                      <div style="margin-right: ${getIndentation(4, formatting)}; display: flex; flex-direction: column; gap: 4px;">
                        ${rec.children.map((child: any) => `
                          <div style="font-size: 13px; color: #4a5568;">• ${child.text}</div>
                        `).join('')}
                      </div>
                    ` : ''}
                  </div>
                `).join('') : `<div style="font-size: 13.5px; color: #718096; font-style: italic; margin-bottom: 10px;">لا توجد توصيات مدخلة تحت هذه الجهة.</div>`}
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${payload.appendices && payload.appendices.some((a: any) => a.visible) ? `
          <div class="page-break"></div>
          <div class="section-title">${getLevel1Number(5, formatting)} ملاحق التقرير التفتيشي</div>
          <div style="margin-right: 15px;">
            ${payload.appendices.filter((a: any) => a.visible).map((app: any, idx: number) => `
              <div style="font-weight: bold; color: #0c2340; border-bottom: 1px dashed #cbd5e0; padding-bottom: 3px; margin-bottom: 8px;">
                ${getLevel2ArabicLetter(idx + 1, formatting)} ملحق (${app.symbol})
              </div>
              <div style="white-space: pre-line; font-size: 13px; margin-bottom: 15px;">${app.text}</div>
            `).join('')}
          </div>
        ` : ''}

        ${finalEvaluationSectionTitleHtml}

        <br><br>
        <div class="signatures-container page-break-inside-avoid" style="margin-top: 40px; font-family: 'Cairo', sans-serif;">
          ${(payload.signatures?.showMinisterSign !== false) ? `
            <div style="display: flex; justify-content: flex-end; margin-bottom: 25px; padding-left: 5%;">
              <div style="text-align: center; width: 45%;">
                <p style="margin: 0 0 5px 0;"><strong>${payload.signatures?.ministerTitle || 'اصادق اصوليا'}</strong></p>
                <p style="margin: 0 0 5px 0; font-size: 15px;"><strong>${payload.signatures?.ministerName || 'وزيـــــــر الداخلية'}</strong></p>
                <p style="margin: 0; font-size: 12px; color: #4a5568;"><span dir="ltr" style="direction: ltr; display: inline-block;">${payload.signatures?.ministerDate || '٢٠٢٦/  / '}</span></p>
              </div>
            </div>
          ` : ''}
          <div style="display: flex; justify-content: space-around; width: 100%;">
            <!-- Right Column: Leader -->
            <div class="signature-box" style="text-align: center; width: 45%;">
              <div style="height: 35px;"></div>
              <p style="margin: 0 0 5px 0;"><strong>${payload.signatures?.leaderRank || '&nbsp;'}</strong></p>
              <p style="margin: 0 0 5px 0;">${payload.signatures?.leaderName || ''}</p>
              <p style="margin: 0 0 5px 0;"><strong>${payload.signatures?.leaderRole || 'رئيس اللجنة'}</strong></p>
              <p style="margin: 0; font-size: 11px; color: #4a5568;"><span dir="ltr" style="direction: ltr; display: inline-block;">${payload.signatures?.leaderDate || ''}</span></p>
            </div>
            <!-- Left Column: Deputy -->
            <div class="signature-box" style="text-align: center; width: 45%;">
              <div style="height: 35px;"></div>
              <p style="margin: 0 0 5px 0;"><strong>${payload.signatures?.deputyRank || '&nbsp;'}</strong></p>
              <p style="margin: 0 0 5px 0;">${payload.signatures?.deputyName || ''}</p>
              <p style="margin: 0 0 5px 0;"><strong>${payload.signatures?.deputyRole || 'رئيس هيئة تفتيش قوى الامن الداخلي'}</strong></p>
              <p style="margin: 0; font-size: 11px; color: #4a5568;"><span dir="ltr" style="direction: ltr; display: inline-block;">${payload.signatures?.deputyDate || ''}</span></p>
            </div>
          </div>
        </div>
      `;
    }

    return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
        body {
          font-family: 'Cairo', 'Times New Roman', serif;
          margin: 0;
          padding: 40px;
          color: #111111;
          background-color: #ffffff;
          line-height: 1.8;
          font-size: 15px;
          direction: rtl;
          text-align: right;
        }
        .logo-header {
          text-align: center;
          margin-bottom: 25px;
        }
        .logo-header img {
          height: 95px;
          margin-bottom: 12px;
        }
        .logo-header h2 {
          font-size: 16px;
          margin: 3px 0;
          font-weight: bold;
        }
        .report-title {
          text-align: center;
          font-size: 21px;
          font-weight: bold;
          margin: 30px 0;
          color: #0c2340;
          text-decoration: underline;
          text-underline-offset: 8px;
        }
        .section-num {
          font-size: 16px;
          font-weight: bold;
          color: #0c2340;
          margin-top: 30px;
          margin-bottom: 10px;
          page-break-after: avoid;
          break-after: avoid;
        }
        .section-title {
          font-size: 16px;
          font-weight: bold;
          color: #0c2340;
          border-bottom: 2px solid #0c2340;
          padding-bottom: 5px;
          margin-top: 30px;
          margin-bottom: 15px;
          page-break-after: avoid;
          break-after: avoid;
        }
        .section-body {
          margin-right: 15px;
          margin-bottom: 20px;
          text-align: justify;
        }
        .member-line {
          margin-bottom: 8px;
          font-size: 15px;
        }
        table.military-table {
          width: 100%;
          border-collapse: collapse;
          margin: 15px 0 25px 0;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        table.military-table th, table.military-table td {
          border: 1px solid #000000;
          padding: 8px 10px;
          text-align: center;
          font-size: 13px;
        }
        table.military-table th {
          background-color: #f2f2f2;
          font-weight: bold;
        }
        .meta-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 25px;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .meta-table td {
          padding: 8px;
          border: 1px solid #ddd;
          width: 50%;
        }
        .meta-title {
          font-weight: bold;
          background-color: #f7f7f7;
        }
        .signatures {
          margin-top: 60px;
          display: flex;
          justify-content: space-around;
        }
        .signature-box {
          text-align: center;
          width: 45%;
        }
        .page-break {
          page-break-before: always;
        }
        .page-break-inside-avoid {
          page-break-inside: avoid;
          break-inside: avoid;
        }
      </style>
    </head>
    <body>
      ${mainContentHtml}
    </body>
    </html>
    `;
  }

  async generateCampaignReportPdf(campaignId: string, payload?: any): Promise<Buffer> {
    if (!payload) {
      payload = await this.getCampaignReportPayload(campaignId);
    } else {
      this.normalizeReportSectionsVisibility(payload);
      if (!payload.finalEvaluation) {
        payload.finalEvaluation = await this.calculateCampaignFinalEvaluation(campaignId);
      }
      const currentObservationSection = await this.buildCampaignObservationSection(campaignId);
      this.mergeObservationSection(payload, currentObservationSection);
      this.normalizeReportSectionsVisibility(payload);
    }

    const htmlContent = this.generateHtmlFromPayload(payload);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'load' });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        bottom: '20mm',
        left: '20mm',
        right: '20mm',
      },
    });

    await browser.close();
    return Buffer.from(pdfBuffer);
  }

  async generateCampaignReportWord(campaignId: string, payload?: any): Promise<Buffer> {
    if (!payload) {
      payload = await this.getCampaignReportPayload(campaignId);
    } else {
      this.normalizeReportSectionsVisibility(payload);
      if (!payload.finalEvaluation) {
        payload.finalEvaluation = await this.calculateCampaignFinalEvaluation(campaignId);
      }
      const currentObservationSection = await this.buildCampaignObservationSection(campaignId);
      this.mergeObservationSection(payload, currentObservationSection);
      this.normalizeReportSectionsVisibility(payload);
    }

    const formatting = payload.formatting || DEFAULT_FORMATTING_CONFIG;
    const isEducational = payload.isEducation;

    const tableBorders = {
      top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      right: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    };

    const whiteBorders = {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'FFFFFF' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'FFFFFF' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'FFFFFF' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'FFFFFF' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'FFFFFF' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'FFFFFF' },
    };

    const noBorders = {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    };

    // Load logo file
    const logoPath = path.join(__dirname, '..', '..', 'uploads', 'system', 'ministry-logo.png');
    const hasLogo = fs.existsSync(logoPath);

    const docChildren: any[] = [];

    // Unified 3-column table header layout matching PDF and React print previews
    const headerTableCellBorders = {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
    };

    const headerTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders,
      rows: [
        new TableRow({
          children: [
            // Right Cell (Text)
            new TableCell({
              width: { size: 35, type: WidthType.PERCENTAGE },
              borders: headerTableCellBorders,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: 'جمهورية العراق', bold: true, size: 24, font: 'Cairo' })],
                  alignment: AlignmentType.RIGHT,
                  bidirectional: true,
                }),
                new Paragraph({
                  children: [new TextRun({ text: 'وزارة الداخلية', bold: true, size: 24, font: 'Cairo' })],
                  alignment: AlignmentType.RIGHT,
                  bidirectional: true,
                }),
                new Paragraph({
                  children: [new TextRun({ text: 'هيئة تفتيش قوى الامن الداخلي', bold: true, size: 24, font: 'Cairo' })],
                  alignment: AlignmentType.RIGHT,
                  bidirectional: true,
                }),
              ],
            }),
            // Center Cell (Logo)
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              borders: headerTableCellBorders,
              children: hasLogo
                ? [
                  new Paragraph({
                    children: [
                      new ImageRun({
                        type: 'png',
                        data: fs.readFileSync(logoPath),
                        transformation: {
                          width: 65,
                          height: 65,
                        },
                      }),
                    ],
                    alignment: AlignmentType.CENTER,
                  }),
                ]
                : [],
            }),
            // Left Cell (Metadata)
            new TableCell({
              width: { size: 35, type: WidthType.PERCENTAGE },
              borders: headerTableCellBorders,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'التاريخ: ', bold: true, size: 22, font: 'Cairo' }),
                    new TextRun({ text: payload.startDateText || (payload.startDate ? new Date(payload.startDate).toLocaleDateString('ar-EG') : '—'), size: 22, font: 'Cairo' }),
                  ],
                  alignment: AlignmentType.LEFT,
                  bidirectional: true,
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: 'العدد: ', bold: true, size: 22, font: 'Cairo' }),
                    new TextRun({ text: payload.formationNumber || '—', size: 22, font: 'Cairo' }),
                  ],
                  alignment: AlignmentType.LEFT,
                  bidirectional: true,
                }),
              ],
            }),
          ],
        }),
      ],
    });

    docChildren.push(
      headerTable,
      new Paragraph({
        children: [new TextRun({ text: '' })],
        spacing: { before: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: payload.title, bold: true, size: 32, underline: {} })],
        alignment: AlignmentType.CENTER,
        bidirectional: true,
      }),
      new Paragraph({
        children: [new TextRun({ text: '' })],
        spacing: { before: 400 },
      }),
    );

    const heading1Style = (text: string) =>
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 28, color: '0C2340', rightToLeft: true, font: 'Cairo' })],
        spacing: { before: 300, after: 150 },
        bidirectional: true,
      });

    const bodyStyle = (text: string, level: 1 | 2 | 3 | 4 | 5 = 1) => {
      const rightIndent = formatting.enableLevels[`level${level}`] ? formatting.indentations[`level${level}`] * 14.4 : 0;
      return new Paragraph({
        children: [new TextRun({ text, size: 24, rightToLeft: true, font: 'Cairo' })],
        spacing: { after: 120 },
        indent: { right: rightIndent },
        bidirectional: true,
      });
    };

    if (isEducational) {
      // 1. التكليف
      docChildren.push(heading1Style(`${getLevel1Number(1, formatting)} التكلـــــيف`));
      docChildren.push(bodyStyle(payload.assignmentText));

      // 2. التأليف
      docChildren.push(heading1Style(`${getLevel1Number(2, formatting)} التــــأليف`));

      if (payload.committeeMembers && payload.committeeMembers.length > 0) {
        const memberRows: TableRow[] = [];
        payload.committeeMembers.forEach((member: string) => {
          const parsed = parseCommitteeMember(member);
          memberRows.push(
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: parsed.name, size: 24, rightToLeft: true, font: 'Cairo' })],
                      alignment: AlignmentType.RIGHT,
                      bidirectional: true,
                    })
                  ],
                  width: { size: 5415, type: WidthType.DXA },
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: parsed.role, size: 24, rightToLeft: true, font: 'Cairo' })],
                      alignment: AlignmentType.RIGHT,
                      bidirectional: true,
                    })
                  ],
                  width: { size: 3611, type: WidthType.DXA },
                }),
              ],
            })
          );
        });

        docChildren.push(
          new Table({
            width: { size: 9026, type: WidthType.DXA },
            visuallyRightToLeft: true,
            borders: noBorders,
            columnWidths: [5415, 3611],
            rows: memberRows,
          }),
          new Paragraph({ text: '', spacing: { after: 200 } })
        );
      }

      // 3. الغاية
      docChildren.push(heading1Style(`${getLevel1Number(3, formatting)} الغــــاية`));
      docChildren.push(bodyStyle(payload.purposeText));

      // 4. تاريخ التفتيش
      docChildren.push(heading1Style(`${getLevel1Number(4, formatting)} تاريخ التفتيش`));
      docChildren.push(bodyStyle(payload.durationText));

      // 5. جدول شاغلي المناصب
      docChildren.push(heading1Style(`${getLevel1Number(5, formatting)} جدول المدراء والآمرين وشاغلي المناصب الأساسية`));
      const posTableRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'ت', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 451, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'المنصب', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1805, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الرتبة', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 903, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الاسم الكامل', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1354, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الرقم الإحصائي', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 903, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'تاريخ إشغال المنصب', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1354, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'نوع الإشغال', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 903, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'التحصيل الدراسي', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 903, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الملاحظات', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1350, type: WidthType.DXA } }),
          ],
        }),
      ];

      payload.positions.forEach((pos: any, idx: number) => {
        posTableRows.push(
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(idx + 1), size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 451, type: WidthType.DXA } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: pos.positionName || '', bold: true, size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 1805, type: WidthType.DXA } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: pos.rank || '', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 903, type: WidthType.DXA } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: pos.positionHolder || '', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 1354, type: WidthType.DXA } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: pos.statisticalNumber || '', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 903, type: WidthType.DXA } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: pos.joinedDate || '', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 1354, type: WidthType.DXA } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: pos.positionStatus || '', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 903, type: WidthType.DXA } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: pos.education || '', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 903, type: WidthType.DXA } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: pos.notes || '', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 1350, type: WidthType.DXA } }),
            ],
          }),
        );
      });

      docChildren.push(
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          visuallyRightToLeft: true,
          borders: tableBorders,
          columnWidths: [451, 1805, 903, 1354, 903, 1354, 903, 903, 1350],
          rows: posTableRows,
        }),
        new Paragraph({ text: '' }),
      );

      // 6. المواقف الرسمية
      if (payload.personnelRows && payload.personnelRows.length > 0) {
        docChildren.push(heading1Style(`${getLevel1Number(6, formatting)} المواقف الرسمية ونسب التكامل الفعلي`));
        const quantTableRows = [
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الفئة', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 2708, type: WidthType.DXA } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الملاك', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1264, type: WidthType.DXA } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الموجود', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1264, type: WidthType.DXA } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الزيادة', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1264, type: WidthType.DXA } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'النقص', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1264, type: WidthType.DXA } }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'نسبة التكامل', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1262, type: WidthType.DXA } }),
            ],
          }),
        ];

        payload.personnelRows.forEach((row: any) => {
          const nominal = row.authorized !== undefined ? row.authorized : (row.nominal || 0);
          const actual = row.present !== undefined ? row.present : (row.actual || 0);
          const increase = row.excess !== undefined ? row.excess : Math.max(0, actual - nominal);
          const deficit = row.shortage !== undefined ? row.shortage : Math.max(0, nominal - actual);
          const percentage = row.percentage !== undefined ? row.percentage : (nominal > 0 ? (actual / nominal * 100).toFixed(0) : '0');

          quantTableRows.push(
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: row.category || '', bold: true, size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.RIGHT, bidirectional: true })], width: { size: 2708, type: WidthType.DXA } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(nominal), size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 1264, type: WidthType.DXA } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(actual), size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 1264, type: WidthType.DXA } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(increase), size: 20, rightToLeft: true, font: 'Cairo', color: '2b6cb0' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 1264, type: WidthType.DXA } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(deficit), size: 20, rightToLeft: true, font: 'Cairo', color: 'c53030' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 1264, type: WidthType.DXA } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${parseFloat(percentage).toFixed(1)}%`, bold: true, size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 1262, type: WidthType.DXA } }),
              ],
            }),
          );
        });

        docChildren.push(
          new Table({
            width: { size: 9026, type: WidthType.DXA },
            visuallyRightToLeft: true,
            borders: tableBorders,
            columnWidths: [2708, 1264, 1264, 1264, 1264, 1262],
            rows: quantTableRows,
          }),
          new Paragraph({ text: '' }),
        );
      }

      // Page break before detailed section
      docChildren.push(new Paragraph({ children: [new PageBreak()] }));

      // 7. تفاصيل التفتيش
      docChildren.push(heading1Style(`${getLevel1Number(7, formatting)} تفاصيل التفتيش`));
      docChildren.push(bodyStyle('بناءً على التوجيهات الرسمية، تم تجميع وتصنيف كافة نتائج التفتيش الميداني وأسس التقييم والخيارات المرصودة والملاحظات والدرجات للمنطقة الأمنية المعنية بشكل منظم ومبوب كما يلي:'));
      docChildren.push(new Paragraph({ text: '' }));

      let l2Idx = 1;
      const visibleSections = payload.sections?.filter((sec: any) => sec.visible && !sec.isEmpty) || [];
      if (visibleSections.length === 0) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: '⚠️ لا توجد أسس مرتبطة بهذا القالب التفتيشي',
                bold: true,
                size: 24,
                color: 'C53030',
                font: 'Cairo',
              }),
            ],
            spacing: { before: 200, after: 100 },
            alignment: AlignmentType.CENTER,
            bidirectional: true,
          }),
        );
      }

      payload.sections.forEach((sec: any) => {
        if (sec.isManual) return;
        if (!sec.visible || sec.isEmpty) return;

        const priTitlePrefix = sec.numbering ? sec.numbering : getLevel2ArabicLetter(l2Idx++, formatting);
        const priTitleFormatted = `${priTitlePrefix} ${sec.title}`;
        docChildren.push(
          new Paragraph({
            children: [new TextRun({ text: priTitleFormatted, bold: true, size: 26, color: '0C2340', font: 'Cairo' })],
            spacing: { before: 200, after: 100 },
            indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
            bidirectional: true,
          }),
        );

        if (sec.narrativeText) {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: sec.narrativeText, size: 22, rightToLeft: true, font: 'Cairo' })],
              spacing: { after: 100 },
              indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
              bidirectional: true,
            })
          );
        }

        if (sec.isManual) {
          let level4Idx = 1;
          if (sec.showPositives && sec.positivesList?.length > 0) {
            docChildren.push(
              new Paragraph({
                children: [new TextRun({ text: `${getLevel4Number(level4Idx++, formatting)} الإيجابيات وعوامل القوة العامة:`, bold: true, size: 24, color: '1A5235' })],
                spacing: { before: 100, after: 60 },
                indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                bidirectional: true,
              }),
            );
            sec.positivesList.forEach((text: string, idx: number) => {
              docChildren.push(
                new Paragraph({
                  children: [new TextRun({ text: `${getLevel5ArabicLetter(idx + 1, formatting)} ${text}`, size: 24, color: '1A5235' })],
                  spacing: { after: 60 },
                  indent: { right: formatting.enableLevels.level5 ? formatting.indentations.level5 * 14.4 : 0 },
                  bidirectional: true,
                }),
              );
            });
          }
          if (sec.showNegatives && sec.negativesList?.length > 0) {
            docChildren.push(
              new Paragraph({
                children: [new TextRun({ text: `${getLevel4Number(level4Idx++, formatting)} السلبيات ونقاط التقصير العامة:`, bold: true, size: 24, color: '742A2A' })],
                spacing: { before: 100, after: 60 },
                indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                bidirectional: true,
              }),
            );
            sec.negativesList.forEach((text: string, idx: number) => {
              docChildren.push(
                new Paragraph({
                  children: [new TextRun({ text: `${getLevel5ArabicLetter(idx + 1, formatting)} ${text}`, size: 24, color: '742A2A' })],
                  spacing: { after: 60 },
                  indent: { right: formatting.enableLevels.level5 ? formatting.indentations.level5 * 14.4 : 0 },
                  bidirectional: true,
                }),
              );
            });
          }
          if (sec.showImpediments && sec.impedimentsList?.length > 0) {
            docChildren.push(
              new Paragraph({
                children: [new TextRun({ text: `${getLevel4Number(level4Idx++, formatting)} المعوقات العامة:`, bold: true, size: 24, color: '7B341E' })],
                spacing: { before: 100, after: 60 },
                indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                bidirectional: true,
              }),
            );
            sec.impedimentsList.forEach((text: string, idx: number) => {
              docChildren.push(
                new Paragraph({
                  children: [new TextRun({ text: `${getLevel5ArabicLetter(idx + 1, formatting)} ${text}`, size: 24, color: '7B341E' })],
                  spacing: { after: 60 },
                  indent: { right: formatting.enableLevels.level5 ? formatting.indentations.level5 * 14.4 : 0 },
                  bidirectional: true,
                }),
              );
            });
          }
          if (sec.showObstacles && sec.obstaclesList?.length > 0) {
            docChildren.push(
              new Paragraph({
                children: [new TextRun({ text: `${getLevel4Number(level4Idx++, formatting)} المعاضل العامة:`, bold: true, size: 24, color: '5A3E2B' })],
                spacing: { before: 100, after: 60 },
                indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                bidirectional: true,
              }),
            );
            sec.obstaclesList.forEach((text: string, idx: number) => {
              docChildren.push(
                new Paragraph({
                  children: [new TextRun({ text: `${getLevel5ArabicLetter(idx + 1, formatting)} ${text}`, size: 24, color: '5A3E2B' })],
                  spacing: { after: 60 },
                  indent: { right: formatting.enableLevels.level5 ? formatting.indentations.level5 * 14.4 : 0 },
                  bidirectional: true,
                }),
              );
            });
          }
        } else if (sec.subsections) {
          let secOrdIdx = 1;
          sec.subsections.forEach((sub: any) => {
            if (!sub.visible || sub.isEmpty) return;

            // Arabic digit helper
            const toAr = (n: number) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)]);

            const subTitlePrefix = sub.numbering ? sub.numbering : getLevel3Ordinal(secOrdIdx++, formatting);
            const secTitleFormatted = `${subTitlePrefix} ${sub.title}`;

            docChildren.push(
              new Paragraph({
                children: [new TextRun({ text: secTitleFormatted, bold: true, size: 26, color: '1A202C', font: 'Cairo', rightToLeft: true })],
                spacing: { before: 200, after: 100 },
                indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                bidirectional: true,
                border: { right: { style: BorderStyle.THICK, size: 6, color: '0C2340' } },
              }),
            );

            // Build all items in one numbered list
            let itemIdx = 1;

            // Officer info: (١)(٢)(٣)(٤)
            if (sub.officerInfo) {
              const oi = sub.officerInfo;
              const oiItems: string[] = [
                `الرتبة والاسم الكامل / ${oi.rank} ${oi.fullName}.`,
                `الرقم الإحصائي/ (${oi.statisticalNumber}).`,
                `تاريخ استلام المنصب/ ${oi.joinedDate} (${oi.positionStatus}).`,
              ];
              if (oi.education && oi.education !== '—') {
                oiItems.push(`التحصيل الدراسي/ ${oi.education}.`);
              }
              oiItems.forEach(text => {
                docChildren.push(
                  new Paragraph({
                    children: [
                      new TextRun({ text: `(${toAr(itemIdx++)})  `, bold: true, size: 24, color: '0C2340', rightToLeft: true, font: 'Cairo' }),
                      new TextRun({ text, size: 24, rightToLeft: true, font: 'Cairo' }),
                    ],
                    spacing: { after: 80 },
                    indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                    bidirectional: true,
                  }),
                );
              });
            }

            // Findings: continue numbering
            if (sub.findings && sub.findings.length > 0) {
              sub.findings.forEach((text: string) => {
                docChildren.push(
                  new Paragraph({
                    children: [
                      new TextRun({ text: `(${toAr(itemIdx++)})  `, bold: true, size: 24, color: '0C2340', rightToLeft: true, font: 'Cairo' }),
                      new TextRun({ text, size: 24, rightToLeft: true, font: 'Cairo' }),
                    ],
                    spacing: { after: 80 },
                    indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                    bidirectional: true,
                  }),
                );
              });
            }

            // Narrative text if any
            if (sub.narrativeText) {
              docChildren.push(
                new Paragraph({
                  children: [new TextRun({ text: sub.narrativeText, size: 22, rightToLeft: true, font: 'Cairo', color: '4A5568' })],
                  spacing: { after: 80 },
                  indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                  bidirectional: true,
                })
              );
            }

            if (sub.detailedTables && sub.detailedTables.length > 0) {
              sub.detailedTables.forEach((table: any) => {
                // 1. Table Title Paragraph
                docChildren.push(
                  new Paragraph({
                    children: [
                      new TextRun({ text: `📊  ${table.title} `, bold: true, size: 22, color: '0C2340', font: 'Cairo' }),
                      new TextRun({ text: ` (${table.entityName})`, size: 20, color: '718096', font: 'Cairo' }),
                    ],
                    spacing: { before: 120, after: 80 },
                    indent: { right: formatting.enableLevels.level4 ? (formatting.indentations.level4 + 0.5) * 14.4 : 14.4 },
                    bidirectional: true,
                  })
                );

                // 2. Build Table
                const wordTableRows: TableRow[] = [];

                // Header Row
                wordTableRows.push(
                  new TableRow({
                    children: table.schema.map((col: any) => (
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: [new TextRun({ text: col.label, bold: true, size: 20, rightToLeft: true, font: 'Cairo' })],
                            alignment: AlignmentType.CENTER,
                            bidirectional: true,
                          })
                        ],
                        shading: { fill: 'F2F2F2' },
                      })
                    )),
                  })
                );

                // Data Rows
                table.rows.forEach((row: any) => {
                  wordTableRows.push(
                    new TableRow({
                      children: table.schema.map((col: any) => {
                        const cellVal = row[col.key] !== undefined ? row[col.key] : '';
                        const isPercentage = col.role === 'percentage';
                        const formattedVal = isPercentage ? `${cellVal}%` : String(cellVal);

                        let textColor = '000000';
                        if (col.role === 'deficit' && Number(cellVal) > 0) textColor = 'C53030';
                        if (col.role === 'increase' && Number(cellVal) > 0) textColor = '2B6CB0';

                        const isBold = col.role === 'label' || col.role === 'percentage' || col.role === 'deficit' || col.role === 'increase';

                        return new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: formattedVal,
                                  size: 20,
                                  bold: isBold,
                                  color: textColor,
                                  rightToLeft: true,
                                  font: 'Cairo'
                                })
                              ],
                              alignment: col.role === 'label' ? AlignmentType.RIGHT : AlignmentType.CENTER,
                              bidirectional: true,
                            })
                          ],
                        });
                      }),
                    })
                  );
                });

                // Calculate column widths in DXA
                const totalDxa = 9026;
                const colWidths: number[] = [];
                const labelIdx = table.schema.findIndex((c: any) => c.role === 'label');
                const numCols = table.schema.length;

                if (numCols > 0) {
                  if (labelIdx !== -1 && numCols > 1) {
                    const labelWidth = Math.floor(totalDxa * 0.3);
                    const otherWidth = Math.floor((totalDxa - labelWidth) / (numCols - 1));
                    for (let idx = 0; idx < numCols; idx++) {
                      if (idx === labelIdx) {
                        colWidths.push(labelWidth);
                      } else {
                        colWidths.push(otherWidth);
                      }
                    }
                  } else {
                    const equalWidth = Math.floor(totalDxa / numCols);
                    for (let idx = 0; idx < numCols; idx++) {
                      colWidths.push(equalWidth);
                    }
                  }
                }

                docChildren.push(
                  new Table({
                    width: { size: 9026, type: WidthType.DXA },
                    visuallyRightToLeft: true,
                    borders: tableBorders,
                    columnWidths: colWidths,
                    rows: wordTableRows,
                  }),
                  new Paragraph({ text: '', spacing: { after: 100 } })
                );
              });
            }
          });
        }

      });

      // 8. التوصيات والمقترحات
      const pushOfficialObservationItems = (items: string[] = []) => {
        if (items.length === 0) {
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: 'لا توجد ملاحظات ضمن هذا التصنيف.', size: 22, color: '718096', font: 'Cairo' })],
            spacing: { after: 60 },
            indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
            bidirectional: true,
          }));
          return;
        }
        items.forEach((text: string, idx: number) => {
          docChildren.push(new Paragraph({
            children: [new TextRun({ text: `${getLevel3Ordinal(idx + 1, formatting)} ${text}`, size: 24, font: 'Cairo' })],
            spacing: { after: 60 },
            indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
            bidirectional: true,
          }));
        });
      };

      const wordOfficialObservationSection = payload.sections.find((s: any) => s.isManual);
      docChildren.push(heading1Style(`${getLevel1Number(8, formatting)} الملاحظات`));
      [
        { title: `${getLevel2ArabicLetter(1, formatting)} الإيجابيات`, items: wordOfficialObservationSection?.positivesList || [] },
        { title: `${getLevel2ArabicLetter(2, formatting)} السلبيات`, items: wordOfficialObservationSection?.negativesList || [] },
        { title: `${getLevel2ArabicLetter(3, formatting)} المعوقات`, items: wordOfficialObservationSection?.impedimentsList || [] },
        { title: `${getLevel2ArabicLetter(4, formatting)} المعاضل`, items: wordOfficialObservationSection?.obstaclesList || [] },
      ].forEach((group) => {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: group.title, bold: true, size: 24, font: 'Cairo' })],
          spacing: { before: 100, after: 60 },
          indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
          bidirectional: true,
        }));
        pushOfficialObservationItems(group.items);
      });

      docChildren.push(heading1Style(`${getLevel1Number(9, formatting)} التوصيات`));
      if (payload.recommendations && payload.recommendations.length > 0) {
        payload.recommendations.filter((r: any) => r.visible).forEach((recGroup: any, idx: number) => {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: `${getLevel2ArabicLetter(idx + 1, formatting)} ${recGroup.authority}`, bold: true, size: 24, font: 'Cairo' })],
              spacing: { before: 150, after: 60 },
              indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
              bidirectional: true,
            }),
          );
          if (recGroup.recs && recGroup.recs.length > 0) {
            recGroup.recs.forEach((rec: any, recIdx: number) => {
              docChildren.push(
                new Paragraph({
                  children: [new TextRun({ text: `${getLevel3Ordinal(recIdx + 1, formatting).replace('.', ':')} ${rec.text}`, size: 24, font: 'Cairo' })],
                  spacing: { after: 60 },
                  indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                  bidirectional: true,
                }),
              );
              if (rec.children && rec.children.length > 0) {
                rec.children.forEach((child: any) => {
                  docChildren.push(
                    new Paragraph({
                      children: [new TextRun({ text: `• ${child.text}`, size: 24, color: '4a5568', font: 'Cairo' })],
                      spacing: { after: 60 },
                      indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                      bidirectional: true,
                    }),
                  );
                });
              }
            });
          } else {
            docChildren.push(
              new Paragraph({
                children: [new TextRun({ text: 'لا توجد توصيات مدخلة تحت هذه الجهة.', size: 22, color: '718096', font: 'Cairo' })],
                spacing: { after: 60 },
                indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                bidirectional: true,
              }),
            );
          }
        });
      } else {
        docChildren.push(new Paragraph({
          children: [new TextRun({ text: 'لا توجد توصيات مدخلة.', size: 22, color: '718096', font: 'Cairo' })],
          spacing: { after: 100 },
          indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
          bidirectional: true,
        }));
      }

      if (payload.finalEvaluation?.statement) {
        docChildren.push(heading1Style(`${getLevel1Number(10, formatting)} ${payload.finalEvaluation.statement}`));
      }

      if (false && payload.recommendations && payload.recommendations.some((r: any) => r.visible && r.recs.length > 0)) {
        docChildren.push(heading1Style(`${getLevel1Number(8, formatting)} التوصيات والمقترحات المرفوعة للمصادقة`));
        payload.recommendations.filter((r: any) => r.visible).forEach((recGroup: any, idx: number) => {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: `${getLevel2ArabicLetter(idx + 1, formatting)} الموجهة إلى (${recGroup.authority}):`, bold: true, size: 24 })],
              spacing: { before: 150, after: 60 },
              indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
              bidirectional: true,
            }),
          );
          recGroup.recs.forEach((r: string, rIdx: number) => {
            docChildren.push(
              new Paragraph({
                children: [new TextRun({ text: `${getLevel3Ordinal(rIdx + 1, formatting)} ${r}`, size: 24 })],
                spacing: { after: 60 },
                indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                bidirectional: true,
              }),
            );
          });
        });
      }

      // 9. ملاحق التقرير التفتيشي
      if (payload.appendices && payload.appendices.some((a: any) => a.visible)) {
        docChildren.push(new Paragraph({ children: [new PageBreak()] }));
        docChildren.push(heading1Style(`${getLevel1Number(11, formatting)} ملاحق التقرير التفتيشي`));
        payload.appendices.filter((a: any) => a.visible).forEach((app: any, idx: number) => {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: `${getLevel2ArabicLetter(idx + 1, formatting)} ملحق (${app.symbol})`, bold: true, size: 24, color: '0C2340' })],
              spacing: { before: 150, after: 60 },
              indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
              bidirectional: true,
            }),
            new Paragraph({
              children: [new TextRun({ text: app.text, size: 22 })],
              spacing: { after: 120 },
              indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
              bidirectional: true,
            }),
          );
        });
      }
      if (false && payload.finalEvaluation?.statement) {
        docChildren.push(heading1Style(`${getLevel1Number(10, formatting)} ${payload.finalEvaluation.statement}`));
      }
    } else {
      const wordManualSection = payload.sections.find((s: any) => s.isManual);
      const wordManualPositives = (wordManualSection?.positivesList || []);
      const wordManualNegatives = (wordManualSection?.negativesList || []);
      const wordManualImpediments = (wordManualSection?.impedimentsList || []);
      const wordManualObstacles = (wordManualSection?.obstaclesList || []);
      const wordShowPositives = wordManualSection?.showPositives !== false && wordManualPositives.length > 0;
      const wordShowNegatives = wordManualSection?.showNegatives !== false && wordManualNegatives.length > 0;
      const wordShowImpediments = wordManualSection?.showImpediments !== false && wordManualImpediments.length > 0;
      const wordShowObstacles = wordManualSection?.showObstacles !== false && wordManualObstacles.length > 0;
      const wordOldFindings = (!wordManualPositives.length && !wordManualNegatives.length && !wordManualImpediments.length && !wordManualObstacles.length && wordManualSection?.findings?.length)
        ? wordManualSection.findings : [];

      // 1. المعلومات الأساسية للحملة التفتيشية
      docChildren.push(heading1Style(`${getLevel1Number(1, formatting)} المعلومات الأساسية للحملة التفتيشية`));

      const metaTableRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'اسم الحملة التفتيشية', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], shading: { fill: 'F7F7F7' }, width: { size: 2708, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payload.campaignName || '', size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], width: { size: 6318, type: WidthType.DXA } }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الأمر الإداري المكلف', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], shading: { fill: 'F7F7F7' }, width: { size: 2708, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `كتاب رقم ${payload.assignmentReference || ''} في ${payload.assignmentDate ? new Date(payload.assignmentDate).toLocaleDateString('ar-EG') : ''}`, size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], width: { size: 6318, type: WidthType.DXA } }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الكيان المستهدف الرئيسي', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], shading: { fill: 'F7F7F7' }, width: { size: 2708, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payload.targetEntityName || '', size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], width: { size: 6318, type: WidthType.DXA } }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'رئيس اللجنة التفتيشية', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], shading: { fill: 'F7F7F7' }, width: { size: 2708, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payload.signatures.leaderName || '', size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], width: { size: 6318, type: WidthType.DXA } }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'معاون رئيس اللجنة / المقرر', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], shading: { fill: 'F7F7F7' }, width: { size: 2708, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payload.signatures.deputyName || '', size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], width: { size: 6318, type: WidthType.DXA } }),
          ],
        }),
      ];

      docChildren.push(
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          visuallyRightToLeft: true,
          borders: tableBorders,
          columnWidths: [2708, 6318],
          rows: metaTableRows,
        }),
        new Paragraph({ text: '' }),
      );

      // 2. جدول تقييم الأداء الميداني للكيانات المفتشة
      docChildren.push(heading1Style(`${getLevel1Number(2, formatting)} جدول تقييم الأداء الميداني للكيانات المفتشة`));

      const evalTableRows = [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'ت', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 903, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الكيان المفتش', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 3610, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'الموقع الجغرافي', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 2708, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'النسبة المستحصلة', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1805, type: WidthType.DXA } }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '1', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 903, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: payload.targetEntityName || '', bold: true, size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 3610, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'مقر الكيان', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 2708, type: WidthType.DXA } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '100.0%', bold: true, size: 20, rightToLeft: true, font: 'Cairo' })], alignment: AlignmentType.CENTER, bidirectional: true })], width: { size: 1805, type: WidthType.DXA } }),
          ],
        }),
      ];

      docChildren.push(
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          visuallyRightToLeft: true,
          borders: tableBorders,
          columnWidths: [903, 3610, 2708, 1805],
          rows: evalTableRows,
        }),
        new Paragraph({ text: '' }),
      );

      // 3. الملاحظات والنتائج العامة للجنة التفتيشية
      if (wordShowPositives || wordShowNegatives || wordShowImpediments || wordShowObstacles || wordOldFindings.length > 0) {
        docChildren.push(heading1Style(`${getLevel1Number(3, formatting)} ${wordManualSection?.title || 'الملاحظات والنتائج العامة للجنة التفتيشية'}`));

        let noteIdx = 1;
        if (wordShowPositives) {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: `${getLevel2ArabicLetter(noteIdx++, formatting)} الإيجابيات ورصد كفاءة الأداء:`, bold: true, size: 24 })],
              spacing: { before: 100, after: 60 },
              indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
              bidirectional: true,
            }),
          );
          wordManualPositives.forEach((note: string, idx: number) => {
            docChildren.push(
              new Paragraph({
                children: [new TextRun({ text: `${getLevel3Ordinal(idx + 1, formatting)} ${note}`, size: 24 })],
                spacing: { after: 60 },
                indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                bidirectional: true,
              }),
            );
          });
        }

        if (wordShowNegatives) {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: `${getLevel2ArabicLetter(noteIdx++, formatting)} السلبيات ونقاط الضعف المرصودة:`, bold: true, size: 24 })],
              spacing: { before: 100, after: 60 },
              indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
              bidirectional: true,
            }),
          );
          wordManualNegatives.forEach((note: string, idx: number) => {
            docChildren.push(
              new Paragraph({
                children: [new TextRun({ text: `${getLevel3Ordinal(idx + 1, formatting)} ${note}`, size: 24 })],
                spacing: { after: 60 },
                indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                bidirectional: true,
              }),
            );
          });
        }

        if (wordShowImpediments || wordShowObstacles) {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: `${getLevel2ArabicLetter(noteIdx++, formatting)} المعوقات والمعاضل الميدانية:`, bold: true, size: 24 })],
              spacing: { before: 100, after: 60 },
              indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
              bidirectional: true,
            }),
          );
          if (wordShowObstacles) {
            wordManualObstacles.forEach((note: string, idx: number) => {
              docChildren.push(
                new Paragraph({
                  children: [new TextRun({ text: `${getLevel3Ordinal(idx + 1, formatting)} ${note} (عائق)`, size: 24 })],
                  spacing: { after: 60 },
                  indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                  bidirectional: true,
                }),
              );
            });
          }
          if (wordShowImpediments) {
            wordManualImpediments.forEach((note: string, idx: number) => {
              docChildren.push(
                new Paragraph({
                  children: [new TextRun({ text: `${getLevel3Ordinal((wordShowObstacles ? wordManualObstacles.length : 0) + idx + 1, formatting)} ${note} (معضلة حرجة)`, size: 24 })],
                  spacing: { after: 60 },
                  indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                  bidirectional: true,
                }),
              );
            });
          }
        }

        if (wordOldFindings.length > 0) {
          wordOldFindings.forEach((text: string, idx: number) => {
            docChildren.push(
              new Paragraph({
                children: [new TextRun({ text: `${getLevel3Ordinal(idx + 1, formatting)} ${text}`, size: 24 })],
                spacing: { after: 60 },
                indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                bidirectional: true,
              }),
            );
          });
        }
      }

      // 4. التوصيات
      if (payload.recommendations && payload.recommendations.length > 0) {
        docChildren.push(heading1Style(`${getLevel1Number(4, formatting)} التوصيات`));
        payload.recommendations.filter((r: any) => r.visible).forEach((recGroup: any, idx: number) => {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: `${getLevel2ArabicLetter(idx + 1, formatting)} ${recGroup.authority}`, bold: true, size: 24, font: 'Cairo' })],
              spacing: { before: 150, after: 60 },
              indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
              bidirectional: true,
            }),
          );
          if (recGroup.recs && recGroup.recs.length > 0) {
            recGroup.recs.forEach((rec: any, recIdx: number) => {
              docChildren.push(
                new Paragraph({
                  children: [new TextRun({ text: `${getLevel3Ordinal(recIdx + 1, formatting).replace('.', ':')} ${rec.text}`, size: 24, font: 'Cairo' })],
                  spacing: { after: 60 },
                  indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                  bidirectional: true,
                }),
              );
              if (rec.children && rec.children.length > 0) {
                rec.children.forEach((child: any) => {
                  docChildren.push(
                    new Paragraph({
                      children: [new TextRun({ text: `• ${child.text}`, size: 24, color: '4a5568', font: 'Cairo' })],
                      spacing: { after: 60 },
                      indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                      bidirectional: true,
                    }),
                  );
                });
              }
            });
          } else {
            docChildren.push(
              new Paragraph({
                children: [new TextRun({ text: 'لا توجد توصيات مدخلة تحت هذه الجهة.', size: 22, color: '718096', font: 'Cairo' })],
                spacing: { after: 60 },
                indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                bidirectional: true,
              }),
            );
          }
        });
      }

      // 5. ملاحق التقرير التفتيشي
      if (payload.appendices && payload.appendices.some((a: any) => a.visible)) {
        docChildren.push(new Paragraph({ children: [new PageBreak()] }));
        docChildren.push(heading1Style(`${getLevel1Number(5, formatting)} ملاحق التقرير التفتيشي`));
        payload.appendices.filter((a: any) => a.visible).forEach((app: any, idx: number) => {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: `${getLevel2ArabicLetter(idx + 1, formatting)} ملحق (${app.symbol})`, bold: true, size: 24, color: '0C2340' })],
              spacing: { before: 150, after: 60 },
              indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
              bidirectional: true,
            }),
            new Paragraph({
              children: [new TextRun({ text: app.text, size: 22 })],
              spacing: { after: 120 },
              indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
              bidirectional: true,
            }),
          );
        });
      }
      if (payload.finalEvaluation?.statement) {
        docChildren.push(heading1Style(`${getLevel1Number(10, formatting)} ${payload.finalEvaluation.statement}`));
      }
    }

    // Minister Signature if enabled
    if (payload.signatures?.showMinisterSign !== false) {
      docChildren.push(
        new Table({
          width: { size: 9026, type: WidthType.DXA },
          visuallyRightToLeft: true,
          borders: noBorders,
          columnWidths: [4513, 4513],
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 4513, type: WidthType.DXA },
                  children: [
                    new Paragraph({ text: '' })
                  ]
                }),
                new TableCell({
                  width: { size: 4513, type: WidthType.DXA },
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: payload.signatures?.ministerTitle || 'اصادق اصوليا', bold: true, size: 24, rightToLeft: true, font: 'Cairo' })],
                      alignment: AlignmentType.CENTER,
                      bidirectional: true,
                    }),
                    new Paragraph({
                      children: [new TextRun({ text: payload.signatures?.ministerName || 'وزيـــــــر الداخلية', bold: true, size: 24, rightToLeft: true, font: 'Cairo' })],
                      alignment: AlignmentType.CENTER,
                      bidirectional: true,
                      spacing: { before: 100 },
                    }),
                    new Paragraph({
                      children: [new TextRun({ text: payload.signatures?.ministerDate || '٢٠٢٦/  / ', size: 20, rightToLeft: true, font: 'Cairo' })],
                      alignment: AlignmentType.CENTER,
                      bidirectional: true,
                      spacing: { before: 50 },
                    }),
                  ]
                })
              ]
            })
          ]
        }),
        new Paragraph({ children: [new TextRun({ text: '' })], spacing: { before: 200 } })
      );
    }

    // Borderless Signatures Table for Side-by-Side Alignment (Swapped Columns)
    docChildren.push(
      new Table({
        width: { size: 9026, type: WidthType.DXA },
        visuallyRightToLeft: true,
        borders: noBorders,
        columnWidths: [4513, 4513],
        rows: [
          new TableRow({
            children: [
              // Right Column: Leader (رئيس اللجنة)
              new TableCell({
                width: { size: 4513, type: WidthType.DXA },
                children: [
                  ...(payload.signatures?.leaderRank ? [
                    new Paragraph({
                      children: [new TextRun({ text: payload.signatures.leaderRank, bold: true, size: 22, rightToLeft: true, font: 'Cairo' })],
                      alignment: AlignmentType.CENTER,
                      bidirectional: true,
                    })
                  ] : []),
                  new Paragraph({
                    children: [new TextRun({ text: payload.signatures?.leaderName || '', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })],
                    alignment: AlignmentType.CENTER,
                    bidirectional: true,
                    spacing: { before: payload.signatures?.leaderRank ? 200 : 0 },
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: payload.signatures?.leaderRole || 'رئيس اللجنة', bold: true, size: 24, rightToLeft: true, font: 'Cairo' })],
                    alignment: AlignmentType.CENTER,
                    bidirectional: true,
                    spacing: { before: 50 },
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: payload.signatures?.leaderDate || '', size: 20, rightToLeft: true, font: 'Cairo' })],
                    alignment: AlignmentType.CENTER,
                    bidirectional: true,
                  }),
                ],
              }),
              // Left Column: Deputy (المقرر / المفتش العام)
              new TableCell({
                width: { size: 4513, type: WidthType.DXA },
                children: [
                  ...(payload.signatures?.deputyRank ? [
                    new Paragraph({
                      children: [new TextRun({ text: payload.signatures.deputyRank, bold: true, size: 22, rightToLeft: true, font: 'Cairo' })],
                      alignment: AlignmentType.CENTER,
                      bidirectional: true,
                    })
                  ] : []),
                  new Paragraph({
                    children: [new TextRun({ text: payload.signatures?.deputyName || '', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })],
                    alignment: AlignmentType.CENTER,
                    bidirectional: true,
                    spacing: { before: payload.signatures?.deputyRank ? 200 : 0 },
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: payload.signatures?.deputyRole || 'رئيس هيئة تفتيش قوى الامن الداخلي', bold: true, size: 24, rightToLeft: true, font: 'Cairo' })],
                    alignment: AlignmentType.CENTER,
                    bidirectional: true,
                    spacing: { before: 50 },
                  }),
                  new Paragraph({
                    children: [new TextRun({ text: payload.signatures?.deputyDate || '', size: 20, rightToLeft: true, font: 'Cairo' })],
                    alignment: AlignmentType.CENTER,
                    bidirectional: true,
                  }),
                ],
              }),
            ],
          }),
        ],
      })
    );

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440,
                bottom: 1440,
                left: 1440,
                right: 1440,
              },
            },
          },
          children: docChildren,
        },
      ],
    });

    return Packer.toBuffer(doc);
  }
}
