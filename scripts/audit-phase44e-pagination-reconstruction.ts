/**
 * Phase 44E: shadow-only pagination reconstruction research.
 * Uses official HTML, stable semantic mapping, measured DOM positions, and A4
 * geometry. It does not modify or replace production pagination.
 */
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import puppeteer from 'puppeteer';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportDocumentV1Builder } from '../src/reports/report-document-v1-shadow/report-document-v1.builder';
import { ReportsService } from '../src/reports/reports.service';
import {
  collectDomBlocks,
  mapDocument,
  waitForStableLayout,
  type SemanticMatch,
} from './audit-phase44c-semantic-identity';

const OUTPUT_DIR = join(process.cwd(), 'audit-output', 'phase44e');
const REAL_CAMPAIGNS = 3;
const RUNS_PER_CAMPAIGN = 3;
const A4_HEIGHT_MM = 297;
const MARGINS_MM = { top: 20, right: 10, bottom: 22, left: 10 } as const;
const PRINTABLE_HEIGHT_MM = A4_HEIGHT_MM - MARGINS_MM.top - MARGINS_MM.bottom;
const EPSILON_MM = 0.01;

type Assignment = {
  fragmentId: string;
  fragmentKind: string;
  domTopMm: number | null;
  domBottomMm: number | null;
  domHeightMm: number | null;
  estimatedPageFromTop: number | null;
  estimatedPageFromBottom: number | null;
  crossesEstimatedBoundary: boolean;
  mappedDomIdentity: string | null;
  semanticMatchStrategy: string;
  semanticConfidence: number;
  pageAssignmentConfidence: number;
  confidentlyAssigned: boolean;
  sharedDomMapping: boolean;
  ambiguousSemanticMatch: boolean;
  printFragmentationRisk: boolean;
  riskReasons: string[];
};

type Geometry = {
  cssPxPerMm: number;
  rootTopPx: number;
  rootHeightPx: number;
  documentHeightPx: number;
  manualBreaksMm: number[];
};

const round = (value: number, precision = 2): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const countPdfPages = (buffer: Buffer): number =>
  (buffer.toString('latin1').match(/\/Type\s*\/Page(?![s])/g) || []).length;

const collectGeometry = async (page: import('puppeteer').Page): Promise<Geometry> => page.evaluate(() => {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:100mm;height:1px;left:-10000px;top:0;';
  document.body.appendChild(probe);
  const cssPxPerMm = probe.getBoundingClientRect().width / 100;
  probe.remove();
  const root = document.querySelector<HTMLElement>('.pdf-page') || document.body;
  const rootRect = root.getBoundingClientRect();
  const manualBreaksMm = Array.from(root.querySelectorAll<HTMLElement>('.page-break'))
    .map((element) => (element.getBoundingClientRect().top - rootRect.top) / cssPxPerMm)
    .filter((value) => value > 0)
    .sort((left, right) => left - right);
  return {
    cssPxPerMm,
    rootTopPx: rootRect.top,
    rootHeightPx: rootRect.height,
    documentHeightPx: document.documentElement.scrollHeight,
    manualBreaksMm,
  };
});

const estimatedPageAt = (positionMm: number, manualBreaksMm: readonly number[]): number => {
  let segmentStartMm = 0;
  let completedPages = 0;
  for (const breakMm of manualBreaksMm) {
    if (breakMm > positionMm) break;
    const segmentLengthMm = Math.max(0, breakMm - segmentStartMm);
    completedPages += Math.max(1, Math.ceil(segmentLengthMm / PRINTABLE_HEIGHT_MM));
    segmentStartMm = breakMm;
  }
  return completedPages + Math.floor(Math.max(0, positionMm - segmentStartMm) / PRINTABLE_HEIGHT_MM) + 1;
};

