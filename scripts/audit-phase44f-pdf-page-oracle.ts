/** Phase 44F: shadow-only PDF page-position text oracle research. */
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import puppeteer from 'puppeteer';
import { AppModule } from '../src/app.module';
import type { ReportFragmentV1 } from '../src/contracts/report-document-v1/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportDocumentV1Builder } from '../src/reports/report-document-v1-shadow/report-document-v1.builder';
import type { ShadowReportDocumentV1 } from '../src/reports/report-document-v1-shadow/report-document-v1.builder';
import { ReportsService } from '../src/reports/reports.service';
import {
  fragmentSignals,
  normalizeArabic,
  tableSignature,
  waitForStableLayout,
} from './audit-phase44c-semantic-identity';
import { extractPdfTextByPage, type ExtractedPdfPage } from './pdf-text-oracle/pdf-text-extractor';

const OUTPUT_DIR = join(process.cwd(), 'audit-output', 'phase44f');
const REAL_CAMPAIGNS = 3;
const RUNS_PER_CAMPAIGN = 3;
const MARGINS_MM = { top: 20, right: 10, bottom: 22, left: 10 } as const;

type OracleStrategy =
  | 'exact-page-text'
  | 'normalized-arabic-text'
  | 'ordered-occurrence'
  | 'table-row-signature'
  | 'multi-page-text-anchors'
  | 'kind-specific-anchor'
  | 'parent-page-anchor'
  | 'unassigned';

type OracleAssignment = {
  fragmentId: string;
  fragmentKind: string;
  textSignature: string;
  matchedPdfPages: number[];
  primaryPage: number | null;
  confidence: number;
  matchStrategy: OracleStrategy;
  ambiguityReason: string | null;
  splitAcrossPages: boolean;
  notes: string[];
};

type NormalizedPage = {
  pageNumber: number;
  strict: string;
  relaxed: string;
  rawText: string;
};

const round = (value: number, precision = 2): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const strictText = (value: unknown): string => normalizeArabic(value)
  .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
  .replace(/\s+/g, '');

const relaxedText = (value: unknown): string => strictText(value).replace(/ا/g, '');

const occurrences = (text: string, signature: string): number => {
  if (!signature) return 0;
  let count = 0;
  let offset = 0;
  while (offset <= text.length - signature.length) {
    const index = text.indexOf(signature, offset);
    if (index < 0) break;
    count += 1;
    offset = index + Math.max(signature.length, 1);
  }
  return count;
};

const normalizePages = (pages: readonly ExtractedPdfPage[]): NormalizedPage[] => pages.map((page) => ({
  pageNumber: page.pageNumber,
  strict: strictText(page.text),
  relaxed: relaxedText(page.text),
  rawText: page.text,
}));

const kindSpecificSignals = (fragment: ReportFragmentV1): string[] => {
  const content = fragment.content as Record<string, unknown>;
  if (fragment.kind === 'tableTitle' && content.tableId === 'summary') {
    return ['جدول المدراط والآمرين وشاغلي المناصب الأساسية', 'جدول المدراء والآمرين وشاغلي المناصب الأساسية'];
  }
  if (fragment.kind === 'tableHeader' && content.tableId === 'summary') {
    return ['المنصب الرتبة الاسم الكامل الرقم الإحصائي تاريخ إشغال المنصب'];
  }
  if (fragment.kind === 'officialNotesTitle') return ['الملاحظات'];
  if (fragment.kind === 'recommendationsTitle') return ['التوصيات'];
  if (fragment.kind === 'appendicesTitle') return ['ملاحق التقرير التفتيشي'];
  if (fragment.kind === 'signatures') return ['اصادق اصوليا وزير الداخلية', 'رئيس اللجنة'];
  return [];
};

