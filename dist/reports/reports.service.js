"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var ReportsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const puppeteer_1 = require("puppeteer");
const fs = require("fs");
const path = require("path");
const reportNumbering_1 = require("../utils/reportNumbering");
const reportFilter_1 = require("../utils/reportFilter");
const docx_1 = require("docx");
function parseCommitteeMember(member) {
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
let ReportsService = ReportsService_1 = class ReportsService {
    prisma;
    logger = new common_1.Logger(ReportsService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
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
        const hasItems = positivesList.length > 0 || negativesList.length > 0 || impedimentsList.length > 0 || obstaclesList.length > 0 || optionTypeLists.length > 0;
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
            throw new common_1.NotFoundException('Campaign not found');
        }
        const positives = campaign.notes.filter((note) => note.type === 'positive').map((note) => note.text);
        const negatives = campaign.notes.filter((note) => note.type === 'negative').map((note) => note.text);
        const impediments = campaign.notes.filter((note) => note.type === 'impediment').map((note) => note.text);
        const obstacles = campaign.notes.filter((note) => note.type === 'obstacle').map((note) => note.text);
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
            throw new common_1.NotFoundException('Campaign not found');
        }
        return this.calculateFinalEvaluationFromInspections(campaign);
    }
    normalizeReportSectionsVisibility(payload) {
        if (!payload)
            return;
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
                    sub.isEmpty = !hasFindings && !hasEarnedScores && !hasNotesText && !hasQuantData;
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
            throw new common_1.NotFoundException('Campaign not found');
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
            this.normalizeReportSectionsVisibility(savedPayload);
            const savedMemberNames = (savedPayload.committeeMembers || []).map((m) => parseCommitteeMember(m).name.trim());
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
    async saveReportPresentation(campaignId, payload) {
        const existing = await this.prisma.reportPresentation.findUnique({
            where: { campaignId },
        });
        let history = [];
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
            throw new common_1.NotFoundException('Campaign not found');
        }
        const isEducational = campaign.type === 'education';
        const governorate = campaign.entity?.parent?.name || 'بغداد';
        const zoneName = campaign.entity?.name || '';
        const validInspections = campaign.inspections.filter(i => ['approved', 'pendingReview', 'draft'].includes(i.status));
        const targetInspections = validInspections.length > 0 ? validInspections : campaign.inspections;
        const mainInspection = campaign.inspections.find(i => i.entityId === campaign.entityId) ||
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
        const prunedTemplate = (0, reportFilter_1.pruneTemplateTree)(template, pruningGradesMap);
        let personnelTableRows = [];
        if (mainInspection && mainInspection.grades) {
            mainInspection.grades.forEach((grade) => {
                if ((grade.criteriaDetail.detailText.includes('المواقف الرسمية') || grade.criteriaDetail.detailText.includes('نسب التكامل')) && (0, reportFilter_1.hasMeaningfulQuantitativeData)(grade.quantitativeData)) {
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
            const commander = insp.entity?.positions?.find(p => p.positionName.includes('آمر') || p.positionName.includes('مدير'));
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
            const positionPrefixes = ['مدير', 'آمر', 'قائد', 'معاون', 'رئيس', 'نائب', 'مقرر'];
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
                joinedDate: bestMatch.joinedDate ? new Date(bestMatch.joinedDate).toLocaleDateString('ar-EG') : '—',
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
        }
        else {
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
            const subsections = pri.secondaryCriteria.flatMap((sec) => {
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
                    sec.details.forEach((det) => {
                        const grade = gradesMap.get(`${det.id}_${suffixKey}`);
                        earnedSum += grade ? (parseFloat(grade.gradeEarned) || 0) : 0;
                        maxSum += parseFloat(det.maxGrade);
                    });
                    const detailsList = sec.details.map((det) => {
                        const grade = gradesMap.get(`${det.id}_${suffixKey}`);
                        const rawScore = grade ? (parseFloat(grade.gradeEarned) || 0) : 0;
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
                        }
                        catch (err) {
                            console.error("Error parsing officerCredentials from subInspection:", err);
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
                            if ((0, reportFilter_1.hasMeaningfulQuantitativeData)(grade.quantitativeData))
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
                            const hasQuantData = (0, reportFilter_1.hasMeaningfulQuantitativeData)(grade.quantitativeData);
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
                                    const nominalVal = row[nominalKey] !== undefined ? row[nominalKey] : (row.authorized !== undefined ? row.authorized : (row.nominal || 0));
                                    const actualVal = row[actualKey] !== undefined ? row[actualKey] : (row.present !== undefined ? row.present : (row.actual || 0));
                                    const deficitVal = row[deficitKey] !== undefined ? row[deficitKey] : (row.shortage !== undefined ? row.shortage : Math.max(0, nominalVal - actualVal));
                                    const increaseVal = row[increaseKey] !== undefined ? row[increaseKey] : (row.excess !== undefined ? row.excess : Math.max(0, actualVal - nominalVal));
                                    const percentageVal = row[percentageKey] !== undefined ? row[percentageKey] : (row.percentage !== undefined ? row.percentage : (nominalVal > 0 ? Math.round((actualVal / nominalVal) * 100) : 0));
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
            const cleanName = (fullName || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const cleanStat = (statisticalNumber && statisticalNumber !== '—' && statisticalNumber !== 'غير متوفر')
                ? statisticalNumber.replace(/\s+/g, '').trim().toLowerCase()
                : '';
            const cleanPos = (positionName || '').replace(/\s+/g, ' ').trim().toLowerCase();
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
            const matchesSection = Array.from(nonEmptySectionTitles).some((title) => posName.includes(title) || title.includes(posName.replace('مدير ', '').replace('قسم ', '').trim()));
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
            formatting: reportNumbering_1.DEFAULT_FORMATTING_CONFIG,
        };
    }
    generateHtmlFromPayload(payload) {
        const isEducational = payload.isEducation;
        const formatting = payload.formatting || reportNumbering_1.DEFAULT_FORMATTING_CONFIG;
        const sections = payload.sections || [];
        const finalEvaluationStatement = payload.finalEvaluation?.statement || '';
        const finalEvaluationSectionNumHtml = finalEvaluationStatement
            ? `<div class="section-num page-break-inside-avoid">${(0, reportNumbering_1.getLevel1Number)(10, formatting)} ${finalEvaluationStatement}</div>`
            : '';
        const finalEvaluationSectionTitleHtml = finalEvaluationStatement
            ? `<div class="section-title page-break-inside-avoid">${(0, reportNumbering_1.getLevel1Number)(10, formatting)} ${finalEvaluationStatement}</div>`
            : '';
        const manualObservationSection = sections.find((sec) => sec.isManual);
        const renderObservationItems = (items = []) => items.length > 0
            ? items.map((text, idx) => `
        <div style="margin-right: ${(0, reportNumbering_1.getIndentation)(3, formatting)}; margin-bottom: 6px; font-size: 13.5px; text-align: justify;">
          ${(0, reportNumbering_1.getLevel3Ordinal)(idx + 1, formatting)} ${text}
        </div>
      `).join('')
            : `<div style="margin-right: ${(0, reportNumbering_1.getIndentation)(3, formatting)}; margin-bottom: 6px; font-size: 13.5px; color: #718096;">لا توجد ملاحظات ضمن هذا التصنيف.</div>`;
        const officialObservationsHtml = `
      <div class="section-num page-break-inside-avoid">${(0, reportNumbering_1.getLevel1Number)(8, formatting)} الملاحظات</div>
      <div class="section-body page-break-inside-avoid">
        <div style="font-weight: bold; margin-top: 12px; font-size: 14px; margin-right: ${(0, reportNumbering_1.getIndentation)(2, formatting)};">
          ${(0, reportNumbering_1.getLevel2ArabicLetter)(1, formatting)} الإيجابيات
        </div>
        ${renderObservationItems(manualObservationSection?.positivesList || [])}

        <div style="font-weight: bold; margin-top: 12px; font-size: 14px; margin-right: ${(0, reportNumbering_1.getIndentation)(2, formatting)};">
          ${(0, reportNumbering_1.getLevel2ArabicLetter)(2, formatting)} السلبيات
        </div>
        ${renderObservationItems(manualObservationSection?.negativesList || [])}

        <div style="font-weight: bold; margin-top: 12px; font-size: 14px; margin-right: ${(0, reportNumbering_1.getIndentation)(2, formatting)};">
          ${(0, reportNumbering_1.getLevel2ArabicLetter)(3, formatting)} المعوقات
        </div>
        ${renderObservationItems(manualObservationSection?.impedimentsList || [])}

        <div style="font-weight: bold; margin-top: 12px; font-size: 14px; margin-right: ${(0, reportNumbering_1.getIndentation)(2, formatting)};">
          ${(0, reportNumbering_1.getLevel2ArabicLetter)(4, formatting)} المعاضل
        </div>
        ${renderObservationItems(manualObservationSection?.obstaclesList || [])}
      </div>
    `;
        const officialRecommendationsHtml = `
      <div class="section-num page-break-inside-avoid">${(0, reportNumbering_1.getLevel1Number)(9, formatting)} التوصيات</div>
      <div class="section-body page-break-inside-avoid">
        ${payload.recommendations && payload.recommendations.length > 0 ? `
          ${payload.recommendations.filter((r) => r.visible).map((recGroup, idx) => `
            <div style="font-weight: bold; margin-top: 15px; font-size: 14px; margin-right: ${(0, reportNumbering_1.getIndentation)(2, formatting)};">
              ${(0, reportNumbering_1.getLevel2ArabicLetter)(idx + 1, formatting)} ${recGroup.authority}
            </div>
            <div style="margin-right: ${(0, reportNumbering_1.getIndentation)(3, formatting)};">
              ${recGroup.recs && recGroup.recs.length > 0 ? recGroup.recs.map((rec, recIdx) => `
                <div style="margin-bottom: 8px;">
                  <div style="margin-bottom: 4px; font-size: 13.5px; font-weight: 500;">
                    ${(0, reportNumbering_1.getLevel3Ordinal)(recIdx + 1, formatting).replace('.', ':')} ${rec.text}
                  </div>
                  ${rec.children && rec.children.length > 0 ? `
                    <div style="margin-right: ${(0, reportNumbering_1.getIndentation)(4, formatting)}; display: flex; flex-direction: column; gap: 4px;">
                      ${rec.children.map((child) => `
                        <div style="font-size: 13px; color: #4a5568;">• ${child.text}</div>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              `).join('') : `<div style="font-size: 13.5px; color: #718096; font-style: italic; margin-bottom: 10px;">لا توجد توصيات مدخلة تحت هذه الجهة.</div>`}
            </div>
          `).join('')}
        ` : `<div style="margin-right: ${(0, reportNumbering_1.getIndentation)(2, formatting)}; font-size: 13.5px; color: #718096;">لا توجد توصيات مدخلة.</div>`}
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
            console.error('Failed to load logo in PDF generation', e);
        }
        let detailSectionHtml = '';
        let level2Idx = 1;
        const visibleSections = sections.filter((sec) => !sec.isManual && sec.visible && !sec.isEmpty);
        if (visibleSections.length === 0) {
            detailSectionHtml += `
        <div style="text-align: center; padding: 40px; margin-top: 30px; border: 2px dashed #cbd5e0; border-radius: 8px; background-color: #fafbfc; font-size: 15px; color: #c53030; font-family: 'Cairo', sans-serif; font-weight: bold; direction: rtl;">
          ⚠️ لا توجد أسس مرتبطة بهذا القالب التفتيشي
        </div>
      `;
        }
        sections.forEach((sec) => {
            if (sec.isManual)
                return;
            if (!sec.visible || sec.isEmpty)
                return;
            const priTitlePrefix = sec.numbering ? sec.numbering : (0, reportNumbering_1.getLevel2ArabicLetter)(level2Idx++, formatting);
            const priTitleFormatted = `${priTitlePrefix} ${sec.title}`;
            let sectionNarrativeHtml = '';
            if (sec.narrativeText) {
                sectionNarrativeHtml = `
          <div style="margin-right: ${(0, reportNumbering_1.getIndentation)(3, formatting)}; margin-bottom: 10px; font-size: 13.5px; white-space: pre-line; text-align: justify;">
            ${sec.narrativeText}
          </div>
        `;
            }
            detailSectionHtml += `
        <div class="page-break-inside-avoid" style="margin-top: 25px; margin-right: ${(0, reportNumbering_1.getIndentation)(2, formatting)};">
          <div style="font-weight: bold; font-size: 15px; color: #0c2340; border-bottom: 1.5px solid #0c2340; padding-bottom: 3px; margin-bottom: 10px;">
            ${priTitleFormatted}
          </div>
          ${sectionNarrativeHtml}
      `;
            if (sec.isManual) {
                let catIdx = 1;
                if (sec.showPositives && sec.positivesList?.length > 0) {
                    detailSectionHtml += `
            <div style="font-weight: bold; font-size: 14px; color: #1a5235; margin-right: ${(0, reportNumbering_1.getIndentation)(3, formatting)}; margin-top: 12px; margin-bottom: 6px;">
              ${(0, reportNumbering_1.getLevel3Ordinal)(catIdx++, formatting)} الإيجابيات وعوامل القوة العامة:
            </div>`;
                    sec.positivesList.forEach((text, idx) => {
                        detailSectionHtml += `
              <div style="margin-right: ${(0, reportNumbering_1.getIndentation)(4, formatting)}; font-size: 13.5px; margin-bottom: 4px; text-align: justify;">
                ${(0, reportNumbering_1.getLevel5ArabicLetter)(idx + 1, formatting)} ${text}
              </div>`;
                    });
                }
                if (sec.showNegatives && sec.negativesList?.length > 0) {
                    detailSectionHtml += `
            <div style="font-weight: bold; font-size: 14px; color: #742a2a; margin-right: ${(0, reportNumbering_1.getIndentation)(3, formatting)}; margin-top: 12px; margin-bottom: 6px;">
              ${(0, reportNumbering_1.getLevel3Ordinal)(catIdx++, formatting)} السلبيات ونقاط التقصير العامة:
            </div>`;
                    sec.negativesList.forEach((text, idx) => {
                        detailSectionHtml += `
              <div style="margin-right: ${(0, reportNumbering_1.getIndentation)(4, formatting)}; font-size: 13.5px; margin-bottom: 4px; text-align: justify;">
                ${(0, reportNumbering_1.getLevel5ArabicLetter)(idx + 1, formatting)} ${text}
              </div>`;
                    });
                }
                if (sec.showImpediments && sec.impedimentsList?.length > 0) {
                    detailSectionHtml += `
            <div style="font-weight: bold; font-size: 14px; color: #7b341e; margin-right: ${(0, reportNumbering_1.getIndentation)(3, formatting)}; margin-top: 12px; margin-bottom: 6px;">
              ${(0, reportNumbering_1.getLevel3Ordinal)(catIdx++, formatting)} المعوقات العامة:
            </div>`;
                    sec.impedimentsList.forEach((text, idx) => {
                        detailSectionHtml += `
              <div style="margin-right: ${(0, reportNumbering_1.getIndentation)(4, formatting)}; font-size: 13.5px; margin-bottom: 4px; text-align: justify;">
                ${(0, reportNumbering_1.getLevel5ArabicLetter)(idx + 1, formatting)} ${text}
              </div>`;
                    });
                }
                if (sec.showObstacles && sec.obstaclesList?.length > 0) {
                    detailSectionHtml += `
            <div style="font-weight: bold; font-size: 14px; color: #5a3e2b; margin-right: ${(0, reportNumbering_1.getIndentation)(3, formatting)}; margin-top: 12px; margin-bottom: 6px;">
              ${(0, reportNumbering_1.getLevel3Ordinal)(catIdx++, formatting)} المعاضل العامة:
            </div>`;
                    sec.obstaclesList.forEach((text, idx) => {
                        detailSectionHtml += `
              <div style="margin-right: ${(0, reportNumbering_1.getIndentation)(4, formatting)}; font-size: 13.5px; margin-bottom: 4px; text-align: justify;">
                ${(0, reportNumbering_1.getLevel5ArabicLetter)(idx + 1, formatting)} ${text}
              </div>`;
                    });
                }
                if (!sec.positivesList && sec.findings && sec.findings.length > 0) {
                    sec.findings.forEach((text, idx) => {
                        const findingNum = (0, reportNumbering_1.getLevel3Ordinal)(idx + 1, formatting);
                        detailSectionHtml += `
              <div style="margin-right: ${(0, reportNumbering_1.getIndentation)(3, formatting)}; font-size: 13.5px; margin-bottom: 6px; text-align: justify;">
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
                    const toAr = (n) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)]);
                    const subTitlePrefix = sub.numbering ? sub.numbering : (0, reportNumbering_1.getLevel3Ordinal)(secOrdinalIdx++, formatting);
                    detailSectionHtml += `
            <div class="page-break-inside-avoid" style="margin-top: 18px; margin-right: ${(0, reportNumbering_1.getIndentation)(3, formatting)};">
              <div style="font-weight: bold; font-size: 14px; color: #1a202c; margin-bottom: 10px; border-right: 3px solid #0c2340; padding-right: 8px;">
                ${subTitlePrefix} ${sub.title}
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
                        oiItems.forEach(text => {
                            detailSectionHtml += `
                <div style="margin-right: ${(0, reportNumbering_1.getIndentation)(4, formatting)}; font-size: 13.5px; margin-bottom: 5px; display: flex; gap: 6px; line-height: 1.8;">
                  <span style="font-weight: bold; min-width: 30px; color: #0c2340;">(${toAr(itemIdx++)})</span>
                  <span>${text}</span>
                </div>
              `;
                        });
                    }
                    if (sub.findings && sub.findings.length > 0) {
                        sub.findings.forEach((text) => {
                            detailSectionHtml += `
                <div style="margin-right: ${(0, reportNumbering_1.getIndentation)(4, formatting)}; font-size: 13.5px; margin-bottom: 5px; display: flex; gap: 6px; text-align: justify; line-height: 1.8;">
                  <span style="font-weight: bold; min-width: 30px; color: #0c2340;">(${toAr(itemIdx++)})</span>
                  <span>${text}</span>
                </div>
              `;
                        });
                    }
                    if (sub.narrativeText) {
                        detailSectionHtml += `
              <div style="margin-right: ${(0, reportNumbering_1.getIndentation)(4, formatting)}; font-size: 13px; margin-top: 6px; white-space: pre-line; color: #4a5568; text-align: justify;">
                ${sub.narrativeText}
              </div>
            `;
                    }
                    if (sub.detailedTables && sub.detailedTables.length > 0) {
                        sub.detailedTables.forEach((table) => {
                            detailSectionHtml += `
                <div class="page-break-inside-avoid" style="margin-top: 15px; margin-bottom: 20px; margin-right: ${(0, reportNumbering_1.getIndentation)(4, formatting)};">
                  <div style="font-weight: bold; font-size: 13px; color: #0c2340; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                    <span>📊 ${table.title}</span>
                    <span style="font-size: 11px; font-weight: normal; color: #718096; margin-right: auto;">(${table.entityName})</span>
                  </div>
                  <div style="overflow-x: auto; width: 100%;">
                    <table class="military-table" style="margin: 5px 0 10px 0; width: 100%; border-collapse: collapse;">
                      <thead>
                        <tr style="background-color: #f2f2f2;">
                          ${table.schema.map((col) => `
                            <th style="padding: 6px 8px; border: 1px solid #000000; font-weight: bold; text-align: center; font-size: 12px;">
                              ${col.label}
                            </th>
                          `).join('')}
                        </tr>
                      </thead>
                      <tbody>
                        ${table.rows.map((row) => `
                          <tr>
                            ${table.schema.map((col) => {
                                const cellVal = row[col.key] !== undefined ? row[col.key] : '';
                                const isPercentage = col.role === 'percentage';
                                const formattedVal = isPercentage ? `${cellVal}%` : cellVal;
                                let textColor = '#000000';
                                if (col.role === 'deficit' && Number(cellVal) > 0)
                                    textColor = '#c53030';
                                if (col.role === 'increase' && Number(cellVal) > 0)
                                    textColor = '#2b6cb0';
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
                    detailSectionHtml += `</div>`;
                });
            }
            detailSectionHtml += `</div>`;
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

        <div class="section-num">${(0, reportNumbering_1.getLevel1Number)(1, formatting)} التكلـــــيف</div>
        <div class="section-body">
          ${payload.assignmentText}
        </div>

        <div class="section-num">${(0, reportNumbering_1.getLevel1Number)(2, formatting)} التــــأليف</div>
        <div class="section-body">
          <table style="width: 100%; max-width: 650px; border-collapse: collapse; border: none; margin-top: 10px;">
            <tbody>
              ${payload.committeeMembers.map((member) => {
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

        <div class="section-num">${(0, reportNumbering_1.getLevel1Number)(3, formatting)} الغــــاية</div>
        <div class="section-body">
          ${payload.purposeText}
        </div>

        <div class="section-num">${(0, reportNumbering_1.getLevel1Number)(4, formatting)} تاريخ التفتيش</div>
        <div class="section-body">
          ${payload.durationText}
        </div>

        <div class="section-num page-break-inside-avoid">${(0, reportNumbering_1.getLevel1Number)(5, formatting)} جدول المدراء والآمرين وشاغلي المناصب الأساسية</div>
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
              ${payload.positions.map((pos, idx) => `
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
          <div class="section-num page-break-inside-avoid">${(0, reportNumbering_1.getLevel1Number)(6, formatting)} المواقف الرسمية ونسب التكامل الفعلي</div>
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
                ${payload.personnelRows.map((row) => `
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

        <div class="section-num">${(0, reportNumbering_1.getLevel1Number)(7, formatting)} تفاصيل التفتيش</div>
        <div class="section-body">
          ${detailSectionHtml}
        </div>

        ${officialObservationsHtml}

        ${officialRecommendationsHtml}

        ${finalEvaluationSectionNumHtml}

        ${false && payload.recommendations && payload.recommendations.some((r) => r.visible && r.recs.length > 0) ? `
          <div class="section-num page-break-inside-avoid">${(0, reportNumbering_1.getLevel1Number)(8, formatting)} التوصيات والمقترحات المرفوعة للمصادقة</div>
          <div class="section-body page-break-inside-avoid">
            ${payload.recommendations.filter((r) => r.visible).map((recGroup, idx) => `
              <div style="font-weight: bold; margin-top: 15px; font-size: 14px; margin-right: ${(0, reportNumbering_1.getIndentation)(2, formatting)};">
                ${(0, reportNumbering_1.getLevel2ArabicLetter)(idx + 1, formatting)} الموجهة إلى (${recGroup.authority}):
              </div>
              <div style="margin-right: ${(0, reportNumbering_1.getIndentation)(3, formatting)};">
                ${recGroup.recs.map((r, rIdx) => `
                  <div style="margin-bottom: 6px; font-size: 13.5px;">${(0, reportNumbering_1.getLevel3Ordinal)(rIdx + 1, formatting)} ${r}</div>
                `).join('')}
              </div>
            `).join('')}
          </div>
        ` : ''}

        ${payload.appendices && payload.appendices.some((a) => a.visible) ? `
          <div class="page-break"></div>
          <div class="section-num">${(0, reportNumbering_1.getLevel1Number)(11, formatting)} ملاحق التقرير التفتيشي</div>
          <div class="section-body">
            ${payload.appendices.filter((a) => a.visible).map((app, idx) => `
              <div class="page-break-inside-avoid" style="margin-bottom: 20px; margin-right: ${(0, reportNumbering_1.getIndentation)(2, formatting)};">
                <div style="font-weight: bold; color: #0c2340; border-bottom: 1px dashed #cbd5e0; padding-bottom: 3px; margin-bottom: 8px;">
                  ${(0, reportNumbering_1.getLevel2ArabicLetter)(idx + 1, formatting)} ملحق (${app.symbol})
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
        }
        else {
            const manualSection = payload.sections.find((s) => s.isManual);
            const htmlManualPositives = (manualSection?.positivesList || []);
            const htmlManualNegatives = (manualSection?.negativesList || []);
            const htmlManualImpediments = (manualSection?.impedimentsList || []);
            const htmlManualObstacles = (manualSection?.obstaclesList || []);
            const htmlShowPositives = manualSection?.showPositives !== false && htmlManualPositives.length > 0;
            const htmlShowNegatives = manualSection?.showNegatives !== false && htmlManualNegatives.length > 0;
            const htmlShowImpediments = manualSection?.showImpediments !== false && htmlManualImpediments.length > 0;
            const htmlShowObstacles = manualSection?.showObstacles !== false && htmlManualObstacles.length > 0;
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

        <div class="section-title">${(0, reportNumbering_1.getLevel1Number)(1, formatting)} المعلومات الأساسية للحملة التفتيشية</div>
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

        <div class="section-title">${(0, reportNumbering_1.getLevel1Number)(2, formatting)} جدول تقييم الأداء الميداني للكيانات المفتشة</div>
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
        <div class="section-title">${(0, reportNumbering_1.getLevel1Number)(3, formatting)} ${manualSection?.title || 'الملاحظات والنتائج العامة للجنة التفتيشية'}</div>
        <div style="margin-right: 15px;">
          ${htmlShowPositives ? `
            <div style="font-weight: bold; color: #0c2340; margin-top: 15px;">
              ${(0, reportNumbering_1.getLevel2ArabicLetter)(1, formatting)} الإيجابيات ورصد كفاءة الأداء:
            </div>
            ${htmlManualPositives.map((note, idx) => `
              <div style="margin-right: 20px; margin-bottom: 4px;">
                ${(0, reportNumbering_1.getLevel3Ordinal)(idx + 1, formatting)} ${note}
              </div>
            `).join('')}
          ` : ''}

          ${htmlShowNegatives ? `
            <div style="font-weight: bold; color: #0c2340; margin-top: 15px;">
              ${(0, reportNumbering_1.getLevel2ArabicLetter)(htmlShowPositives ? 2 : 1, formatting)} السلبيات ونقاط الضعف المرصودة:
            </div>
            ${htmlManualNegatives.map((note, idx) => `
              <div style="margin-right: 20px; margin-bottom: 4px;">
                ${(0, reportNumbering_1.getLevel3Ordinal)(idx + 1, formatting)} ${note}
              </div>
            `).join('')}
          ` : ''}

          ${(htmlShowImpediments || htmlShowObstacles) ? `
            <div style="font-weight: bold; color: #0c2340; margin-top: 15px;">
              ${(0, reportNumbering_1.getLevel2ArabicLetter)((htmlShowPositives ? 1 : 0) + (htmlShowNegatives ? 1 : 0) + 1, formatting)} المعوقات والمعاضل الميدانية:
            </div>
            ${htmlShowObstacles ? htmlManualObstacles.map((note, idx) => `
              <div style="margin-right: 20px; margin-bottom: 4px;">
                ${(0, reportNumbering_1.getLevel3Ordinal)(idx + 1, formatting)} ${note} (عائق)
              </div>
            `).join('') : ''}
            ${htmlShowImpediments ? htmlManualImpediments.map((note, idx) => `
              <div style="margin-right: 20px; margin-bottom: 4px;">
                ${(0, reportNumbering_1.getLevel3Ordinal)((htmlShowObstacles ? htmlManualObstacles.length : 0) + idx + 1, formatting)} ${note} (معضلة حرجة)
              </div>
            `).join('') : ''}
          ` : ''}

          ${htmlOldFindings.length > 0 ? htmlOldFindings.map((text, idx) => `
            <div style="margin-right: 20px; margin-bottom: 4px;">
              ${(0, reportNumbering_1.getLevel3Ordinal)(idx + 1, formatting)} ${text}
            </div>
          `).join('') : ''}
        </div>
        ` : ''}

        ${payload.recommendations && payload.recommendations.length > 0 ? `
          <div class="section-title">${(0, reportNumbering_1.getLevel1Number)(4, formatting)} التوصيات</div>
          <div style="margin-right: 15px;">
            ${payload.recommendations.filter((r) => r.visible).map((recGroup, idx) => `
              <div style="font-weight: bold; color: #0c2340; margin-top: 15px;">
                ${(0, reportNumbering_1.getLevel2ArabicLetter)(idx + 1, formatting)} ${recGroup.authority}
              </div>
              <div style="margin-right: 20px;">
                ${recGroup.recs && recGroup.recs.length > 0 ? recGroup.recs.map((rec, recIdx) => `
                  <div style="margin-bottom: 8px;">
                    <div style="margin-bottom: 4px; font-size: 13.5px; font-weight: 500;">
                      ${(0, reportNumbering_1.getLevel3Ordinal)(recIdx + 1, formatting).replace('.', ':')} ${rec.text}
                    </div>
                    ${rec.children && rec.children.length > 0 ? `
                      <div style="margin-right: ${(0, reportNumbering_1.getIndentation)(4, formatting)}; display: flex; flex-direction: column; gap: 4px;">
                        ${rec.children.map((child) => `
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

        ${payload.appendices && payload.appendices.some((a) => a.visible) ? `
          <div class="page-break"></div>
          <div class="section-title">${(0, reportNumbering_1.getLevel1Number)(5, formatting)} ملاحق التقرير التفتيشي</div>
          <div style="margin-right: 15px;">
            ${payload.appendices.filter((a) => a.visible).map((app, idx) => `
              <div style="font-weight: bold; color: #0c2340; border-bottom: 1px dashed #cbd5e0; padding-bottom: 3px; margin-bottom: 8px;">
                ${(0, reportNumbering_1.getLevel2ArabicLetter)(idx + 1, formatting)} ملحق (${app.symbol})
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
    async generateCampaignReportPdf(campaignId, payload) {
        if (!payload) {
            payload = await this.getCampaignReportPayload(campaignId);
        }
        else {
            this.normalizeReportSectionsVisibility(payload);
            if (!payload.finalEvaluation) {
                payload.finalEvaluation = await this.calculateCampaignFinalEvaluation(campaignId);
            }
            const currentObservationSection = await this.buildCampaignObservationSection(campaignId);
            this.mergeObservationSection(payload, currentObservationSection);
            this.normalizeReportSectionsVisibility(payload);
        }
        const htmlContent = this.generateHtmlFromPayload(payload);
        const browser = await puppeteer_1.default.launch({
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
    async generateCampaignReportWord(campaignId, payload) {
        if (!payload) {
            payload = await this.getCampaignReportPayload(campaignId);
        }
        else {
            this.normalizeReportSectionsVisibility(payload);
            if (!payload.finalEvaluation) {
                payload.finalEvaluation = await this.calculateCampaignFinalEvaluation(campaignId);
            }
            const currentObservationSection = await this.buildCampaignObservationSection(campaignId);
            this.mergeObservationSection(payload, currentObservationSection);
            this.normalizeReportSectionsVisibility(payload);
        }
        const formatting = payload.formatting || reportNumbering_1.DEFAULT_FORMATTING_CONFIG;
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
                                    children: [new docx_1.TextRun({ text: 'جمهورية العراق', bold: true, size: 24, font: 'Cairo' })],
                                    alignment: docx_1.AlignmentType.RIGHT,
                                    bidirectional: true,
                                }),
                                new docx_1.Paragraph({
                                    children: [new docx_1.TextRun({ text: 'وزارة الداخلية', bold: true, size: 24, font: 'Cairo' })],
                                    alignment: docx_1.AlignmentType.RIGHT,
                                    bidirectional: true,
                                }),
                                new docx_1.Paragraph({
                                    children: [new docx_1.TextRun({ text: 'هيئة تفتيش قوى الامن الداخلي', bold: true, size: 24, font: 'Cairo' })],
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
                                        new docx_1.TextRun({ text: 'التاريخ: ', bold: true, size: 22, font: 'Cairo' }),
                                        new docx_1.TextRun({ text: payload.startDateText || (payload.startDate ? new Date(payload.startDate).toLocaleDateString('ar-EG') : '—'), size: 22, font: 'Cairo' }),
                                    ],
                                    alignment: docx_1.AlignmentType.LEFT,
                                    bidirectional: true,
                                }),
                                new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({ text: 'العدد: ', bold: true, size: 22, font: 'Cairo' }),
                                        new docx_1.TextRun({ text: payload.formationNumber || '—', size: 22, font: 'Cairo' }),
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
            children: [new docx_1.TextRun({ text: payload.title, bold: true, size: 32, underline: {} })],
            alignment: docx_1.AlignmentType.CENTER,
            bidirectional: true,
        }), new docx_1.Paragraph({
            children: [new docx_1.TextRun({ text: '' })],
            spacing: { before: 400 },
        }));
        const heading1Style = (text) => new docx_1.Paragraph({
            children: [new docx_1.TextRun({ text, bold: true, size: 28, color: '0C2340', rightToLeft: true, font: 'Cairo' })],
            spacing: { before: 300, after: 150 },
            bidirectional: true,
        });
        const bodyStyle = (text, level = 1) => {
            const rightIndent = formatting.enableLevels[`level${level}`] ? formatting.indentations[`level${level}`] * 14.4 : 0;
            return new docx_1.Paragraph({
                children: [new docx_1.TextRun({ text, size: 24, rightToLeft: true, font: 'Cairo' })],
                spacing: { after: 120 },
                indent: { right: rightIndent },
                bidirectional: true,
            });
        };
        if (isEducational) {
            docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(1, formatting)} التكلـــــيف`));
            docChildren.push(bodyStyle(payload.assignmentText));
            docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(2, formatting)} التــــأليف`));
            if (payload.committeeMembers && payload.committeeMembers.length > 0) {
                const memberRows = [];
                payload.committeeMembers.forEach((member) => {
                    const parsed = parseCommitteeMember(member);
                    memberRows.push(new docx_1.TableRow({
                        children: [
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [new docx_1.TextRun({ text: parsed.name, size: 24, rightToLeft: true, font: 'Cairo' })],
                                        alignment: docx_1.AlignmentType.RIGHT,
                                        bidirectional: true,
                                    })
                                ],
                                width: { size: 5415, type: docx_1.WidthType.DXA },
                            }),
                            new docx_1.TableCell({
                                children: [
                                    new docx_1.Paragraph({
                                        children: [new docx_1.TextRun({ text: parsed.role, size: 24, rightToLeft: true, font: 'Cairo' })],
                                        alignment: docx_1.AlignmentType.RIGHT,
                                        bidirectional: true,
                                    })
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
            docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(3, formatting)} الغــــاية`));
            docChildren.push(bodyStyle(payload.purposeText));
            docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(4, formatting)} تاريخ التفتيش`));
            docChildren.push(bodyStyle(payload.durationText));
            docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(5, formatting)} جدول المدراء والآمرين وشاغلي المناصب الأساسية`));
            const posTableRows = [
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'ت', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 451, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'المنصب', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1805, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'الرتبة', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 903, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'الاسم الكامل', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1354, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'الرقم الإحصائي', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 903, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'تاريخ إشغال المنصب', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1354, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'نوع الإشغال', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 903, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'التحصيل الدراسي', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 903, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'الملاحظات', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1350, type: docx_1.WidthType.DXA } }),
                    ],
                }),
            ];
            payload.positions.forEach((pos, idx) => {
                posTableRows.push(new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: String(idx + 1), size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 451, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: pos.positionName || '', bold: true, size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 1805, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: pos.rank || '', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 903, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: pos.positionHolder || '', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 1354, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: pos.statisticalNumber || '', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 903, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: pos.joinedDate || '', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 1354, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: pos.positionStatus || '', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 903, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: pos.education || '', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 903, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: pos.notes || '', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 1350, type: docx_1.WidthType.DXA } }),
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
            if (payload.personnelRows && payload.personnelRows.length > 0) {
                docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(6, formatting)} المواقف الرسمية ونسب التكامل الفعلي`));
                const quantTableRows = [
                    new docx_1.TableRow({
                        children: [
                            new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'الفئة', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 2708, type: docx_1.WidthType.DXA } }),
                            new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'الملاك', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1264, type: docx_1.WidthType.DXA } }),
                            new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'الموجود', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1264, type: docx_1.WidthType.DXA } }),
                            new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'الزيادة', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1264, type: docx_1.WidthType.DXA } }),
                            new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'النقص', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1264, type: docx_1.WidthType.DXA } }),
                            new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'نسبة التكامل', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1262, type: docx_1.WidthType.DXA } }),
                        ],
                    }),
                ];
                payload.personnelRows.forEach((row) => {
                    const nominal = row.authorized !== undefined ? row.authorized : (row.nominal || 0);
                    const actual = row.present !== undefined ? row.present : (row.actual || 0);
                    const increase = row.excess !== undefined ? row.excess : Math.max(0, actual - nominal);
                    const deficit = row.shortage !== undefined ? row.shortage : Math.max(0, nominal - actual);
                    const percentage = row.percentage !== undefined ? row.percentage : (nominal > 0 ? (actual / nominal * 100).toFixed(0) : '0');
                    quantTableRows.push(new docx_1.TableRow({
                        children: [
                            new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: row.category || '', bold: true, size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.RIGHT, bidirectional: true })], width: { size: 2708, type: docx_1.WidthType.DXA } }),
                            new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: String(nominal), size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 1264, type: docx_1.WidthType.DXA } }),
                            new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: String(actual), size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 1264, type: docx_1.WidthType.DXA } }),
                            new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: String(increase), size: 20, rightToLeft: true, font: 'Cairo', color: '2b6cb0' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 1264, type: docx_1.WidthType.DXA } }),
                            new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: String(deficit), size: 20, rightToLeft: true, font: 'Cairo', color: 'c53030' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 1264, type: docx_1.WidthType.DXA } }),
                            new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: `${parseFloat(percentage).toFixed(1)}%`, bold: true, size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 1262, type: docx_1.WidthType.DXA } }),
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
            docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(7, formatting)} تفاصيل التفتيش`));
            docChildren.push(bodyStyle('بناءً على التوجيهات الرسمية، تم تجميع وتصنيف كافة نتائج التفتيش الميداني وأسس التقييم والخيارات المرصودة والملاحظات والدرجات للمنطقة الأمنية المعنية بشكل منظم ومبوب كما يلي:'));
            docChildren.push(new docx_1.Paragraph({ text: '' }));
            let l2Idx = 1;
            const visibleSections = payload.sections?.filter((sec) => sec.visible && !sec.isEmpty) || [];
            if (visibleSections.length === 0) {
                docChildren.push(new docx_1.Paragraph({
                    children: [
                        new docx_1.TextRun({
                            text: '⚠️ لا توجد أسس مرتبطة بهذا القالب التفتيشي',
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
                const priTitlePrefix = sec.numbering ? sec.numbering : (0, reportNumbering_1.getLevel2ArabicLetter)(l2Idx++, formatting);
                const priTitleFormatted = `${priTitlePrefix} ${sec.title}`;
                docChildren.push(new docx_1.Paragraph({
                    children: [new docx_1.TextRun({ text: priTitleFormatted, bold: true, size: 26, color: '0C2340', font: 'Cairo' })],
                    spacing: { before: 200, after: 100 },
                    indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
                    bidirectional: true,
                }));
                if (sec.narrativeText) {
                    docChildren.push(new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: sec.narrativeText, size: 22, rightToLeft: true, font: 'Cairo' })],
                        spacing: { after: 100 },
                        indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                        bidirectional: true,
                    }));
                }
                if (sec.isManual) {
                    let level4Idx = 1;
                    if (sec.showPositives && sec.positivesList?.length > 0) {
                        docChildren.push(new docx_1.Paragraph({
                            children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel4Number)(level4Idx++, formatting)} الإيجابيات وعوامل القوة العامة:`, bold: true, size: 24, color: '1A5235' })],
                            spacing: { before: 100, after: 60 },
                            indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                            bidirectional: true,
                        }));
                        sec.positivesList.forEach((text, idx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel5ArabicLetter)(idx + 1, formatting)} ${text}`, size: 24, color: '1A5235' })],
                                spacing: { after: 60 },
                                indent: { right: formatting.enableLevels.level5 ? formatting.indentations.level5 * 14.4 : 0 },
                                bidirectional: true,
                            }));
                        });
                    }
                    if (sec.showNegatives && sec.negativesList?.length > 0) {
                        docChildren.push(new docx_1.Paragraph({
                            children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel4Number)(level4Idx++, formatting)} السلبيات ونقاط التقصير العامة:`, bold: true, size: 24, color: '742A2A' })],
                            spacing: { before: 100, after: 60 },
                            indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                            bidirectional: true,
                        }));
                        sec.negativesList.forEach((text, idx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel5ArabicLetter)(idx + 1, formatting)} ${text}`, size: 24, color: '742A2A' })],
                                spacing: { after: 60 },
                                indent: { right: formatting.enableLevels.level5 ? formatting.indentations.level5 * 14.4 : 0 },
                                bidirectional: true,
                            }));
                        });
                    }
                    if (sec.showImpediments && sec.impedimentsList?.length > 0) {
                        docChildren.push(new docx_1.Paragraph({
                            children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel4Number)(level4Idx++, formatting)} المعوقات العامة:`, bold: true, size: 24, color: '7B341E' })],
                            spacing: { before: 100, after: 60 },
                            indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                            bidirectional: true,
                        }));
                        sec.impedimentsList.forEach((text, idx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel5ArabicLetter)(idx + 1, formatting)} ${text}`, size: 24, color: '7B341E' })],
                                spacing: { after: 60 },
                                indent: { right: formatting.enableLevels.level5 ? formatting.indentations.level5 * 14.4 : 0 },
                                bidirectional: true,
                            }));
                        });
                    }
                    if (sec.showObstacles && sec.obstaclesList?.length > 0) {
                        docChildren.push(new docx_1.Paragraph({
                            children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel4Number)(level4Idx++, formatting)} المعاضل العامة:`, bold: true, size: 24, color: '5A3E2B' })],
                            spacing: { before: 100, after: 60 },
                            indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                            bidirectional: true,
                        }));
                        sec.obstaclesList.forEach((text, idx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel5ArabicLetter)(idx + 1, formatting)} ${text}`, size: 24, color: '5A3E2B' })],
                                spacing: { after: 60 },
                                indent: { right: formatting.enableLevels.level5 ? formatting.indentations.level5 * 14.4 : 0 },
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
                        const toAr = (n) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)]);
                        const subTitlePrefix = sub.numbering ? sub.numbering : (0, reportNumbering_1.getLevel3Ordinal)(secOrdIdx++, formatting);
                        const secTitleFormatted = `${subTitlePrefix} ${sub.title}`;
                        docChildren.push(new docx_1.Paragraph({
                            children: [new docx_1.TextRun({ text: secTitleFormatted, bold: true, size: 26, color: '1A202C', font: 'Cairo', rightToLeft: true })],
                            spacing: { before: 200, after: 100 },
                            indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                            bidirectional: true,
                            border: { right: { style: docx_1.BorderStyle.THICK, size: 6, color: '0C2340' } },
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
                            oiItems.forEach(text => {
                                docChildren.push(new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({ text: `(${toAr(itemIdx++)})  `, bold: true, size: 24, color: '0C2340', rightToLeft: true, font: 'Cairo' }),
                                        new docx_1.TextRun({ text, size: 24, rightToLeft: true, font: 'Cairo' }),
                                    ],
                                    spacing: { after: 80 },
                                    indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                                    bidirectional: true,
                                }));
                            });
                        }
                        if (sub.findings && sub.findings.length > 0) {
                            sub.findings.forEach((text) => {
                                docChildren.push(new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({ text: `(${toAr(itemIdx++)})  `, bold: true, size: 24, color: '0C2340', rightToLeft: true, font: 'Cairo' }),
                                        new docx_1.TextRun({ text, size: 24, rightToLeft: true, font: 'Cairo' }),
                                    ],
                                    spacing: { after: 80 },
                                    indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                                    bidirectional: true,
                                }));
                            });
                        }
                        if (sub.narrativeText) {
                            docChildren.push(new docx_1.Paragraph({
                                children: [new docx_1.TextRun({ text: sub.narrativeText, size: 22, rightToLeft: true, font: 'Cairo', color: '4A5568' })],
                                spacing: { after: 80 },
                                indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                                bidirectional: true,
                            }));
                        }
                        if (sub.detailedTables && sub.detailedTables.length > 0) {
                            sub.detailedTables.forEach((table) => {
                                docChildren.push(new docx_1.Paragraph({
                                    children: [
                                        new docx_1.TextRun({ text: `📊  ${table.title} `, bold: true, size: 22, color: '0C2340', font: 'Cairo' }),
                                        new docx_1.TextRun({ text: ` (${table.entityName})`, size: 20, color: '718096', font: 'Cairo' }),
                                    ],
                                    spacing: { before: 120, after: 80 },
                                    indent: { right: formatting.enableLevels.level4 ? (formatting.indentations.level4 + 0.5) * 14.4 : 14.4 },
                                    bidirectional: true,
                                }));
                                const wordTableRows = [];
                                wordTableRows.push(new docx_1.TableRow({
                                    children: table.schema.map((col) => (new docx_1.TableCell({
                                        children: [
                                            new docx_1.Paragraph({
                                                children: [new docx_1.TextRun({ text: col.label, bold: true, size: 20, rightToLeft: true, font: 'Cairo' })],
                                                alignment: docx_1.AlignmentType.CENTER,
                                                bidirectional: true,
                                            })
                                        ],
                                        shading: { fill: 'F2F2F2' },
                                    }))),
                                }));
                                table.rows.forEach((row) => {
                                    wordTableRows.push(new docx_1.TableRow({
                                        children: table.schema.map((col) => {
                                            const cellVal = row[col.key] !== undefined ? row[col.key] : '';
                                            const isPercentage = col.role === 'percentage';
                                            const formattedVal = isPercentage ? `${cellVal}%` : String(cellVal);
                                            let textColor = '000000';
                                            if (col.role === 'deficit' && Number(cellVal) > 0)
                                                textColor = 'C53030';
                                            if (col.role === 'increase' && Number(cellVal) > 0)
                                                textColor = '2B6CB0';
                                            const isBold = col.role === 'label' || col.role === 'percentage' || col.role === 'deficit' || col.role === 'increase';
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
                                                                font: 'Cairo'
                                                            })
                                                        ],
                                                        alignment: col.role === 'label' ? docx_1.AlignmentType.RIGHT : docx_1.AlignmentType.CENTER,
                                                        bidirectional: true,
                                                    })
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
                        children: [new docx_1.TextRun({ text: 'لا توجد ملاحظات ضمن هذا التصنيف.', size: 22, color: '718096', font: 'Cairo' })],
                        spacing: { after: 60 },
                        indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                        bidirectional: true,
                    }));
                    return;
                }
                items.forEach((text, idx) => {
                    docChildren.push(new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel3Ordinal)(idx + 1, formatting)} ${text}`, size: 24, font: 'Cairo' })],
                        spacing: { after: 60 },
                        indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                        bidirectional: true,
                    }));
                });
            };
            const wordOfficialObservationSection = payload.sections.find((s) => s.isManual);
            docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(8, formatting)} الملاحظات`));
            [
                { title: `${(0, reportNumbering_1.getLevel2ArabicLetter)(1, formatting)} الإيجابيات`, items: wordOfficialObservationSection?.positivesList || [] },
                { title: `${(0, reportNumbering_1.getLevel2ArabicLetter)(2, formatting)} السلبيات`, items: wordOfficialObservationSection?.negativesList || [] },
                { title: `${(0, reportNumbering_1.getLevel2ArabicLetter)(3, formatting)} المعوقات`, items: wordOfficialObservationSection?.impedimentsList || [] },
                { title: `${(0, reportNumbering_1.getLevel2ArabicLetter)(4, formatting)} المعاضل`, items: wordOfficialObservationSection?.obstaclesList || [] },
            ].forEach((group) => {
                docChildren.push(new docx_1.Paragraph({
                    children: [new docx_1.TextRun({ text: group.title, bold: true, size: 24, font: 'Cairo' })],
                    spacing: { before: 100, after: 60 },
                    indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
                    bidirectional: true,
                }));
                pushOfficialObservationItems(group.items);
            });
            docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(9, formatting)} التوصيات`));
            if (payload.recommendations && payload.recommendations.length > 0) {
                payload.recommendations.filter((r) => r.visible).forEach((recGroup, idx) => {
                    docChildren.push(new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel2ArabicLetter)(idx + 1, formatting)} ${recGroup.authority}`, bold: true, size: 24, font: 'Cairo' })],
                        spacing: { before: 150, after: 60 },
                        indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
                        bidirectional: true,
                    }));
                    if (recGroup.recs && recGroup.recs.length > 0) {
                        recGroup.recs.forEach((rec, recIdx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel3Ordinal)(recIdx + 1, formatting).replace('.', ':')} ${rec.text}`, size: 24, font: 'Cairo' })],
                                spacing: { after: 60 },
                                indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                                bidirectional: true,
                            }));
                            if (rec.children && rec.children.length > 0) {
                                rec.children.forEach((child) => {
                                    docChildren.push(new docx_1.Paragraph({
                                        children: [new docx_1.TextRun({ text: `• ${child.text}`, size: 24, color: '4a5568', font: 'Cairo' })],
                                        spacing: { after: 60 },
                                        indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                                        bidirectional: true,
                                    }));
                                });
                            }
                        });
                    }
                    else {
                        docChildren.push(new docx_1.Paragraph({
                            children: [new docx_1.TextRun({ text: 'لا توجد توصيات مدخلة تحت هذه الجهة.', size: 22, color: '718096', font: 'Cairo' })],
                            spacing: { after: 60 },
                            indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                            bidirectional: true,
                        }));
                    }
                });
            }
            else {
                docChildren.push(new docx_1.Paragraph({
                    children: [new docx_1.TextRun({ text: 'لا توجد توصيات مدخلة.', size: 22, color: '718096', font: 'Cairo' })],
                    spacing: { after: 100 },
                    indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
                    bidirectional: true,
                }));
            }
            if (payload.finalEvaluation?.statement) {
                docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(10, formatting)} ${payload.finalEvaluation.statement}`));
            }
            if (false && payload.recommendations && payload.recommendations.some((r) => r.visible && r.recs.length > 0)) {
                docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(8, formatting)} التوصيات والمقترحات المرفوعة للمصادقة`));
                payload.recommendations.filter((r) => r.visible).forEach((recGroup, idx) => {
                    docChildren.push(new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel2ArabicLetter)(idx + 1, formatting)} الموجهة إلى (${recGroup.authority}):`, bold: true, size: 24 })],
                        spacing: { before: 150, after: 60 },
                        indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
                        bidirectional: true,
                    }));
                    recGroup.recs.forEach((r, rIdx) => {
                        docChildren.push(new docx_1.Paragraph({
                            children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel3Ordinal)(rIdx + 1, formatting)} ${r}`, size: 24 })],
                            spacing: { after: 60 },
                            indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                            bidirectional: true,
                        }));
                    });
                });
            }
            if (payload.appendices && payload.appendices.some((a) => a.visible)) {
                docChildren.push(new docx_1.Paragraph({ children: [new docx_1.PageBreak()] }));
                docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(11, formatting)} ملاحق التقرير التفتيشي`));
                payload.appendices.filter((a) => a.visible).forEach((app, idx) => {
                    docChildren.push(new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel2ArabicLetter)(idx + 1, formatting)} ملحق (${app.symbol})`, bold: true, size: 24, color: '0C2340' })],
                        spacing: { before: 150, after: 60 },
                        indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
                        bidirectional: true,
                    }), new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: app.text, size: 22 })],
                        spacing: { after: 120 },
                        indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
                        bidirectional: true,
                    }));
                });
            }
            if (false && payload.finalEvaluation?.statement) {
                docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(10, formatting)} ${payload.finalEvaluation.statement}`));
            }
        }
        else {
            const wordManualSection = payload.sections.find((s) => s.isManual);
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
            docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(1, formatting)} المعلومات الأساسية للحملة التفتيشية`));
            const metaTableRows = [
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'اسم الحملة التفتيشية', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], shading: { fill: 'F7F7F7' }, width: { size: 2708, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: payload.campaignName || '', size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], width: { size: 6318, type: docx_1.WidthType.DXA } }),
                    ],
                }),
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'الأمر الإداري المكلف', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], shading: { fill: 'F7F7F7' }, width: { size: 2708, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: `كتاب رقم ${payload.assignmentReference || ''} في ${payload.assignmentDate ? new Date(payload.assignmentDate).toLocaleDateString('ar-EG') : ''}`, size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], width: { size: 6318, type: docx_1.WidthType.DXA } }),
                    ],
                }),
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'الكيان المستهدف الرئيسي', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], shading: { fill: 'F7F7F7' }, width: { size: 2708, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: payload.targetEntityName || '', size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], width: { size: 6318, type: docx_1.WidthType.DXA } }),
                    ],
                }),
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'رئيس اللجنة التفتيشية', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], shading: { fill: 'F7F7F7' }, width: { size: 2708, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: payload.signatures.leaderName || '', size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], width: { size: 6318, type: docx_1.WidthType.DXA } }),
                    ],
                }),
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'معاون رئيس اللجنة / المقرر', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], shading: { fill: 'F7F7F7' }, width: { size: 2708, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: payload.signatures.deputyName || '', size: 22, rightToLeft: true, font: 'Cairo' })], bidirectional: true })], width: { size: 6318, type: docx_1.WidthType.DXA } }),
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
            docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(2, formatting)} جدول تقييم الأداء الميداني للكيانات المفتشة`));
            const evalTableRows = [
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'ت', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 903, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'الكيان المفتش', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 3610, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'الموقع الجغرافي', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 2708, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'النسبة المستحصلة', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], shading: { fill: 'F2F2F2' }, width: { size: 1805, type: docx_1.WidthType.DXA } }),
                    ],
                }),
                new docx_1.TableRow({
                    children: [
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: '1', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 903, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: payload.targetEntityName || '', bold: true, size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 3610, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: 'مقر الكيان', size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 2708, type: docx_1.WidthType.DXA } }),
                        new docx_1.TableCell({ children: [new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: '100.0%', bold: true, size: 20, rightToLeft: true, font: 'Cairo' })], alignment: docx_1.AlignmentType.CENTER, bidirectional: true })], width: { size: 1805, type: docx_1.WidthType.DXA } }),
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
            if (wordShowPositives || wordShowNegatives || wordShowImpediments || wordShowObstacles || wordOldFindings.length > 0) {
                docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(3, formatting)} ${wordManualSection?.title || 'الملاحظات والنتائج العامة للجنة التفتيشية'}`));
                let noteIdx = 1;
                if (wordShowPositives) {
                    docChildren.push(new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel2ArabicLetter)(noteIdx++, formatting)} الإيجابيات ورصد كفاءة الأداء:`, bold: true, size: 24 })],
                        spacing: { before: 100, after: 60 },
                        indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
                        bidirectional: true,
                    }));
                    wordManualPositives.forEach((note, idx) => {
                        docChildren.push(new docx_1.Paragraph({
                            children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel3Ordinal)(idx + 1, formatting)} ${note}`, size: 24 })],
                            spacing: { after: 60 },
                            indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                            bidirectional: true,
                        }));
                    });
                }
                if (wordShowNegatives) {
                    docChildren.push(new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel2ArabicLetter)(noteIdx++, formatting)} السلبيات ونقاط الضعف المرصودة:`, bold: true, size: 24 })],
                        spacing: { before: 100, after: 60 },
                        indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
                        bidirectional: true,
                    }));
                    wordManualNegatives.forEach((note, idx) => {
                        docChildren.push(new docx_1.Paragraph({
                            children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel3Ordinal)(idx + 1, formatting)} ${note}`, size: 24 })],
                            spacing: { after: 60 },
                            indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                            bidirectional: true,
                        }));
                    });
                }
                if (wordShowImpediments || wordShowObstacles) {
                    docChildren.push(new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel2ArabicLetter)(noteIdx++, formatting)} المعوقات والمعاضل الميدانية:`, bold: true, size: 24 })],
                        spacing: { before: 100, after: 60 },
                        indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
                        bidirectional: true,
                    }));
                    if (wordShowObstacles) {
                        wordManualObstacles.forEach((note, idx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel3Ordinal)(idx + 1, formatting)} ${note} (عائق)`, size: 24 })],
                                spacing: { after: 60 },
                                indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                                bidirectional: true,
                            }));
                        });
                    }
                    if (wordShowImpediments) {
                        wordManualImpediments.forEach((note, idx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel3Ordinal)((wordShowObstacles ? wordManualObstacles.length : 0) + idx + 1, formatting)} ${note} (معضلة حرجة)`, size: 24 })],
                                spacing: { after: 60 },
                                indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                                bidirectional: true,
                            }));
                        });
                    }
                }
                if (wordOldFindings.length > 0) {
                    wordOldFindings.forEach((text, idx) => {
                        docChildren.push(new docx_1.Paragraph({
                            children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel3Ordinal)(idx + 1, formatting)} ${text}`, size: 24 })],
                            spacing: { after: 60 },
                            indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                            bidirectional: true,
                        }));
                    });
                }
            }
            if (payload.recommendations && payload.recommendations.length > 0) {
                docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(4, formatting)} التوصيات`));
                payload.recommendations.filter((r) => r.visible).forEach((recGroup, idx) => {
                    docChildren.push(new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel2ArabicLetter)(idx + 1, formatting)} ${recGroup.authority}`, bold: true, size: 24, font: 'Cairo' })],
                        spacing: { before: 150, after: 60 },
                        indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
                        bidirectional: true,
                    }));
                    if (recGroup.recs && recGroup.recs.length > 0) {
                        recGroup.recs.forEach((rec, recIdx) => {
                            docChildren.push(new docx_1.Paragraph({
                                children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel3Ordinal)(recIdx + 1, formatting).replace('.', ':')} ${rec.text}`, size: 24, font: 'Cairo' })],
                                spacing: { after: 60 },
                                indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                                bidirectional: true,
                            }));
                            if (rec.children && rec.children.length > 0) {
                                rec.children.forEach((child) => {
                                    docChildren.push(new docx_1.Paragraph({
                                        children: [new docx_1.TextRun({ text: `• ${child.text}`, size: 24, color: '4a5568', font: 'Cairo' })],
                                        spacing: { after: 60 },
                                        indent: { right: formatting.enableLevels.level4 ? formatting.indentations.level4 * 14.4 : 0 },
                                        bidirectional: true,
                                    }));
                                });
                            }
                        });
                    }
                    else {
                        docChildren.push(new docx_1.Paragraph({
                            children: [new docx_1.TextRun({ text: 'لا توجد توصيات مدخلة تحت هذه الجهة.', size: 22, color: '718096', font: 'Cairo' })],
                            spacing: { after: 60 },
                            indent: { right: formatting.enableLevels.level3 ? formatting.indentations.level3 * 14.4 : 0 },
                            bidirectional: true,
                        }));
                    }
                });
            }
            if (payload.appendices && payload.appendices.some((a) => a.visible)) {
                docChildren.push(new docx_1.Paragraph({ children: [new docx_1.PageBreak()] }));
                docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(5, formatting)} ملاحق التقرير التفتيشي`));
                payload.appendices.filter((a) => a.visible).forEach((app, idx) => {
                    docChildren.push(new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: `${(0, reportNumbering_1.getLevel2ArabicLetter)(idx + 1, formatting)} ملحق (${app.symbol})`, bold: true, size: 24, color: '0C2340' })],
                        spacing: { before: 150, after: 60 },
                        indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
                        bidirectional: true,
                    }), new docx_1.Paragraph({
                        children: [new docx_1.TextRun({ text: app.text, size: 22 })],
                        spacing: { after: 120 },
                        indent: { right: formatting.enableLevels.level2 ? formatting.indentations.level2 * 14.4 : 0 },
                        bidirectional: true,
                    }));
                });
            }
            if (payload.finalEvaluation?.statement) {
                docChildren.push(heading1Style(`${(0, reportNumbering_1.getLevel1Number)(10, formatting)} ${payload.finalEvaluation.statement}`));
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
                                children: [
                                    new docx_1.Paragraph({ text: '' })
                                ]
                            }),
                            new docx_1.TableCell({
                                width: { size: 4513, type: docx_1.WidthType.DXA },
                                children: [
                                    new docx_1.Paragraph({
                                        children: [new docx_1.TextRun({ text: payload.signatures?.ministerTitle || 'اصادق اصوليا', bold: true, size: 24, rightToLeft: true, font: 'Cairo' })],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    }),
                                    new docx_1.Paragraph({
                                        children: [new docx_1.TextRun({ text: payload.signatures?.ministerName || 'وزيـــــــر الداخلية', bold: true, size: 24, rightToLeft: true, font: 'Cairo' })],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                        spacing: { before: 100 },
                                    }),
                                    new docx_1.Paragraph({
                                        children: [new docx_1.TextRun({ text: payload.signatures?.ministerDate || '٢٠٢٦/  / ', size: 20, rightToLeft: true, font: 'Cairo' })],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                        spacing: { before: 50 },
                                    }),
                                ]
                            })
                        ]
                    })
                ]
            }), new docx_1.Paragraph({ children: [new docx_1.TextRun({ text: '' })], spacing: { before: 200 } }));
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
                                ...(payload.signatures?.leaderRank ? [
                                    new docx_1.Paragraph({
                                        children: [new docx_1.TextRun({ text: payload.signatures.leaderRank, bold: true, size: 22, rightToLeft: true, font: 'Cairo' })],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    })
                                ] : []),
                                new docx_1.Paragraph({
                                    children: [new docx_1.TextRun({ text: payload.signatures?.leaderName || '', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                    spacing: { before: payload.signatures?.leaderRank ? 200 : 0 },
                                }),
                                new docx_1.Paragraph({
                                    children: [new docx_1.TextRun({ text: payload.signatures?.leaderRole || 'رئيس اللجنة', bold: true, size: 24, rightToLeft: true, font: 'Cairo' })],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                    spacing: { before: 50 },
                                }),
                                new docx_1.Paragraph({
                                    children: [new docx_1.TextRun({ text: payload.signatures?.leaderDate || '', size: 20, rightToLeft: true, font: 'Cairo' })],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                }),
                            ],
                        }),
                        new docx_1.TableCell({
                            width: { size: 4513, type: docx_1.WidthType.DXA },
                            children: [
                                ...(payload.signatures?.deputyRank ? [
                                    new docx_1.Paragraph({
                                        children: [new docx_1.TextRun({ text: payload.signatures.deputyRank, bold: true, size: 22, rightToLeft: true, font: 'Cairo' })],
                                        alignment: docx_1.AlignmentType.CENTER,
                                        bidirectional: true,
                                    })
                                ] : []),
                                new docx_1.Paragraph({
                                    children: [new docx_1.TextRun({ text: payload.signatures?.deputyName || '', bold: true, size: 22, rightToLeft: true, font: 'Cairo' })],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                    spacing: { before: payload.signatures?.deputyRank ? 200 : 0 },
                                }),
                                new docx_1.Paragraph({
                                    children: [new docx_1.TextRun({ text: payload.signatures?.deputyRole || 'رئيس هيئة تفتيش قوى الامن الداخلي', bold: true, size: 24, rightToLeft: true, font: 'Cairo' })],
                                    alignment: docx_1.AlignmentType.CENTER,
                                    bidirectional: true,
                                    spacing: { before: 50 },
                                }),
                                new docx_1.Paragraph({
                                    children: [new docx_1.TextRun({ text: payload.signatures?.deputyDate || '', size: 20, rightToLeft: true, font: 'Cairo' })],
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
};
exports.ReportsService = ReportsService;
exports.ReportsService = ReportsService = ReportsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ReportsService);
//# sourceMappingURL=reports.service.js.map