const assignmentFromMatch = (
  match: SemanticMatch,
  geometry: Geometry,
): Assignment => {
  if (match.matchedDomIndex === null || match.domTopMm === null || match.domBottomMm === null || match.domHeightMm === null) {
    return {
      fragmentId: match.fragmentId,
      fragmentKind: match.fragmentKind,
      domTopMm: null,
      domBottomMm: null,
      domHeightMm: null,
      estimatedPageFromTop: null,
      estimatedPageFromBottom: null,
      crossesEstimatedBoundary: false,
      mappedDomIdentity: null,
      semanticMatchStrategy: match.matchStrategy,
      semanticConfidence: match.confidence,
      pageAssignmentConfidence: 0,
      confidentlyAssigned: false,
      sharedDomMapping: false,
      ambiguousSemanticMatch: match.ambiguous,
      printFragmentationRisk: true,
      riskReasons: ['No mapped DOM identity.'],
    };
  }

  const rootTopMm = geometry.rootTopPx / geometry.cssPxPerMm;
  const topMm = Math.max(0, match.domTopMm - rootTopMm);
  const bottomMm = Math.max(topMm, match.domBottomMm - rootTopMm);
  const topPage = estimatedPageAt(topMm, geometry.manualBreaksMm);
  const bottomPage = estimatedPageAt(Math.max(topMm, bottomMm - EPSILON_MM), geometry.manualBreaksMm);
  const crossesEstimatedBoundary = topPage !== bottomPage;
  const tableRisk = match.fragmentKind === 'tableTitle'
    || match.fragmentKind === 'tableHeader'
    || match.fragmentKind === 'tableRow';
  const groupedRisk = match.fragmentKind === 'sectionTitle'
    || match.fragmentKind === 'subsectionTitle'
    || match.fragmentKind === 'findingGroupTitle';
  const riskReasons: string[] = [];
  if (crossesEstimatedBoundary) riskReasons.push('Mapped DOM block crosses an estimated A4 content boundary.');
  if (match.sharedDomMatch) riskReasons.push('Multiple V1 fragments share this DOM block.');
  if (match.ambiguous) riskReasons.push('Semantic mapping had multiple deterministic candidates.');
  if (tableRisk) riskReasons.push('Chromium may fragment or repeat table structures during printing.');
  if (groupedRisk) riskReasons.push('CSS keep/break behavior may move the grouped heading during printing.');

  let confidence = match.confidence;
  if (match.sharedDomMatch) confidence *= 0.95;
  if (match.ambiguous) confidence *= 0.9;
  if (tableRisk || groupedRisk) confidence *= 0.95;
  if (crossesEstimatedBoundary) confidence *= 0.45;
  confidence = round(confidence, 3);
  const confidentlyAssigned = !crossesEstimatedBoundary && confidence >= 0.75;

  return {
    fragmentId: match.fragmentId,
    fragmentKind: match.fragmentKind,
    domTopMm: round(topMm),
    domBottomMm: round(bottomMm),
    domHeightMm: match.domHeightMm,
    estimatedPageFromTop: topPage,
    estimatedPageFromBottom: bottomPage,
    crossesEstimatedBoundary,
    mappedDomIdentity: `${match.matchedDomSelector}|${match.matchedDomIndex}`,
    semanticMatchStrategy: match.matchStrategy,
    semanticConfidence: match.confidence,
    pageAssignmentConfidence: confidence,
    confidentlyAssigned,
    sharedDomMapping: match.sharedDomMatch,
    ambiguousSemanticMatch: match.ambiguous,
    printFragmentationRisk: crossesEstimatedBoundary || tableRisk || groupedRisk,
    riskReasons,
  };
};