const fragmentTextSignals = (fragment: ReportFragmentV1): string[] => {
  const values = [
    ...fragmentSignals(fragment),
    ...tableSignature(fragment),
    ...kindSpecificSignals(fragment),
  ];
  return [...new Set(values
    .map((value) => value.trim())
    .filter((value) => strictText(value).length >= 2))]
    .sort((left, right) => strictText(right).length - strictText(left).length);
};

const anchorPage = (pages: readonly NormalizedPage[], signals: readonly string[], preferLast = false): number | null => {
  const matches = pages.filter((page) => signals.some((signal) => page.strict.includes(strictText(signal))));
  if (matches.length === 0) return null;
  return preferLast ? matches[matches.length - 1].pageNumber : matches[0].pageNumber;
};

const pageRegion = (
  fragment: ReportFragmentV1,
  pageCount: number,
  anchors: { notes: number | null; recommendations: number | null; appendices: number | null; signatures: number | null },
): { start: number; end: number } => {
  if (fragment.kind === 'officialNotesTitle' || fragment.kind === 'noteCategoryTitle' || fragment.kind === 'noteItem') {
    return { start: anchors.notes ?? 1, end: (anchors.recommendations ?? pageCount + 1) - 1 };
  }
  if (fragment.kind === 'recommendationsTitle' || fragment.kind === 'recommendationGroupTitle' || fragment.kind === 'recommendationItem') {
    return { start: anchors.recommendations ?? 1, end: (anchors.appendices ?? anchors.signatures ?? pageCount + 1) - 1 };
  }
  if (fragment.kind === 'appendicesTitle' || fragment.kind === 'appendixTitle' || fragment.kind === 'appendixParagraph') {
    return { start: anchors.appendices ?? 1, end: (anchors.signatures ?? pageCount + 1) - 1 };
  }
  if (fragment.kind === 'signatures') return { start: anchors.signatures ?? 1, end: pageCount };
  if (fragment.kind === 'finalEvaluation') {
    return { start: anchors.recommendations ?? 1, end: (anchors.appendices ?? anchors.signatures ?? pageCount + 1) - 1 };
  }
  return { start: 1, end: (anchors.notes ?? pageCount + 1) - 1 };
};

const pagesContaining = (
  pages: readonly NormalizedPage[],
  signature: string,
  region: { start: number; end: number },
  relaxed: boolean,
): Array<{ page: number; count: number }> => {
  const normalized = relaxed ? relaxedText(signature) : strictText(signature);
  return pages.flatMap((page) => {
    if (page.pageNumber < region.start || page.pageNumber > region.end) return [];
    const count = occurrences(relaxed ? page.relaxed : page.strict, normalized);
    return count > 0 ? [{ page: page.pageNumber, count }] : [];
  });
};

const emptyAssignment = (fragment: ReportFragmentV1, signature = ''): OracleAssignment => ({
  fragmentId: fragment.id,
  fragmentKind: fragment.kind,
  textSignature: signature.slice(0, 240),
  matchedPdfPages: [],
  primaryPage: null,
  confidence: 0,
  matchStrategy: 'unassigned',
  ambiguityReason: 'No deterministic text or semantic page anchor was found.',
  splitAcrossPages: false,
  notes: [],
});

