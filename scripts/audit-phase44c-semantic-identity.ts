/**
 * Phase 44C: semantic identity mapping against the unchanged official DOM.
 * Shadow-only, read-only experiment. No pagination is reconstructed.
 */
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import puppeteer, { type Page } from 'puppeteer';
import { AppModule } from '../src/app.module';
import type { ReportFragmentV1 } from '../src/contracts/report-document-v1/types';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportDocumentV1Builder } from '../src/reports/report-document-v1-shadow/report-document-v1.builder';
import type { ShadowReportDocumentV1 } from '../src/reports/report-document-v1-shadow/report-document-v1.builder';
import { ReportsService } from '../src/reports/reports.service';

const PX_PER_MM = 96 / 25.4;
const MAX_CAMPAIGNS = 3;
const OUTPUT_DIR = join(process.cwd(), 'audit-output', 'phase44c');

type JsonRecord = Record<string, unknown>;

export type DomBlock = {
  index: number;
  tagName: string;
  className: string;
  text: string;
  normalizedText: string;
  topPx: number;
  heightPx: number;
  bottomPx: number;
  tableIndex: number | null;
  rowIndex: number | null;
  isTable: boolean;
  isTableHeader: boolean;
  isTableRow: boolean;
};

type MatchStrategy =
  | 'exact-text'
  | 'normalized-arabic-text'
  | 'ordered-nearest'
  | 'kind-specific'
  | 'table-row-signature'
  | 'table-header-signature'
  | 'kind-specific-parent-anchor'
  | 'unmatched';

export type SemanticMatch = {
  fragmentId: string;
  fragmentKind: string;
  matchedDomIndex: number | null;
  matchedDomSelector: string | null;
  matchStrategy: MatchStrategy;
  confidence: number;
  ambiguous: boolean;
  candidateCount: number;
  sharedDomMatch: boolean;
  matchedTextPreview: string;
  domTopMm: number | null;
  domHeightMm: number | null;
  domBottomMm: number | null;
  signalPreview: string;
  reason: string;
};

type MatchCandidate = {
  block: DomBlock;
  strategy: Exclude<MatchStrategy, 'kind-specific-parent-anchor' | 'unmatched'>;
  confidence: number;
  reason: string;
};

const asRecord = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const scalarText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
};

export const normalizeArabic = (value: unknown): string => scalarText(value)
  .normalize('NFKC')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
  .replace(/ـ/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[.,،؛;:()[\]{}\/\\|!?؟'"`~_\-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const round = (value: number, precision = 2): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const uniqueSignals = (values: unknown[]): string[] => [...new Set(values
  .map((value) => scalarText(value).trim())
  .filter((value) => normalizeArabic(value).length >= 2))];

const listLabel = (value: unknown): string => ({
  positives: 'الإيجابيات',
  negatives: 'السلبيات',
  impediments: 'المعوقات',
  obstacles: 'المعاضل',
}[scalarText(value)] ?? '');

export const fragmentSignals = (fragment: ReportFragmentV1): string[] => {
  const content = asRecord(fragment.content);
  switch (fragment.kind) {
    case 'reportHeader':
      return ['جمهورية العراق وزارة الداخلية هيئة تفتيش قوى الامن الداخلي'];
    case 'reportTitle':
    case 'sectionTitle':
    case 'subsectionTitle':
      return uniqueSignals([content.title]);
    case 'assignment':
    case 'purpose':
    case 'visitDate':
    case 'sectionNarrative':
    case 'subsectionNarrative':
      return uniqueSignals([content.text]);
    case 'committee':
      return uniqueSignals(asArray(content.members).slice(0, 3));
    case 'findingItem':
    case 'noteItem':
      return uniqueSignals([content.text]);
    case 'findingGroupTitle':
    case 'noteCategoryTitle':
      return uniqueSignals([listLabel(content.findingType ?? content.noteType)]);
    case 'recommendationsTitle':
      return ['التوصيات'];
    case 'recommendationGroupTitle':
      return uniqueSignals([content.authority]);
    case 'recommendationItem': {
      const item = asRecord(fragment.content);
      return uniqueSignals([item.text, item.recommendation, fragment.content]);
    }
    case 'officialNotesTitle':
      return ['الملاحظات'];
    case 'appendicesTitle':
      return ['ملاحق التقرير التفتيشي', 'الملاحق'];
    case 'appendixTitle':
      return uniqueSignals([content.symbol ? `ملحق ${scalarText(content.symbol)}` : '']);
    case 'appendixParagraph':
      return uniqueSignals([content.text]);
    case 'finalEvaluation': {
      const evaluation = asRecord(fragment.content);
      return uniqueSignals([evaluation.statement, evaluation.text, fragment.content]);
    }
    case 'signatures': {
      const signatures = asRecord(fragment.content);
      return uniqueSignals([
        signatures.ministerTitle,
        signatures.ministerName,
        signatures.leaderName,
        signatures.leaderRole,
        signatures.memberName,
        signatures.memberRole,
        'رئيس اللجنة',
      ]);
    }
    case 'tableTitle':
      return uniqueSignals([content.title, content.entityName]);
    default:
      return [];
  }
};