const assignmentIdentity = (assignment: Assignment): string => [
  assignment.mappedDomIdentity ?? 'unmapped',
  assignment.estimatedPageFromTop ?? 'none',
  assignment.estimatedPageFromBottom ?? 'none',
  assignment.crossesEstimatedBoundary,
  assignment.pageAssignmentConfidence,
].join('|');

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
    pdfPageCount: number;
    reconstructedPageCount: number;
    pageCountDelta: number;
    totalFragments: number;
    confidentlyAssignedFragments: number;
    confidentAssignmentPercentage: number;
    crossingFragments: number;
    sharedDomFragments: number;
    ambiguousPageAssignments: number;
    printFragmentationRiskFragments: number;
    repeatedRunsDeterministic: boolean;
    unstableAssignments: number;
    failureExamples: Assignment[];
    runs: Array<{
      run: number;
      layoutStable: boolean;
      pdfPageCount: number;
      reconstructedPageCount: number;
      pageCountDelta: number;
      totalFragments: number;
      confidentlyAssignedFragments: number;
      confidentAssignmentPercentage: number;
      crossingFragments: number;
      sharedDomFragments: number;
      ambiguousPageAssignments: number;
      printFragmentationRiskFragments: number;
      manualBreaksMm: number[];
      geometry: Geometry;
      assignments: Assignment[];
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
        pdfPageCount: number;
        reconstructedPageCount: number;
        pageCountDelta: number;
        totalFragments: number;
        confidentlyAssignedFragments: number;
        confidentAssignmentPercentage: number;
        crossingFragments: number;
        sharedDomFragments: number;
        ambiguousPageAssignments: number;
        printFragmentationRiskFragments: number;
        manualBreaksMm: number[];
        geometry: Geometry;
        assignments: Assignment[];
      }> = [];

      for (let run = 1; run <= RUNS_PER_CAMPAIGN; run += 1) {
        const page = await browser.newPage();
        await page.setContent(officialHtml, { waitUntil: 'load' });
        const layoutStable = await waitForStableLayout(page);
        const blocks = await collectDomBlocks(page);
        const matches = mapDocument(document, blocks);
        const geometry = await collectGeometry(page);
        const assignments = matches.map((match) => assignmentFromMatch(match, geometry));
        const rootHeightMm = geometry.rootHeightPx / geometry.cssPxPerMm;
        const reconstructedPageCount = estimatedPageAt(Math.max(0, rootHeightMm - EPSILON_MM), geometry.manualBreaksMm);

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
        const pdfPageCount = countPdfPages(Buffer.from(pdfBytes));
        const confidentlyAssignedFragments = assignments.filter((assignment) => assignment.confidentlyAssigned).length;
        runs.push({
          run,
          layoutStable,
          pdfPageCount,
          reconstructedPageCount,
          pageCountDelta: reconstructedPageCount - pdfPageCount,
          totalFragments: assignments.length,
          confidentlyAssignedFragments,
          confidentAssignmentPercentage: round((confidentlyAssignedFragments / Math.max(assignments.length, 1)) * 100),
          crossingFragments: assignments.filter((assignment) => assignment.crossesEstimatedBoundary).length,
          sharedDomFragments: assignments.filter((assignment) => assignment.sharedDomMapping).length,
          ambiguousPageAssignments: assignments.filter((assignment) => !assignment.confidentlyAssigned).length,
          printFragmentationRiskFragments: assignments.filter((assignment) => assignment.printFragmentationRisk).length,
          manualBreaksMm: geometry.manualBreaksMm.map((value) => round(value)),
          geometry,
          assignments,
        });
        await page.close();
      }

      const baseline = runs[0];
      let unstableAssignments = 0;
      baseline.assignments.forEach((assignment) => {
        const identities = runs.map((run) => {
          const candidate = run.assignments.find((item) => item.fragmentId === assignment.fragmentId);
          return candidate ? assignmentIdentity(candidate) : 'missing';
        });
        if (new Set(identities).size > 1) unstableAssignments += 1;
      });
      const repeatedRunsDeterministic = unstableAssignments === 0
        && runs.every((run) => run.layoutStable)
        && new Set(runs.map((run) => `${run.pdfPageCount}|${run.reconstructedPageCount}`)).size === 1;
      campaignResults.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        pdfPageCount: baseline.pdfPageCount,
        reconstructedPageCount: baseline.reconstructedPageCount,
        pageCountDelta: baseline.pageCountDelta,
        totalFragments: baseline.totalFragments,
        confidentlyAssignedFragments: baseline.confidentlyAssignedFragments,
        confidentAssignmentPercentage: baseline.confidentAssignmentPercentage,
        crossingFragments: baseline.crossingFragments,
        sharedDomFragments: baseline.sharedDomFragments,
        ambiguousPageAssignments: baseline.ambiguousPageAssignments,
        printFragmentationRiskFragments: baseline.printFragmentationRiskFragments,
        repeatedRunsDeterministic,
        unstableAssignments,
        failureExamples: baseline.assignments
          .filter((assignment) => !assignment.confidentlyAssigned)
          .slice(0, 20),
        runs,
      });
    }
  } finally {
    await browser.close();
    await app.close();
  }

  const allWithinPageDelta = campaignResults.every((campaign) => Math.abs(campaign.pageCountDelta) <= 1);
  const allCoveragePass = campaignResults.every((campaign) => campaign.confidentAssignmentPercentage >= 95);
  const allDeterministic = campaignResults.every((campaign) => campaign.repeatedRunsDeterministic);
  const decision = allWithinPageDelta && allCoveragePass && allDeterministic ? 'GO' : 'NO-GO';
  const output = {
    phase: '44E',
    mode: 'shadow-only',
    generatedAt: new Date().toISOString(),
    runsPerCampaign: RUNS_PER_CAMPAIGN,
    productionChanges: 0,
    rendererModified: false,
    pagePlanV1Modified: false,
    officialPdfModified: false,
    paginationUsedInProduction: false,
    method: {
      printableHeightMm: PRINTABLE_HEIGHT_MM,
      pageAssignment: 'Measured DOM top/bottom relative to .pdf-page, segmented by existing manual .page-break positions.',
      validation: 'Aggregate reconstructed page count compared with PDF generated from the same Puppeteer page.',
      limitation: 'No PDF text-position oracle; individual estimated page assignments are not verified as exact print placements.',
    },
    summary: {
      campaignsTested: campaignResults.length,
      totalRuns: campaignResults.length * RUNS_PER_CAMPAIGN,
      allPageCountDeltasWithinOne: allWithinPageDelta,
      allCampaignsAtLeast95PercentConfident: allCoveragePass,
      repeatedRunsDeterministic: allDeterministic,
      decision,
    },
    campaigns: campaignResults,
  };
  writeFileSync(join(OUTPUT_DIR, 'pagination-reconstruction.json'), JSON.stringify(output, null, 2));

  const failures = campaignResults.flatMap((campaign) => campaign.failureExamples.map((assignment) => ({
    campaign: campaign.campaignName,
    ...assignment,
  })));
  const report = [
    '# Phase 44E Shadow Pagination Reconstruction Research',
    '',
    `Decision: **${decision}**`,
    '',
    `Campaigns tested: ${campaignResults.length}`,
    `Repeated runs per campaign: ${RUNS_PER_CAMPAIGN}`,
    `All page-count deltas within 1: ${allWithinPageDelta ? 'PASS' : 'FAIL'}`,
    `All campaigns at least 95% confidently assigned: ${allCoveragePass ? 'PASS' : 'FAIL'}`,
    `Repeated runs deterministic: ${allDeterministic ? 'PASS' : 'FAIL'}`,
    '',
    '## Campaign Results',
    '',
    '| Campaign | PDF pages | Reconstructed pages | Delta | Fragments | Confident | Confident % | Crossing | Shared DOM | Ambiguous page | Print-risk |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...campaignResults.map((campaign) => `| ${campaign.campaignName.replace(/\|/g, '\\|')} | ${campaign.pdfPageCount} | ${campaign.reconstructedPageCount} | ${campaign.pageCountDelta} | ${campaign.totalFragments} | ${campaign.confidentlyAssignedFragments} | ${campaign.confidentAssignmentPercentage}% | ${campaign.crossingFragments} | ${campaign.sharedDomFragments} | ${campaign.ambiguousPageAssignments} | ${campaign.printFragmentationRiskFragments} |`),
    '',
    '## Accuracy Observations',
    '',
    '- DOM geometry and semantic mapping were collected before PDF generation from the same Puppeteer page.',
    '- Estimated pages use A4 printable height and observed positions only; no calibrated fragment capacities are used.',
    '- Existing manual page-break positions start new measured segments.',
    '- PDF page count is actual output truth, but per-fragment PDF page positions remain unobserved.',
    '',
    '## Failure Examples',
    '',
    ...(failures.length > 0
      ? failures.slice(0, 20).map((failure) => `- ${failure.campaign}: ${failure.fragmentKind} \`${failure.fragmentId}\`, estimated ${failure.estimatedPageFromTop}-${failure.estimatedPageFromBottom}, confidence ${failure.pageAssignmentConfidence}; ${failure.riskReasons.join(' ')}`)
      : ['- None.']),
    '',
    '## Explicit Limitations',
    '',
    '- getBoundingClientRect() exposes continuous DOM geometry, not Chromium print fragmentation.',
    '- Blocks crossing estimated boundaries cannot be assigned to one page confidently.',
    '- Shared DOM mappings are reported even when all linked fragments receive the same estimated page.',
    '- Table rows, table headers, and grouped headings remain print-fragmentation risks.',
    '- Matching reconstructed page count does not prove every fragment is on the same page in the PDF.',
    '',
    '## Recommendation for Phase 44F',
    '',
    decision === 'GO'
      ? 'GO for a shadow-only PDF page-position validation phase. Do not integrate these assignments into PagePlanV1 or Designer yet.'
      : 'NO-GO for using DOM-only assignments. Phase 44F should research a PDF page-position oracle or another way to observe Chromium print fragmentation, without production integration.',
    '',
  ].join('\n');
  writeFileSync(join(OUTPUT_DIR, 'pagination-reconstruction-report.md'), report);
  console.log(report);
};

execute().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