const mapPdfPages = (
  document: ShadowReportDocumentV1,
  extractedPages: readonly ExtractedPdfPage[],
): OracleAssignment[] => {
  const pages = normalizePages(extractedPages);
  const pageCount = pages.length;
  const anchors = {
    notes: anchorPage(pages, ['الملاحظات']),
    recommendations: anchorPage(pages, ['التوصيات']),
    appendices: anchorPage(pages, ['ملاحق التقرير التفتيشي']),
    signatures: anchorPage(pages, ['اصادق اصوليا وزير الداخلية', 'رئيس اللجنة'], true),
  };
  const usage = new Map<string, number>();
  const assignments: OracleAssignment[] = [];
  const byFragmentId = new Map<string, OracleAssignment>();
  let orderedPageCursor = 1;

  document.fragmentOrder.forEach((fragmentId) => {
    const fragment = document.fragments[fragmentId];
    const signals = fragmentTextSignals(fragment);
    const region = pageRegion(fragment, pageCount, anchors);
    const cursor = fragment.kind === 'finalEvaluation' ? region.start : Math.max(region.start, orderedPageCursor);
    let assignment = emptyAssignment(fragment, signals[0] ?? '');

    for (const signal of signals) {
      const candidates = pagesContaining(pages, signal, region, false);
      const available = candidates.find((candidate) => {
        if (candidate.page < cursor) return false;
        const key = `${strictText(signal)}|${candidate.page}`;
        return (usage.get(key) ?? 0) < candidate.count;
      });
      if (!available) continue;
      const key = `${strictText(signal)}|${available.page}`;
      usage.set(key, (usage.get(key) ?? 0) + 1);
      const repeated = candidates.reduce((sum, candidate) => sum + candidate.count, 0) > 1;
      assignment = {
        fragmentId,
        fragmentKind: fragment.kind,
        textSignature: signal.slice(0, 240),
        matchedPdfPages: candidates.map((candidate) => candidate.page),
        primaryPage: available.page,
        confidence: repeated ? 0.9 : 0.98,
        matchStrategy: repeated ? 'ordered-occurrence' : 'exact-page-text',
        ambiguityReason: repeated ? 'The same normalized signature occurs more than once; ordered occurrence selected the primary page.' : null,
        splitAcrossPages: false,
        notes: [],
      };
      break;
    }

    if (assignment.primaryPage === null) {
      for (const signal of signals) {
        const candidates = pagesContaining(pages, signal, region, true);
        const available = candidates.find((candidate) => candidate.page >= cursor);
        if (!available) continue;
        assignment = {
          fragmentId,
          fragmentKind: fragment.kind,
          textSignature: signal.slice(0, 240),
          matchedPdfPages: candidates.map((candidate) => candidate.page),
          primaryPage: available.page,
          confidence: 0.86,
          matchStrategy: 'normalized-arabic-text',
          ambiguityReason: candidates.length > 1 ? 'Relaxed Arabic normalization matched multiple pages; order selected the primary page.' : null,
          splitAcrossPages: false,
          notes: ['Relaxed matching removes Alef variants to tolerate Chromium glyph extraction differences.'],
        };
        break;
      }
    }

    if (assignment.primaryPage === null && signals.length > 0) {
      const compact = strictText(signals[0]);
      if (compact.length >= 120) {
        const anchorsText = [compact.slice(0, 70), compact.slice(Math.floor(compact.length / 2) - 35, Math.floor(compact.length / 2) + 35), compact.slice(-70)];
        const matchedPages = [...new Set(anchorsText.flatMap((anchor) => pages
          .filter((page) => page.pageNumber >= region.start && page.pageNumber <= region.end && page.strict.includes(anchor))
          .map((page) => page.pageNumber)))].sort((left, right) => left - right);
        if (matchedPages.length > 0) {
          assignment = {
            fragmentId,
            fragmentKind: fragment.kind,
            textSignature: signals[0].slice(0, 240),
            matchedPdfPages: matchedPages,
            primaryPage: matchedPages.find((page) => page >= cursor) ?? matchedPages[0],
            confidence: matchedPages.length > 1 ? 0.88 : 0.82,
            matchStrategy: 'multi-page-text-anchors',
            ambiguityReason: matchedPages.length > 1 ? 'Long text anchors occur on multiple consecutive PDF pages.' : null,
            splitAcrossPages: matchedPages.length > 1,
            notes: ['Full long-text signature was not contained by one page; first, middle, and final anchors were used.'],
          };
        }
      }
    }

    if (assignment.primaryPage === null && fragment.parentId) {
      const parent = byFragmentId.get(fragment.parentId);
      if (parent?.primaryPage) {
        assignment = {
          fragmentId,
          fragmentKind: fragment.kind,
          textSignature: signals[0]?.slice(0, 240) ?? '',
          matchedPdfPages: [parent.primaryPage],
          primaryPage: parent.primaryPage,
          confidence: 0.78,
          matchStrategy: 'parent-page-anchor',
          ambiguityReason: 'The fragment has no independent extractable text; its stable parent page was used.',
          splitAcrossPages: false,
          notes: ['Structural assignment; no independent PDF text signature.'],
        };
      }
    }

    if (assignment.primaryPage === null) {
      const specificPage = fragment.kind === 'reportHeader' || fragment.kind === 'reportTitle'
        ? 1
        : fragment.kind === 'signatures' ? anchors.signatures : null;
      if (specificPage) {
        assignment = {
          fragmentId,
          fragmentKind: fragment.kind,
          textSignature: signals[0]?.slice(0, 240) ?? '',
          matchedPdfPages: [specificPage],
          primaryPage: specificPage,
          confidence: 0.82,
          matchStrategy: 'kind-specific-anchor',
          ambiguityReason: 'Assigned from a deterministic document-level semantic anchor.',
          splitAcrossPages: false,
          notes: [],
        };
      }
    }

    if (assignment.primaryPage !== null && fragment.kind !== 'finalEvaluation') {
      orderedPageCursor = Math.max(orderedPageCursor, assignment.primaryPage);
    }
    assignments.push(assignment);
    byFragmentId.set(fragmentId, assignment);
  });
  return assignments;
};

