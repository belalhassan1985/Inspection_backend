// @ts-nocheck
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import * as docx_1 from 'docx';
import {
  sanitizeFormattingConfig,
  formatArabicTableValue,
  getLevel1Number, getLevel2ArabicLetter, getLevel3Ordinal,
  getLevel4Number, getLevel5ArabicLetter,
  getIndentation,
  DEFAULT_FORMATTING_CONFIG,
} from '../utils/reportNumbering';
import { hasMeaningfulQuantitativeData, pruneTemplateTree } from '../utils/reportFilter';
import { ReportFormattingConfig } from '../utils/reportNumbering';

export { sanitizePdfReview };

function parseCommitteeMember(member: any) {
  const cleanMember = member.replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim();
  const parts = cleanMember.split(/\s{2,}/);
  if (parts.length >= 2) return { name: parts[0].trim(), role: parts.slice(1).join(' ').trim() };
  const roles = ['رئيس اللجنة', 'نائب رئيس اللجنة', 'عضو اللجنة', 'مقرر اللجنة', 'عضو مجلس', 'ركن', 'مشرف', 'ضابط ارتباط'];
  for (const role of roles) {
    if (cleanMember.endsWith(role)) {
      const name = cleanMember.substring(0, cleanMember.length - role.length).trim();
      return { name, role };
    }
  }
  return { name: cleanMember, role: '' };
}

function sanitizePdfReview(input: any): any {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const ALLOWED_DECISIONS = ['pending', 'approved', 'needs_changes'];
  const result: any = {};
  if (ALLOWED_DECISIONS.includes(input.decision)) result.decision = input.decision;
  if (typeof input.finalAcceptanceStatus === 'boolean') result.finalAcceptanceStatus = input.finalAcceptanceStatus;
  if (typeof input.notes === 'string') result.notes = input.notes.slice(0, 2000);
  if (typeof input.reviewedAt === 'string' && !isNaN(Date.parse(input.reviewedAt))) result.reviewedAt = input.reviewedAt;
  if (typeof input.reviewedBy === 'string') result.reviewedBy = input.reviewedBy.slice(0, 255);
  if (typeof input.lastExportSummary === 'string') result.lastExportSummary = input.lastExportSummary.slice(0, 500);
  else if (input.lastExportSummary !== null && typeof input.lastExportSummary === 'object' && !Array.isArray(input.lastExportSummary))
    result.lastExportSummary = input.lastExportSummary;
  return Object.keys(result).length > 0 ? result : undefined;
}

@Injectable()
export class ReportsService {
  protected readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {
  }