export const tableSignature = (fragment: ReportFragmentV1): string[] => {
  const content = asRecord(fragment.content);
  if (fragment.kind === 'tableHeader') {
    return uniqueSignals(asArray(content.columns).flatMap((column) => {
      const record = asRecord(column);
      return [record.label, typeof column === 'string' ? column : ''];
    }));
  }
  if (fragment.kind !== 'tableRow') return [];
  const row = asRecord(content.row);
  const position = asRecord(content.position);
  if (Object.keys(row).length > 0) return uniqueSignals(Object.values(row));
  if (Object.keys(position).length > 0) return uniqueSignals([
    position.positionName,
    position.rank,
    position.positionHolder,
    position.statisticalNumber,
    position.joinedDate,
    position.positionStatus,
    position.education,
  ]);
  if (content.field) return uniqueSignals([content.value]);
  return [];
};

export const waitForStableLayout = async (page: Page): Promise<boolean> => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(async (image) => {
      if (image.complete) return;
      try {
        await image.decode();
      } catch {
        // Resource failure is reflected by layout stability and audit output.
      }
    }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const samples: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    samples.push(await page.evaluate(() => document.documentElement.scrollHeight));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return new Set(samples).size === 1;
};

export const collectDomBlocks = async (page: Page): Promise<DomBlock[]> => page.evaluate(() => {
  const normalize = (value: string): string => value
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/ـ/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[.,،؛;:()[\]{}\/\\|!?؟'"`~_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const root = document.querySelector<HTMLElement>('.pdf-page') || document.body;
  const elements = Array.from(root.querySelectorAll<HTMLElement>(
    'div, p, span, table, thead, tbody > tr, td, th, li',
  ));
  const tables = Array.from(root.querySelectorAll('table'));
  const blocks: DomBlock[] = [];

  elements.forEach((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const text = element.innerText?.replace(/\s+/g, ' ').trim() || '';
    if (!text || style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return;
    const table = element.closest('table');
    const row = element.matches('tr') ? element : element.closest('tr');
    const tableIndex = table ? tables.indexOf(table) : null;
    const tableRows = table ? Array.from(table.querySelectorAll('tbody > tr')) : [];
    const rowIndex = row && table ? tableRows.indexOf(row) : null;
    const index = blocks.length;
    element.dataset.shadowSemanticIndex = String(index);
    blocks.push({
      index,
      tagName: element.tagName.toLowerCase(),
      className: element.className || '',
      text,
      normalizedText: normalize(text),
      topPx: Math.round(rect.top * 100) / 100,
      heightPx: Math.round(rect.height * 100) / 100,
      bottomPx: Math.round(rect.bottom * 100) / 100,
      tableIndex,
      rowIndex: rowIndex !== null && rowIndex >= 0 ? rowIndex : null,
      isTable: element.matches('table'),
      isTableHeader: element.matches('thead'),
      isTableRow: element.matches('tbody > tr'),
    });
  });
  return blocks;
});

const kindCompatible = (fragment: ReportFragmentV1, block: DomBlock): boolean => {
  switch (fragment.kind) {
    case 'reportTitle': return block.className.includes('report-title');
    case 'tableHeader': return block.isTableHeader;
    case 'tableRow': return block.isTableRow || block.tagName === 'div';
    case 'signatures': return block.className.includes('signatures');
    case 'sectionTitle': return block.className.includes('section-num') || block.className.includes('section-title') || block.tagName === 'div';
    case 'officialNotesTitle':
    case 'recommendationsTitle':
    case 'appendicesTitle': return block.className.includes('section-num') || block.tagName === 'div';
    default: return true;
  }
};

const textCandidates = (
  fragment: ReportFragmentV1,
  blocks: readonly DomBlock[],
  signals: readonly string[],
  cursor: number,
): MatchCandidate[] => {
  const candidates: MatchCandidate[] = [];
  signals.forEach((signal) => {
    const normalizedSignal = normalizeArabic(signal);
    if (!normalizedSignal) return;
    blocks.forEach((block) => {
      if (!kindCompatible(fragment, block)) return;
      if (block.normalizedText === normalizedSignal) {
        candidates.push({
          block,
          strategy: block.text.trim() === signal.trim() ? 'exact-text' : 'normalized-arabic-text',
          confidence: block.text.trim() === signal.trim() ? 1 : 0.98,
          reason: 'The complete DOM block text equals the fragment signal.',
        });
      } else if (block.normalizedText.includes(normalizedSignal)) {
        const ordered = block.index >= cursor;
        candidates.push({
          block,
          strategy: ordered ? 'ordered-nearest' : 'normalized-arabic-text',
          confidence: ordered ? 0.94 : 0.9,
          reason: 'The normalized fragment signal is contained in a compatible DOM block.',
        });
      }
    });
  });
  return candidates;
};

const tableCandidates = (
  fragment: ReportFragmentV1,
  blocks: readonly DomBlock[],
  signature: readonly string[],
): MatchCandidate[] => {
  if (signature.length === 0) return [];
  const required = signature
    .map(normalizeArabic)
    .filter((value) => value.length > 0)
    .slice(0, 8);
  if (required.length === 0) return [];
  const targetBlocks = fragment.kind === 'tableHeader'
    ? blocks.filter((block) => block.isTableHeader)
    : blocks.filter((block) => block.isTableRow || (asRecord(fragment.content).field && block.tagName === 'div'));
  return targetBlocks.flatMap((block) => {
    const matched = required.filter((value) => block.normalizedText.includes(value)).length;
    const minimum = fragment.kind === 'tableHeader'
      ? Math.min(required.length, 2)
      : Math.min(required.length, required.length === 1 ? 1 : 2);
    if (matched < minimum) return [];
    return [{
      block,
      strategy: fragment.kind === 'tableHeader' ? 'table-header-signature' as const : 'table-row-signature' as const,
      confidence: round(Math.min(0.99, 0.9 + (matched / required.length) * 0.09), 2),
      reason: `${matched}/${required.length} deterministic table signature values matched.`,
    }];
  });
};

const kindSpecificCandidates = (
  fragment: ReportFragmentV1,
  blocks: readonly DomBlock[],
): MatchCandidate[] => {
  if (fragment.kind === 'reportHeader') {
    return blocks.filter((block) => block.normalizedText.includes(normalizeArabic('جمهورية العراق وزارة الداخلية')))
      .map((block) => ({ block, strategy: 'kind-specific', confidence: 0.97, reason: 'Official report header label matched.' }));
  }
  if (fragment.kind === 'tableTitle' && asRecord(fragment.content).tableId === 'summary') {
    const firstTable = blocks.find((block) => block.isTable && block.className.includes('military-table'));
    return firstTable ? [{ block: firstTable, strategy: 'kind-specific', confidence: 0.92, reason: 'The first official military table is the summary table.' }] : [];
  }
  if (fragment.kind === 'tableHeader' && asRecord(fragment.content).tableId === 'summary') {
    const firstHeader = blocks.find((block) => block.isTableHeader);
    return firstHeader ? [{ block: firstHeader, strategy: 'kind-specific', confidence: 0.96, reason: 'The first official table header belongs to the summary table.' }] : [];
  }
  if (fragment.kind === 'committee') {
    return blocks
      .filter((block) => block.isTable && (
        block.normalizedText.includes(normalizeArabic('رئيس اللجنة'))
        || block.normalizedText.includes(normalizeArabic('عضو'))
      ))
      .map((block) => ({ block, strategy: 'kind-specific', confidence: 0.95, reason: 'A non-military official table contains committee role labels.' }));
  }
  if (fragment.kind === 'signatures') {
    return blocks.filter((block) => block.className.includes('signatures'))
      .map((block) => ({ block, strategy: 'kind-specific', confidence: 0.97, reason: 'Official signatures container class matched.' }));
  }
  const sectionLabel = fragment.kind === 'officialNotesTitle'
    ? 'الملاحظات'
    : fragment.kind === 'recommendationsTitle'
      ? 'التوصيات'
      : fragment.kind === 'appendicesTitle' ? 'ملاحق التقرير التفتيشي' : '';
  if (sectionLabel) {
    const normalizedLabel = normalizeArabic(sectionLabel);
    return blocks
      .filter((block) => block.className.includes('section-num') && block.normalizedText.includes(normalizedLabel))
      .map((block) => ({ block, strategy: 'kind-specific', confidence: 0.98, reason: `Official section heading '${sectionLabel}' matched.` }));
  }
  return [];
};

const selectCandidate = (candidates: readonly MatchCandidate[], cursor: number): {
  selected: MatchCandidate | null;
  ambiguous: boolean;
} => {
  if (candidates.length === 0) return { selected: null, ambiguous: false };
  const unique = [...new Map(candidates.map((candidate) => [
    `${candidate.block.index}:${candidate.strategy}`,
    candidate,
  ])).values()];
  const ordered = unique.filter((candidate) => candidate.block.index >= cursor);
  if (ordered.length === 0) return { selected: null, ambiguous: false };
  const sorted = ordered.sort((left, right) =>
    right.confidence - left.confidence
    || Number(right.block.index >= cursor) - Number(left.block.index >= cursor)
    || Math.abs(left.block.index - cursor) - Math.abs(right.block.index - cursor)
    || left.block.normalizedText.length - right.block.normalizedText.length
    || left.block.index - right.block.index);
  const selected = sorted[0];
  const equallyStrong = sorted.filter((candidate) => candidate.confidence === selected.confidence);
  return { selected, ambiguous: equallyStrong.length > 1 };
};

const toMatch = (
  fragment: ReportFragmentV1,
  candidate: MatchCandidate | null,
  ambiguous: boolean,
  candidateCount: number,
  signalPreview: string,
): SemanticMatch => {
  if (!candidate) {
    return {
      fragmentId: fragment.id,
      fragmentKind: fragment.kind,
      matchedDomIndex: null,
      matchedDomSelector: null,
      matchStrategy: 'unmatched',
      confidence: 0,
      ambiguous: false,
      candidateCount: 0,
      sharedDomMatch: false,
      matchedTextPreview: '',
      domTopMm: null,
      domHeightMm: null,
      domBottomMm: null,
      signalPreview,
      reason: 'No deterministic official DOM signal was found.',
    };
  }
  return {
    fragmentId: fragment.id,
    fragmentKind: fragment.kind,
    matchedDomIndex: candidate.block.index,
    matchedDomSelector: `[data-shadow-semantic-index="${candidate.block.index}"]`,
    matchStrategy: candidate.strategy,
    confidence: candidate.confidence,
    ambiguous,
    candidateCount,
    sharedDomMatch: false,
    matchedTextPreview: candidate.block.text.slice(0, 180),
    domTopMm: round(candidate.block.topPx / PX_PER_MM),
    domHeightMm: round(candidate.block.heightPx / PX_PER_MM),
    domBottomMm: round(candidate.block.bottomPx / PX_PER_MM),
    signalPreview,
    reason: candidate.reason,
  };
};

export const mapDocument = (
  document: ShadowReportDocumentV1,
  blocks: readonly DomBlock[],
): SemanticMatch[] => {
  const matches: SemanticMatch[] = [];
  const matchByFragmentId = new Map<string, SemanticMatch>();
  let globalCursor = 0;
  const sectionAnchor = (label: string): number | null => {
    const normalized = normalizeArabic(label);
    return blocks.find((block) =>
      block.className.includes('section-num') && block.normalizedText.includes(normalized))?.index ?? null;
  };
  const observationsStart = sectionAnchor('الملاحظات');
  const recommendationsStart = sectionAnchor('التوصيات');
  const appendicesStart = sectionAnchor('ملاحق التقرير التفتيشي');
  const signaturesStart = blocks.find((block) => block.className.includes('signatures'))?.index ?? null;
  const scopedBlocks = (fragment: ReportFragmentV1): DomBlock[] => {
    let start = 0;
    let end = Number.POSITIVE_INFINITY;
    if (fragment.kind === 'officialNotesTitle' || fragment.kind === 'noteCategoryTitle' || fragment.kind === 'noteItem') {
      start = observationsStart ?? 0;
      end = recommendationsStart ?? Number.POSITIVE_INFINITY;
    } else if (fragment.kind === 'recommendationsTitle' || fragment.kind === 'recommendationGroupTitle' || fragment.kind === 'recommendationItem') {
      start = recommendationsStart ?? 0;
      end = appendicesStart ?? signaturesStart ?? Number.POSITIVE_INFINITY;
    } else if (fragment.kind === 'appendicesTitle' || fragment.kind === 'appendixTitle' || fragment.kind === 'appendixParagraph') {
      start = appendicesStart ?? 0;
      end = signaturesStart ?? Number.POSITIVE_INFINITY;
    } else if (fragment.kind === 'finalEvaluation') {
      start = recommendationsStart ?? 0;
      end = appendicesStart ?? signaturesStart ?? Number.POSITIVE_INFINITY;
    } else if (fragment.kind === 'signatures') {
      start = signaturesStart ?? 0;
    } else {
      end = observationsStart ?? Number.POSITIVE_INFINITY;
    }
    return blocks.filter((block) => block.index >= start && block.index < end);
  };

  document.fragmentOrder.forEach((fragmentId) => {
    const fragment = document.fragments[fragmentId];
    const signals = fragmentSignals(fragment);
    const cursor = fragment.kind === 'finalEvaluation' ? recommendationsStart ?? 0 : globalCursor;
    const candidatesInRegion = scopedBlocks(fragment);
    const candidates = [
      ...tableCandidates(fragment, candidatesInRegion, tableSignature(fragment)),
      ...textCandidates(fragment, candidatesInRegion, signals, cursor),
      ...kindSpecificCandidates(fragment, candidatesInRegion),
    ];
    const { selected, ambiguous } = selectCandidate(candidates, cursor);
    let match = toMatch(fragment, selected, ambiguous, candidates.length, signals.join(' | ').slice(0, 180));

    const canUseParentAnchor = fragment.kind === 'findingGroupTitle'
      || (fragment.kind === 'tableRow' && fragment.sourceRef.sourceType === 'officer-info');
    if (!selected && canUseParentAnchor && fragment.parentId) {
      const parentMatch = matchByFragmentId.get(fragment.parentId);
      const parentBlock = parentMatch?.matchedDomIndex === null || parentMatch?.matchedDomIndex === undefined
        ? null
        : blocks[parentMatch.matchedDomIndex];
      if (parentBlock) {
        match = {
          ...toMatch(fragment, {
            block: parentBlock,
            strategy: 'kind-specific',
            confidence: 0.85,
            reason: fragment.kind === 'findingGroupTitle'
              ? 'The official renderer has no independent finding-group box; the parent subsection anchor is deterministic.'
              : 'The officer field has no independent text signal; its official subsection anchor is deterministic.',
          }, false, 1, signals.join(' | ').slice(0, 180)),
          matchStrategy: 'kind-specific-parent-anchor',
        };
      }
    }

    if (match.matchedDomIndex !== null && match.matchStrategy !== 'kind-specific-parent-anchor') {
      globalCursor = Math.max(globalCursor, match.matchedDomIndex);
    }
    matches.push(match);
    matchByFragmentId.set(fragmentId, match);
  });

  const domUse = new Map<number, number>();
  matches.forEach((match) => {
    if (match.matchedDomIndex !== null) domUse.set(match.matchedDomIndex, (domUse.get(match.matchedDomIndex) ?? 0) + 1);
  });
  return matches.map((match) => ({
    ...match,
    sharedDomMatch: match.matchedDomIndex !== null && (domUse.get(match.matchedDomIndex) ?? 0) > 1,
  }));
};

export const summarizeByKind = (matches: readonly SemanticMatch[]): Record<string, {
  total: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  coveragePercentage: number;
}> => {
  const result: Record<string, { total: number; matched: number; unmatched: number; ambiguous: number; coveragePercentage: number }> = {};
  matches.forEach((match) => {
    const entry = result[match.fragmentKind] ??= { total: 0, matched: 0, unmatched: 0, ambiguous: 0, coveragePercentage: 0 };
    entry.total += 1;
    if (match.matchedDomIndex === null) entry.unmatched += 1;
    else entry.matched += 1;
    if (match.ambiguous) entry.ambiguous += 1;
  });
  Object.values(result).forEach((entry) => {
    entry.coveragePercentage = round((entry.matched / Math.max(entry.total, 1)) * 100);
  });
  return result;
};

const main = async (): Promise<void> => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reportsService = app.get(ReportsService);
  const prisma = app.get(PrismaService);
  const builder = new ReportDocumentV1Builder();
  const campaigns = await prisma.campaign.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_CAMPAIGNS,
  });
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const campaignResults: Array<{
    campaignId: string;
    campaignName: string;
    layoutStable: boolean;
    domBlocks: number;
    totalFragments: number;
    matchedFragments: number;
    unmatchedFragments: number;
    ambiguousMatches: number;
    sharedDomMatches: number;
    coveragePercentage: number;
    deterministicRepeat: boolean;
    coverageByKind: ReturnType<typeof summarizeByKind>;
    matches: SemanticMatch[];
  }> = [];

  try {
    for (const campaign of campaigns) {
      const payload = await reportsService.getCampaignReportPayload(campaign.id);
      const document = builder.build(payload, { campaignId: campaign.id });
      const officialHtml = reportsService.generateHtmlFromPayload(payload);
      const page = await browser.newPage();
      await page.setContent(officialHtml, { waitUntil: 'load' });
      const layoutStable = await waitForStableLayout(page);
      const blocks = await collectDomBlocks(page);
      const matches = mapDocument(document, blocks);
      const repeat = mapDocument(document, blocks);
      const deterministicRepeat = JSON.stringify(matches) === JSON.stringify(repeat);
      const matchedFragments = matches.filter((match) => match.matchedDomIndex !== null).length;
      const unmatchedFragments = matches.length - matchedFragments;
      const ambiguousMatches = matches.filter((match) => match.ambiguous).length;
      const sharedDomMatches = matches.filter((match) => match.sharedDomMatch).length;
      campaignResults.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        layoutStable,
        domBlocks: blocks.length,
        totalFragments: matches.length,
        matchedFragments,
        unmatchedFragments,
        ambiguousMatches,
        sharedDomMatches,
        coveragePercentage: round((matchedFragments / Math.max(matches.length, 1)) * 100),
        deterministicRepeat,
        coverageByKind: summarizeByKind(matches),
        matches,
      });
      await page.close();
    }
  } finally {
    await browser.close();
    await app.close();
  }

  const allMatches = campaignResults.flatMap((campaign) => campaign.matches);
  const totalFragments = allMatches.length;
  const matchedFragments = allMatches.filter((match) => match.matchedDomIndex !== null).length;
  const unmatchedFragments = totalFragments - matchedFragments;
  const ambiguousMatches = allMatches.filter((match) => match.ambiguous).length;
  const coveragePercentage = round((matchedFragments / Math.max(totalFragments, 1)) * 100);
  const minimumCampaignCoverage = Math.min(...campaignResults.map((campaign) => campaign.coveragePercentage));
  const deterministicAcrossCampaigns = campaignResults.every((campaign) => campaign.deterministicRepeat && campaign.layoutStable);
  const decision = coveragePercentage >= 90 && minimumCampaignCoverage >= 90 && deterministicAcrossCampaigns ? 'GO' : 'NO-GO';
  const output = {
    phase: '44C',
    mode: 'shadow-only',
    generatedAt: new Date().toISOString(),
    productionChanges: 0,
    rendererModified: false,
    paginationReconstructed: false,
    matchingPolicy: 'deterministic-only',
    summary: {
      campaigns: campaignResults.length,
      totalFragments,
      matchedFragments,
      unmatchedFragments,
      ambiguousMatches,
      sharedDomMatches: allMatches.filter((match) => match.sharedDomMatch).length,
      coveragePercentage,
      minimumCampaignCoverage,
      deterministicAcrossCampaigns,
      decision,
    },
    coverageByKind: summarizeByKind(allMatches),
    campaigns: campaignResults,
  };
  writeFileSync(join(OUTPUT_DIR, 'semantic-map.json'), JSON.stringify(output, null, 2));

  const successfulExamples = allMatches
    .filter((match) => match.matchedDomIndex !== null && match.confidence >= 0.95)
    .slice(0, 10);
  const failedExamples = allMatches.filter((match) => match.matchedDomIndex === null).slice(0, 10);
  const kindRows = Object.entries(output.coverageByKind)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, value]) => `| ${kind} | ${value.total} | ${value.matched} | ${value.unmatched} | ${value.ambiguous} | ${value.coveragePercentage}% |`);
  const report = [
    '# Phase 44C Semantic Identity Mapping Report',
    '',
    `Decision: **${decision}**`,
    '',
    `Total V1 fragments: ${totalFragments}`,
    `Matched fragments: ${matchedFragments}`,
    `Unmatched fragments: ${unmatchedFragments}`,
    `Ambiguous matches: ${ambiguousMatches}`,
    `Shared DOM mappings: ${output.summary.sharedDomMatches}`,
    `Match coverage: ${coveragePercentage}%`,
    `Minimum campaign coverage: ${minimumCampaignCoverage}%`,
    `Deterministic repeated mapping: ${deterministicAcrossCampaigns ? 'PASS' : 'FAIL'}`,
    '',
    '## Campaign Coverage',
    '',
    '| Campaign | V1 fragments | DOM blocks | Matched | Unmatched | Ambiguous | Coverage |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...campaignResults.map((campaign) => `| ${campaign.campaignName.replace(/\|/g, '\\|')} | ${campaign.totalFragments} | ${campaign.domBlocks} | ${campaign.matchedFragments} | ${campaign.unmatchedFragments} | ${campaign.ambiguousMatches} | ${campaign.coveragePercentage}% |`),
    '',
    '## Coverage by Kind',
    '',
    '| Kind | Total | Matched | Unmatched | Ambiguous | Coverage |',
    '|---|---:|---:|---:|---:|---:|',
    ...kindRows,
    '',
    '## Successful Examples',
    '',
    ...successfulExamples.map((match) => `- ${match.fragmentKind} \`${match.fragmentId}\` -> DOM ${match.matchedDomIndex} via ${match.matchStrategy} (${match.confidence}): ${match.matchedTextPreview.slice(0, 100)}`),
    '',
    '## Failed Examples',
    '',
    ...(failedExamples.length > 0
      ? failedExamples.map((match) => `- ${match.fragmentKind} \`${match.fragmentId}\`: ${match.reason}; signal=${match.signalPreview || '(none)'}`)
      : ['- None.']),
    '',
    '## Limitations',
    '',
    '- Multiple V1 fragments may intentionally share one official DOM block when the renderer merges content.',
    '- A match proves semantic identity only. It does not prove printed-page placement.',
    '- Parent-anchor matches identify structural fragments that have no independent official DOM box.',
    '- Ambiguous repeated text is resolved by deterministic order, but remains reported as ambiguous.',
    '- No pagination boundaries were estimated or reconstructed.',
    '',
    '## Recommendation for Phase 44D',
    '',
    decision === 'GO'
      ? 'Proceed with a shadow-only stability audit of this semantic map across repeated renders and targeted difficult fixtures. Do not reconstruct pagination yet.'
      : 'Do not proceed to pagination research. Improve deterministic identity coverage without changing the official renderer.',
    '',
  ].join('\n');
  writeFileSync(join(OUTPUT_DIR, 'semantic-map-report.md'), report);
  console.log(report);
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