const assignmentIdentity = (assignment: OracleAssignment): string => [
  assignment.primaryPage ?? 'none',
  assignment.matchedPdfPages.join(','),
  assignment.matchStrategy,
  assignment.splitAcrossPages,
  assignment.confidence,
].join('|');

const summarizeByKind = (assignments: readonly OracleAssignment[]): Record<string, {
  total: number;
  assigned: number;
  unassigned: number;
  ambiguous: number;
  multiPage: number;
  averageConfidence: number;
  coveragePercentage: number;
}> => {
  const result: Record<string, { total: number; assigned: number; unassigned: number; ambiguous: number; multiPage: number; averageConfidence: number; coveragePercentage: number; confidenceTotal: number }> = {};
  assignments.forEach((assignment) => {
    const entry = result[assignment.fragmentKind] ??= { total: 0, assigned: 0, unassigned: 0, ambiguous: 0, multiPage: 0, averageConfidence: 0, coveragePercentage: 0, confidenceTotal: 0 };
    entry.total += 1;
    if (assignment.primaryPage === null) entry.unassigned += 1;
    else entry.assigned += 1;
    if (assignment.ambiguityReason) entry.ambiguous += 1;
    if (assignment.splitAcrossPages) entry.multiPage += 1;
    entry.confidenceTotal += assignment.confidence;
  });
  Object.values(result).forEach((entry) => {
    entry.coveragePercentage = round((entry.assigned / Math.max(entry.total, 1)) * 100);
    entry.averageConfidence = round(entry.confidenceTotal / Math.max(entry.total, 1), 3);
    delete (entry as Partial<typeof entry>).confidenceTotal;
  });
  return result;
};