    toNumber(value) {
        const numeric = Number(value ?? 0);
        return Number.isFinite(numeric) ? numeric : 0;
    }
    getOptionTypeCode(option) {
        return option?.optionType?.code || option?.type || 'positive';
    }
    addOptionTextToBuckets(option, buckets) {
        const text = option?.optionText;
        if (!text)
            return;
        const type = this.getOptionTypeCode(option);
        if (type === 'positive')
            buckets.positives.push(text);
        else if (type === 'negative')
            buckets.negatives.push(text);
        else if (type === 'impediment')
            buckets.impediments.push(text);
        else if (type === 'obstacle')
            buckets.obstacles.push(text);
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
    getFinalEvaluationRating(percentage) {
        if (percentage >= 90)
            return 'ممتاز';
        if (percentage >= 80)
            return 'جيد جداً';
        if (percentage >= 70)
            return 'جيد';
        if (percentage >= 60)
            return 'وسط';
        return 'ضعيف';
    }
    buildFinalEvaluationSummary(entityName, earnedSum, maxSum) {
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
    dedupeTexts(items = []) {
        const seen = new Set();
        const result = [];
        items.forEach((item) => {
            const text = String(item ?? '').trim();
            if (!text || seen.has(text))
                return;
            seen.add(text);
            result.push(text);
        });
        return result;
    }
    buildObservationSectionFromLists(title, positives = [], negatives = [], impediments = [], obstacles = [], dynamicOptionTypeLists = []) {
        const positivesList = this.dedupeTexts(positives);
        const negativesList = this.dedupeTexts(negatives);
        const impedimentsList = this.dedupeTexts(impediments);
        const obstaclesList = this.dedupeTexts(obstacles);
        const optionTypeLists = dynamicOptionTypeLists
            .map((item) => ({ ...item, items: this.dedupeTexts(item.items) }))
            .filter((item) => item.items.length > 0);
        const hasItems = positivesList.length > 0 ||
            negativesList.length > 0 ||
            impedimentsList.length > 0 ||
            obstaclesList.length > 0 ||
            optionTypeLists.length > 0;
        if (!hasItems)
            return null;
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
    mergeObservationSection(payload, sourceSection) {
        if (!payload || !sourceSection)
            return;
        if (!Array.isArray(payload.sections)) {
            payload.sections = [];
        }
        const existingIndex = payload.sections.findIndex((section) => section?.id === 'manual-notes' || section?.isManual);
        if (existingIndex === -1) {
            payload.sections.unshift(sourceSection);
            return;
        }
        const existing = payload.sections[existingIndex];
        const previousSource = existing.generatedObservationSource || null;
        const mergeList = (existingList = [], sourceList = [], previousSourceList = []) => {
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
                positivesList: [
                    ...(sourceSection.generatedObservationSource?.positivesList ||
                        sourceSection.positivesList ||
                        []),
                ],
                negativesList: [
                    ...(sourceSection.generatedObservationSource?.negativesList ||
                        sourceSection.negativesList ||
                        []),
                ],
                impedimentsList: [
                    ...(sourceSection.generatedObservationSource?.impedimentsList ||
                        sourceSection.impedimentsList ||
                        []),
                ],
                obstaclesList: [
                    ...(sourceSection.generatedObservationSource?.obstaclesList ||
                        sourceSection.obstaclesList ||
                        []),
                ],
            },
        };
        merged.showPositives = merged.positivesList.length > 0;
        merged.showNegatives = merged.negativesList.length > 0;
        merged.showImpediments = merged.impedimentsList.length > 0;
        merged.showObstacles = merged.obstaclesList.length > 0;
        merged.isEmpty = !(merged.showPositives ||
            merged.showNegatives ||
            merged.showImpediments ||
            merged.showObstacles);
        payload.sections[existingIndex] = merged;
    }
    async buildCampaignObservationSection(campaignId) {
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
        const positives = campaign.notes
            .filter((note) => note.type === 'positive')
            .map((note) => note.text);
        const negatives = campaign.notes
            .filter((note) => note.type === 'negative')
            .map((note) => note.text);
        const impediments = campaign.notes
            .filter((note) => note.type === 'impediment')
            .map((note) => note.text);
        const obstacles = campaign.notes
            .filter((note) => note.type === 'obstacle')
            .map((note) => note.text);
        const dynamicOptionTypes = {};
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
        return this.buildObservationSectionFromLists('الملاحظات والنتائج العامة للجنة التفتيشية', positives, negatives, impediments, obstacles, Object.values(dynamicOptionTypes));
    }
    calculateFinalEvaluationFromInspections(campaign) {
        let earnedSum = 0;
        let maxSum = 0;
        (campaign.inspections || [])
            .filter((inspection) => ['approved', 'pendingReview', 'draft'].includes(inspection.status))
            .forEach((inspection) => {
            (inspection.grades || []).forEach((grade) => {
                earnedSum += this.toNumber(grade.gradeEarned);
                maxSum += this.toNumber(grade.criteriaDetail?.maxGrade);
            });
        });
        return this.buildFinalEvaluationSummary(campaign.entity?.name, earnedSum, maxSum);
    }
    async calculateCampaignFinalEvaluation(campaignId) {
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
    normalizeReportSectionsVisibility(payload) {
        if (!payload)
            return;
        if (!payload.signatures) {
            payload.signatures = {};
        }
        if (payload.signatures.leaderRank === 'هيئة تفتيش قوى الامن الداخلي' ||
            !payload.signatures.leaderRank) {
        }
        if (payload.signatures.deputyRank === 'هيئة الرقابة والتفتيش' ||
            !payload.signatures.deputyRank) {
            payload.signatures.deputyRank = 'الفريق الحقوقي المفتش';
        }
        if (payload.signatures.deputyRole === 'عضو ومقرر اللجنة' ||
            !payload.signatures.deputyRole) {
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
        if (!payload.sections)
            return;
        payload.sections.forEach((sec) => {
            if (sec.isManual) {
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
                sec.isEmpty = !((sec.positivesList && sec.positivesList.length > 0) ||
                    (sec.negativesList && sec.negativesList.length > 0) ||
                    (sec.impedimentsList && sec.impedimentsList.length > 0) ||
                    (sec.obstaclesList && sec.obstaclesList.length > 0));
                sec.visible = sec.visible !== false;
            }
            else if (sec.subsections) {
                sec.subsections.forEach((sub) => {
                    const hasFindings = sub.findings && sub.findings.length > 0;
                    const hasEarnedScores = sub.earnedSum > 0;
                    const hasNotesText = sub.detailsList?.some((d) => d.includes('ملاحظة:'));
                    const hasQuantData = sub.hasQuantData === true;
                    sub.isEmpty =
                        !hasFindings && !hasEarnedScores && !hasNotesText && !hasQuantData;
                    sub.visible = sub.visible !== false && !sub.isEmpty;
                });
                sec.subsections = sec.subsections.filter((sub) => sub.visible);
                sec.isEmpty = sec.subsections.length === 0;
                sec.visible = sec.visible !== false && !sec.isEmpty;
            }
        });
    }
    async getCampaignReportPayload(campaignId) {
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
                    status: { in: ['approved', 'pendingReview', 'draft'] },
                },
            },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
        });
        const leaderName = campaign.leader
            ? `${campaign.leader.rank ? campaign.leader.rank.trim() + ' ' : ''}${campaign.leader.fullName.trim()}`
            : 'ليث محمد عبيد';
        const deputyName = campaign.deputy
            ? `${campaign.deputy.rank ? campaign.deputy.rank.trim() + ' ' : ''}${campaign.deputy.fullName.trim()}`
            : 'عاطف عبد الحسين راضي';
        const currentCommitteeMembers = [
            `${leaderName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; رئيـس اللجنة`,
            `${deputyName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; معـاون اللجنة`,
            ...campaign.members.map((m) => {
                const name = m.inspector.rank
                    ? `${m.inspector.rank.trim()} ${m.inspector.fullName.trim()}`
                    : m.inspector.fullName.trim();
                return `${name} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; عضـــــــــواً`;
            }),
        ];
        if (saved) {
            const savedPayload = typeof saved.payload === 'string'
                ? JSON.parse(saved.payload)
                : saved.payload;
            const isStale = latestGrade &&
                latestGrade.createdAt.getTime() > saved.updatedAt.getTime() + 1000;
            this.normalizeReportSectionsVisibility(savedPayload);
            const enrichNameWithRank = (savedName, dbInspector) => {
                if (!savedName || !dbInspector || !dbInspector.fullName)
                    return savedName;
                const fullName = dbInspector.fullName.trim();
                const rank = (dbInspector.rank || '').trim();
                if (!rank)
                    return savedName;
                const cleanSavedName = savedName
                    .replace(/<[^>]*>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                if (cleanSavedName.includes(fullName) && !cleanSavedName.includes(rank)) {
                    return `${rank} ${savedName}`;
                }
                return savedName;
            };
            if (savedPayload.committeeMembers && Array.isArray(savedPayload.committeeMembers)) {
                savedPayload.committeeMembers = savedPayload.committeeMembers.map((memberStr, idx) => {
                    if (idx === 0) {
                        return enrichNameWithRank(memberStr, campaign.leader);
                    }
                    else if (idx === 1) {
                        return enrichNameWithRank(memberStr, campaign.deputy);
                    }
                    else {
                        const memberIdx = idx - 2;
                        const campaignMember = campaign.members[memberIdx];
                        return enrichNameWithRank(memberStr, campaignMember?.inspector);
                    }
                });
            }
            if (savedPayload.signatures) {
                if (savedPayload.signatures.leaderName) {
                    savedPayload.signatures.leaderName = enrichNameWithRank(savedPayload.signatures.leaderName, campaign.leader);
                }
            }
            if (!savedPayload.signatures) {
                savedPayload.signatures = {};
            }
            if (!savedPayload.signatures.deputyName) {
                savedPayload.signatures.deputyName = 'عاطف عبد الحسين راضي';
            }
            if (!savedPayload.signatures.deputyRank) {
                savedPayload.signatures.deputyRank = 'الفريق الحقوقي المفتش';
            }
            if (!savedPayload.signatures.deputyRole) {
                savedPayload.signatures.deputyRole = 'رئيس هيئة تفتيش قوى الامن الداخلي';
            }
            if (!savedPayload.finalEvaluation) {
                savedPayload.finalEvaluation =
                    await this.calculateCampaignFinalEvaluation(campaignId);
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
    async saveReportPresentation(campaignId, payload) {
        const existing = await this.prisma.reportPresentation.findUnique({
            where: { campaignId },
        });
        if (payload && typeof payload === 'object') {
            if (payload.pdfReview !== undefined) {
                const sanitized = sanitizePdfReview(payload.pdfReview);
                if (sanitized === undefined) {
                    delete payload.pdfReview;
                }
                else {
                    payload.pdfReview = sanitized;
                }
            }
        }
        let history = [];
        if (existing) {
            const oldHistory = Array.isArray(existing.history)
                ? existing.history
                : [];
            const historyEntry = {
                version: oldHistory.length + 1,
                updatedAt: existing.updatedAt.toISOString(),
                payload: existing.payload,
            };
            history = [historyEntry, ...oldHistory].slice(0, 5);
            return this.prisma.reportPresentation.update({
                where: { campaignId },
                data: {
                    payload: payload,
                    history: history,
                },
            });
        }
        else {
            return this.prisma.reportPresentation.create({
                data: {
                    campaignId,
                    payload: payload,
                    history: [],
                },
            });
        }
    }
    async deleteReportPresentation(campaignId) {
        try {
            return await this.prisma.reportPresentation.delete({
                where: { campaignId },
            });
        }
        catch (e) {
            return null;
        }
    }
    async buildDefaultReportPayload(campaignId) {
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
        const validInspections = campaign.inspections.filter((i) => ['approved', 'pendingReview', 'draft'].includes(i.status));
        const targetInspections = validInspections.length > 0 ? validInspections : campaign.inspections;
        const mainInspection = campaign.inspections.find((i) => i.entityId === campaign.entityId) ||
            campaign.inspections.find((i) => i.status === 'approved') ||
            campaign.inspections.find((i) => i.status === 'pendingReview') ||
            campaign.inspections.find((i) => i.status === 'draft') ||
            campaign.inspections[0];
        const activeInspection = mainInspection;
        const pruningGradesMap = new Map();
        const gradesMap = new Map();
        const secondaryInstancesMap = new Map();
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
                        instSet = new Set();
                        secondaryInstancesMap.set(secId, instSet);
                    }
                    if (g.instanceName) {
                        instSet.add(g.instanceName);
                    }
                });
            }
        });
        let template = [];
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
        }
        else {
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
        const prunedTemplate = pruneTemplateTree(template, pruningGradesMap);
        let personnelTableRows = [];
        if (mainInspection && mainInspection.grades) {
            mainInspection.grades.forEach((grade) => {
                if ((grade.criteriaDetail.detailText.includes('المواقف الرسمية') ||
                    grade.criteriaDetail.detailText.includes('نسب التكامل')) &&
                    hasMeaningfulQuantitativeData(grade.quantitativeData)) {
                    try {
                        const parsed = typeof grade.quantitativeData === 'string'
                            ? JSON.parse(grade.quantitativeData)
                            : grade.quantitativeData;
                        if (Array.isArray(parsed)) {
                            personnelTableRows = parsed;
                        }
                        else if (parsed && Array.isArray(parsed.rows)) {
                            personnelTableRows = parsed.rows;
                        }
                    }
                    catch (e) {
                        this.logger.warn('Error parsing quantitative data', e);
                    }
                }
            });
        }
        const leaderName = campaign.leader
            ? `${campaign.leader.rank ? campaign.leader.rank.trim() + ' ' : ''}${campaign.leader.fullName.trim()}`
            : 'ليث محمد عبيد';
        const deputyName = campaign.deputy
            ? `${campaign.deputy.rank ? campaign.deputy.rank.trim() + ' ' : ''}${campaign.deputy.fullName.trim()}`
            : 'عاطف عبد الحسين راضي';
        const committeeMembers = [
            `${leaderName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; رئيـس اللجنة`,
            `${deputyName} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; معـاون اللجنة`,
            ...campaign.members.map((m) => {
                const name = m.inspector.rank
                    ? `${m.inspector.rank.trim()} ${m.inspector.fullName.trim()}`
                    : m.inspector.fullName.trim();
                return `${name} &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; عضـــــــــواً`;
            }),
        ];
        const campaignPositions = campaign.entity?.positions || [];
        const inspectionPositions = campaign.inspections.flatMap((insp) => insp.entity?.positions || []);
        const allPositions = [...campaignPositions, ...inspectionPositions];
        const positionsList = allPositions.map((pos) => ({
            id: pos.id,
            positionName: pos.positionName,
            rank: pos.rank || '—',
            positionHolder: pos.positionHolder || '—',
            statisticalNumber: pos.statisticalNumber || '—',
            joinedDate: pos.joinedDate
                ? new Date(pos.joinedDate).toLocaleDateString('ar-EG')
                : '—',
            positionStatus: pos.positionStatus || '—',
            education: pos.education || '—',
            notes: pos.notes || '—',
        }));
        const personnelRows = personnelTableRows.map((row) => {
            const nominal = row.authorized !== undefined ? row.authorized : row.nominal || 0;
            const actual = row.present !== undefined ? row.present : row.actual || 0;
            const increase = row.excess !== undefined ? row.excess : Math.max(0, actual - nominal);
            const deficit = row.shortage !== undefined
                ? row.shortage
                : Math.max(0, nominal - actual);
            const percentage = row.percentage !== undefined
                ? row.percentage
                : nominal > 0
                    ? ((actual / nominal) * 100).toFixed(0)
                    : '0';
            return {
                category: row.category,
                nominal,
                actual,
                increase,
                deficit,
                percentage: parseFloat(percentage),
            };
        });
        const manualPositives = campaign.notes
            .filter((n) => n.type === 'positive')
            .map((n) => n.text);
        const manualNegatives = campaign.notes
            .filter((n) => n.type === 'negative')
            .map((n) => n.text);
        const manualImpediments = campaign.notes
            .filter((n) => n.type === 'impediment')
            .map((n) => n.text);
        const manualObstacles = campaign.notes
            .filter((n) => n.type === 'obstacle')
            .map((n) => n.text);
        const evaluations = campaign.inspections
            .filter((i) => ['approved', 'pendingReview', 'draft'].includes(i.status))
            .map((insp) => {
            const commander = insp.entity?.positions?.find((p) => p.positionName.includes('آمر') || p.positionName.includes('مدير'));
            return {
                entityName: insp.entity?.name || '',
                commanderName: commander ? commander.positionHolder : 'غير متوفر',
                location: insp.location,
                totalScore: insp.totalScore,
                performanceRating: insp.performanceRating,
            };
        });
        const checklistPositives = [];
        const checklistNegatives = [];
        const checklistImpediments = [];
        const checklistObstacles = [];
        const checklistDynamicTypes = {};
        targetInspections.forEach((insp) => {
            if (insp.grades) {
                insp.grades.forEach((grade) => {
                    if (grade.selectedOptions) {
                        grade.selectedOptions.forEach((sel) => {
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
        function matchOfficerInfo(criterionTitle) {
            const titleClean = criterionTitle.replace(/[^\w\s]/g, '').trim();
            if (!titleClean || titleClean.length < 1)
                return null;
            const positionPrefixes = [
                'مدير',
                'آمر',
                'قائد',
                'معاون',
                'رئيس',
                'نائب',
                'مقرر',
            ];
            const prefixPattern = new RegExp(`^(${positionPrefixes.join('|')})\\s+`);
            let bestMatch = null;
            let bestScore = 0;
            for (const pos of allPositions) {
                const posName = pos.positionName || '';
                const posClean = posName.replace(prefixPattern, '').trim();
                if (!posClean)
                    continue;
                let score = 0;
                if (posClean === titleClean) {
                    score = 10;
                }
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
            if (!bestMatch || bestScore < 5)
                return null;
            return {
                positionName: bestMatch.positionName,
                rank: bestMatch.rank || '—',
                fullName: bestMatch.positionHolder || '—',
                statisticalNumber: bestMatch.statisticalNumber || '—',
                positionStatus: bestMatch.positionStatus || '—',
                joinedDate: bestMatch.joinedDate
                    ? new Date(bestMatch.joinedDate).toLocaleDateString('ar-EG')
                    : '—',
                education: bestMatch.education || '—',
                notes: bestMatch.notes || '—',
            };
        }
        function mapPerformanceToAssessment(score) {
            if (score === null || score === undefined)
                return '';
            const s = typeof score === 'string' ? parseFloat(score) : score;
            if (s >= 90)
                return 'جيد جداً';
            if (s >= 75)
                return 'جيد';
            if (s >= 60)
                return 'فوق الوسط';
            if (s >= 45)
                return 'وسط';
            return 'دون الوسط';
        }
        const sections = [];
        if (false && isEducational) {
            if (manualPositives.length > 0 ||
                manualNegatives.length > 0 ||
                manualImpediments.length > 0 ||
                manualObstacles.length > 0) {
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
        }
        else {
            const allPositives = this.dedupeTexts([
                ...manualPositives,
                ...checklistPositives,
            ]);
            const allNegatives = this.dedupeTexts([
                ...manualNegatives,
                ...checklistNegatives,
            ]);
            const allImpediments = this.dedupeTexts([
                ...manualImpediments,
                ...checklistImpediments,
            ]);
            const allObstacles = this.dedupeTexts([
                ...manualObstacles,
                ...checklistObstacles,
            ]);
            const optionTypeLists = Object.values(checklistDynamicTypes)
                .map((item) => ({ ...item, items: this.dedupeTexts(item.items) }))
                .filter((item) => item.items.length > 0);
            if (allPositives.length > 0 ||
                allNegatives.length > 0 ||
                allImpediments.length > 0 ||
                allObstacles.length > 0 ||
                optionTypeLists.length > 0) {
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
            {
                key: 'category',
                label: 'الفئة',
                type: 'text',
                required: true,
                role: 'label',
            },
            {
                key: 'nominal',
                label: 'الملاك',
                type: 'number',
                required: true,
                role: 'nominal',
            },
            {
                key: 'actual',
                label: 'الموجود',
                type: 'number',
                required: true,
                role: 'actual',
            },
            {
                key: 'deficit',
                label: 'النقص',
                type: 'number',
                required: false,
                role: 'deficit',
            },
            {
                key: 'increase',
                label: 'الزيادة',
                type: 'number',
                required: false,
                role: 'increase',
            },
            {
                key: 'percentage',
                label: 'النسبة %',
                type: 'percentage',
                required: false,
                role: 'percentage',
            },
        ];
        prunedTemplate.forEach((pri) => {
            const cleanPriTitle = pri.title.replace(/^[أ-ي]\.\s*/, '');
            const subsections = pri.secondaryCriteria.flatMap((sec) => {
                const cleanSecTitle = sec.title.replace(/^(أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً|حادي عشر|ثاني عشر|ثالث عشر|رابع عشر|خامس عشر|سادس عشر|سابع عشر|ثامن عشر|تاسع عشر|عشرون)\.\s*/, '');
                const instancesSet = secondaryInstancesMap.get(sec.id);
                const instancesList = [
                    null,
                    ...(instancesSet && instancesSet.size > 0
                        ? Array.from(instancesSet)
                        : []),
                ];
                return instancesList.map((instName) => {
                    const suffixKey = instName || 'default';
                    let earnedSum = 0;
                    let maxSum = 0;
                    sec.details.forEach((det) => {
                        const grade = gradesMap.get(`${det.id}_${suffixKey}`);
                        earnedSum += grade ? parseFloat(grade.gradeEarned) || 0 : 0;
                        maxSum += parseFloat(det.maxGrade);
                    });
                    const detailsList = sec.details.map((det) => {
                        const grade = gradesMap.get(`${det.id}_${suffixKey}`);
                        const rawScore = grade ? parseFloat(grade.gradeEarned) || 0 : 0;
                        const scoreText = `${rawScore.toFixed(1)} من ${parseFloat(det.maxGrade).toFixed(1)}`;
                        const noteText = grade && grade.notes ? ` - ملاحظة: ${grade.notes}` : '';
                        return `${det.detailText}: الدرجة المستحصلة ${scoreText} درجة${noteText}`;
                    });
                    const findings = [];
                    sec.details.forEach((det) => {
                        const grade = gradesMap.get(`${det.id}_${suffixKey}`);
                        if (grade && grade.selectedOptions) {
                            grade.selectedOptions.forEach((sel) => {
                                findings.push(sel.option.optionText);
                            });
                        }
                    });
                    let subInspection = targetInspections.find((i) => i.entityId === campaign.entityId) ||
                        targetInspections[0];
                    for (const det of sec.details) {
                        const grade = gradesMap.get(`${det.id}_${suffixKey}`);
                        if (grade) {
                            const insp = targetInspections.find((i) => i.id === grade.inspectionId);
                            if (insp) {
                                subInspection = insp;
                                break;
                            }
                        }
                    }
                    const assessment = subInspection
                        ? mapPerformanceToAssessment(subInspection.totalScore)
                        : '';
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
                                    joinedDate: oCred.joinedDate
                                        ? new Date(oCred.joinedDate).toLocaleDateString('ar-EG')
                                        : '—',
                                    education: oCred.education || '—',
                                    notes: oCred.notes || '—',
                                };
                            }
                        }
                        catch (err) {
                            this.logger.warn('Error parsing officerCredentials from subInspection:', err);
                        }
                    }
                    if (!officerInfo) {
                        officerInfo = matchOfficerInfo(cleanSecTitle);
                    }
                    let hasNotes = false;
                    let hasQuant = false;
                    sec.details.forEach((det) => {
                        const grade = gradesMap.get(`${det.id}_${suffixKey}`);
                        if (grade) {
                            if (grade.notes)
                                hasNotes = true;
                            if (hasMeaningfulQuantitativeData(grade.quantitativeData))
                                hasQuant = true;
                        }
                    });
                    const detailedTables = [];
                    targetInspections.forEach((insp) => {
                        if (!insp.grades)
                            return;
                        insp.grades.forEach((grade) => {
                            const belongsToSec = sec.details.some((d) => d.id === grade.detailId);
                            if (!belongsToSec)
                                return;
                            const matchesInstance = (grade.instanceName || 'default') === suffixKey;
                            if (!matchesInstance)
                                return;
                            const hasQuantData = hasMeaningfulQuantitativeData(grade.quantitativeData);
                            const isDetailedTable = grade.criteriaDetail.inputType === 'detailed_table';
                            if (hasQuantData || isDetailedTable) {
                                const schema = grade.criteriaDetail.tableSchema
                                    ? typeof grade.criteriaDetail.tableSchema === 'string'
                                        ? JSON.parse(grade.criteriaDetail.tableSchema)
                                        : grade.criteriaDetail.tableSchema
                                    : DEFAULT_PERSONNEL_SCHEMA;
                                let rawRows = [];
                                if (grade.quantitativeData) {
                                    const parsed = typeof grade.quantitativeData === 'string'
                                        ? JSON.parse(grade.quantitativeData)
                                        : grade.quantitativeData;
                                    if (Array.isArray(parsed)) {
                                        rawRows = parsed;
                                    }
                                    else if (parsed && Array.isArray(parsed.rows)) {
                                        rawRows = parsed.rows;
                                    }
                                }
                                const normalizedRows = rawRows.map((row) => {
                                    const nominalCol = schema.find((c) => c.role === 'nominal');
                                    const actualCol = schema.find((c) => c.role === 'actual');
                                    const deficitCol = schema.find((c) => c.role === 'deficit');
                                    const increaseCol = schema.find((c) => c.role === 'increase');
                                    const percentageCol = schema.find((c) => c.role === 'percentage');
                                    const nominalKey = nominalCol?.key || 'nominal';
                                    const actualKey = actualCol?.key || 'actual';
                                    const deficitKey = deficitCol?.key || 'deficit';
                                    const increaseKey = increaseCol?.key || 'increase';
                                    const percentageKey = percentageCol?.key || 'percentage';
                                    const nominalVal = row[nominalKey] !== undefined
                                        ? row[nominalKey]
                                        : row.authorized !== undefined
                                            ? row.authorized
                                            : row.nominal || 0;
                                    const actualVal = row[actualKey] !== undefined
                                        ? row[actualKey]
                                        : row.present !== undefined
                                            ? row.present
                                            : row.actual || 0;
                                    const deficitVal = row[deficitKey] !== undefined
                                        ? row[deficitKey]
                                        : row.shortage !== undefined
                                            ? row.shortage
                                            : Math.max(0, nominalVal - actualVal);
                                    const increaseVal = row[increaseKey] !== undefined
                                        ? row[increaseKey]
                                        : row.excess !== undefined
                                            ? row.excess
                                            : Math.max(0, actualVal - nominalVal);
                                    const percentageVal = row[percentageKey] !== undefined
                                        ? row[percentageKey]
                                        : row.percentage !== undefined
                                            ? row.percentage
                                            : nominalVal > 0
                                                ? Math.round((actualVal / nominalVal) * 100)
                                                : 0;
                                    const normalized = { ...row };
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
                    const fullTitle = instName
                        ? `${cleanSecTitle} / ${instName}`
                        : cleanSecTitle;
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
                        isEmpty: findings.length === 0 &&
                            !(earnedSum > 0) &&
                            !hasNotes &&
                            !hasQuant &&
                            detailedTables.length === 0,
                        hasQuantData: hasQuant || detailedTables.length > 0,
                        detailedTables,
                    };
                });
            });
            const visibleSubsections = subsections.filter((sub) => sub.visible !== false && !sub.isEmpty);
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
        const collectedPositions = [];
        const seenHolders = new Set();
        const getOfficerKey = (fullName, statisticalNumber, positionName) => {
            const cleanName = (fullName || '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
            const cleanStat = statisticalNumber &&
                statisticalNumber !== '—' &&
                statisticalNumber !== 'غير متوفر'
                ? statisticalNumber.replace(/\s+/g, '').trim().toLowerCase()
                : '';
            const cleanPos = (positionName || '')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();
            return `${cleanName}_${cleanStat}_${cleanPos}`;
        };
        sections.forEach((sec) => {
            if (sec.subsections) {
                sec.subsections.forEach((sub) => {
                    if (sub.officerInfo) {
                        const oi = sub.officerInfo;
                        const fullName = (oi.fullName || oi.name || '').trim();
                        const statisticalNumber = (oi.statisticalNumber || '—').trim();
                        if (fullName && fullName !== '—') {
                            const rawPosName = oi.positionName || sub.title || '—';
                            const positionName = rawPosName
                                .replace(/^(أولاً|ثانياً|ثالثاً|رابعاً|خامساً|سادساً|سابعاً|ثامناً|تاسعاً|عاشراً|حادي عشر|ثاني عشر|ثالث عشر|رابع عشر|خامس عشر|سادس عشر|سابع عشر|ثامن عشر|تاسع عشر|عشرون)\.\s*/, '')
                                .trim();
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
        const campaignMemberNames = new Set(campaign.members.map((m) => m.inspector.fullName.trim().toLowerCase()));
        if (campaign.leader)
            campaignMemberNames.add(campaign.leader.fullName.trim().toLowerCase());
        if (campaign.deputy)
            campaignMemberNames.add(campaign.deputy.fullName.trim().toLowerCase());
        const nonEmptySectionTitles = new Set();
        sections.forEach((sec) => {
            if (sec.subsections) {
                sec.subsections.forEach((sub) => {
                    if (!sub.isEmpty && sub.title) {
                        nonEmptySectionTitles.add(sub.title.trim().toLowerCase());
                    }
                });
            }
        });
        allPositions.forEach((pos) => {
            const holderName = (pos.positionHolder || '').trim();
            if (!holderName || holderName === '—')
                return;
            const posName = pos.positionName.trim().toLowerCase();
            const cleanHolderName = holderName.toLowerCase();
            const matchesSection = Array.from(nonEmptySectionTitles).some((title) => posName.includes(title) ||
                title.includes(posName.replace('مدير ', '').replace('قسم ', '').trim()));
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
                        joinedDate: pos.joinedDate
                            ? new Date(pos.joinedDate).toLocaleDateString('ar-EG')
                            : '—',
                        positionStatus: pos.positionStatus || '—',
                        education: pos.education || '—',
                        notes: pos.notes || '—',
                    });
                }
            }
        });
        const filteredPositionsList = collectedPositions;
        if (process.env.DEBUG_SECTIONS === 'true') {
            sections.forEach((sec) => {
                if (sec.subsections) {
                    sec.subsections.forEach((sub, subIdx) => {
                        this.logger.warn(`[SECTION DEBUG] section="${sec.title}" subsection="${sub.title}" ` +
                            `findings=${sub.findings?.length || 0} ` +
                            `earnedSum=${sub.earnedSum} ` +
                            `hasNotes=${sub.detailsList?.some((d) => d.includes('ملاحظة:')) || false} ` +
                            `hasQuant=${sub.hasQuantData === true} ` +
                            `isEmpty=${sub.isEmpty} ` +
                            `officerInfo=${!!sub.officerInfo} ` +
                            `visible=${sub.visible} ` +
                            `willRender=${sub.visible && !sub.isEmpty}`);
                    });
                    this.logger.warn(`[SECTION DEBUG] PRIMARY section="${sec.title}" ` +
                        `nonEmptySubs=${sec.subsections.filter((s) => !s.isEmpty).length}/${sec.subsections.length} ` +
                        `isEmpty=${sec.isEmpty} ` +
                        `visible=${sec.visible} ` +
                        `willRender=${sec.visible && !sec.isEmpty}`);
                }
            });
        }
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
            assignmentText: campaign.assignmentText ||
                `تنفيذاً لأمـــر السيد الـــــوزير المحترم وبنـــاط،ً على مــــــا جـــــــاط، بكتـــاب مكتب الــــوزير ذي العدد (ش/أ.س ${campaign.assignmentReference}) في ${new Date(campaign.assignmentDate).toLocaleDateString('ar-EG')}.`,
            committeeMembers,
            purposeText: campaign.purpose ||
                (isEducational
                    ? `اجراط، التفتيش التعليمي للمنطقة الأمنية (${zoneName}) في قيادة شرطة محافظة (${governorate}) لغرض بسط الأمن وفرض القانون وفقاً للمعايير الموحدة لتفتيش التشكيلات والمناطق الأمنية في اطار تطوير الأداط، المؤسسي لوزارة الداخلية، والوقوف على كافة متطلبات القيادة والسيطرة والانفتاح لكافة الأجهزة الأمنية العائدة لوزارتنا التي تقع ضمن أمرة المنطقة الأمنية المعنية.`
                    : `الوقوف على الجاهزية القتالية والأداط، الإداري والعمل التنظيمي والمهني للكيان المفتش وتحديد الثغرات ونقاط القوة والضعف وأسلوب معالجتها.`),
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
    generateHtmlFromPayload(payload) {
        const isEducational = payload.isEducation;
        const rawFormatting = payload.formatting || DEFAULT_FORMATTING_CONFIG;
        const formatting = sanitizeFormattingConfig(rawFormatting);
        const titleInlineStyle = this.buildReportTitleInlineStyle(formatting);
        const assignmentParagraphInlineStyle = this.buildAssignmentParagraphInlineStyle(rawFormatting);
        const assignmentHeadingInlineStyle = this.buildAssignmentHeadingInlineStyle(rawFormatting);
        const committeeHeadingInlineStyle = this.buildIntroHeadingInlineStyle(rawFormatting, 'committeeHeading');
        const purposeHeadingInlineStyle = this.buildIntroHeadingInlineStyle(rawFormatting, 'purposeHeading');
        const visitDateHeadingInlineStyle = this.buildIntroHeadingInlineStyle(rawFormatting, 'visitDateHeading');
        const numberingLevel1Style = this.buildNumberingLevelInlineStyle(rawFormatting, 1);
        const numberingLevel2Style = this.buildNumberingLevelInlineStyle(rawFormatting, 2);
        const numberingLevel3Style = this.buildNumberingLevelInlineStyle(rawFormatting, 3);
        const numberingLevel4Style = this.buildNumberingLevelInlineStyle(rawFormatting, 4);
        const numStyle = (text, style) => style ? `<span style="${style}">${text}</span>` : text;
        const sections = payload.sections || [];
        const ALLOWED_MANUAL_BREAKS = new Set([
            'title', 'assignment', 'committee', 'purpose', 'visit-date',
            'commanders-table', 'inspection-details', 'observations',
            'recommendations', 'final-evaluation', 'appendices', 'signatures',
        ]);
        const rawBreaks = Array.isArray(payload.manualBreaks) ? payload.manualBreaks : [];
        const manualBreaksSet = new Set(rawBreaks
            .filter((id) => typeof id === 'string')
            .map((id) => id.trim())
            .filter((id) => id.length > 0 && ALLOWED_MANUAL_BREAKS.has(id)));
        const shouldBreakBefore = (sectionId) => manualBreaksSet.has(sectionId);
        const finalEvaluationStatement = payload.finalEvaluation?.statement || '';
        const finalEvaluationSectionNumHtml = finalEvaluationStatement
            ? `<div class="section-num page-break-inside-avoid"${numberingLevel1Style ? ` style="${numberingLevel1Style}"` : ''}>${getLevel1Number(9, formatting)} ${finalEvaluationStatement}</div>`
            : '';
        const finalEvaluationSectionTitleHtml = finalEvaluationStatement
            ? `<div class="section-title page-break-inside-avoid"${numberingLevel1Style ? ` style="${numberingLevel1Style}"` : ''}>${getLevel1Number(10, formatting)} ${finalEvaluationStatement}</div>`
            : '';
        const manualObservationSection = sections.find((sec) => sec.isManual);
        const renderObservationItems = (items = []) => items.length > 0
            ? items
                .map((text, idx) => `
        <div style="margin-right: ${getIndentation(3, formatting)}; margin-bottom: 6px; font-size: 13.5px; text-align: justify;">
          ${numStyle(getLevel3Ordinal(idx + 1, formatting), numberingLevel3Style)} ${text}
        </div>
      `)
                .join('')
            : `<div style="margin-right: ${getIndentation(3, formatting)}; margin-bottom: 6px; font-size: 13.5px; color: #718096;">لا توجد ملاحظات ضمن هذا التصنيف.</div>`;
        const officialObservationsHtml = `
      <div class="section-num page-break-inside-avoid"${numberingLevel1Style ? ` style="${numberingLevel1Style}"` : ''}>${getLevel1Number(7, formatting)} الملاحظات</div>
      <div class="section-body">
        <div style="font-weight: bold; margin-top: 12px; font-size: 14px; margin-right: ${getIndentation(2, formatting)};">
          ${numStyle(getLevel2ArabicLetter(1, formatting), numberingLevel2Style)} الإيجابيات
        </div>
        ${renderObservationItems(manualObservationSection?.positivesList || [])}

        <div style="font-weight: bold; margin-top: 12px; font-size: 14px; margin-right: ${getIndentation(2, formatting)};">
          ${numStyle(getLevel2ArabicLetter(2, formatting), numberingLevel2Style)} السلبيات
        </div>
        ${renderObservationItems(manualObservationSection?.negativesList || [])}

        <div style="font-weight: bold; margin-top: 12px; font-size: 14px; margin-right: ${getIndentation(2, formatting)};">
          ${numStyle(getLevel2ArabicLetter(3, formatting), numberingLevel2Style)} المعوقات
        </div>
        ${renderObservationItems(manualObservationSection?.impedimentsList || [])}

        <div style="font-weight: bold; margin-top: 12px; font-size: 14px; margin-right: ${getIndentation(2, formatting)};">
          ${numStyle(getLevel2ArabicLetter(4, formatting), numberingLevel2Style)} المعاضل
        </div>
        ${renderObservationItems(manualObservationSection?.obstaclesList || [])}
      </div>
    `;
        const officialRecommendationsHtml = `
      <div class="section-num page-break-inside-avoid"${numberingLevel1Style ? ` style="${numberingLevel1Style}"` : ''}>${getLevel1Number(8, formatting)} التوصيات</div>
      <div class="section-body">
        ${payload.recommendations && payload.recommendations.length > 0
            ? `
          ${payload.recommendations
                .filter((r) => r.visible)
                .map((recGroup, idx) => `
            <div style="font-weight: bold; margin-top: 15px; font-size: 14px; margin-right: ${getIndentation(2, formatting)};">
              ${numStyle(getLevel2ArabicLetter(idx + 1, formatting), numberingLevel2Style)} ${recGroup.authority}
            </div>
            <div style="margin-right: ${getIndentation(3, formatting)};">
              ${recGroup.recs && recGroup.recs.length > 0
                ? recGroup.recs
                    .map((rec, recIdx) => `
                ${rec.pagination?.pageBreakBefore ? '<div class="page-break"></div>' : ''}
                <div style="margin-bottom: 8px;">
                  <div style="margin-bottom: 4px; font-size: 13.5px; font-weight: 500;${rec.designerOverride ? ' display: flex;' : ''}">
                    ${rec.designerOverride ? `<span style="white-space:nowrap">${numStyle(getLevel3Ordinal(recIdx + 1, formatting).replace('.', ':'), numberingLevel3Style)}</span><span style="white-space:pre-wrap;flex:1">${rec.text}</span>` : `${numStyle(getLevel3Ordinal(recIdx + 1, formatting).replace('.', ':'), numberingLevel3Style)} ${rec.text}`}
                  </div>
                  ${rec.children && rec.children.length > 0
                    ? `
                    <div style="margin-right: ${getIndentation(4, formatting)}; display: flex; flex-direction: column; gap: 4px;">
                      ${rec.children
                        .map((child) => `
                          <div style="font-size: 13px; color: #4a5568;${child.designerOverride ? ' display: flex;' : ''}">${child.designerOverride ? `<span style="white-space:nowrap">â€¢ </span><span style="white-space:pre-wrap;flex:1">${child.text}</span>` : `â€¢ ${child.text}`}</div>
                      `)
                        .join('')}
                    </div>
                  `
                    : ''}
                </div>
              `)
                    .join('')
                : `<div style="font-size: 13.5px; color: #718096; font-style: italic; margin-bottom: 10px;">لا توجد توصيات مدخلة تحت هذه الجهة.</div>`}
            </div>
          `)
                .join('')}
        `
            : `<div style="margin-right: ${getIndentation(2, formatting)}; font-size: 13.5px; color: #718096;">لا توجد توصيات مدخلة.</div>`}
      </div>
    `;
        let logoBase64 = '';
        try {
            const logoPath = path.join(__dirname, '..', '..', 'uploads', 'system', 'ministry-logo.png');
            if (fs.existsSync(logoPath)) {
                const logoBuffer = fs.readFileSync(logoPath);
                logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
            }
        }
        catch (e) {
            this.logger.warn('Failed to load logo in PDF generation', e);
        }
        let detailSectionHtml = '';
        let level2Idx = 1;
        const visibleSections = sections.filter((sec) => !sec.isManual && sec.visible && !sec.isEmpty);
        if (visibleSections.length === 0) {
            detailSectionHtml += `
        <div style="text-align: center; padding: 40px; margin-top: 30px; border: 2px dashed #cbd5e0; border-radius: 8px; background-color: #fafbfc; font-size: 15px; color: #c53030; font-family: 'Cairo', sans-serif; font-weight: bold; direction: rtl;">
          تنبيه: لا توجد أسس مرتبطة بهذا القالب التفتيشي
        </div>
      `;
        }
        const spacersConfig = Array.isArray(payload.spacers) ? payload.spacers.filter((s) => s && typeof s.heightMm === 'number') : [];
        let sectionRenderIdx = 0;
        sections.forEach((sec) => {
            if (sec.isManual)
                return;
            if (!sec.visible || sec.isEmpty)
                return;
            const priTitlePrefix = sec.numbering
                ? sec.numbering
                : getLevel2ArabicLetter(level2Idx++, formatting);
            const priTitleFormatted = `${numStyle(priTitlePrefix, numberingLevel2Style)} ${sec.title}`;
            let sectionNarrativeHtml = '';
            if (sec.narrativeText) {
                sectionNarrativeHtml = `
          <div style="margin-right: ${getIndentation(3, formatting)}; margin-bottom: 10px; font-size: 13.5px; text-align: justify;">
            ${sec.narrativeText}
          </div>
        `;
            }

            detailSectionHtml += `
        <div style="margin-top: 25px; margin-right: ${getIndentation(2, formatting)};">
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
              ${numStyle(getLevel3Ordinal(catIdx++, formatting), numberingLevel3Style)} الإيجابيات وعوامل القوة العامة:
            </div>`;
                    sec.positivesList.forEach((text, idx) => {
                        detailSectionHtml += `
              <div style="margin-right: ${getIndentation(4, formatting)}; font-size: 13.5px; margin-bottom: 4px; text-align: justify;">
                ${numStyle(getLevel5ArabicLetter(idx + 1, formatting), numberingLevel4Style)} ${text}
              </div>`;
                    });
                }
                if (sec.showNegatives && sec.negativesList?.length > 0) {
                    detailSectionHtml += `
            <div style="font-weight: bold; font-size: 14px; color: #742a2a; margin-right: ${getIndentation(3, formatting)}; margin-top: 12px; margin-bottom: 6px;">
              ${numStyle(getLevel3Ordinal(catIdx++, formatting), numberingLevel3Style)} السلبيات ونقاط التقصير العامة:
            </div>`;
                    sec.negativesList.forEach((text, idx) => {
                        detailSectionHtml += `
              <div style="margin-right: ${getIndentation(4, formatting)}; font-size: 13.5px; margin-bottom: 4px; text-align: justify;">
                ${numStyle(getLevel5ArabicLetter(idx + 1, formatting), numberingLevel4Style)} ${text}
              </div>`;
                    });
                }
                if (sec.showImpediments && sec.impedimentsList?.length > 0) {
                    detailSectionHtml += `
            <div style="font-weight: bold; font-size: 14px; color: #7b341e; margin-right: ${getIndentation(3, formatting)}; margin-top: 12px; margin-bottom: 6px;">
              ${numStyle(getLevel3Ordinal(catIdx++, formatting), numberingLevel3Style)} المعوقات العامة:
            </div>`;
                    sec.impedimentsList.forEach((text, idx) => {
                        detailSectionHtml += `
              <div style="margin-right: ${getIndentation(4, formatting)}; font-size: 13.5px; margin-bottom: 4px; text-align: justify;">
                ${numStyle(getLevel5ArabicLetter(idx + 1, formatting), numberingLevel4Style)} ${text}
              </div>`;
                    });
                }
                if (sec.showObstacles && sec.obstaclesList?.length > 0) {
                    detailSectionHtml += `
            <div style="font-weight: bold; font-size: 14px; color: #5a3e2b; margin-right: ${getIndentation(3, formatting)}; margin-top: 12px; margin-bottom: 6px;">
              ${numStyle(getLevel3Ordinal(catIdx++, formatting), numberingLevel3Style)} المعاضل العامة:
            </div>`;
                    sec.obstaclesList.forEach((text, idx) => {
                        detailSectionHtml += `
<div style="margin-right: ${getIndentation(4, formatting)}; font-size: 13.5px; margin-bottom: 4px; text-align: justify;">
                ${numStyle(getLevel5ArabicLetter(idx + 1, formatting), numberingLevel4Style)} ${text}
              </div>`;
                    });
                }
                if (!sec.positivesList && sec.findings && sec.findings.length > 0) {
                    sec.findings.forEach((text, idx) => {
                        const findingNum = numStyle(getLevel3Ordinal(idx + 1, formatting), numberingLevel3Style);
                        detailSectionHtml += `
              <div style="margin-right: ${getIndentation(3, formatting)}; font-size: 13.5px; margin-bottom: 6px; text-align: justify;">
                ${findingNum} ${text}
              </div>
            `;
                    });
                }
            }
            else if (sec.subsections) {
                let secOrdinalIdx = 1;
                sec.subsections.forEach((sub) => {
                    if (!sub.visible || sub.isEmpty)
                        return;
                    const toAr = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)]);
                    const subTitlePrefix = sub.numbering
                        ? sub.numbering
                        : getLevel3Ordinal(secOrdinalIdx++, formatting);
                    const subTitleStyled = `${numStyle(subTitlePrefix, numberingLevel3Style)} ${sub.title}`;

                    detailSectionHtml += `
            <div style="margin-top: 18px; margin-right: ${getIndentation(3, formatting)};">
              <div style="font-weight: bold; font-size: 14px; color: #1a202c; margin-bottom: 10px; padding-right: 8px;">
                ${subTitleStyled}
              </div>
          `;
                    let itemIdx = 1;
                    if (sub.officerInfo) {
                        const oi = sub.officerInfo;
                        const oiItems = [
                            `الرتبة والاسم الكامل / ${oi.rank} ${oi.fullName}.`,
                            `الرقم الإحصائي/ (${oi.statisticalNumber}).`,
                            `تاريخ استلام المنصب/ ${oi.joinedDate} (${oi.positionStatus}).`,
                        ];
                        if (oi.education && oi.education !== '—') {
                            oiItems.push(`التحصيل الدراسي/ ${oi.education}.`);
                        }
                        oiItems.forEach((text) => {
                            detailSectionHtml += `
                <div style="margin-right: ${getIndentation(4, formatting)}; font-size: 13.5px; margin-bottom: 5px; display: flex; gap: 6px; line-height: 1.8;">
                  <span class="pdf-parenthesized-number" style="font-weight: bold; min-width: 30px;${numberingLevel3Style ? ` ${numberingLevel3Style}` : ''}">(${toAr(itemIdx++)})</span>
                  <span>${text}</span>
                </div>
              `;
                        });
                    }
                    if (sub.findings && sub.findings.length > 0) {
                        sub.findings.forEach((text) => {
                            detailSectionHtml += `
                <div style="margin-right: ${getIndentation(4, formatting)}; font-size: 13.5px; margin-bottom: 5px; display: flex; gap: 6px; text-align: justify; line-height: 1.8;">
                  <span class="pdf-parenthesized-number" style="font-weight: bold; min-width: 30px;${numberingLevel3Style ? ` ${numberingLevel3Style}` : ''}">(${toAr(itemIdx++)})</span>
                  <span>${text}</span>
                </div>
              `;
                        });
                    }
                    if (sub.narrativeText) {
                        detailSectionHtml += `
              <div style="margin-right: ${getIndentation(4, formatting)}; font-size: 13px; margin-top: 6px; color: #4a5568; text-align: justify;">
                ${sub.narrativeText}
              </div>
            `;
                    }
                    if (sub.detailedTables && sub.detailedTables.length > 0) {
                        sub.detailedTables.forEach((table) => {
                            detailSectionHtml += `
                <div style="margin-top: 15px; margin-bottom: 20px; margin-right: ${getIndentation(4, formatting)};">
                  <div style="font-weight: bold; font-size: 13px; color: #0c2340; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    <span>${table.title}</span>
                    <span style="font-size: 11px; font-weight: normal; color: #718096; margin-right: auto;">(${table.entityName})</span>
                  </div>
                  <div style="overflow-x: auto; width: 100%;">
                    <table class="military-table" style="margin: 5px 0 10px 0; width: 100%; border-collapse: collapse;">
                      <thead>
                        <tr style="background-color: #f2f2f2;">
                          ${table.schema
                                .map((col) => `
                            <th style="padding: 6px 8px; border: 1px solid #000000; font-weight: bold; text-align: center; font-size: 12px;">
                              ${col.label}
                            </th>
                          `)
                                .join('')}
                        </tr>
                      </thead>
                      <tbody>
                        ${table.rows
                                .map((row) => `
                          <tr>
                            ${table.schema
                                .map((col) => {
                                const cellVal = row[col.key] !== undefined
                                    ? row[col.key]
                                    : '';
                                const isPercentage = col.role === 'percentage';
                                const formattedVal = isPercentage
                                    ? formatArabicTableValue(cellVal, {
                                        percentage: true,
                                    })
                                    : formatArabicTableValue(cellVal);
                                let textColor = '#000000';
                                if (col.role === 'deficit' &&
                                    Number(cellVal) > 0)
                                    textColor = '#c53030';
                                if (col.role === 'increase' &&
                                    Number(cellVal) > 0)
                                    textColor = '#2b6cb0';
                                const isBold = col.role === 'label' ||
                                    col.role === 'percentage' ||
                                    col.role === 'deficit' ||
                                    col.role === 'increase';
                                const fontWeight = isBold ? 'bold' : 'normal';
                                return `
                                <td style="padding: 6px; border: 1px solid #000000; text-align: center; font-size: 12px; color: ${textColor}; font-weight: ${fontWeight};">
                                  ${formattedVal}
                                </td>
                              `;
                            })
                                .join('')}
                          </tr>
                        `)
                                .join('')}
                        ${table.rows.length === 0 ? `<tr><td colspan="${table.schema.length}" style="padding: 10px; color: #a0aec0; text-align: center;">لا توجد سجلات.</td></tr>` : ''}
                      </tbody>
                    </table>
                  </div>
                </div>
              `;
                        });
                    }
                    detailSectionHtml += `</div>`;
                });
            }
            detailSectionHtml += `</div>`;
            const secSpacers = spacersConfig.filter((s) => s.afterSectionIndex === sectionRenderIdx);
            for (const sp of secSpacers) {
                detailSectionHtml += `<div style="height: ${sp.heightMm}mm;"></div>`;
            }
            sectionRenderIdx++;
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

        ${shouldBreakBefore('title') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        <div class="report-title" style="${titleInlineStyle}">
          ${payload.title}
        </div>

        ${shouldBreakBefore('assignment') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        <div class="section-num" style="${numberingLevel1Style ? numberingLevel1Style + '; ' : ''}${assignmentHeadingInlineStyle}">${getLevel1Number(1, formatting)} التكلـــــيف</div>
        <div class="section-body"${assignmentParagraphInlineStyle ? ` style="${assignmentParagraphInlineStyle}"` : ''}>
          ${payload.assignmentText}
        </div>

        ${shouldBreakBefore('committee') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        <div class="section-num" style="${numberingLevel1Style ? numberingLevel1Style + '; ' : ''}${committeeHeadingInlineStyle}">${getLevel1Number(2, formatting)} التــــأليف</div>
        <div class="section-body">
          <table style="width: 100%; max-width: 650px; border-collapse: collapse; border: none; margin-top: 10px;">
            <tbody>
              ${payload.committeeMembers
                .map((member) => {
                const parsed = parseCommitteeMember(member);
                return `
                  <tr>
                    <td style="border: none; padding: 4px 0; font-size: 15px; width: 60%; text-align: right;">${parsed.name}</td>
                    <td style="border: none; padding: 4px 0; font-size: 15px; width: 40%; text-align: right;">${parsed.role}</td>
                  </tr>
                `;
            })
                .join('')}
            </tbody>
          </table>
        </div>

        ${shouldBreakBefore('purpose') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        <div class="section-num" style="${numberingLevel1Style ? numberingLevel1Style + '; ' : ''}${purposeHeadingInlineStyle}">${getLevel1Number(3, formatting)} الغــــاية</div>
        <div class="section-body">
          ${payload.purposeText}
        </div>

        ${shouldBreakBefore('visit-date') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        <div class="section-num" style="${numberingLevel1Style ? numberingLevel1Style + '; ' : ''}${visitDateHeadingInlineStyle}">${getLevel1Number(4, formatting)} تاريخ التفتيش</div>
        <div class="section-body">
          ${payload.durationText}
        </div>

        ${shouldBreakBefore('commanders-table') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        <div class="section-num page-break-inside-avoid"${numberingLevel1Style ? ` style="${numberingLevel1Style}"` : ''}>${getLevel1Number(5, formatting)} جدول المدراط، والآمرين وشاغلي المناصب الأساسية</div>
        <div class="section-body">
          <table class="military-table">
            <thead>
              <tr>
                <th style="width: 5%">ت</th>
                <th style="width: 22%">المنصب</th>
                <th style="width: 10%">الرتبة</th>
                <th style="width: 17%">الاسم الكامل</th>
                <th style="width: 10%">الرقم الإحصائي</th>
                <th style="width: 16%">تاريخ إشغال المنصب</th>
                <th style="width: 10%">نوع الإشغال</th>
                <th style="width: 10%">التحصيل الدراسي</th>
              </tr>
            </thead>
            <tbody>
              ${payload.positions
                .map((pos, idx) => `
                <tr>
                  <td>${formatArabicTableValue(idx + 1)}</td>
                  <td><strong>${pos.positionName}</strong></td>
                  <td>${pos.rank}</td>
                  <td>${pos.positionHolder}</td>
                  <td>${formatArabicTableValue(pos.statisticalNumber)}</td>
                  <td>${pos.joinedDate}</td>
                  <td>${pos.positionStatus}</td>
                  <td>${pos.education}</td>
                </tr>
              `)
                .join('')}
              ${payload.positions.length === 0 ? '<tr><td colspan="8">لم يتم العثور على سجلات المدراط، والآمرين للكيان.</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        ${false && payload.personnelRows && payload.personnelRows.length > 0
                ? `
          <div class="section-num page-break-inside-avoid"${numberingLevel1Style ? ` style="${numberingLevel1Style}"` : ''}>${getLevel1Number(6, formatting)} المواقف الرسمية ونسب التكامل الفعلي</div>
          <div class="section-body">
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
                ${payload.personnelRows
                    .map((row) => `
                  <tr>
                    <td><strong>${row.category}</strong></td>
                    <td>${formatArabicTableValue(row.nominal)}</td>
                    <td>${formatArabicTableValue(row.actual)}</td>
                    <td>${formatArabicTableValue(row.increase)}</td>
                    <td>${formatArabicTableValue(row.deficit)}</td>
                    <td><strong>${formatArabicTableValue(parseFloat(row.percentage).toFixed(1), { percentage: true })}</strong></td>
                  </tr>
                `)
                    .join('')}
              </tbody>
            </table>
          </div>
        `
                : ''}
        ${shouldBreakBefore('inspection-details') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        <div class="section-num"${numberingLevel1Style ? ` style="${numberingLevel1Style}"` : ''}>${getLevel1Number(6, formatting)} تفاصيل التفتيش</div>
        <div class="section-body">
          ${detailSectionHtml}
        </div>

        ${shouldBreakBefore('observations') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        ${officialObservationsHtml}

        ${shouldBreakBefore('recommendations') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        ${officialRecommendationsHtml}

        ${shouldBreakBefore('final-evaluation') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        ${finalEvaluationSectionNumHtml}

        ${false &&
                payload.recommendations &&
                payload.recommendations.some((r) => r.visible && r.recs.length > 0)
                ? `
          <div class="section-num page-break-inside-avoid"${numberingLevel1Style ? ` style="${numberingLevel1Style}"` : ''}>${getLevel1Number(8, formatting)} التوصيات والمقترحات المرفوعة للمصادقة</div>
              <div class="section-body page-break-inside-avoid">
                ${payload.recommendations
                    .filter((r) => r.visible)
                    .map((recGroup, idx) => `
                  <div style="font-weight: bold; margin-top: 15px; font-size: 14px; margin-right: ${getIndentation(2, formatting)};">
                    ${numStyle(getLevel2ArabicLetter(idx + 1, formatting), numberingLevel2Style)} الموجهة إلى (${recGroup.authority}):
                  </div>
                  <div style="margin-right: ${getIndentation(3, formatting)};">
                    ${recGroup.recs
                    .map((r, rIdx) => `
                      <div style="margin-bottom: 6px; font-size: 13.5px; white-space: pre-wrap;">${numStyle(getLevel3Ordinal(rIdx + 1, formatting), numberingLevel3Style)} ${r}</div>
                    `)
                    .join('')}
                  </div>
                `)
                    .join('')}
              </div>
        `
                : ''}

        ${payload.appendices && payload.appendices.some((a) => a.visible)
                ? `
          ${shouldBreakBefore('appendices') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
          <div class="section-num"${numberingLevel1Style ? ` style="${numberingLevel1Style}"` : ''}>${getLevel1Number(10, formatting)} ملاحق التقرير التفتيشي</div>
          <div class="section-body">
            ${payload.appendices
                    .filter((a) => a.visible)
                    .map((app, idx) => `
              <div style="margin-bottom: 20px; margin-right: ${getIndentation(2, formatting)};">
                <div style="font-weight: bold; color: #0c2340; border-bottom: 1px dashed #cbd5e0; padding-bottom: 3px; margin-bottom: 8px;">
                  ${numStyle(getLevel2ArabicLetter(idx + 1, formatting), numberingLevel2Style)} ملحق (${app.symbol})
                </div>
                <div style="font-size: 13px;">${app.text}</div>
              </div>
            `)
                    .join('')}
          </div>
        `
                : ''}

        ${shouldBreakBefore('signatures') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        <br><br>
        <div class="signatures-container page-break-inside-avoid" style="margin-top: 40px; font-family: 'Cairo', sans-serif;">
          ${payload.signatures?.showMinisterSign !== false
                ? `
            <div style="display: flex; justify-content: flex-end; margin-bottom: 25px; padding-left: 5%;">
              <div style="text-align: center; width: 45%;">
                <p style="margin: 0 0 5px 0;"><strong>${payload.signatures?.ministerTitle || 'اصادق اصوليا'}</strong></p>
                <p style="margin: 0 0 5px 0; font-size: 15px;"><strong>${payload.signatures?.ministerName || 'وزيـــــــر الداخلية'}</strong></p>
                <p style="margin: 0; font-size: 12px; color: #4a5568;"><span dir="ltr" style="direction: ltr; display: inline-block;">${payload.signatures?.ministerDate || '٢٠٢٦/  / '}</span></p>
              </div>
            </div>
          `
                : ''}
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
        else {
            const manualSection = payload.sections.find((s) => s.isManual);
            const htmlManualPositives = manualSection?.positivesList || [];
            const htmlManualNegatives = manualSection?.negativesList || [];
            const htmlManualImpediments = manualSection?.impedimentsList || [];
            const htmlManualObstacles = manualSection?.obstaclesList || [];
            const htmlShowPositives = manualSection?.showPositives !== false &&
                htmlManualPositives.length > 0;
            const htmlShowNegatives = manualSection?.showNegatives !== false &&
                htmlManualNegatives.length > 0;
            const htmlShowImpediments = manualSection?.showImpediments !== false &&
                htmlManualImpediments.length > 0;
            const htmlShowObstacles = manualSection?.showObstacles !== false &&
                htmlManualObstacles.length > 0;
            const htmlOldFindings = !htmlManualPositives.length &&
                !htmlManualNegatives.length &&
                !htmlManualImpediments.length &&
                !htmlManualObstacles.length &&
                manualSection?.findings?.length
                ? manualSection.findings
                : [];
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

        ${shouldBreakBefore('title') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        <div class="report-title" style="${titleInlineStyle}">
          ${payload.title}
        </div>

        <div class="section-title"${numberingLevel1Style ? ` style="${numberingLevel1Style}"` : ''}>${getLevel1Number(1, formatting)} المعلومات الأساسية للحملة التفتيشية</div>
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

        <div class="section-title"${numberingLevel1Style ? ` style="${numberingLevel1Style}"` : ''}>${getLevel1Number(2, formatting)} جدول تقييم الأداط، الميداني للكيانات المفتشة</div>
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
              <td>${formatArabicTableValue(1)}</td>
              <td>${payload.targetEntityName || ''}</td>
              <td>مقر الكيان</td>
              <td>${formatArabicTableValue('100.0', { percentage: true })}</td>
            </tr>
          </tbody>
        </table>

        ${htmlShowPositives ||
                htmlShowNegatives ||
                htmlShowImpediments ||
                htmlShowObstacles ||
                htmlOldFindings.length > 0
                ? `
        ${shouldBreakBefore('observations') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        <div class="section-title"${numberingLevel1Style ? ` style="${numberingLevel1Style}"` : ''}>${getLevel1Number(3, formatting)} ${manualSection?.title || 'الملاحظات والنتائج العامة للجنة التفتيشية'}</div>
        <div style="margin-right: 15px;">
          ${htmlShowPositives
                    ? `
            <div style="font-weight: bold; color: #0c2340; margin-top: 15px;">
              ${numStyle(getLevel2ArabicLetter(1, formatting), numberingLevel2Style)} الإيجابيات ورصد كفاط،ة الأداط،:
            </div>
              ${htmlManualPositives
                        .map((note, idx) => `
              <div style="margin-right: 20px; margin-bottom: 4px;">
                ${numStyle(getLevel3Ordinal(idx + 1, formatting), numberingLevel3Style)} ${note}
              </div>
            `)
                        .join('')}
          `
                    : ''}

          ${htmlShowNegatives
                    ? `
            <div style="font-weight: bold; color: #0c2340; margin-top: 15px;">
              ${numStyle(getLevel2ArabicLetter(htmlShowPositives ? 2 : 1, formatting), numberingLevel2Style)} السلبيات ونقاط الضعف المرصودة:
            </div>
              ${htmlManualNegatives
                        .map((note, idx) => `
              <div style="margin-right: 20px; margin-bottom: 4px;">
                ${numStyle(getLevel3Ordinal(idx + 1, formatting), numberingLevel3Style)} ${note}
              </div>
            `)
                        .join('')}
          `
                    : ''}

          ${htmlShowImpediments || htmlShowObstacles
                    ? `
            <div style="font-weight: bold; color: #0c2340; margin-top: 15px;">
              ${numStyle(getLevel2ArabicLetter((htmlShowPositives ? 1 : 0) + (htmlShowNegatives ? 1 : 0) + 1, formatting), numberingLevel2Style)} المعوقات والمعاضل الميدانية:
            </div>
            ${htmlShowObstacles
                        ? htmlManualObstacles
                            .map((note, idx) => `
              <div style="margin-right: 20px; margin-bottom: 4px;">
                ${numStyle(getLevel3Ordinal(idx + 1, formatting), numberingLevel3Style)} ${note} (عائق)
              </div>
            `)
                            .join('')
                        : ''}
            ${htmlShowImpediments
                        ? htmlManualImpediments
                            .map((note, idx) => `
              <div style="margin-right: 20px; margin-bottom: 4px;">
                ${numStyle(getLevel3Ordinal((htmlShowObstacles ? htmlManualObstacles.length : 0) + idx + 1, formatting), numberingLevel3Style)} ${note} (معضلة حرجة)
              </div>
            `)
                            .join('')
                        : ''}
          `
                    : ''}

          ${htmlOldFindings.length > 0
                    ? htmlOldFindings
                        .map((text, idx) => `
            <div style="margin-right: 20px; margin-bottom: 4px;">
              ${numStyle(getLevel3Ordinal(idx + 1, formatting), numberingLevel3Style)} ${text}
            </div>
          `)
                        .join('')
                    : ''}
        </div>
        `
                : ''}

        ${payload.recommendations && payload.recommendations.length > 0
                ? `
          ${shouldBreakBefore('recommendations') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
          <div class="section-title"${numberingLevel1Style ? ` style="${numberingLevel1Style}"` : ''}>${getLevel1Number(4, formatting)} التوصيات</div>
          <div style="margin-right: 15px;">
            ${payload.recommendations
                    .filter((r) => r.visible)
                    .map((recGroup, idx) => `
              <div style="font-weight: bold; color: #0c2340; margin-top: 15px;">
                ${numStyle(getLevel2ArabicLetter(idx + 1, formatting), numberingLevel2Style)} ${recGroup.authority}
              </div>
              <div style="margin-right: 20px;">
                ${recGroup.recs && recGroup.recs.length > 0
                    ? recGroup.recs
                        .map((rec, recIdx) => `
                  ${rec.pagination?.pageBreakBefore ? '<div class="page-break"></div>' : ''}
                  <div style="margin-bottom: 8px;">
                    <div style="margin-bottom: 4px; font-size: 13.5px; font-weight: 500;${rec.designerOverride ? ' display: flex;' : ''}">
                      ${rec.designerOverride ? `<span style="white-space:nowrap">${numStyle(getLevel3Ordinal(recIdx + 1, formatting).replace('.', ':'), numberingLevel3Style)}</span><span style="white-space:pre-wrap;flex:1">${rec.text}</span>` : `${numStyle(getLevel3Ordinal(recIdx + 1, formatting).replace('.', ':'), numberingLevel3Style)} ${rec.text}`}
                    </div>
                    ${rec.children && rec.children.length > 0
                        ? `
                      <div style="margin-right: ${getIndentation(4, formatting)}; display: flex; flex-direction: column; gap: 4px;">
                        ${rec.children
                            .map((child) => `
                        <div style="font-size: 13px; color: #4a5568;${child.designerOverride ? ' display: flex;' : ''}">${child.designerOverride ? `<span style="white-space:nowrap">â€¢ </span><span style="white-space:pre-wrap;flex:1">${child.text}</span>` : `â€¢ ${child.text}`}</div>
                        `)
                            .join('')}
                      </div>
                    `
                        : ''}
                  </div>
                `)
                        .join('')
                    : `<div style="font-size: 13.5px; color: #718096; font-style: italic; margin-bottom: 10px;">لا توجد توصيات مدخلة تحت هذه الجهة.</div>`}
              </div>
            `)
                    .join('')}
          </div>
        `
                : ''}

        ${payload.appendices && payload.appendices.some((a) => a.visible)
                ? `
          ${shouldBreakBefore('appendices') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
          <div class="section-title"${numberingLevel1Style ? ` style="${numberingLevel1Style}"` : ''}>${getLevel1Number(5, formatting)} ملاحق التقرير التفتيشي</div>
          <div style="margin-right: 15px;">
            ${payload.appendices
                    .filter((a) => a.visible)
                    .map((app, idx) => `
              <div style="font-weight: bold; color: #0c2340; border-bottom: 1px dashed #cbd5e0; padding-bottom: 3px; margin-bottom: 8px;">
                ${numStyle(getLevel2ArabicLetter(idx + 1, formatting), numberingLevel2Style)} ملحق (${app.symbol})
              </div>
              <div style="font-size: 13px; margin-bottom: 15px;">${app.text}</div>
            `)
                    .join('')}
          </div>
        `
                : ''}

        ${shouldBreakBefore('final-evaluation') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        ${finalEvaluationSectionTitleHtml}

        ${shouldBreakBefore('signatures') ? '<div class="page-break page-break-inside-avoid"></div>' : ''}
        <br><br>
        <div class="signatures-container page-break-inside-avoid" style="margin-top: 40px; font-family: 'Cairo', sans-serif;">
          ${payload.signatures?.showMinisterSign !== false
                ? `
            <div style="display: flex; justify-content: flex-end; margin-bottom: 25px; padding-left: 5%;">
              <div style="text-align: center; width: 45%;">
                <p style="margin: 0 0 5px 0;"><strong>${payload.signatures?.ministerTitle || 'اصادق اصوليا'}</strong></p>
                <p style="margin: 0 0 5px 0; font-size: 15px;"><strong>${payload.signatures?.ministerName || 'وزيـــــــر الداخلية'}</strong></p>
                <p style="margin: 0; font-size: 12px; color: #4a5568;"><span dir="ltr" style="direction: ltr; display: inline-block;">${payload.signatures?.ministerDate || '٢٠٢٦/  / '}</span></p>
              </div>
            </div>
          `
                : ''}
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
        const officialRendererMarker = process.env.DEBUG ? '<!-- OFFICIAL_RENDERER_19C4 -->' : '';
        return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      ${officialRendererMarker}
      <meta charset="utf-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700&display=swap');
        :root {
          --ff: 'Cairo', 'Times New Roman', serif;
          --bfs: 14px;
          --lh: 1.7;
          --tc: #0c2340;
          --tfs: 21px;
          --tfw: bold;
          --ta: center;
          --nc: #0c2340;
          --hc: #0c2340;
          --hbc: #0c2340;
          --tbc: #000000;
          --thbg: #f2f2f2;
          --tcp: 8px 10px;
          --page-pt: 50px;
          --page-ph: 40px;
          ${this.buildFormattingCssVariables(formatting)}
        }
        .pdf-parenthesized-number {
          font-family: 'Noto Sans Arabic', 'Cairo', 'Times New Roman', serif;
        }
        body {
          font-family: var(--ff);
          margin: 0;
          padding: 0;
          color: #1a1a1a;
          background-color: #ffffff;
          line-height: var(--lh);
          font-size: var(--bfs);
          direction: rtl;
          text-align: right;
        }
        .pdf-page {
          max-width: 850px;
          margin: 0 auto;
          padding: 10px var(--page-ph) 6px;
          box-sizing: border-box;
          background-color: #ffffff;
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
          text-align: var(--ta);
          font-size: var(--tfs);
          font-weight: var(--tfw);
          margin: 30px 0;
          color: var(--tc);
          text-decoration: underline;
          text-underline-offset: 8px;
        }
        .section-num {
          font-size: 16px;
          font-weight: bold;
          color: var(--nc);
          margin-top: 30px;
          margin-bottom: 10px;
          page-break-after: avoid;
          break-after: avoid;
        }
        .section-title {
          font-size: 16px;
          font-weight: bold;
          color: var(--hc);
          border-bottom: 2px solid var(--hbc);
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
        }
        table.military-table th, table.military-table td {
          border: 1px solid var(--tbc);
          padding: var(--tcp);
          text-align: center;
          font-size: 13px;
        }
        table.military-table th {
          background-color: var(--thbg);
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
        ${this.buildFormattingCssOverrides(formatting)}

      </style>
    </head>
    <body>
      <div class="pdf-page">
        ${mainContentHtml}
      </div>
    </body>
    </html>
    `;
    }
    buildFormattingCssVariables(fc) {
        const vars = [];
        if (fc.fontFamily) {
            vars.push(`          --ff: '${fc.fontFamily}', 'Times New Roman', serif;`);
        }
        if (fc.baseFontSize) {
            vars.push(`          --bfs: ${fc.baseFontSize}px;`);
        }
        if (fc.headingColor) {
            vars.push(`          --hc: ${fc.headingColor};`);
            vars.push(`          --hbc: ${fc.headingColor};`);
        }
        if (fc.titleColor) {
            vars.push(`          --tc: ${fc.titleColor};`);
        }
        if (fc.titleFontSize) {
            vars.push(`          --tfs: ${fc.titleFontSize}px;`);
        }
        if (fc.titleFontWeight) {
            vars.push(`          --tfw: ${fc.titleFontWeight};`);
        }
        if (fc.titleAlign) {
            vars.push(`          --ta: ${fc.titleAlign};`);
        }
        if (fc.numberingColor) {
            vars.push(`          --nc: ${fc.numberingColor};`);
        }
        if (fc.tableBorderColor) {
            vars.push(`          --tbc: ${fc.tableBorderColor};`);
        }
        if (fc.tableHeaderBg) {
            vars.push(`          --thbg: ${fc.tableHeaderBg};`);
        }
        if (fc.tableCellPadding) {
            switch (fc.tableCellPadding) {
                case 'compact':
                    vars.push('          --tcp: 4px 6px;');
                    break;
                case 'comfortable':
                    vars.push('          --tcp: 12px 16px;');
                    break;
                case 'normal':
                default:
                    vars.push('          --tcp: 8px 10px;');
                    break;
            }
        }
        if (fc.density) {
            switch (fc.density) {
                case 'compact':
                    vars.push('          --lh: 1.5;');
                    vars.push('          --page-pt: 30px;');
                    vars.push('          --page-ph: 25px;');
                    break;
                case 'comfortable':
                    vars.push('          --lh: 2.0;');
                    vars.push('          --page-pt: 70px;');
                    vars.push('          --page-ph: 55px;');
                    break;
                case 'normal':
                default:
                    vars.push('          --lh: 1.7;');
                    vars.push('          --page-pt: 50px;');
                    vars.push('          --page-ph: 40px;');
                    break;
            }
        }
        return vars.length > 0 ? vars.join('\n') : '';
    }
    buildFormattingCssOverrides(fc) {
        const rules = [];
        if (fc.headingColor) {
            rules.push(`        [style*="color: #0c2340"] { color: ${fc.headingColor} !important; }`);
        }
        if (fc.tableBorderColor) {
            rules.push(`        [style*="border: 1px solid #000000"] { border-color: ${fc.tableBorderColor} !important; }`);
        }
        if (fc.tableHeaderBg) {
            rules.push(`        [style*="background-color: #f2f2f2"] { background-color: ${fc.tableHeaderBg} !important; }`);
        }
        return rules.length > 0 ? '\n' + rules.join('\n') : '';
    }
    buildReportTitleInlineStyle(fc) {
        const parts = [];
        if (fc.titleColor) {
            parts.push(`color: ${fc.titleColor}`);
        }
        if (fc.titleFontSize) {
            parts.push(`font-size: ${fc.titleFontSize}px`);
        }
        if (fc.titleFontWeight) {
            parts.push(`font-weight: ${fc.titleFontWeight}`);
        }
        if (fc.titleAlign) {
            parts.push(`text-align: ${fc.titleAlign}`);
        }
        return parts.join('; ');
    }
    buildAssignmentParagraphInlineStyle(rawFmt) {
        const parts = [];
        if (rawFmt?.assignmentParagraphColor) {
            parts.push(`color: ${rawFmt.assignmentParagraphColor}`);
        }
        if (rawFmt?.assignmentParagraphFontSize) {
            parts.push(`font-size: ${rawFmt.assignmentParagraphFontSize}px`);
        }
        if (rawFmt?.assignmentParagraphFontWeight) {
            parts.push(`font-weight: ${rawFmt.assignmentParagraphFontWeight}`);
        }
        if (rawFmt?.assignmentParagraphLineHeight) {
            parts.push(`line-height: ${rawFmt.assignmentParagraphLineHeight}`);
        }
        return parts.join('; ');
    }
    buildAssignmentHeadingInlineStyle(rawFmt) {
        const parts = [];
        if (rawFmt?.assignmentHeadingColor) {
            parts.push(`color: ${rawFmt.assignmentHeadingColor}`);
        }
        if (rawFmt?.assignmentHeadingFontSize) {
            parts.push(`font-size: ${rawFmt.assignmentHeadingFontSize}px`);
        }
        if (rawFmt?.assignmentHeadingFontWeight) {
            parts.push(`font-weight: ${rawFmt.assignmentHeadingFontWeight}`);
        }
        return parts.join('; ');
    }
    buildIntroHeadingInlineStyle(rawFmt, prefix) {
        const parts = [];
        const colorKey = `${prefix}Color`;
        const fontSizeKey = `${prefix}FontSize`;
        const fontWeightKey = `${prefix}FontWeight`;
        if (rawFmt?.[colorKey]) {
            parts.push(`color: ${rawFmt[colorKey]}`);
        }
        if (rawFmt?.[fontSizeKey]) {
            parts.push(`font-size: ${rawFmt[fontSizeKey]}px`);
        }
        if (rawFmt?.[fontWeightKey]) {
            parts.push(`font-weight: ${rawFmt[fontWeightKey]}`);
        }
        return parts.join('; ');
    }
    buildNumberingLevelInlineStyle(rawFmt, level) {
        const parts = [];
        const color = rawFmt?.[`numberingLevel${level}Color`];
        const fontSize = rawFmt?.[`numberingLevel${level}FontSize`];
        const weight = rawFmt?.[`numberingLevel${level}Weight`];
        if (color)
            parts.push(`color: ${color}`);
        if (fontSize && Number(fontSize) > 0)
            parts.push(`font-size: ${Number(fontSize)}px`);
        if (weight && weight !== 'normal')
            parts.push(`font-weight: ${weight}`);
        return parts.join('; ');
    }
    async generateCampaignReportPdf(campaignId: any, payload: any = null) {
        if (!payload) {
            payload = await this.getCampaignReportPayload(campaignId);
        }
        else {
            this.normalizeReportSectionsVisibility(payload);
            if (!payload.finalEvaluation) {
                payload.finalEvaluation =
                    await this.calculateCampaignFinalEvaluation(campaignId);
            }
            const currentObservationSection = await this.buildCampaignObservationSection(campaignId);
            this.mergeObservationSection(payload, currentObservationSection);
            this.normalizeReportSectionsVisibility(payload);
        }
        const htmlContent = this.generateHtmlFromPayload(payload);
        this.logger.log('[19C-4 OFFICIAL EXPORT PATH CONFIRMED] campaignId=' + campaignId + ' htmlLength=' + htmlContent.length);
        const browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            headerTemplate: '<div style="width:100%;text-align:center;font-family:Cairo,Arial,sans-serif;font-size:10px;font-weight:700;direction:rtl;">سري</div>',
            footerTemplate: '<div style="width:100%;text-align:center;font-family:Cairo,Arial,sans-serif;font-size:9px;font-weight:700;direction:rtl;line-height:1.3;"><div style="text-decoration:underline;text-underline-offset:2px;">سري</div><div>(<span class="pageNumber"></span> - <span class="totalPages"></span>)</div></div>',
            margin: {
                top: '20mm',
                bottom: '22mm',
                left: '10mm',
                right: '10mm',
            },
        });
        await browser.close();
        return Buffer.from(pdfBuffer);
    }
    async generateCampaignReportWord(campaignId: any, payload: any = null) {
        if (!payload) {
            payload = await this.getCampaignReportPayload(campaignId);
        }
        else {
            this.normalizeReportSectionsVisibility(payload);
            if (!payload.finalEvaluation) {
                payload.finalEvaluation =
                    await this.calculateCampaignFinalEvaluation(campaignId);
            }
            const currentObservationSection = await this.buildCampaignObservationSection(campaignId);
            this.mergeObservationSection(payload, currentObservationSection);
            this.normalizeReportSectionsVisibility(payload);
        }
        const formatting = payload.formatting || DEFAULT_FORMATTING_CONFIG;
        const isEducational = payload.isEducation;
        const tableBorders = {
            top: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '000000' },
            bottom: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '000000' },
            left: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '000000' },
            right: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '000000' },
            insideHorizontal: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '000000' },
            insideVertical: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '000000' },
        };
        const whiteBorders = {
            top: { style: docx_1.BorderStyle.SINGLE, size: 4, color: 'FFFFFF' },
            bottom: { style: docx_1.BorderStyle.SINGLE, size: 4, color: 'FFFFFF' },
            left: { style: docx_1.BorderStyle.SINGLE, size: 4, color: 'FFFFFF' },
            right: { style: docx_1.BorderStyle.SINGLE, size: 4, color: 'FFFFFF' },
            insideHorizontal: { style: docx_1.BorderStyle.SINGLE, size: 4, color: 'FFFFFF' },
            insideVertical: { style: docx_1.BorderStyle.SINGLE, size: 4, color: 'FFFFFF' },
        };
        const noBorders = {
            top: { style: docx_1.BorderStyle.NONE },
            bottom: { style: docx_1.BorderStyle.NONE },
            left: { style: docx_1.BorderStyle.NONE },
            right: { style: docx_1.BorderStyle.NONE },
            insideHorizontal: { style: docx_1.BorderStyle.NONE },
            insideVertical: { style: docx_1.BorderStyle.NONE },
        };
        const logoPath = path.join(__dirname, '..', '..', 'uploads', 'system', 'ministry-logo.png');
        const hasLogo = fs.existsSync(logoPath);
        const docChildren = [];
        const headerTableCellBorders = {
            top: { style: docx_1.BorderStyle.NONE },
            bottom: { style: docx_1.BorderStyle.SINGLE, size: 12, color: '000000' },
            left: { style: docx_1.BorderStyle.NONE },
            right: { style: docx_1.BorderStyle.NONE },
        };
        const headerTable = new docx_1.Table({
            width: { size: 100, type: docx_1.WidthType.PERCENTAGE },
            borders: noBorders,
            rows: [
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({
                            width: { size: 35, type: docx_1.WidthType.PERCENTAGE },
                            borders: headerTableCellBorders,
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'جمهورية العراق',
                                            bold: true,
                                            size: 24,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.RIGHT,
                                    bidirectional: true,
                                }),
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'وزارة الداخلية',
                                            bold: true,
                                            size: 24,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.RIGHT,
                                    bidirectional: true,
                                }),
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'هيئة تفتيش قوى الامن الداخلي',
                                            bold: true,
                                            size: 24,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.RIGHT,
                                    bidirectional: true,
                                }),
                            ],
                        }),
                        new docx_1.TableCell({
                            width: { size: 30, type: docx_1.WidthType.PERCENTAGE },
                            borders: headerTableCellBorders,
                            children: hasLogo
                                ? [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.ImageRun({
                                                type: 'png',
                                                data: fs.readFileSync(logoPath),
                                                transformation: {
                                                    width: 65,
                                                    height: 65,
                                                },
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                    }),
                                ]
                                : [],
                        }),
                        new docx_1.TableCell({
                            width: { size: 35, type: docx_1.WidthType.PERCENTAGE },
                            borders: headerTableCellBorders,
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'التاريخ: ',
                                            bold: true,
                                            size: 22,
                                            font: 'Cairo',
                                        }),
                                        new docx_1.TextRun({
                                            text: payload.startDateText ||
                                                (payload.startDate
                                                    ? new Date(payload.startDate).toLocaleDateString('ar-EG')
                                                    : '—'),
                                            size: 22,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.LEFT,
                                    bidirectional: true,
                                }),
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'العدد: ',
                                            bold: true,
                                            size: 22,
                                            font: 'Cairo',
                                        }),
                                        new docx_1.TextRun({
                                            text: payload.formationNumber || '—',
                                            size: 22,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.LEFT,
                                    bidirectional: true,
                                }),
                            ],
                        }),
                    ],
                }),
            ],
        });
        docChildren.push(headerTable, new docx_1.Paragraph({
            children: [new docx_1.TextRun({ text: '' })],
            spacing: { before: 200 },
        }), new docx_1.Paragraph({
            children: [
                new docx_1.TextRun({
                    text: payload.title,
                    bold: true,
                    size: 32,
                    underline: {},
                }),
            ],
            alignment: docx_1.AlignmentType.CENTER,
            bidirectional: true,
        }), new docx_1.Paragraph({
            children: [new docx_1.TextRun({ text: '' })],
            spacing: { before: 400 },
        }));
        const heading1Style = (text) => new docx_1.Paragraph({
            children: [
                new docx_1.TextRun({
                    text,
                    bold: true,
                    size: 28,
                    color: '0C2340',
                    rightToLeft: true,
                    font: 'Cairo',
                }),
            ],
            spacing: { before: 300, after: 150 },
            bidirectional: true,
        });
        const bodyStyle = (text, level = 1) => {
            const rightIndent = formatting.enableLevels[`level${level}`]
                ? formatting.indentations[`level${level}`] * 14.4
                : 0;
            return new docx_1.Paragraph({
                children: [
                    new docx_1.TextRun({ text, size: 24, rightToLeft: true, font: 'Cairo' }),
                ],
                spacing: { after: 120 },
                indent: { right: rightIndent },
                bidirectional: true,
            });
        };
        if (isEducational) {
            docChildren.push(heading1Style(`${getLevel1Number(1, formatting)} التكلـــــيف`));
            docChildren.push(bodyStyle(payload.assignmentText));
            docChildren.push(heading1Style(`${getLevel1Number(2, formatting)} التــــأليف`));
            if (payload.committeeMembers && payload.committeeMembers.length > 0) {
                const memberRows = [];
                payload.committeeMembers.forEach((member) => {
                    const parsed = parseCommitteeMember(member);
                    memberRows.push(new docx_1.TableRow({
                        children: [
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: parsed.name,
                                                size: 24,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.RIGHT,
                                        bidirectional: true,
                                    }),
                                ],
                                width: { size: 5415, type: docx_1.WidthType.DXA },
                            }),
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: parsed.role,
                                                size: 24,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.RIGHT,
                                        bidirectional: true,
                                    }),
                                ],
                                width: { size: 3611, type: docx_1.WidthType.DXA },
                            }),
                        ],
                    }));
                });
                docChildren.push(new docx_1.Table({
                    width: { size: 9026, type: docx_1.WidthType.DXA },
                    visuallyRightToLeft: true,
                    borders: noBorders,
                    columnWidths: [5415, 3611],
                    rows: memberRows,
                }), new docx_1.Paragraph({ text: '', spacing: { after: 200 } }));
            }
            docChildren.push(heading1Style(`${getLevel1Number(3, formatting)} الغــــاية`));
            docChildren.push(bodyStyle(payload.purposeText));
            docChildren.push(heading1Style(`${getLevel1Number(4, formatting)} تاريخ التفتيش`));
            docChildren.push(bodyStyle(payload.durationText));
            docChildren.push(heading1Style(`${getLevel1Number(5, formatting)} جدول المدراط، والآمرين وشاغلي المناصب الأساسية`));
            const posTableRows = [
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'ت',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F2F2F2' },
                            width: { size: 451, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'المنصب',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F2F2F2' },
                            width: { size: 1805, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'الرتبة',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F2F2F2' },
                            width: { size: 903, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'الاسم الكامل',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F2F2F2' },
                            width: { size: 1354, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'الرقم الإحصائي',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F2F2F2' },
                            width: { size: 903, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'تاريخ إشغال المنصب',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F2F2F2' },
                            width: { size: 1354, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'نوع الإشغال',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F2F2F2' },
                            width: { size: 903, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'التحصيل الدراسي',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F2F2F2' },
                            width: { size: 903, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'الملاحظات',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F2F2F2' },
                            width: { size: 1350, type: docx_1.WidthType.DXA },
                        }),
                    ],
                }),
            ];
            payload.positions.forEach((pos, idx) => {
                posTableRows.push(new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: formatArabicTableValue(idx + 1),
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 451, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: pos.positionName || '',
                                            bold: true,
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 1805, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: pos.rank || '',
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 903, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: pos.positionHolder || '',
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 1354, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: pos.statisticalNumber
                                                ? formatArabicTableValue(pos.statisticalNumber)
                                                : '',
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 903, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: pos.joinedDate || '',
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 1354, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: pos.positionStatus || '',
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 903, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: pos.education || '',
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 903, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: pos.notes || '',
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 1350, type: docx_1.WidthType.DXA },
                        }),
                    ],
                }));
            });
            docChildren.push(new docx_1.Table({
                width: { size: 9026, type: docx_1.WidthType.DXA },
                visuallyRightToLeft: true,
                borders: tableBorders,
                columnWidths: [451, 1805, 903, 1354, 903, 1354, 903, 903, 1350],
                rows: posTableRows,
            }), new docx_1.Paragraph({ text: '' }));
            if (false && payload.personnelRows && payload.personnelRows.length > 0) {
                docChildren.push(heading1Style(`${getLevel1Number(6, formatting)} المواقف الرسمية ونسب التكامل الفعلي`));
                const quantTableRows = [
                    new docx_1.TableRow({
                        children: [
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: 'الفئة',
                                                bold: true,
                                                size: 22,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    }),
                                ],
                                shading: { fill: 'F2F2F2' },
                                width: { size: 2708, type: docx_1.WidthType.DXA },
                            }),
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: 'الملاك',
                                                bold: true,
                                                size: 22,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    }),
                                ],
                                shading: { fill: 'F2F2F2' },
                                width: { size: 1264, type: docx_1.WidthType.DXA },
                            }),
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: 'الموجود',
                                                bold: true,
                                                size: 22,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    }),
                                ],
                                shading: { fill: 'F2F2F2' },
                                width: { size: 1264, type: docx_1.WidthType.DXA },
                            }),
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: 'الزيادة',
                                                bold: true,
                                                size: 22,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    }),
                                ],
                                shading: { fill: 'F2F2F2' },
                                width: { size: 1264, type: docx_1.WidthType.DXA },
                            }),
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: 'النقص',
                                                bold: true,
                                                size: 22,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    }),
                                ],
                                shading: { fill: 'F2F2F2' },
                                width: { size: 1264, type: docx_1.WidthType.DXA },
                            }),
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: 'نسبة التكامل',
                                                bold: true,
                                                size: 22,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    }),
                                ],
                                shading: { fill: 'F2F2F2' },
                                width: { size: 1262, type: docx_1.WidthType.DXA },
                            }),
                        ],
                    }),
                ];
                payload.personnelRows.forEach((row) => {
                    const nominal = row.authorized !== undefined ? row.authorized : row.nominal || 0;
                    const actual = row.present !== undefined ? row.present : row.actual || 0;
                    const increase = row.excess !== undefined
                        ? row.excess
                        : Math.max(0, actual - nominal);
                    const deficit = row.shortage !== undefined
                        ? row.shortage
                        : Math.max(0, nominal - actual);
                    const percentage = row.percentage !== undefined
                        ? row.percentage
                        : nominal > 0
                            ? ((actual / nominal) * 100).toFixed(0)
                            : '0';
                    quantTableRows.push(new docx_1.TableRow({
                        children: [
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: row.category || '',
                                                bold: true,
                                                size: 20,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.RIGHT,
                                        bidirectional: true,
                                    }),
                                ],
                                width: { size: 2708, type: docx_1.WidthType.DXA },
                            }),
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: formatArabicTableValue(nominal),
                                                size: 20,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    }),
                                ],
                                width: { size: 1264, type: docx_1.WidthType.DXA },
                            }),
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: formatArabicTableValue(actual),
                                                size: 20,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    }),
                                ],
                                width: { size: 1264, type: docx_1.WidthType.DXA },
                            }),
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: formatArabicTableValue(increase),
                                                size: 20,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                                color: '2b6cb0',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    }),
                                ],
                                width: { size: 1264, type: docx_1.WidthType.DXA },
                            }),
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: formatArabicTableValue(deficit),
                                                size: 20,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                                color: 'c53030',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    }),
                                ],
                                width: { size: 1264, type: docx_1.WidthType.DXA },
                            }),
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: formatArabicTableValue(parseFloat(percentage).toFixed(1), { percentage: true }),
                                                bold: true,
                                                size: 20,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    }),
                                ],
                                width: { size: 1262, type: docx_1.WidthType.DXA },
                            }),
                        ],
                    }));
                });
                docChildren.push(new docx_1.Table({
                    width: { size: 9026, type: docx_1.WidthType.DXA },
                    visuallyRightToLeft: true,
                    borders: tableBorders,
                    columnWidths: [2708, 1264, 1264, 1264, 1264, 1262],
                    rows: quantTableRows,
                }), new docx_1.Paragraph({ text: '' }));
            }
            docChildren.push(new docx_1.Paragraph({ children: [new docx_1.PageBreak()] }));
            docChildren.push(heading1Style(`${getLevel1Number(6, formatting)} تفاصيل التفتيش`));
            docChildren.push(bodyStyle('بناط،ً على التوجيهات الرسمية، تم تجميع وتصنيف كافة نتائج التفتيش الميداني وأسس التقييم والخيارات المرصودة والملاحظات والدرجات للمنطقة الأمنية المعنية بشكل منظم ومبوب كما يلي:'));
            docChildren.push(new docx_1.Paragraph({ text: '' }));
            let l2Idx = 1;
            const visibleSections = payload.sections?.filter((sec) => sec.visible && !sec.isEmpty) ||
                [];
            if (visibleSections.length === 0) {
                docChildren.push(new docx_1.Paragraph({
                    children: [
                        new docx_1.TextRun({
                            text: 'تنبيه: لا توجد أسس مرتبطة بهذا القالب التفتيشي',
                            bold: true,
                            size: 24,
                            color: 'C53030',
                            font: 'Cairo',
                        }),
                    ],
                    spacing: { before: 200, after: 100 },
                    alignment: docx_1.AlignmentType.CENTER,
                    bidirectional: true,
                }));
            }
            payload.sections.forEach((sec) => {
                if (sec.isManual)
                    return;
                if (!sec.visible || sec.isEmpty)
                    return;
                const priTitlePrefix = sec.numbering
                    ? sec.numbering
                    : getLevel2ArabicLetter(l2Idx++, formatting);
                const priTitleFormatted = `${priTitlePrefix} ${sec.title}`;
                docChildren.push(new docx_1.Paragraph({
                    children: [
                        new docx_1.TextRun({
                            text: priTitleFormatted,
                            bold: true,
                            size: 26,
                            color: '0C2340',
                            font: 'Cairo',
                        }),
                    ],
                    spacing: { before: 200, after: 100 },
                    indent: {
                        right: formatting.enableLevels.level2
                            ? formatting.indentations.level2 * 14.4
                            : 0,
                    },
                    bidirectional: true,
                }));
                if (sec.narrativeText) {
                    docChildren.push(new docx_1.Paragraph({
                        children: [
                            new docx_1.TextRun({
                                text: sec.narrativeText,
                                size: 22,
                                rightToLeft: true,
                                font: 'Cairo',
                            }),
                        ],
                        spacing: { after: 100 },
                        indent: {
                            right: formatting.enableLevels.level3
                                ? formatting.indentations.level3 * 14.4
                                : 0,
                        },
                        bidirectional: true,
                    }));
                }
                if (sec.isManual) {
                    let level4Idx = 1;
                    if (sec.showPositives && sec.positivesList?.length > 0) {
                        docChildren.push(new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: `${getLevel4Number(level4Idx++, formatting)} الإيجابيات وعوامل القوة العامة:`,
                                    bold: true,
                                    size: 24,
                                    color: '1A5235',
                                }),
                            ],
                            spacing: { before: 100, after: 60 },
                            indent: {
                                right: formatting.enableLevels.level4
                                    ? formatting.indentations.level4 * 14.4
                                    : 0,
                            },
                            bidirectional: true,
                        }));
                        sec.positivesList.forEach((text, idx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: `${getLevel5ArabicLetter(idx + 1, formatting)} ${text}`,
                                        size: 24,
                                        color: '1A5235',
                                    }),
                                ],
                                spacing: { after: 60 },
                                indent: {
                                    right: formatting.enableLevels.level5
                                        ? formatting.indentations.level5 * 14.4
                                        : 0,
                                },
                                bidirectional: true,
                            }));
                        });
                    }
                    if (sec.showNegatives && sec.negativesList?.length > 0) {
                        docChildren.push(new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: `${getLevel4Number(level4Idx++, formatting)} السلبيات ونقاط التقصير العامة:`,
                                    bold: true,
                                    size: 24,
                                    color: '742A2A',
                                }),
                            ],
                            spacing: { before: 100, after: 60 },
                            indent: {
                                right: formatting.enableLevels.level4
                                    ? formatting.indentations.level4 * 14.4
                                    : 0,
                            },
                            bidirectional: true,
                        }));
                        sec.negativesList.forEach((text, idx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: `${getLevel5ArabicLetter(idx + 1, formatting)} ${text}`,
                                        size: 24,
                                        color: '742A2A',
                                    }),
                                ],
                                spacing: { after: 60 },
                                indent: {
                                    right: formatting.enableLevels.level5
                                        ? formatting.indentations.level5 * 14.4
                                        : 0,
                                },
                                bidirectional: true,
                            }));
                        });
                    }
                    if (sec.showImpediments && sec.impedimentsList?.length > 0) {
                        docChildren.push(new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: `${getLevel4Number(level4Idx++, formatting)} المعوقات العامة:`,
                                    bold: true,
                                    size: 24,
                                    color: '7B341E',
                                }),
                            ],
                            spacing: { before: 100, after: 60 },
                            indent: {
                                right: formatting.enableLevels.level4
                                    ? formatting.indentations.level4 * 14.4
                                    : 0,
                            },
                            bidirectional: true,
                        }));
                        sec.impedimentsList.forEach((text, idx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: `${getLevel5ArabicLetter(idx + 1, formatting)} ${text}`,
                                        size: 24,
                                        color: '7B341E',
                                    }),
                                ],
                                spacing: { after: 60 },
                                indent: {
                                    right: formatting.enableLevels.level5
                                        ? formatting.indentations.level5 * 14.4
                                        : 0,
                                },
                                bidirectional: true,
                            }));
                        });
                    }
                    if (sec.showObstacles && sec.obstaclesList?.length > 0) {
                        docChildren.push(new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: `${getLevel4Number(level4Idx++, formatting)} المعاضل العامة:`,
                                    bold: true,
                                    size: 24,
                                    color: '5A3E2B',
                                }),
                            ],
                            spacing: { before: 100, after: 60 },
                            indent: {
                                right: formatting.enableLevels.level4
                                    ? formatting.indentations.level4 * 14.4
                                    : 0,
                            },
                            bidirectional: true,
                        }));
                        sec.obstaclesList.forEach((text, idx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: `${getLevel5ArabicLetter(idx + 1, formatting)} ${text}`,
                                        size: 24,
                                        color: '5A3E2B',
                                    }),
                                ],
                                spacing: { after: 60 },
                                indent: {
                                    right: formatting.enableLevels.level5
                                        ? formatting.indentations.level5 * 14.4
                                        : 0,
                                },
                                bidirectional: true,
                            }));
                        });
                    }
                }
                else if (sec.subsections) {
                    let secOrdIdx = 1;
                    sec.subsections.forEach((sub) => {
                        if (!sub.visible || sub.isEmpty)
                            return;
                        const toAr = (n) => String(n).replace(/\d/g, (d) => '٠،٢٣٤٥٦٧٨٩'[parseInt(d)]);
                        const subTitlePrefix = sub.numbering
                            ? sub.numbering
                            : getLevel3Ordinal(secOrdIdx++, formatting);
                        const secTitleFormatted = `${subTitlePrefix} ${sub.title}`;
                        docChildren.push(new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: secTitleFormatted,
                                    bold: true,
                                    size: 26,
                                    color: '1A202C',
                                    font: 'Cairo',
                                    rightToLeft: true,
                                }),
                            ],
                            spacing: { before: 200, after: 100 },
                            indent: {
                                right: formatting.enableLevels.level3
                                    ? formatting.indentations.level3 * 14.4
                                    : 0,
                            },
                            bidirectional: true,
                            border: {
                                right: { style: docx_1.BorderStyle.THICK, size: 6, color: '0C2340' },
                            },
                        }));
                        let itemIdx = 1;
                        if (sub.officerInfo) {
                            const oi = sub.officerInfo;
                            const oiItems = [
                                `الرتبة والاسم الكامل / ${oi.rank} ${oi.fullName}.`,
                                `الرقم الإحصائي/ (${oi.statisticalNumber}).`,
                                `تاريخ استلام المنصب/ ${oi.joinedDate} (${oi.positionStatus}).`,
                            ];
                            if (oi.education && oi.education !== '—') {
                                oiItems.push(`التحصيل الدراسي/ ${oi.education}.`);
                            }
                            oiItems.forEach((text) => {
                                docChildren.push(new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: `(${toAr(itemIdx++)})  `,
                                            bold: true,
                                            size: 24,
                                            color: '0C2340',
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                        new docx_1.TextRun({
                                            text,
                                            size: 24,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    spacing: { after: 80 },
                                    indent: {
                                        right: formatting.enableLevels.level4
                                            ? formatting.indentations.level4 * 14.4
                                            : 0,
                                    },
                                    bidirectional: true,
                                }));
                            });
                        }
                        if (sub.findings && sub.findings.length > 0) {
                            sub.findings.forEach((text) => {
                                docChildren.push(new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: `(${toAr(itemIdx++)})  `,
                                            bold: true,
                                            size: 24,
                                            color: '0C2340',
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                        new docx_1.TextRun({
                                            text,
                                            size: 24,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    spacing: { after: 80 },
                                    indent: {
                                        right: formatting.enableLevels.level4
                                            ? formatting.indentations.level4 * 14.4
                                            : 0,
                                    },
                                    bidirectional: true,
                                }));
                            });
                        }
                        if (sub.narrativeText) {
                            docChildren.push(new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: sub.narrativeText,
                                        size: 22,
                                        rightToLeft: true,
                                        font: 'Cairo',
                                        color: '4A5568',
                                    }),
                                ],
                                spacing: { after: 80 },
                                indent: {
                                    right: formatting.enableLevels.level4
                                        ? formatting.indentations.level4 * 14.4
                                        : 0,
                                },
                                bidirectional: true,
                            }));
                        }
                        if (sub.detailedTables && sub.detailedTables.length > 0) {
                            sub.detailedTables.forEach((table) => {
                                docChildren.push(new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: `ًں"ٹ  ${table.title} `,
                                            bold: true,
                                            size: 22,
                                            color: '0C2340',
                                            font: 'Cairo',
                                        }),
                                        new docx_1.TextRun({
                                            text: ` (${table.entityName})`,
                                            size: 20,
                                            color: '718096',
                                            font: 'Cairo',
                                        }),
                                    ],
                                    spacing: { before: 120, after: 80 },
                                    indent: {
                                        right: formatting.enableLevels.level4
                                            ? (formatting.indentations.level4 + 0.5) * 14.4
                                            : 14.4,
                                    },
                                    bidirectional: true,
                                }));
                                const wordTableRows = [];
                                wordTableRows.push(new docx_1.TableRow({
                                    children: table.schema.map((col) => new docx_1.TableCell({
                                        children: [
                                            new docx_1.Paragraph({
                                                children: [
                                                    new docx_1.TextRun({
                                                        text: col.label,
                                                        bold: true,
                                                        size: 20,
                                                        rightToLeft: true,
                                                        font: 'Cairo',
                                                    }),
                                                ],
                                                alignment: docx_1.AlignmentType.CENTER,
                                                bidirectional: true,
                                            }),
                                        ],
                                        shading: { fill: 'F2F2F2' },
                                    })),
                                }));
                                table.rows.forEach((row) => {
                                    wordTableRows.push(new docx_1.TableRow({
                                        children: table.schema.map((col) => {
                                            const cellVal = row[col.key] !== undefined ? row[col.key] : '';
                                            const isPercentage = col.role === 'percentage';
                                            const formattedVal = isPercentage
                                                ? formatArabicTableValue(cellVal, {
                                                    percentage: true,
                                                })
                                                : formatArabicTableValue(cellVal);
                                            let textColor = '000000';
                                            if (col.role === 'deficit' && Number(cellVal) > 0)
                                                textColor = 'C53030';
                                            if (col.role === 'increase' && Number(cellVal) > 0)
                                                textColor = '2B6CB0';
                                            const isBold = col.role === 'label' ||
                                                col.role === 'percentage' ||
                                                col.role === 'deficit' ||
                                                col.role === 'increase';
                                            return new docx_1.TableCell({
                                                children: [
                                                    new docx_1.Paragraph({
                                                        children: [
                                                            new docx_1.TextRun({
                                                                text: formattedVal,
                                                                size: 20,
                                                                bold: isBold,
                                                                color: textColor,
                                                                rightToLeft: true,
                                                                font: 'Cairo',
                                                            }),
                                                        ],
                                                        alignment: col.role === 'label'
                                                            ? docx_1.AlignmentType.RIGHT
                                                            : docx_1.AlignmentType.CENTER,
                                                        bidirectional: true,
                                                    }),
                                                ],
                                            });
                                        }),
                                    }));
                                });
                                const totalDxa = 9026;
                                const colWidths = [];
                                const labelIdx = table.schema.findIndex((c) => c.role === 'label');
                                const numCols = table.schema.length;
                                if (numCols > 0) {
                                    if (labelIdx !== -1 && numCols > 1) {
                                        const labelWidth = Math.floor(totalDxa * 0.3);
                                        const otherWidth = Math.floor((totalDxa - labelWidth) / (numCols - 1));
                                        for (let idx = 0; idx < numCols; idx++) {
                                            if (idx === labelIdx) {
                                                colWidths.push(labelWidth);
                                            }
                                            else {
                                                colWidths.push(otherWidth);
                                            }
                                        }
                                    }
                                    else {
                                        const equalWidth = Math.floor(totalDxa / numCols);
                                        for (let idx = 0; idx < numCols; idx++) {
                                            colWidths.push(equalWidth);
                                        }
                                    }
                                }
                                docChildren.push(new docx_1.Table({
                                    width: { size: 9026, type: docx_1.WidthType.DXA },
                                    visuallyRightToLeft: true,
                                    borders: tableBorders,
                                    columnWidths: colWidths,
                                    rows: wordTableRows,
                                }), new docx_1.Paragraph({ text: '', spacing: { after: 100 } }));
                            });
                        }
                    });
                }
            });
            const pushOfficialObservationItems = (items = []) => {
                if (items.length === 0) {
                    docChildren.push(new docx_1.Paragraph({
                        children: [
                            new docx_1.TextRun({
                                text: 'لا توجد ملاحظات ضمن هذا التصنيف.',
                                size: 22,
                                color: '718096',
                                font: 'Cairo',
                            }),
                        ],
                        spacing: { after: 60 },
                        indent: {
                            right: formatting.enableLevels.level3
                                ? formatting.indentations.level3 * 14.4
                                : 0,
                        },
                        bidirectional: true,
                    }));
                    return;
                }
                items.forEach((text, idx) => {
                    docChildren.push(new docx_1.Paragraph({
                        children: [
                            new docx_1.TextRun({
                                text: `${getLevel3Ordinal(idx + 1, formatting)} ${text}`,
                                size: 24,
                                font: 'Cairo',
                            }),
                        ],
                        spacing: { after: 60 },
                        indent: {
                            right: formatting.enableLevels.level3
                                ? formatting.indentations.level3 * 14.4
                                : 0,
                        },
                        bidirectional: true,
                    }));
                });
            };
            const wordOfficialObservationSection = payload.sections.find((s) => s.isManual);
            docChildren.push(heading1Style(`${getLevel1Number(7, formatting)} الملاحظات`));
            [
                {
                    title: `${getLevel2ArabicLetter(1, formatting)} الإيجابيات`,
                    items: wordOfficialObservationSection?.positivesList || [],
                },
                {
                    title: `${getLevel2ArabicLetter(2, formatting)} السلبيات`,
                    items: wordOfficialObservationSection?.negativesList || [],
                },
                {
                    title: `${getLevel2ArabicLetter(3, formatting)} المعوقات`,
                    items: wordOfficialObservationSection?.impedimentsList || [],
                },
                {
                    title: `${getLevel2ArabicLetter(4, formatting)} المعاضل`,
                    items: wordOfficialObservationSection?.obstaclesList || [],
                },
            ].forEach((group) => {
                docChildren.push(new docx_1.Paragraph({
                    children: [
                        new docx_1.TextRun({
                            text: group.title,
                            bold: true,
                            size: 24,
                            font: 'Cairo',
                        }),
                    ],
                    spacing: { before: 100, after: 60 },
                    indent: {
                        right: formatting.enableLevels.level2
                            ? formatting.indentations.level2 * 14.4
                            : 0,
                    },
                    bidirectional: true,
                }));
                pushOfficialObservationItems(group.items);
            });
            docChildren.push(heading1Style(`${getLevel1Number(8, formatting)} التوصيات`));
            if (payload.recommendations && payload.recommendations.length > 0) {
                payload.recommendations
                    .filter((r) => r.visible)
                    .forEach((recGroup, idx) => {
                    docChildren.push(new docx_1.Paragraph({
                        children: [
                            new docx_1.TextRun({
                                text: `${getLevel2ArabicLetter(idx + 1, formatting)} ${recGroup.authority}`,
                                bold: true,
                                size: 24,
                                font: 'Cairo',
                            }),
                        ],
                        spacing: { before: 150, after: 60 },
                        indent: {
                            right: formatting.enableLevels.level2
                                ? formatting.indentations.level2 * 14.4
                                : 0,
                        },
                        bidirectional: true,
                    }));
                    if (recGroup.recs && recGroup.recs.length > 0) {
                        recGroup.recs.forEach((rec, recIdx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: `${getLevel3Ordinal(recIdx + 1, formatting).replace('.', ':')} ${rec.text}`,
                                        size: 24,
                                        font: 'Cairo',
                                    }),
                                ],
                                spacing: { after: 60 },
                                indent: {
                                    right: formatting.enableLevels.level3
                                        ? formatting.indentations.level3 * 14.4
                                        : 0,
                                },
                                bidirectional: true,
                            }));
                            if (rec.children && rec.children.length > 0) {
                                rec.children.forEach((child) => {
                                    docChildren.push(new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: `â€¢ ${child.text}`,
                                                size: 24,
                                                color: '4a5568',
                                                font: 'Cairo',
                                            }),
                                        ],
                                        spacing: { after: 60 },
                                        indent: {
                                            right: formatting.enableLevels.level4
                                                ? formatting.indentations.level4 * 14.4
                                                : 0,
                                        },
                                        bidirectional: true,
                                    }));
                                });
                            }
                        });
                    }
                    else {
                        docChildren.push(new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: 'لا توجد توصيات مدخلة تحت هذه الجهة.',
                                    size: 22,
                                    color: '718096',
                                    font: 'Cairo',
                                }),
                            ],
                            spacing: { after: 60 },
                            indent: {
                                right: formatting.enableLevels.level3
                                    ? formatting.indentations.level3 * 14.4
                                    : 0,
                            },
                            bidirectional: true,
                        }));
                    }
                });
            }
            else {
                docChildren.push(new docx_1.Paragraph({
                    children: [
                        new docx_1.TextRun({
                            text: 'لا توجد توصيات مدخلة.',
                            size: 22,
                            color: '718096',
                            font: 'Cairo',
                        }),
                    ],
                    spacing: { after: 100 },
                    indent: {
                        right: formatting.enableLevels.level2
                            ? formatting.indentations.level2 * 14.4
                            : 0,
                    },
                    bidirectional: true,
                }));
            }
            if (payload.finalEvaluation?.statement) {
                docChildren.push(heading1Style(`${getLevel1Number(9, formatting)} ${payload.finalEvaluation.statement}`));
            }
            if (false &&
                payload.recommendations &&
                payload.recommendations.some((r) => r.visible && r.recs.length > 0)) {
                docChildren.push(heading1Style(`${getLevel1Number(8, formatting)} التوصيات والمقترحات المرفوعة للمصادقة`));
                payload.recommendations
                    .filter((r) => r.visible)
                    .forEach((recGroup, idx) => {
                    docChildren.push(new docx_1.Paragraph({
                        children: [
                            new docx_1.TextRun({
                                text: `${getLevel2ArabicLetter(idx + 1, formatting)} الموجهة إلى (${recGroup.authority}):`,
                                bold: true,
                                size: 24,
                            }),
                        ],
                        spacing: { before: 150, after: 60 },
                        indent: {
                            right: formatting.enableLevels.level2
                                ? formatting.indentations.level2 * 14.4
                                : 0,
                        },
                        bidirectional: true,
                    }));
                    recGroup.recs.forEach((r, rIdx) => {
                        docChildren.push(new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: `${getLevel3Ordinal(rIdx + 1, formatting)} ${r}`,
                                    size: 24,
                                }),
                            ],
                            spacing: { after: 60 },
                            indent: {
                                right: formatting.enableLevels.level3
                                    ? formatting.indentations.level3 * 14.4
                                    : 0,
                            },
                            bidirectional: true,
                        }));
                    });
                });
            }
            if (payload.appendices &&
                payload.appendices.some((a) => a.visible)) {
                docChildren.push(new docx_1.Paragraph({ children: [new docx_1.PageBreak()] }));
                docChildren.push(heading1Style(`${getLevel1Number(10, formatting)} ملاحق التقرير التفتيشي`));
                payload.appendices
                    .filter((a) => a.visible)
                    .forEach((app, idx) => {
                    docChildren.push(new docx_1.Paragraph({
                        children: [
                            new docx_1.TextRun({
                                text: `${getLevel2ArabicLetter(idx + 1, formatting)} ملحق (${app.symbol})`,
                                bold: true,
                                size: 24,
                                color: '0C2340',
                            }),
                        ],
                        spacing: { before: 150, after: 60 },
                        indent: {
                            right: formatting.enableLevels.level2
                                ? formatting.indentations.level2 * 14.4
                                : 0,
                        },
                        bidirectional: true,
                    }), new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: app.text, size: 22 })],
                        spacing: { after: 120 },
                        indent: {
                            right: formatting.enableLevels.level2
                                ? formatting.indentations.level2 * 14.4
                                : 0,
                        },
                        bidirectional: true,
                    }));
                });
            }
            if (false && payload.finalEvaluation?.statement) {
                docChildren.push(heading1Style(`${getLevel1Number(9, formatting)} ${payload.finalEvaluation.statement}`));
            }
        }
        else {
            const wordManualSection = payload.sections.find((s) => s.isManual);
            const wordManualPositives = wordManualSection?.positivesList || [];
            const wordManualNegatives = wordManualSection?.negativesList || [];
            const wordManualImpediments = wordManualSection?.impedimentsList || [];
            const wordManualObstacles = wordManualSection?.obstaclesList || [];
            const wordShowPositives = wordManualSection?.showPositives !== false &&
                wordManualPositives.length > 0;
            const wordShowNegatives = wordManualSection?.showNegatives !== false &&
                wordManualNegatives.length > 0;
            const wordShowImpediments = wordManualSection?.showImpediments !== false &&
                wordManualImpediments.length > 0;
            const wordShowObstacles = wordManualSection?.showObstacles !== false &&
                wordManualObstacles.length > 0;
            const wordOldFindings = !wordManualPositives.length &&
                !wordManualNegatives.length &&
                !wordManualImpediments.length &&
                !wordManualObstacles.length &&
                wordManualSection?.findings?.length
                ? wordManualSection.findings
                : [];
            docChildren.push(heading1Style(`${getLevel1Number(1, formatting)} المعلومات الأساسية للحملة التفتيشية`));
            const metaTableRows = [
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'اسم الحملة التفتيشية',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F7F7F7' },
                            width: { size: 2708, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: payload.campaignName || '',
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 6318, type: docx_1.WidthType.DXA },
                        }),
                    ],
                }),
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'الأمر الإداري المكلف',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F7F7F7' },
                            width: { size: 2708, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: `كتاب رقم ${payload.assignmentReference || ''} في ${payload.assignmentDate ? new Date(payload.assignmentDate).toLocaleDateString('ar-EG') : ''}`,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 6318, type: docx_1.WidthType.DXA },
                        }),
                    ],
                }),
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'الكيان المستهدف الرئيسي',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F7F7F7' },
                            width: { size: 2708, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: payload.targetEntityName || '',
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 6318, type: docx_1.WidthType.DXA },
                        }),
                    ],
                }),
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'رئيس اللجنة التفتيشية',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F7F7F7' },
                            width: { size: 2708, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: payload.signatures.leaderName || '',
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 6318, type: docx_1.WidthType.DXA },
                        }),
                    ],
                }),
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'معاون رئيس اللجنة / المقرر',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F7F7F7' },
                            width: { size: 2708, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: payload.signatures.deputyName || '',
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 6318, type: docx_1.WidthType.DXA },
                        }),
                    ],
                }),
            ];
            docChildren.push(new docx_1.Table({
                width: { size: 9026, type: docx_1.WidthType.DXA },
                visuallyRightToLeft: true,
                borders: tableBorders,
                columnWidths: [2708, 6318],
                rows: metaTableRows,
            }), new docx_1.Paragraph({ text: '' }));
            docChildren.push(heading1Style(`${getLevel1Number(2, formatting)} جدول تقييم الأداط، الميداني للكيانات المفتشة`));
            const evalTableRows = [
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'ت',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F2F2F2' },
                            width: { size: 903, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'الكيان المفتش',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F2F2F2' },
                            width: { size: 3610, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'الموقع الجغرافي',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F2F2F2' },
                            width: { size: 2708, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'النسبة المستحصلة',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            shading: { fill: 'F2F2F2' },
                            width: { size: 1805, type: docx_1.WidthType.DXA },
                        }),
                    ],
                }),
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: '1',
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 903, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: payload.targetEntityName || '',
                                            bold: true,
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 3610, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'مقر الكيان',
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 2708, type: docx_1.WidthType.DXA },
                        }),
                        new docx_1.TableCell({
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: formatArabicTableValue('100.0', {
                                                percentage: true,
                                            }),
                                            bold: true,
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                            width: { size: 1805, type: docx_1.WidthType.DXA },
                        }),
                    ],
                }),
            ];
            docChildren.push(new docx_1.Table({
                width: { size: 9026, type: docx_1.WidthType.DXA },
                visuallyRightToLeft: true,
                borders: tableBorders,
                columnWidths: [903, 3610, 2708, 1805],
                rows: evalTableRows,
            }), new docx_1.Paragraph({ text: '' }));
            if (wordShowPositives ||
                wordShowNegatives ||
                wordShowImpediments ||
                wordShowObstacles ||
                wordOldFindings.length > 0) {
                docChildren.push(heading1Style(`${getLevel1Number(3, formatting)} ${wordManualSection?.title || 'الملاحظات والنتائج العامة للجنة التفتيشية'}`));
                let noteIdx = 1;
                if (wordShowPositives) {
                    docChildren.push(new docx_1.Paragraph({
                        children: [
                            new docx_1.TextRun({
                                text: `${getLevel2ArabicLetter(noteIdx++, formatting)} الإيجابيات ورصد كفاط،ة الأداط،:`,
                                bold: true,
                                size: 24,
                            }),
                        ],
                        spacing: { before: 100, after: 60 },
                        indent: {
                            right: formatting.enableLevels.level2
                                ? formatting.indentations.level2 * 14.4
                                : 0,
                        },
                        bidirectional: true,
                    }));
                    wordManualPositives.forEach((note, idx) => {
                        docChildren.push(new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: `${getLevel3Ordinal(idx + 1, formatting)} ${note}`,
                                    size: 24,
                                }),
                            ],
                            spacing: { after: 60 },
                            indent: {
                                right: formatting.enableLevels.level3
                                    ? formatting.indentations.level3 * 14.4
                                    : 0,
                            },
                            bidirectional: true,
                        }));
                    });
                }
                if (wordShowNegatives) {
                    docChildren.push(new docx_1.Paragraph({
                        children: [
                            new docx_1.TextRun({
                                text: `${getLevel2ArabicLetter(noteIdx++, formatting)} السلبيات ونقاط الضعف المرصودة:`,
                                bold: true,
                                size: 24,
                            }),
                        ],
                        spacing: { before: 100, after: 60 },
                        indent: {
                            right: formatting.enableLevels.level2
                                ? formatting.indentations.level2 * 14.4
                                : 0,
                        },
                        bidirectional: true,
                    }));
                    wordManualNegatives.forEach((note, idx) => {
                        docChildren.push(new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: `${getLevel3Ordinal(idx + 1, formatting)} ${note}`,
                                    size: 24,
                                }),
                            ],
                            spacing: { after: 60 },
                            indent: {
                                right: formatting.enableLevels.level3
                                    ? formatting.indentations.level3 * 14.4
                                    : 0,
                            },
                            bidirectional: true,
                        }));
                    });
                }
                if (wordShowImpediments || wordShowObstacles) {
                    docChildren.push(new docx_1.Paragraph({
                        children: [
                            new docx_1.TextRun({
                                text: `${getLevel2ArabicLetter(noteIdx++, formatting)} المعوقات والمعاضل الميدانية:`,
                                bold: true,
                                size: 24,
                            }),
                        ],
                        spacing: { before: 100, after: 60 },
                        indent: {
                            right: formatting.enableLevels.level2
                                ? formatting.indentations.level2 * 14.4
                                : 0,
                        },
                        bidirectional: true,
                    }));
                    if (wordShowObstacles) {
                        wordManualObstacles.forEach((note, idx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: `${getLevel3Ordinal(idx + 1, formatting)} ${note} (عائق)`,
                                        size: 24,
                                    }),
                                ],
                                spacing: { after: 60 },
                                indent: {
                                    right: formatting.enableLevels.level3
                                        ? formatting.indentations.level3 * 14.4
                                        : 0,
                                },
                                bidirectional: true,
                            }));
                        });
                    }
                    if (wordShowImpediments) {
                        wordManualImpediments.forEach((note, idx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: `${getLevel3Ordinal((wordShowObstacles ? wordManualObstacles.length : 0) + idx + 1, formatting)} ${note} (معضلة حرجة)`,
                                        size: 24,
                                    }),
                                ],
                                spacing: { after: 60 },
                                indent: {
                                    right: formatting.enableLevels.level3
                                        ? formatting.indentations.level3 * 14.4
                                        : 0,
                                },
                                bidirectional: true,
                            }));
                        });
                    }
                }
                if (wordOldFindings.length > 0) {
                    wordOldFindings.forEach((text, idx) => {
                        docChildren.push(new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: `${getLevel3Ordinal(idx + 1, formatting)} ${text}`,
                                    size: 24,
                                }),
                            ],
                            spacing: { after: 60 },
                            indent: {
                                right: formatting.enableLevels.level3
                                    ? formatting.indentations.level3 * 14.4
                                    : 0,
                            },
                            bidirectional: true,
                        }));
                    });
                }
            }
            if (payload.recommendations && payload.recommendations.length > 0) {
                docChildren.push(heading1Style(`${getLevel1Number(4, formatting)} التوصيات`));
                payload.recommendations
                    .filter((r) => r.visible)
                    .forEach((recGroup, idx) => {
                    docChildren.push(new docx_1.Paragraph({
                        children: [
                            new docx_1.TextRun({
                                text: `${getLevel2ArabicLetter(idx + 1, formatting)} ${recGroup.authority}`,
                                bold: true,
                                size: 24,
                                font: 'Cairo',
                            }),
                        ],
                        spacing: { before: 150, after: 60 },
                        indent: {
                            right: formatting.enableLevels.level2
                                ? formatting.indentations.level2 * 14.4
                                : 0,
                        },
                        bidirectional: true,
                    }));
                    if (recGroup.recs && recGroup.recs.length > 0) {
                        recGroup.recs.forEach((rec, recIdx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: `${getLevel3Ordinal(recIdx + 1, formatting).replace('.', ':')} ${rec.text}`,
                                        size: 24,
                                        font: 'Cairo',
                                    }),
                                ],
                                spacing: { after: 60 },
                                indent: {
                                    right: formatting.enableLevels.level3
                                        ? formatting.indentations.level3 * 14.4
                                        : 0,
                                },
                                bidirectional: true,
                            }));
                            if (rec.children && rec.children.length > 0) {
                                rec.children.forEach((child) => {
                                    docChildren.push(new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: `â€¢ ${child.text}`,
                                                size: 24,
                                                color: '4a5568',
                                                font: 'Cairo',
                                            }),
                                        ],
                                        spacing: { after: 60 },
                                        indent: {
                                            right: formatting.enableLevels.level4
                                                ? formatting.indentations.level4 * 14.4
                                                : 0,
                                        },
                                        bidirectional: true,
                                    }));
                                });
                            }
                        });
                    }
                    else {
                        docChildren.push(new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({
                                    text: 'لا توجد توصيات مدخلة تحت هذه الجهة.',
                                    size: 22,
                                    color: '718096',
                                    font: 'Cairo',
                                }),
                            ],
                            spacing: { after: 60 },
                            indent: {
                                right: formatting.enableLevels.level3
                                    ? formatting.indentations.level3 * 14.4
                                    : 0,
                            },
                            bidirectional: true,
                        }));
                    }
                });
            }
            if (payload.appendices &&
                payload.appendices.some((a) => a.visible)) {
                docChildren.push(new docx_1.Paragraph({ children: [new docx_1.PageBreak()] }));
                docChildren.push(heading1Style(`${getLevel1Number(5, formatting)} ملاحق التقرير التفتيشي`));
                payload.appendices
                    .filter((a) => a.visible)
                    .forEach((app, idx) => {
                    docChildren.push(new docx_1.Paragraph({
                        children: [
                            new docx_1.TextRun({
                                text: `${getLevel2ArabicLetter(idx + 1, formatting)} ملحق (${app.symbol})`,
                                bold: true,
                                size: 24,
                                color: '0C2340',
                            }),
                        ],
                        spacing: { before: 150, after: 60 },
                        indent: {
                            right: formatting.enableLevels.level2
                                ? formatting.indentations.level2 * 14.4
                                : 0,
                        },
                        bidirectional: true,
                    }), new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: app.text, size: 22 })],
                        spacing: { after: 120 },
                        indent: {
                            right: formatting.enableLevels.level2
                                ? formatting.indentations.level2 * 14.4
                                : 0,
                        },
                        bidirectional: true,
                    }));
                });
            }
            if (payload.finalEvaluation?.statement) {
                docChildren.push(heading1Style(`${getLevel1Number(10, formatting)} ${payload.finalEvaluation.statement}`));
            }
        }
        if (payload.signatures?.showMinisterSign !== false) {
            docChildren.push(new docx_1.Table({
                width: { size: 9026, type: docx_1.WidthType.DXA },
                visuallyRightToLeft: true,
                borders: noBorders,
                columnWidths: [4513, 4513],
                rows: [
                    new docx_1.TableRow({
                        children: [
                            new docx_1.TableCell({
                                width: { size: 4513, type: docx_1.WidthType.DXA },
                                children: [new docx_1.Paragraph({ text: '' })],
                            }),
                            new docx_1.TableCell({
                                width: { size: 4513, type: docx_1.WidthType.DXA },
                                children: [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: payload.signatures?.ministerTitle || 'اصادق اصوليا',
                                                bold: true,
                                                size: 24,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    }),
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: payload.signatures?.ministerName ||
                                                    'وزيـــــــر الداخلية',
                                                bold: true,
                                                size: 24,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                        spacing: { before: 100 },
                                    }),
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.TextRun({
                                                text: payload.signatures?.ministerDate || '٢٠٢٦/  / ',
                                                size: 20,
                                                rightToLeft: true,
                                                font: 'Cairo',
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                        spacing: { before: 50 },
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
            }), new docx_1.Paragraph({
                children: [new docx_1.TextRun({ text: '' })],
                spacing: { before: 200 },
            }));
        }
        docChildren.push(new docx_1.Table({
            width: { size: 9026, type: docx_1.WidthType.DXA },
            visuallyRightToLeft: true,
            borders: noBorders,
            columnWidths: [4513, 4513],
            rows: [
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({
                            width: { size: 4513, type: docx_1.WidthType.DXA },
                            children: [
                                ...(payload.signatures?.leaderRank
                                    ? [
                                        new docx_1.Paragraph({
                                            children: [
                                                new docx_1.TextRun({
                                                    text: payload.signatures.leaderRank,
                                                    bold: true,
                                                    size: 22,
                                                    rightToLeft: true,
                                                    font: 'Cairo',
                                                }),
                                            ],
                                            alignment: docx_1.AlignmentType.CENTER,
                                            bidirectional: true,
                                        }),
                                    ]
                                    : []),
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: payload.signatures?.leaderName || '',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                    spacing: {
                                        before: payload.signatures?.leaderRank ? 200 : 0,
                                    },
                                }),
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: payload.signatures?.leaderRole || 'رئيس اللجنة',
                                            bold: true,
                                            size: 24,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                    spacing: { before: 50 },
                                }),
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: payload.signatures?.leaderDate || '',
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                        }),
                        new docx_1.TableCell({
                            width: { size: 4513, type: docx_1.WidthType.DXA },
                            children: [
                                ...(payload.signatures?.deputyRank
                                    ? [
                                        new docx_1.Paragraph({
                                            children: [
                                                new docx_1.TextRun({
                                                    text: payload.signatures.deputyRank,
                                                    bold: true,
                                                    size: 22,
                                                    rightToLeft: true,
                                                    font: 'Cairo',
                                                }),
                                            ],
                                            alignment: docx_1.AlignmentType.CENTER,
                                            bidirectional: true,
                                        }),
                                    ]
                                    : []),
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: payload.signatures?.deputyName || '',
                                            bold: true,
                                            size: 22,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                    spacing: {
                                        before: payload.signatures?.deputyRank ? 200 : 0,
                                    },
                                }),
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: payload.signatures?.deputyRole ||
                                                'رئيس هيئة تفتيش قوى الامن الداخلي',
                                            bold: true,
                                            size: 24,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                    spacing: { before: 50 },
                                }),
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: payload.signatures?.deputyDate || '',
                                            size: 20,
                                            rightToLeft: true,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                        }),
                    ],
                }),
            ],
        }));
        const doc = new docx_1.Document({
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
        return docx_1.Packer.toBuffer(doc);
    }
    async getCriteriaReportPayload(templateId) {
        const template = await this.prisma.criteriaTemplate.findUnique({
            where: { id: templateId },
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
        if (!template) {
            throw new NotFoundException('Criteria template not found');
        }
        const rows = [];
        let seq = 0;
        for (const item of template.items) {
            const primary = item.primary;
            for (const secondary of primary.secondaryCriteria) {
                if (secondary.details.length === 0) {
                    seq++;
                    rows.push({
                        seq,
                        primaryTitle: primary.title,
                        primaryId: primary.id,
                        secondaryTitle: secondary.title,
                        secondaryId: secondary.id,
                        detailText: '—',
                        detailId: null,
                        inputType: '—',
                        inputTypeLabel: '—',
                        optionsText: '',
                        optionsList: [],
                        tableSchema: null,
                        maxGrade: null,
                    });
                    continue;
                }
                for (const detail of secondary.details) {
                    seq++;
                    const inputTypeLabels = {
                        single: 'اختيار مفرد',
                        multiple: 'اختيار متعدد',
                        boolean: 'نعم/لا',
                        text: 'نص وصفي',
                        detailed_table: 'جدول تفصيلي',
                    };
                    const optionsList = (detail.options || []).map((opt) => {
                        const scoreStr = opt.scoreValue != null ? ` (${opt.scoreValue})` : '';
                        return `${opt.optionText}${scoreStr}`;
                    });
                    let tableSchemaInfo = null;
                    if (detail.inputType === 'detailed_table' && detail.tableSchema) {
                        const schema = typeof detail.tableSchema === 'string'
                            ? JSON.parse(detail.tableSchema)
                            : detail.tableSchema;
                        tableSchemaInfo = {
                            name: 'جدول تفصيلي',
                            columns: (schema || []).map((col) => col.label || col.key),
                        };
                    }
                    rows.push({
                        seq,
                        primaryTitle: primary.title,
                        primaryId: primary.id,
                        secondaryTitle: secondary.title,
                        secondaryId: secondary.id,
                        detailText: detail.detailText,
                        detailId: detail.id,
                        inputType: detail.inputType,
                        inputTypeLabel: inputTypeLabels[detail.inputType] || detail.inputType,
                        optionsText: optionsList.join(' | '),
                        optionsList,
                        tableSchema: tableSchemaInfo,
                        maxGrade: Number(detail.maxGrade),
                    });
                }
            }
        }
        return {
            templateName: template.name,
            templateDescription: template.description,
            exportedAt: new Date().toISOString(),
            totalRows: rows.length,
            rows,
        };
    }
    generateCriteriaReportHtml(payload) {
        const rows = payload.rows || [];
        let logoBase64 = '';
        try {
            const logoPath = path.join(__dirname, '..', '..', 'uploads', 'system', 'ministry-logo.png');
            if (fs.existsSync(logoPath)) {
                const logoBuffer = fs.readFileSync(logoPath);
                logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
            }
        }
        catch (e) {
        }
        const dateStr = new Date(payload.exportedAt).toLocaleDateString('ar-IQ', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        const primaryGroups = [];
        for (const row of rows) {
            const last = primaryGroups[primaryGroups.length - 1];
            if (last && last.title === row.primaryTitle) {
                last.rows.push(row);
            }
            else {
                primaryGroups.push({ title: row.primaryTitle, rows: [row] });
            }
        }
        const summaryRowsHtml = rows
            .map((row, idx) => {
            const isFirstInPrimary = idx === 0 || rows[idx - 1].primaryTitle !== row.primaryTitle;
            const group = primaryGroups.find((g) => g.title === row.primaryTitle);
            const rowspan = group ? group.rows.length : 1;
            const primaryCell = isFirstInPrimary
                ? `<td rowspan="${rowspan}" style="border: 1px solid #000; padding: 6px 8px; font-size: 12px; font-weight: bold; vertical-align: top; text-align: center; background-color: ${idx % 2 === 0 ? '#f8fafc' : '#ffffff'};">${row.primaryTitle}</td>`
                : '';
            return `<tr>
        ${primaryCell}
        <td style="border: 1px solid #000; padding: 6px 8px; font-size: 12px; text-align: center; vertical-align: top;${!isFirstInPrimary ? ' border-top: none;' : ''}">${row.secondaryTitle}</td>
        <td style="border: 1px solid #000; padding: 6px 8px; font-size: 12px; text-align: right; vertical-align: top;${!isFirstInPrimary ? ' border-top: none;' : ''}">${row.detailText}</td>
        <td style="border: 1px solid #000; padding: 6px 8px; font-size: 12px; text-align: center; vertical-align: top; white-space: nowrap;${!isFirstInPrimary ? ' border-top: none;' : ''}">${row.inputTypeLabel}</td>
      </tr>`;
        })
            .join('');
        const detailCardsHtml = rows
            .map((row) => {
            let optionsContent = '';
            if (row.inputType === 'detailed_table' && row.tableSchema) {
                const cols = row.tableSchema.columns || [];
                optionsContent = `<div class="field-value">
          <div class="table-name"><strong>اسم الجدول:</strong> ${row.tableSchema.name}</div>
          ${cols.length > 0
                    ? `
          <div class="columns-list">
            <div class="columns-title"><strong>الأعمدة:</strong></div>
            ${cols.map((col) => `<div class="column-item">â€¢ ${col}</div>`).join('')}
          </div>`
                    : ''}
        </div>`;
            }
            else if (row.optionsList.length > 0) {
                optionsContent = `<div class="field-value">
          ${row.optionsList.map((opt) => `<div class="option-item">â€¢ ${opt}</div>`).join('')}
        </div>`;
            }
            else {
                optionsContent = '<span class="field-value no-data">—</span>';
            }
            return `<div class="detail-card">
        <div class="detail-card-header">البند رقم (${row.seq})</div>
        <div class="detail-field">
          <span class="field-label">الأساس الرئيسي:</span>
          <span class="field-value">${row.primaryTitle}</span>
        </div>
        <div class="detail-field">
          <span class="field-label">الأساس الفرعي:</span>
          <span class="field-value">${row.secondaryTitle}</span>
        </div>
        <div class="detail-field">
          <span class="field-label">البند:</span>
          <span class="field-value">${row.detailText}</span>
        </div>
        <div class="detail-field">
          <span class="field-label">نوع الإجابة:</span>
          <span class="field-value">${row.inputTypeLabel}</span>
        </div>
        <div class="detail-field">
          <span class="field-label">الإجابات / الخيارات:</span>
          ${optionsContent}
        </div>
      </div>`;
        })
            .join('');
        const isEmpty = rows.length === 0;
        return `<!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
        body {
          font-family: 'Cairo', 'Times New Roman', serif;
          margin: 0;
          padding: 30px;
          color: #111111;
          background-color: #ffffff;
          line-height: 1.7;
          font-size: 14px;
          direction: rtl;
          text-align: right;
        }
        .report-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2px solid #0c2340;
          padding-bottom: 12px;
          margin-bottom: 20px;
        }
        .report-header .header-text {
          font-size: 13px;
          font-weight: bold;
          line-height: 1.5;
        }
        .report-header .header-logo { text-align: center; }
        .report-header .header-logo img { height: 75px; }
        .report-header .header-meta {
          font-size: 12px;
          font-weight: bold;
          text-align: left;
        }
        .report-title {
          text-align: center;
          font-size: 20px;
          font-weight: bold;
          margin: 20px 0;
          color: #0c2340;
          text-decoration: underline;
          text-underline-offset: 6px;
        }
        .report-meta {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 20px;
          color: #4a5568;
        }
        .report-meta span {
          background: #f7fafc;
          padding: 4px 12px;
          border-radius: 4px;
        }
        .section-title {
          font-size: 16px;
          font-weight: bold;
          color: #0c2340;
          border-bottom: 2px solid #0c2340;
          padding-bottom: 5px;
          margin-top: 20px;
          margin-bottom: 15px;
        }
        /* Summary Table */
        .summary-table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
        }
        .summary-table thead { display: table-header-group; }
        .summary-table th {
          background-color: #0c2340;
          color: #ffffff;
          padding: 8px 6px;
          border: 1px solid #0c2340;
          font-size: 12px;
          font-weight: bold;
          text-align: center;
        }
        .summary-table td {
          word-break: break-word;
        }
        .summary-table tr {
          page-break-inside: avoid;
          break-inside: avoid;
        }
        /* Detail Cards */
        .detail-card {
          border: 1px solid #cbd5e0;
          border-radius: 6px;
          padding: 14px 16px;
          margin-bottom: 16px;
          page-break-inside: avoid;
          break-inside: avoid;
          background-color: #fafbfc;
        }
        .detail-card-header {
          font-size: 15px;
          font-weight: bold;
          color: #0c2340;
          border-bottom: 2px solid #0c2340;
          padding-bottom: 6px;
          margin-bottom: 12px;
        }
        .detail-field {
          margin-bottom: 8px;
          display: flex;
          gap: 8px;
          line-height: 1.8;
        }
        .field-label {
          font-weight: bold;
          font-size: 13px;
          color: #0c2340;
          min-width: 110px;
          white-space: nowrap;
        }
        .field-value {
          font-size: 13px;
          color: #2d3748;
          flex: 1;
        }
        .field-value.no-data { color: #a0aec0; }
        .option-item, .column-item {
          font-size: 13px;
          margin-bottom: 3px;
          padding-right: 8px;
        }
        .table-name {
          font-size: 13px;
          margin-bottom: 6px;
        }
        .columns-title {
          font-size: 13px;
          margin-bottom: 4px;
        }
        /* Page Break */
        .page-break { page-break-before: always; }
        /* Empty state */
        .empty-state {
          text-align: center;
          padding: 40px;
          border: 2px dashed #cbd5e0;
          border-radius: 8px;
          background-color: #fafbfc;
          font-size: 15px;
          color: #c53030;
          font-weight: bold;
        }
        .footer-note {
          text-align: center;
          font-size: 11px;
          color: #718096;
          margin-top: 30px;
          border-top: 1px solid #e2e8f0;
          padding-top: 12px;
        }
      </style>
    </head>
    <body>
      <div class="report-header">
        <div class="header-text">
          جمهورية العراق<br />
          وزارة الداخلية<br />
          هيئة تفتيش قوى الامن الداخلي
        </div>
        <div class="header-logo">
          ${logoBase64 ? `<img src="${logoBase64}" alt="وزارة الداخلية" />` : ''}
        </div>
        <div class="header-meta">
          التاريخ: ${dateStr}
        </div>
      </div>

      <div class="report-title">
        تقرير أسس ومعايير التفتيش المعتمدة
      </div>

      <div class="report-meta">
        <span>مسمى الأسس: ${payload.templateName}</span>
        <span>إجمالي البنود: ${payload.totalRows}</span>
      </div>

      ${isEmpty
            ? `
        <div class="empty-state">لا توجد بنود معيارية في هذا القالب</div>
      `
            : `
        <!-- Section 1: Summary Table -->
        <div class="section-title">القسم الأول: ملخص أسس ومعايير التفتيش</div>
        <table class="summary-table">
          <thead>
            <tr>
              <th style="width: 6%;">ت</th>
              <th style="width: 22%;">الأساس الرئيسي</th>
              <th style="width: 22%;">الأساس الفرعي</th>
              <th style="width: 38%;">البند التفصيلي</th>
              <th style="width: 12%;">نوع الإجابة</th>
            </tr>
          </thead>
          <tbody>
            ${summaryRowsHtml}
          </tbody>
        </table>

        <div class="page-break"></div>

        <!-- Section 2: Details -->
        <div class="section-title">القسم الثاني: تفاصيل أسس ومعايير التفتيش</div>
        ${detailCardsHtml}
      `}

      <div class="footer-note">
        تم التصدير في ${dateStr} - هذا التقرير يعرض أسس ومعايير التفتيش المعتمدة حسب القالب المحدد
      </div>
    </body>
    </html>`;
    }
    async generateCriteriaReportPdf(templateId) {
        const payload = await this.getCriteriaReportPayload(templateId);
        const htmlContent = this.generateCriteriaReportHtml(payload);
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
                top: '15mm',
                bottom: '15mm',
                left: '15mm',
                right: '15mm',
            },
        });
        await browser.close();
        return Buffer.from(pdfBuffer);
    }
    async generateCriteriaReportWord(templateId) {
        const payload = await this.getCriteriaReportPayload(templateId);
        const rows = payload.rows || [];
        const tableBorders = {
            top: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '000000' },
            bottom: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '000000' },
            left: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '000000' },
            right: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '000000' },
            insideHorizontal: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '000000' },
            insideVertical: { style: docx_1.BorderStyle.SINGLE, size: 4, color: '000000' },
        };
        const noBorders = {
            top: { style: docx_1.BorderStyle.NONE },
            bottom: { style: docx_1.BorderStyle.NONE },
            left: { style: docx_1.BorderStyle.NONE },
            right: { style: docx_1.BorderStyle.NONE },
            insideHorizontal: { style: docx_1.BorderStyle.NONE },
            insideVertical: { style: docx_1.BorderStyle.NONE },
        };
        const logoPath = path.join(__dirname, '..', '..', 'uploads', 'system', 'ministry-logo.png');
        const hasLogo = fs.existsSync(logoPath);
        const docChildren = [];
        const dateStr = new Date(payload.exportedAt).toLocaleDateString('ar-IQ', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
        const headerTableCellBorders = {
            top: { style: docx_1.BorderStyle.NONE },
            bottom: { style: docx_1.BorderStyle.SINGLE, size: 12, color: '000000' },
            left: { style: docx_1.BorderStyle.NONE },
            right: { style: docx_1.BorderStyle.NONE },
        };
        docChildren.push(new docx_1.Table({
            width: { size: 100, type: docx_1.WidthType.PERCENTAGE },
            borders: noBorders,
            rows: [
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({
                            width: { size: 35, type: docx_1.WidthType.PERCENTAGE },
                            borders: headerTableCellBorders,
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'جمهورية العراق',
                                            bold: true,
                                            size: 22,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.RIGHT,
                                    bidirectional: true,
                                }),
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'وزارة الداخلية',
                                            bold: true,
                                            size: 22,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.RIGHT,
                                    bidirectional: true,
                                }),
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: 'هيئة تفتيش قوى الامن الداخلي',
                                            bold: true,
                                            size: 22,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.RIGHT,
                                    bidirectional: true,
                                }),
                            ],
                        }),
                        new docx_1.TableCell({
                            width: { size: 30, type: docx_1.WidthType.PERCENTAGE },
                            borders: headerTableCellBorders,
                            children: hasLogo
                                ? [
                                    new docx_1.Paragraph({
                                        children: [
                                            new docx_1.ImageRun({
                                                type: 'png',
                                                data: fs.readFileSync(logoPath),
                                                transformation: { width: 60, height: 60 },
                                            }),
                                        ],
                                        alignment: docx_1.AlignmentType.CENTER,
                                    }),
                                ]
                                : [],
                        }),
                        new docx_1.TableCell({
                            width: { size: 35, type: docx_1.WidthType.PERCENTAGE },
                            borders: headerTableCellBorders,
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: `التاريخ: ${dateStr}`,
                                            bold: true,
                                            size: 20,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.LEFT,
                                    bidirectional: true,
                                }),
                            ],
                        }),
                    ],
                }),
            ],
        }), new docx_1.Paragraph({
            children: [new docx_1.TextRun({ text: '' })],
            spacing: { before: 200 },
        }));
        docChildren.push(new docx_1.Paragraph({
            children: [
                new docx_1.TextRun({
                    text: 'تقرير أسس ومعايير التفتيش المعتمدة',
                    bold: true,
                    size: 30,
                    font: 'Cairo',
                    underline: {},
                }),
            ],
            alignment: docx_1.AlignmentType.CENTER,
            spacing: { before: 200, after: 300 },
            bidirectional: true,
        }));
        docChildren.push(new docx_1.Paragraph({
            children: [
                new docx_1.TextRun({
                    text: `مسمى الأسس: ${payload.templateName}`,
                    size: 22,
                    font: 'Cairo',
                }),
                new docx_1.TextRun({
                    text: `    |    إجمالي البنود: ${payload.totalRows}`,
                    size: 22,
                    font: 'Cairo',
                }),
            ],
            spacing: { after: 200 },
            bidirectional: true,
        }));
        if (rows.length === 0) {
            docChildren.push(new docx_1.Paragraph({
                children: [
                    new docx_1.TextRun({
                        text: 'لا توجد بنود معيارية في هذا القالب',
                        bold: true,
                        size: 24,
                        color: 'C53030',
                        font: 'Cairo',
                    }),
                ],
                alignment: docx_1.AlignmentType.CENTER,
                spacing: { before: 400 },
                bidirectional: true,
            }));
        }
        else {
            docChildren.push(new docx_1.Paragraph({
                children: [
                    new docx_1.TextRun({
                        text: 'القسم الأول: ملخص أسس ومعايير التفتيش',
                        bold: true,
                        size: 26,
                        color: '0C2340',
                        font: 'Cairo',
                    }),
                ],
                spacing: { before: 300, after: 150 },
                border: {
                    bottom: { style: docx_1.BorderStyle.SINGLE, size: 6, color: '0C2340' },
                },
                bidirectional: true,
            }));
            const summaryColWidths = [903, 2256, 2256, 2708, 903];
            const summaryTableRows = [];
            summaryTableRows.push(new docx_1.TableRow({
                tableHeader: true,
                children: [
                    new docx_1.TableCell({
                        width: { size: summaryColWidths[0], type: docx_1.WidthType.DXA },
                        shading: { fill: '0C2340' },
                        children: [
                            new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: 'ت',
                                        bold: true,
                                        size: 20,
                                        color: 'FFFFFF',
                                        font: 'Cairo',
                                    }),
                                ],
                                alignment: docx_1.AlignmentType.CENTER,
                                bidirectional: true,
                            }),
                        ],
                    }),
                    new docx_1.TableCell({
                        width: { size: summaryColWidths[1], type: docx_1.WidthType.DXA },
                        shading: { fill: '0C2340' },
                        children: [
                            new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: 'الأساس الرئيسي',
                                        bold: true,
                                        size: 20,
                                        color: 'FFFFFF',
                                        font: 'Cairo',
                                    }),
                                ],
                                alignment: docx_1.AlignmentType.CENTER,
                                bidirectional: true,
                            }),
                        ],
                    }),
                    new docx_1.TableCell({
                        width: { size: summaryColWidths[2], type: docx_1.WidthType.DXA },
                        shading: { fill: '0C2340' },
                        children: [
                            new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: 'الأساس الفرعي',
                                        bold: true,
                                        size: 20,
                                        color: 'FFFFFF',
                                        font: 'Cairo',
                                    }),
                                ],
                                alignment: docx_1.AlignmentType.CENTER,
                                bidirectional: true,
                            }),
                        ],
                    }),
                    new docx_1.TableCell({
                        width: { size: summaryColWidths[3], type: docx_1.WidthType.DXA },
                        shading: { fill: '0C2340' },
                        children: [
                            new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: 'البند التفصيلي',
                                        bold: true,
                                        size: 20,
                                        color: 'FFFFFF',
                                        font: 'Cairo',
                                    }),
                                ],
                                alignment: docx_1.AlignmentType.CENTER,
                                bidirectional: true,
                            }),
                        ],
                    }),
                    new docx_1.TableCell({
                        width: { size: summaryColWidths[4], type: docx_1.WidthType.DXA },
                        shading: { fill: '0C2340' },
                        children: [
                            new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({
                                        text: 'نوع الإجابة',
                                        bold: true,
                                        size: 20,
                                        color: 'FFFFFF',
                                        font: 'Cairo',
                                    }),
                                ],
                                alignment: docx_1.AlignmentType.CENTER,
                                bidirectional: true,
                            }),
                        ],
                    }),
                ],
            }));
            rows.forEach((row) => {
                summaryTableRows.push(new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({
                            width: { size: summaryColWidths[0], type: docx_1.WidthType.DXA },
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: String(row.seq),
                                            size: 18,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                        }),
                        new docx_1.TableCell({
                            width: { size: summaryColWidths[1], type: docx_1.WidthType.DXA },
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: row.primaryTitle,
                                            bold: true,
                                            size: 18,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                        }),
                        new docx_1.TableCell({
                            width: { size: summaryColWidths[2], type: docx_1.WidthType.DXA },
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: row.secondaryTitle,
                                            size: 18,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                        }),
                        new docx_1.TableCell({
                            width: { size: summaryColWidths[3], type: docx_1.WidthType.DXA },
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: row.detailText,
                                            size: 18,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.RIGHT,
                                    bidirectional: true,
                                }),
                            ],
                        }),
                        new docx_1.TableCell({
                            width: { size: summaryColWidths[4], type: docx_1.WidthType.DXA },
                            children: [
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({
                                            text: row.inputTypeLabel,
                                            size: 18,
                                            font: 'Cairo',
                                        }),
                                    ],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                        }),
                    ],
                }));
            });
            docChildren.push(new docx_1.Table({
                width: { size: 100, type: docx_1.WidthType.PERCENTAGE },
                visuallyRightToLeft: true,
                borders: tableBorders,
                columnWidths: summaryColWidths,
                rows: summaryTableRows,
            }));
            docChildren.push(new docx_1.Paragraph({ children: [new docx_1.PageBreak()] }));
            docChildren.push(new docx_1.Paragraph({
                children: [
                    new docx_1.TextRun({
                        text: 'القسم الثاني: تفاصيل أسس ومعايير التفتيش',
                        bold: true,
                        size: 26,
                        color: '0C2340',
                        font: 'Cairo',
                    }),
                ],
                spacing: { before: 200, after: 300 },
                border: {
                    bottom: { style: docx_1.BorderStyle.SINGLE, size: 6, color: '0C2340' },
                },
                bidirectional: true,
            }));
            rows.forEach((row) => {
                docChildren.push(new docx_1.Paragraph({
                    children: [
                        new docx_1.TextRun({
                            text: `البند رقم (${row.seq})`,
                            bold: true,
                            size: 24,
                            color: '0C2340',
                            font: 'Cairo',
                        }),
                    ],
                    spacing: { before: 300, after: 100 },
                    bidirectional: true,
                    border: {
                        bottom: { style: docx_1.BorderStyle.SINGLE, size: 6, color: '0C2340' },
                    },
                }));
                const fields = [
                    ['الأساس الرئيسي:', row.primaryTitle],
                    ['الأساس الفرعي:', row.secondaryTitle],
                    ['البند:', row.detailText],
                    ['نوع الإجابة:', row.inputTypeLabel],
                ];
                fields.forEach(([label, value]) => {
                    docChildren.push(new docx_1.Paragraph({
                        children: [
                            new docx_1.TextRun({
                                text: `${label} `,
                                bold: true,
                                size: 22,
                                color: '0C2340',
                                font: 'Cairo',
                            }),
                            new docx_1.TextRun({ text: value, size: 22, font: 'Cairo' }),
                        ],
                        spacing: { after: 60 },
                        indent: { right: 200 },
                        bidirectional: true,
                    }));
                });
                const labelRun = new docx_1.TextRun({
                    text: 'الإجابات / الخيارات: ',
                    bold: true,
                    size: 22,
                    color: '0C2340',
                    font: 'Cairo',
                });
                if (row.inputType === 'detailed_table' && row.tableSchema) {
                    const cols = row.tableSchema.columns || [];
                    docChildren.push(new docx_1.Paragraph({
                        children: [labelRun],
                        spacing: { after: 40 },
                        indent: { right: 200 },
                        bidirectional: true,
                    }), new docx_1.Paragraph({
                        children: [
                            new docx_1.TextRun({
                                text: `اسم الجدول: ${row.tableSchema.name}`,
                                size: 22,
                                font: 'Cairo',
                            }),
                        ],
                        spacing: { after: 40 },
                        indent: { right: 400 },
                        bidirectional: true,
                    }));
                    if (cols.length > 0) {
                        docChildren.push(new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({ text: 'الأعمدة:', size: 22, font: 'Cairo' }),
                            ],
                            spacing: { after: 40 },
                            indent: { right: 400 },
                            bidirectional: true,
                        }));
                        cols.forEach((col) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [
                                    new docx_1.TextRun({ text: `â€¢ ${col}`, size: 22, font: 'Cairo' }),
                                ],
                                spacing: { after: 30 },
                                indent: { right: 500 },
                                bidirectional: true,
                            }));
                        });
                    }
                }
                else if (row.optionsList.length > 0) {
                    docChildren.push(new docx_1.Paragraph({
                        children: [labelRun],
                        spacing: { after: 40 },
                        indent: { right: 200 },
                        bidirectional: true,
                    }));
                    row.optionsList.forEach((opt) => {
                        docChildren.push(new docx_1.Paragraph({
                            children: [
                                new docx_1.TextRun({ text: `â€¢ ${opt}`, size: 22, font: 'Cairo' }),
                            ],
                            spacing: { after: 30 },
                            indent: { right: 400 },
                            bidirectional: true,
                        }));
                    });
                }
                else {
                    docChildren.push(new docx_1.Paragraph({
                        children: [
                            labelRun,
                            new docx_1.TextRun({
                                text: '—',
                                size: 22,
                                color: 'A0AEC0',
                                font: 'Cairo',
                            }),
                        ],
                        spacing: { after: 40 },
                        indent: { right: 200 },
                        bidirectional: true,
                    }));
                }
            });
        }
        docChildren.push(new docx_1.Paragraph({
            children: [new docx_1.TextRun({ text: '' })],
            spacing: { before: 300 },
        }), new docx_1.Paragraph({
            children: [
                new docx_1.TextRun({
                    text: `تم التصدير في ${dateStr} - هذا التقرير يعرض أسس ومعايير التفتيش المعتمدة حسب القالب المحدد`,
                    size: 18,
                    color: '718096',
                    font: 'Cairo',
                }),
            ],
            alignment: docx_1.AlignmentType.CENTER,
            bidirectional: true,
        }));
        const doc = new docx_1.Document({
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
        return docx_1.Packer.toBuffer(doc);
    }

}
