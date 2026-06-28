/** Phase 44D: repeated-render semantic mapping stability audit. Shadow only. */
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import puppeteer from 'puppeteer';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportDocumentV1Builder } from '../src/reports/report-document-v1-shadow/report-document-v1.builder';
import type { ShadowReportDocumentV1 } from '../src/reports/report-document-v1-shadow/report-document-v1.builder';
import { ReportsService } from '../src/reports/reports.service';
import {
  collectDomBlocks,
  mapDocument,
  summarizeByKind,
  waitForStableLayout,
  type SemanticMatch,
} from './audit-phase44c-semantic-identity';
import { PHASE_44D_STABILITY_FIXTURES } from './fixtures/phase44d-stability-fixtures';

const OUTPUT_DIR = join(process.cwd(), 'audit-output', 'phase44d');
const REAL_CAMPAIGNS = 3;
const RUNS_PER_SUBJECT = 5;

type Subject = {
  subjectId: string;
  label: string;
  source: 'real-campaign' | 'synthetic-fixture';
  coveredCases: string[];
  payload: any;
  document: ShadowReportDocumentV1;
  officialHtml: string;
};

type RunMetrics = {
  run: number;
  layoutStable: boolean;
  totalFragments: number;
  matchedFragments: number;
  unmatchedFragments: number;
  ambiguousMatches: number;
  sharedDomMappings: number;
  stableMappings: number;
  unstableMappings: number;
  stabilityPercentage: number;
  coveragePercentage: number;
  coverageByKind: ReturnType<typeof summarizeByKind>;
  matches: SemanticMatch[];
};

const round = (value: number, precision = 2): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const mappingIdentity = (match: SemanticMatch): string => match.matchedDomIndex === null
  ? 'unmatched'
  : `${match.matchedDomIndex}|${match.matchStrategy}|${match.matchedTextPreview}`;