const execute = async (): Promise<void> => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const reportsService = app.get(ReportsService);
  const builder = new ReportDocumentV1Builder();
  const campaigns = await prisma.campaign.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' },
    take: REAL_CAMPAIGNS,
  });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const campaignResults: Array<{
    campaignId: string;
    campaignName: string;
    pdfPages: number;
    totalFragments: number;
    assignedFragments: number;
    unassignedFragments: number;
    multiPageFragments: number;
    ambiguousFragments: number;
    assignmentCoveragePercentage: number;
    repeatedRunsDeterministic: boolean;
    unstableAssignments: number;
    coverageByKind: ReturnType<typeof summarizeByKind>;
    successfulExamples: OracleAssignment[];
    ambiguousOrFailingExamples: OracleAssignment[];
    runs: Array<{
      run: number;
      layoutStable: boolean;
      extractionWarnings: string[];
      pdfPages: number;
      extractedCharacters: number;
      fontsWithToUnicode: number;
      totalFragments: number;
      assignedFragments: number;
      unassignedFragments: number;
      multiPageFragments: number;
      ambiguousFragments: number;
      assignmentCoveragePercentage: number;
      assignments: OracleAssignment[];
    }>;
  }> = [];

  try {
    for (const campaign of campaigns) {
      const payload = await reportsService.getCampaignReportPayload(campaign.id);
      const document = builder.build(payload, { campaignId: campaign.id });
      const officialHtml = reportsService.generateHtmlFromPayload(payload);
      const runs: Array<{
        run: number;
        layoutStable: boolean;
        extractionWarnings: string[];
        pdfPages: number;
        extractedCharacters: number;
        fontsWithToUnicode: number;
        totalFragments: number;
        assignedFragments: number;
        unassignedFragments: number;
        multiPageFragments: number;
        ambiguousFragments: number;
        assignmentCoveragePercentage: number;
        assignments: OracleAssignment[];
      }> = [];

      for (let run = 1; run <= RUNS_PER_CAMPAIGN; run += 1) {
        const page = await browser.newPage();
        await page.setContent(officialHtml, { waitUntil: 'load' });
        const layoutStable = await waitForStableLayout(page);
        const pdfBytes = await page.pdf({
          format: 'A4',
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: '<div style="width:100%;text-align:center;font-family:Cairo,Arial,sans-serif;font-size:10px;font-weight:700;direction:rtl;">سري</div>',
          footerTemplate: '<div style="width:100%;text-align:center;font-family:Cairo,Arial,sans-serif;font-size:9px;font-weight:700;direction:rtl;line-height:1.3;"><div style="text-decoration:underline;text-underline-offset:2px;">سري</div><div>(<span class="pageNumber"></span> - <span class="totalPages"></span>)</div></div>',
          margin: {
            top: `${MARGINS_MM.top}mm`,
            bottom: `${MARGINS_MM.bottom}mm`,
            left: `${MARGINS_MM.left}mm`,
            right: `${MARGINS_MM.right}mm`,
          },
        });
        const extracted = extractPdfTextByPage(Buffer.from(pdfBytes));
        const assignments = mapPdfPages(document, extracted.pages);
        const assignedFragments = assignments.filter((assignment) => assignment.primaryPage !== null).length;
        const extractionWarnings = [
          ...extracted.warnings,
          ...extracted.pages.flatMap((extractedPage) => extractedPage.extractionWarnings.map((warning) => `page ${extractedPage.pageNumber}: ${warning}`)),
        ];
        runs.push({
          run,
          layoutStable,
          extractionWarnings,
          pdfPages: extracted.pages.length,
          extractedCharacters: extracted.pages.reduce((sum, extractedPage) => sum + extractedPage.text.length, 0),
          fontsWithToUnicode: extracted.fontsWithToUnicode,
          totalFragments: assignments.length,
          assignedFragments,
          unassignedFragments: assignments.length - assignedFragments,
          multiPageFragments: assignments.filter((assignment) => assignment.splitAcrossPages).length,
          ambiguousFragments: assignments.filter((assignment) => assignment.ambiguityReason !== null).length,
          assignmentCoveragePercentage: round((assignedFragments / Math.max(assignments.length, 1)) * 100),
          assignments,
        });
        await page.close();
      }

      const baseline = runs[0];
      let unstableAssignments = 0;
      baseline.assignments.forEach((assignment) => {
        const identities = runs.map((run) => {
          const match = run.assignments.find((candidate) => candidate.fragmentId === assignment.fragmentId);
          return match ? assignmentIdentity(match) : 'missing';
        });
        if (new Set(identities).size > 1) unstableAssignments += 1;
      });
      const repeatedRunsDeterministic = unstableAssignments === 0
        && runs.every((run) => run.layoutStable && run.extractionWarnings.length === 0)
        && new Set(runs.map((run) => `${run.pdfPages}|${run.extractedCharacters}`)).size === 1;
      campaignResults.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        pdfPages: baseline.pdfPages,
        totalFragments: baseline.totalFragments,
        assignedFragments: baseline.assignedFragments,
        unassignedFragments: baseline.unassignedFragments,
        multiPageFragments: baseline.multiPageFragments,
        ambiguousFragments: baseline.ambiguousFragments,
        assignmentCoveragePercentage: baseline.assignmentCoveragePercentage,
        repeatedRunsDeterministic,
        unstableAssignments,
        coverageByKind: summarizeByKind(baseline.assignments),
        successfulExamples: baseline.assignments.filter((assignment) => assignment.confidence >= 0.9).slice(0, 12),
        ambiguousOrFailingExamples: baseline.assignments.filter((assignment) => assignment.primaryPage === null || assignment.ambiguityReason).slice(0, 20),
        runs,
      });
    }
  } finally {
    await browser.close();
    await app.close();
  }

  const baselineAssignments = campaignResults.flatMap((campaign) => campaign.runs[0].assignments);
  const totalFragments = baselineAssignments.length;
  const assignedFragments = baselineAssignments.filter((assignment) => assignment.primaryPage !== null).length;
  const assignmentCoveragePercentage = round((assignedFragments / Math.max(totalFragments, 1)) * 100);
  const coverageByKind = summarizeByKind(baselineAssignments);
  const tableRowsReliable = (coverageByKind.tableRow?.coveragePercentage ?? 0) >= 95
    && (coverageByKind.tableRow?.averageConfidence ?? 0) >= 0.8;
  const findingItemsReliable = (coverageByKind.findingItem?.coveragePercentage ?? 0) >= 95
    && (coverageByKind.findingItem?.averageConfidence ?? 0) >= 0.8;
  const repeatedRunsDeterministic = campaignResults.every((campaign) => campaign.repeatedRunsDeterministic);
  const decision = assignmentCoveragePercentage >= 95
    && repeatedRunsDeterministic
    && tableRowsReliable
    && findingItemsReliable
    ? 'GO'
    : 'NO-GO';
  const output = {
    phase: '44F',
    mode: 'shadow-only',
    generatedAt: new Date().toISOString(),
    runsPerCampaign: RUNS_PER_CAMPAIGN,
    extractionMethod: 'Direct PDF text-layer extraction using page content streams and embedded ToUnicode CMaps; no OCR.',
    productionChanges: 0,
    rendererModified: false,
    rendererMarkersAdded: false,
    pagePlanV1Modified: false,
    summary: {
      campaignsTested: campaignResults.length,
      totalRuns: campaignResults.length * RUNS_PER_CAMPAIGN,
      totalFragments,
      assignedFragments,
      unassignedFragments: totalFragments - assignedFragments,
      multiPageFragments: baselineAssignments.filter((assignment) => assignment.splitAcrossPages).length,
      ambiguousFragments: baselineAssignments.filter((assignment) => assignment.ambiguityReason !== null).length,
      assignmentCoveragePercentage,
      repeatedRunsDeterministic,
      tableRowsReliable,
      findingItemsReliable,
      decision,
    },
    coverageByKind,
    campaigns: campaignResults,
  };
  writeFileSync(join(OUTPUT_DIR, 'pdf-page-oracle.json'), JSON.stringify(output, null, 2));

  const successfulExamples = campaignResults.flatMap((campaign) => campaign.successfulExamples.map((assignment) => ({ campaign: campaign.campaignName, ...assignment }))).slice(0, 15);
  const failingExamples = campaignResults.flatMap((campaign) => campaign.ambiguousOrFailingExamples.map((assignment) => ({ campaign: campaign.campaignName, ...assignment }))).slice(0, 20);
  const report = [
    '# Phase 44F Shadow PDF Page-Position Oracle Research',
    '',
    `Decision: **${decision}**`,
    '',
    `Campaigns tested: ${campaignResults.length}`,
    `Total PDF renders: ${campaignResults.length * RUNS_PER_CAMPAIGN}`,
    `Total fragments: ${totalFragments}`,
    `Assigned fragments: ${assignedFragments}`,
    `Unassigned fragments: ${totalFragments - assignedFragments}`,
    `Multi-page fragments: ${output.summary.multiPageFragments}`,
    `Ambiguous fragments: ${output.summary.ambiguousFragments}`,
    `Assignment coverage: ${assignmentCoveragePercentage}%`,
    `Repeated runs deterministic: ${repeatedRunsDeterministic ? 'PASS' : 'FAIL'}`,
    `Table rows reliable: ${tableRowsReliable ? 'PASS' : 'FAIL'}`,
    `Finding items reliable: ${findingItemsReliable ? 'PASS' : 'FAIL'}`,
    '',
    '## Campaign Results',
    '',
    '| Campaign | PDF pages | Fragments | Assigned | Unassigned | Multi-page | Ambiguous | Coverage | Deterministic |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---|',
    ...campaignResults.map((campaign) => `| ${campaign.campaignName.replace(/\|/g, '\\|')} | ${campaign.pdfPages} | ${campaign.totalFragments} | ${campaign.assignedFragments} | ${campaign.unassignedFragments} | ${campaign.multiPageFragments} | ${campaign.ambiguousFragments} | ${campaign.assignmentCoveragePercentage}% | ${campaign.repeatedRunsDeterministic ? 'PASS' : 'FAIL'} |`),
    '',
    '## Coverage by Kind',
    '',
    '| Kind | Total | Assigned | Unassigned | Multi-page | Ambiguous | Coverage | Avg confidence |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...Object.entries(coverageByKind).sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, value]) => `| ${kind} | ${value.total} | ${value.assigned} | ${value.unassigned} | ${value.multiPage} | ${value.ambiguous} | ${value.coveragePercentage}% | ${value.averageConfidence} |`),
    '',
    '## Successful Examples',
    '',
    ...successfulExamples.map((example) => `- ${example.campaign}: ${example.fragmentKind} \`${example.fragmentId}\` -> page ${example.primaryPage} via ${example.matchStrategy} (${example.confidence})`),
    '',
    '## Ambiguous or Failing Examples',
    '',
    ...(failingExamples.length > 0
      ? failingExamples.map((example) => `- ${example.campaign}: ${example.fragmentKind} \`${example.fragmentId}\` -> ${example.primaryPage ?? 'unassigned'}; ${example.ambiguityReason ?? 'no page match'}`)
      : ['- None.']),
    '',
    '## Reliability Findings',
    '',
    '- Text was extracted directly from each generated PDF page through content streams and embedded ToUnicode maps.',
    '- No OCR, renderer markers, or production modifications were used.',
    '- Repeated signatures are resolved with ordered occurrence counters and semantic page regions.',
    '- Long fragments use first, middle, and final text anchors and may report multiple pages.',
    '- Structural fragments without independent text may inherit a stable parent page at reduced confidence.',
    '',
    '## Recommendation for Phase 44G',
    '',
    decision === 'GO'
      ? 'GO for a shadow-only cross-validation phase comparing PDF-oracle pages with independent semantic anchors and difficult repeated-text fixtures. Do not integrate the oracle into Designer or PagePlanV1.'
      : 'NO-GO for downstream page planning. Improve PDF text disambiguation for the failing fragment kinds without adding renderer markers or production dependencies.',
    '',
  ].join('\n');
  writeFileSync(join(OUTPUT_DIR, 'pdf-page-oracle-report.md'), report);
  console.log(report);
};

execute().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