const execute = async (): Promise<void> => {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const reportsService = app.get(ReportsService);
  const builder = new ReportDocumentV1Builder();
  const realCampaigns = await prisma.campaign.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' },
    take: REAL_CAMPAIGNS,
  });
  const subjects: Subject[] = [];

  for (const campaign of realCampaigns) {
    const payload = await reportsService.getCampaignReportPayload(campaign.id);
    subjects.push({
      subjectId: campaign.id,
      label: campaign.name,
      source: 'real-campaign',
      coveredCases: [],
      payload,
      document: builder.build(payload, { campaignId: campaign.id }),
      officialHtml: reportsService.generateHtmlFromPayload(payload),
    });
  }
  PHASE_44D_STABILITY_FIXTURES.forEach((fixture) => subjects.push({
    subjectId: fixture.id,
    label: fixture.label,
    source: 'synthetic-fixture',
    coveredCases: fixture.coveredCases,
    payload: fixture.payload,
    document: builder.build(fixture.payload, { campaignId: fixture.id }),
    officialHtml: reportsService.generateHtmlFromPayload(fixture.payload),
  }));

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const results: Array<{
    subjectId: string;
    label: string;
    source: Subject['source'];
    coveredCases: string[];
    totalFragments: number;
    stableMappings: number;
    unstableMappings: number;
    stabilityPercentage: number;
    minimumCoveragePercentage: number;
    repeatedRendersDeterministic: boolean;
    unstableExamples: Array<{ fragmentId: string; fragmentKind: string; identities: string[]; cause: string }>;
    runs: RunMetrics[];
  }> = [];

  try {
    for (const subject of subjects) {
      const runs: RunMetrics[] = [];
      for (let run = 1; run <= RUNS_PER_SUBJECT; run += 1) {
        const page = await browser.newPage();
        await page.setContent(subject.officialHtml, { waitUntil: 'load' });
        const layoutStable = await waitForStableLayout(page);
        const blocks = await collectDomBlocks(page);
        const matches = mapDocument(subject.document, blocks);
        const matchedFragments = matches.filter((match) => match.matchedDomIndex !== null).length;
        runs.push({
          run,
          layoutStable,
          totalFragments: matches.length,
          matchedFragments,
          unmatchedFragments: matches.length - matchedFragments,
          ambiguousMatches: matches.filter((match) => match.ambiguous).length,
          sharedDomMappings: matches.filter((match) => match.sharedDomMatch).length,
          stableMappings: 0,
          unstableMappings: 0,
          stabilityPercentage: 0,
          coveragePercentage: round((matchedFragments / Math.max(matches.length, 1)) * 100),
          coverageByKind: summarizeByKind(matches),
          matches,
        });
        await page.close();
      }

      const baseline = runs[0].matches;
      const unstableExamples: Array<{ fragmentId: string; fragmentKind: string; identities: string[]; cause: string }> = [];
      let stableMappings = 0;
      baseline.forEach((baselineMatch) => {
        const runMatches = runs.map((run) => run.matches.find((match) => match.fragmentId === baselineMatch.fragmentId));
        const identities = runMatches.map((match) => match ? mappingIdentity(match) : 'missing-fragment');
        const stable = baselineMatch.matchedDomIndex !== null && new Set(identities).size === 1;
        if (stable) {
          stableMappings += 1;
          return;
        }
        const cause = identities.includes('unmatched') || identities.includes('missing-fragment')
          ? 'matched/unmatched state changed or remained unavailable'
          : 'DOM index, strategy, or matched text changed across renders';
        unstableExamples.push({
          fragmentId: baselineMatch.fragmentId,
          fragmentKind: baselineMatch.fragmentKind,
          identities: [...new Set(identities)],
          cause,
        });
      });
      const unstableMappings = baseline.length - stableMappings;
      const stabilityPercentage = round((stableMappings / Math.max(baseline.length, 1)) * 100);
      runs.forEach((run) => {
        run.stableMappings = stableMappings;
        run.unstableMappings = unstableMappings;
        run.stabilityPercentage = stabilityPercentage;
      });
      results.push({
        subjectId: subject.subjectId,
        label: subject.label,
        source: subject.source,
        coveredCases: subject.coveredCases,
        totalFragments: baseline.length,
        stableMappings,
        unstableMappings,
        stabilityPercentage,
        minimumCoveragePercentage: Math.min(...runs.map((run) => run.coveragePercentage)),
        repeatedRendersDeterministic: unstableMappings === 0 && runs.every((run) => run.layoutStable),
        unstableExamples: unstableExamples.slice(0, 25),
        runs,
      });
    }
  } finally {
    await browser.close();
    await app.close();
  }

  const totalFragments = results.reduce((sum, result) => sum + result.totalFragments, 0);
  const stableMappings = results.reduce((sum, result) => sum + result.stableMappings, 0);
  const unstableMappings = totalFragments - stableMappings;
  const overallStabilityPercentage = round((stableMappings / Math.max(totalFragments, 1)) * 100);
  const minimumCoveragePercentage = Math.min(...results.map((result) => result.minimumCoveragePercentage));
  const repeatedRendersDeterministic = results.every((result) => result.repeatedRendersDeterministic);
  const allMatches = results.flatMap((result) => result.runs[0].matches);
  const baselineByKind = summarizeByKind(allMatches);
  const stabilityByKind: Record<string, { total: number; stable: number; unstable: number; stabilityPercentage: number }> = {};
  results.forEach((result) => {
    result.runs[0].matches.forEach((match) => {
      const entry = stabilityByKind[match.fragmentKind] ??= { total: 0, stable: 0, unstable: 0, stabilityPercentage: 0 };
      entry.total += 1;
      const unstable = result.unstableExamples.some((example) => example.fragmentId === match.fragmentId);
      if (unstable) entry.unstable += 1;
      else entry.stable += 1;
    });
  });
  Object.values(stabilityByKind).forEach((entry) => {
    entry.stabilityPercentage = round((entry.stable / Math.max(entry.total, 1)) * 100);
  });
  const unstableExamples = results.flatMap((result) => result.unstableExamples.map((example) => ({
    subject: result.label,
    ...example,
  })));
  const causeCounts = unstableExamples.reduce<Record<string, number>>((counts, example) => {
    counts[example.cause] = (counts[example.cause] ?? 0) + 1;
    return counts;
  }, {});
  const decision = minimumCoveragePercentage >= 95
    && overallStabilityPercentage >= 99
    && repeatedRendersDeterministic
    && unstableMappings === 0
    ? 'GO'
    : 'NO-GO';
  const output = {
    phase: '44D',
    mode: 'shadow-only',
    generatedAt: new Date().toISOString(),
    runsPerSubject: RUNS_PER_SUBJECT,
    productionChanges: 0,
    rendererModified: false,
    paginationReconstructed: false,
    summary: {
      subjects: results.length,
      realCampaigns: results.filter((result) => result.source === 'real-campaign').length,
      syntheticFixtures: results.filter((result) => result.source === 'synthetic-fixture').length,
      totalRenders: results.length * RUNS_PER_SUBJECT,
      totalFragments,
      stableMappings,
      unstableMappings,
      overallStabilityPercentage,
      minimumCoveragePercentage,
      repeatedRendersDeterministic,
      decision,
    },
    baselineCoverageByKind: baselineByKind,
    stabilityByKind,
    topInstabilityCauses: Object.entries(causeCounts)
      .sort((left, right) => right[1] - left[1])
      .map(([cause, count]) => ({ cause, count })),
    unstableExamples,
    subjects: results,
  };
  writeFileSync(join(OUTPUT_DIR, 'stability-report.json'), JSON.stringify(output, null, 2));

  const stableExamples = allMatches
    .filter((match) => match.matchedDomIndex !== null)
    .slice(0, 10);
  const report = [
    '# Phase 44D Semantic Mapping Stability Audit',
    '',
    `Decision: **${decision}**`,
    '',
    `Subjects: ${results.length} (${output.summary.realCampaigns} real campaigns, ${output.summary.syntheticFixtures} synthetic fixtures)`,
    `Repeated renders per subject: ${RUNS_PER_SUBJECT}`,
    `Total renders: ${output.summary.totalRenders}`,
    `Total fragments: ${totalFragments}`,
    `Stable mappings: ${stableMappings}`,
    `Unstable mappings: ${unstableMappings}`,
    `Overall stability: ${overallStabilityPercentage}%`,
    `Minimum mapping coverage: ${minimumCoveragePercentage}%`,
    `Repeated renders deterministic: ${repeatedRendersDeterministic ? 'PASS' : 'FAIL'}`,
    '',
    '## Stability by Subject',
    '',
    '| Subject | Source | Fragments | Stable | Unstable | Stability | Minimum coverage |',
    '|---|---|---:|---:|---:|---:|---:|',
    ...results.map((result) => `| ${result.label.replace(/\|/g, '\\|')} | ${result.source} | ${result.totalFragments} | ${result.stableMappings} | ${result.unstableMappings} | ${result.stabilityPercentage}% | ${result.minimumCoveragePercentage}% |`),
    '',
    '## Stability by Fragment Kind',
    '',
    '| Kind | Total | Stable | Unstable | Stability |',
    '|---|---:|---:|---:|---:|',
    ...Object.entries(stabilityByKind).sort(([left], [right]) => left.localeCompare(right))
      .map(([kind, value]) => `| ${kind} | ${value.total} | ${value.stable} | ${value.unstable} | ${value.stabilityPercentage}% |`),
    '',
    '## Top Instability Causes',
    '',
    ...(output.topInstabilityCauses.length > 0
      ? output.topInstabilityCauses.map((item) => `- ${item.cause}: ${item.count}`)
      : ['- None.']),
    '',
    '## Stable Examples',
    '',
    ...stableExamples.map((match) => `- ${match.fragmentKind} \`${match.fragmentId}\` -> DOM ${match.matchedDomIndex} via ${match.matchStrategy}`),
    '',
    '## Unstable Examples',
    '',
    ...(unstableExamples.length > 0
      ? unstableExamples.slice(0, 20).map((example) => `- ${example.subject}: ${example.fragmentKind} \`${example.fragmentId}\` - ${example.cause}`)
      : ['- None.']),
    '',
    '## Stress Cases Covered',
    '',
    ...PHASE_44D_STABILITY_FIXTURES.flatMap((fixture) => fixture.coveredCases.map((item) => `- ${item}: ${fixture.label}`)),
    '',
    '## Recommendation',
    '',
    decision === 'GO'
      ? 'GO for the next shadow research phase. Ambiguous and shared mappings were stable across repeated renders. Pagination reconstruction remains explicitly out of scope.'
      : 'NO-GO. Semantic mapping must be stabilized before any pagination research.',
    '',
  ].join('\n');
  writeFileSync(join(OUTPUT_DIR, 'stability-report.md'), report);
  console.log(report);
};

execute().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
