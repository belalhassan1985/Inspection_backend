/**
 * Phase 43H — Per-Kind Overhead Model
 *
 * Distributes layout overhead proportionally to each fragment kind's
 * content contribution, then tests cross-campaign prediction.
 *
 * Key insight: different fragment kinds have different overhead
 * (tableRow has cell padding/borders, findingItem is just paragraphs).
 * Proportional distribution accounts for this.
 *
 * Dev-only diagnostic. No production code changes.
 *
 * Usage: npx ts-node scripts/audit-phase43h-per-kind-overhead.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/reports/reports.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportDocumentV1Builder } from '../src/reports/report-document-v1-shadow/report-document-v1.builder';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_HEIGHT = 10;

const ESTIMATED_HEIGHTS: Record<string, number> = {
  reportHeader: 20, reportTitle: 15, assignment: 10, committee: 12,
  purpose: 10, visitDate: 8, tableTitle: 8, tableHeader: 10,
  tableRow: 7, sectionTitle: 10, sectionNarrative: 40, subsectionTitle: 8,
  subsectionNarrative: 35, findingGroupTitle: 8, findingItem: 7,
  recommendationsTitle: 10, recommendationGroupTitle: 8, recommendationItem: 7,
  officialNotesTitle: 10, noteCategoryTitle: 8, noteItem: 7,
  appendicesTitle: 10, appendixTitle: 8, appendixParagraph: 15,
  finalEvaluation: 12, signatures: 15,
};

const countPages = (
  heightsMm: number[],
  usableHeightMm: number,
): number => {
  if (heightsMm.length === 0) return 1;
  let pages = 1;
  let currentY = heightsMm[0];
  for (let i = 1; i < heightsMm.length; i++) {
    const h = heightsMm[i];
    if (currentY + h > usableHeightMm) {
      pages++;
      currentY = h;
    } else {
      currentY += h;
    }
  }
  return pages;
};

const extractText = (content: unknown, depth = 0): string => {
  if (depth > 5) return '';
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'number' || typeof content === 'boolean') return String(content);
  if (Array.isArray(content)) {
    return content.map((item) => extractText(item, depth + 1)).filter(Boolean).join(' ');
  }
  if (typeof content === 'object') {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
      if (key === 'tableId' || key === 'columns' || key === 'field' || key === 'label') continue;
      const text = extractText(value, depth + 1);
      if (text) parts.push(text);
    }
    return parts.join(' ');
  }
  return '';
};

const CONTENT_WIDTH_MM = 190;

const buildMeasurementHtml = (
  fragmentOrder: readonly string[],
  fragments: Readonly<Record<string, { id: string; kind: string; content: unknown }>>,
): string => {
  const fragmentDivs = fragmentOrder
    .map((id) => {
      const f = fragments[id];
      if (!f) return '';
      const text = extractText(f.content);
      return `<div data-fragment-id="${f.id}" data-kind="${f.kind}" class="frag-block"
        style="margin:0 0 8px 0;padding:0;width:${CONTENT_WIDTH_MM}mm;font-size:13.5px;line-height:1.7;font-family:'Cairo','Times New Roman',serif;text-align:right;">
        ${text || `[${f.kind}]`}
      </div>`;
    })
    .filter(Boolean)
    .join('\n');

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: white; direction: rtl; text-align: right; padding: 0; }
  .frag-block { word-wrap: break-word; overflow-wrap: break-word; }
</style>
</head>
<body>
${fragmentDivs}
</body>
</html>`;
};

const countPdfPages = (buf: Buffer): number => {
  const m = buf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g);
  return m ? m.length : 0;
};

const OUTPUT_DIR = path.join(__dirname, '..', 'audit-output', 'phase43h');

interface KindOverheadStats {
  kind: string;
  avgBareHeight: number;
  count: number;
  bareHeightTotal: number;
  // After overhead distribution
  effectiveHeight: number;
  overheadPerInstance: number;
}

interface CampaignData {
  name: string;
  campaignId: string;
  fragmentCount: number;
  officialPdfPages: number;
  totalHtmlHeightMm: number;
  bareHeightsSum: number;
  overheadTotal: number; // totalHtmlHeightMm - bareHeightsSum
  perKindCounts: Record<string, number>;
  perKindBareHeights: Record<string, number[]>; // kind -> heights
  kindEffectiveHeights: Record<string, number>; // kind -> height with overhead
  fragmentKindOrder: string[]; // fragment order by kind (preserves sequence)
}

const main = async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reportsService = app.get(ReportsService);
  const prisma = app.get(PrismaService);
  const builder = new ReportDocumentV1Builder();

  const campaigns = await prisma.campaign.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Found ${campaigns.length} campaigns in database.`);

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const allData: CampaignData[] = [];

  for (const c of campaigns) {
    console.log(`\nProcessing: ${c.name} [${c.id.slice(0, 8)}]...`);

    try {
      const payload = await reportsService.getCampaignReportPayload(c.id);
      const officialHtml = reportsService.generateHtmlFromPayload(payload);
      const v1Doc = builder.build(payload, { campaignId: c.id });

      const fragmentOrder = v1Doc.fragmentOrder;
      const fragments = v1Doc.fragments;
      const fragmentCount = fragmentOrder.length;

      let officialPdfPages = 0;
      let totalHtmlHeightMm = 0;

      try {
        const p = await browser.newPage();
        await p.setContent(officialHtml, { waitUntil: 'load' });
        totalHtmlHeightMm = await p.evaluate(() => document.body.scrollHeight) / 3.7795275591;
        const buf = await p.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '20mm', bottom: '22mm', left: '10mm', right: '10mm' },
          preferCSSPageSize: false,
        });
        officialPdfPages = countPdfPages(Buffer.from(buf));
        await p.close();
      } catch (e: any) {
        console.error(`  SKIPPED (PDF): ${e.message}`);
        continue;
      }

      // Measure bare fragment heights (no layout context)
      const measurementHtml = buildMeasurementHtml(fragmentOrder, fragments);
      const bareFragmentData: { kind: string; heightMm: number }[] = [];

      try {
        const p = await browser.newPage();
        await p.setContent(measurementHtml, { waitUntil: 'load' });
        const measurements = await p.evaluate(() => {
          const blocks = Array.from(document.querySelectorAll('[data-fragment-id]')) as HTMLElement[];
          return blocks.map((el) => ({
            kind: el.getAttribute('data-kind') || '',
            heightPx: Math.round(el.getBoundingClientRect().height * 100) / 100,
          }));
        });
        await p.close();
        bareFragmentData.push(...measurements.map((m: any) => ({
          kind: m.kind,
          heightMm: m.heightPx / 3.7795275591,
        })));
      } catch (e: any) {
        console.error(`  SKIPPED (measurement): ${e.message}`);
        continue;
      }

      const bareHeightsSum = Math.round(bareFragmentData.reduce((s, f) => s + f.heightMm, 0) * 100) / 100;
      totalHtmlHeightMm = Math.round(totalHtmlHeightMm * 100) / 100;
      const overheadTotal = Math.round((totalHtmlHeightMm - bareHeightsSum) * 100) / 100;

      // Per-kind stats
      const perKindBareHeights: Record<string, number[]> = {};
      const perKindCounts: Record<string, number> = {};
      for (const f of bareFragmentData) {
        if (!perKindBareHeights[f.kind]) perKindBareHeights[f.kind] = [];
        perKindBareHeights[f.kind].push(f.heightMm);
        perKindCounts[f.kind] = (perKindCounts[f.kind] || 0) + 1;
      }

      // Distribute overhead proportionally to each kind's total bare height
      // Overhead per kind = totalOverhead * (kindBareTotal / totalBareSum)
      // Effective height per instance = bareHeight[i] + overheadPerInstance
      const kindOverhead: Record<string, number> = {};
      const kindEffectiveHeights: Record<string, number> = {};
      for (const [kind, heights] of Object.entries(perKindBareHeights)) {
        const kindBareTotal = heights.reduce((s, h) => s + h, 0);
        const kindShare = kindBareTotal / bareHeightsSum;
        const kindOverheadTotal = overheadTotal * kindShare;
        const overheadPerInstance = kindOverheadTotal / heights.length;
        // Effective height = average bare height + overhead share per instance
        const avgBare = kindBareTotal / heights.length;
        kindOverhead[kind] = Math.round(overheadPerInstance * 100) / 100;
        kindEffectiveHeights[kind] = Math.round((avgBare + overheadPerInstance) * 100) / 100;
      }

      // Preserve fragment order by kind for page count simulation
      const fragmentKindOrder = bareFragmentData.map((f) => f.kind);

      allData.push({
        name: c.name,
        campaignId: c.id,
        fragmentCount,
        officialPdfPages,
        totalHtmlHeightMm,
        bareHeightsSum,
        overheadTotal,
        perKindCounts,
        perKindBareHeights,
        kindEffectiveHeights,
        fragmentKindOrder,
      });

      console.log(`  fragments=${fragmentCount}  official=${officialPdfPages}p  bareSum=${bareHeightsSum}mm  overhead=${overheadTotal}mm`);
    } catch (e: any) {
      console.error(`  SKIPPED: ${e.message}`);
    }
  }

  await browser.close();
  await app.close();

  // ══════════════════════════════════════════════════════════════════════
  // ANALYSIS
  // ══════════════════════════════════════════════════════════════════════

  const div = '═'.repeat(74);
  const sub = '─'.repeat(74);
  const lines: string[] = [];

  lines.push('');
  lines.push(div);
  lines.push('  Phase 43H — Per-Kind Overhead Model');
  lines.push(div);

  // 1. Per-kind effective heights (with overhead)
  lines.push('');
  lines.push('  1. Per-Kind Effective Heights (bare + overhead share)');
  lines.push(sub);
  lines.push('  Overhead distributed proportionally to each kind\'s bare height contribution.');
  lines.push('');

  // Aggregate all kinds across campaigns
  const allKinds = new Set<string>();
  for (const d of allData) {
    for (const kind of Object.keys(d.kindEffectiveHeights)) {
      allKinds.add(kind);
    }
  }

  const sortedKinds = [...allKinds].sort();
  const kindStatsTable: Record<string, {
    avgEffectiveHeight: number;
    avgBareHeight: number;
    avgOverhead: number;
    overheadRatio: number;
    totalCount: number;
    campaignCount: number;
  }> = {};

  for (const kind of sortedKinds) {
    let effectiveSum = 0;
    let bareSum = 0;
    let overheadSum = 0;
    let totalCount = 0;
    let cCount = 0;

    for (const d of allData) {
      if (!d.kindEffectiveHeights[kind]) continue;
      const avgBareArray = d.perKindBareHeights[kind];
      if (!avgBareArray) continue;
      const avgBare = avgBareArray.reduce((s, h) => s + h, 0) / avgBareArray.length;
      effectiveSum += d.kindEffectiveHeights[kind];
      bareSum += avgBare;
      // Compute overhead per instance for this kind in this campaign
      const kindBareTotal = avgBareArray.reduce((s, h) => s + h, 0);
      const kindShare = kindBareTotal / d.bareHeightsSum;
      const overheadPerInstance = (d.overheadTotal * kindShare) / avgBareArray.length;
      overheadSum += overheadPerInstance;
      totalCount += avgBareArray.length;
      cCount++;
    }

    kindStatsTable[kind] = {
      avgEffectiveHeight: cCount > 0 ? Math.round((effectiveSum / cCount) * 100) / 100 : 0,
      avgBareHeight: cCount > 0 ? Math.round((bareSum / cCount) * 100) / 100 : 0,
      avgOverhead: cCount > 0 ? Math.round((overheadSum / cCount) * 100) / 100 : 0,
      overheadRatio: bareSum > 0 ? Math.round((effectiveSum / bareSum) * 100) / 100 : 1,
      totalCount,
      campaignCount: cCount,
    };
  }

  // Sort by overhead ratio (descending)
  const sortedByOverhead = Object.entries(kindStatsTable).sort((a, b) => b[1].overheadRatio - a[1].overheadRatio);

  lines.push(`  ${'Kind'.padEnd(22)} ${'Bare'.padStart(8)} ${'+Overhead'.padStart(10)} ${'Eff'.padStart(8)} ${'Ratio'.padStart(8)} ${'Count'.padStart(6)}`);
  lines.push(`  ${'─'.repeat(66)}`);
  for (const [kind, stats] of sortedByOverhead) {
    lines.push(`  ${kind.padEnd(22)} ${String(stats.avgBareHeight).padStart(8)} ${String(stats.avgOverhead).padStart(9)}mm ${String(stats.avgEffectiveHeight).padStart(7)}mm ${String(stats.overheadRatio).padStart(7)}x ${String(stats.totalCount).padStart(6)}`);
  }

  // 2. Leave-One-Out Cross-Validation
  lines.push('');
  lines.push('  2. Leave-One-Out Cross-Validation');
  lines.push(sub);
  lines.push('  For each campaign, use effective heights from other campaigns to predict page count.');
  lines.push('');

  const looResults: {
    name: string;
    fragmentCount: number;
    officialPages: number;
    predictedPages: number;
    delta: number;
    totalCapacityMm: number;
  }[] = [];

  for (const target of allData) {
    const others = allData.filter((d) => d.campaignId !== target.campaignId);

    if (others.length === 0) {
      looResults.push({
        name: target.name,
        fragmentCount: target.fragmentCount,
        officialPages: target.officialPdfPages,
        predictedPages: 0,
        delta: 0,
        totalCapacityMm: 0,
      });
      continue;
    }

    // Compute average effective height per kind from OTHER campaigns
    const avgEffHeights: Record<string, number> = {};
    for (const kind of sortedKinds) {
      let sum = 0;
      let count = 0;
      for (const d of others) {
        if (d.kindEffectiveHeights[kind]) {
          sum += d.kindEffectiveHeights[kind];
          count++;
        }
      }
      if (count > 0) {
        avgEffHeights[kind] = Math.round((sum / count) * 100) / 100;
      }
    }

    // Use OTHER campaigns' total capacity per page as estimate
    // totalCapacity = totalHtmlHeight / pages
    const avgTotalCapacity = others.reduce((s, d) => s + (d.totalHtmlHeightMm / d.officialPdfPages), 0) / others.length;
    const totalCapacity = Math.round(avgTotalCapacity * 100) / 100;

    // Apply to target: preserve fragment order, use estimated effective heights per kind.
    // For kinds unseen in training, fall back to current estimated heights (not target's own data)
    const predictedHeights = target.fragmentKindOrder.map(
      (kind) => avgEffHeights[kind] || ESTIMATED_HEIGHTS[kind] || DEFAULT_HEIGHT,
    );

    const predictedPages = countPages(predictedHeights, totalCapacity);

    looResults.push({
      name: target.name,
      fragmentCount: target.fragmentCount,
      officialPages: target.officialPdfPages,
          predictedPages,
          delta: predictedPages - target.officialPdfPages,
          totalCapacityMm: totalCapacity,
        });
  }

  lines.push(`  ${'Campaign'.padEnd(24)} ${'Frags'.padStart(6)} ${'Official'.padStart(8)} ${'Predicted'.padStart(10)} ${'Δ'.padStart(6)} ${'Cap(mm)'.padStart(9)}`);
  lines.push(`  ${'─'.repeat(67)}`);
  for (const r of looResults) {
    const name = r.name.length > 23 ? r.name.slice(0, 20) + '...' : r.name;
    const dStr = r.delta >= 0 ? '+' + String(r.delta) : String(r.delta);
    lines.push(`  ${name.padEnd(24)} ${String(r.fragmentCount).padStart(6)} ${String(r.officialPages).padStart(8)} ${String(r.predictedPages).padStart(10)} ${dStr.padStart(6)} ${String(r.totalCapacityMm).padStart(8)}`);
  }

  const avgAbsDelta = looResults.length > 0
    ? Math.round(looResults.reduce((s, r) => s + Math.abs(r.delta), 0) / looResults.length * 100) / 100
    : 0;
  const zeroCount = looResults.filter((r) => r.delta === 0).length;
  const oneCount = looResults.filter((r) => Math.abs(r.delta) <= 1).length;

  lines.push('');
  lines.push(`  Avg |Δ|: ${avgAbsDelta}`);
  lines.push(`  Δ=0:     ${zeroCount}/${looResults.length}`);
  lines.push(`  |Δ|≤1:   ${oneCount}/${looResults.length}`);

  // 3. Comparison to other approaches
  lines.push('');
  lines.push('  3. Comparison Across All Approaches');
  lines.push(sub);
  lines.push('');
  lines.push(`  Current policy:                          avg |Δ| = 5.67`);
  lines.push(`  155mm fixture profile:                   avg |Δ| = 4.67`);
  lines.push(`  159mm fixture profile:                   avg |Δ| = 4.00`);
  lines.push(`  Content-aware (bare, Phase 43F):          avg |Δ| = 3.33`);
  lines.push(`  Overhead-scaled (Phase 43F fix):          avg |Δ| = 1.33`);
  lines.push(`  Size-dependent model (Phase 43G):         avg |Δ| = 1.67`);
  lines.push(`  Per-kind overhead model (Phase 43H):      avg |Δ| = ${avgAbsDelta}`);

  const bestModel = Math.min(1.33, 1.67, avgAbsDelta);
  const bestLabel = bestModel === avgAbsDelta ? 'Per-kind overhead' : bestModel === 1.33 ? 'Overhead-scaled' : 'Size-dependent';

  lines.push('');
  lines.push(`  Best approach: ${bestLabel} (avg |Δ| = ${bestModel})`);

  // 4. Per-kind overhead consistency
  lines.push('');
  lines.push('  4. Per-Kind Overhead Consistency');
  lines.push(sub);
  lines.push('  How consistent is the overhead per kind across campaigns?');
  lines.push('');

  // For each kind with data in 2+ campaigns, compute CV of effective height
  lines.push(`  ${'Kind'.padEnd(22)} ${'Campaigns'.padStart(10)} ${'Eff Height'.padStart(12)} ${'Range'.padStart(14)} ${'CV'.padStart(8)}`);
  lines.push(`  ${'─'.repeat(70)}`);

  const consistentKinds: string[] = [];
  const variableKinds: string[] = [];

  for (const [kind, _stats] of sortedByOverhead) {
    const effHeightsPerCampaign: number[] = [];
    for (const d of allData) {
      if (d.kindEffectiveHeights[kind]) {
        effHeightsPerCampaign.push(d.kindEffectiveHeights[kind]);
      }
    }
    if (effHeightsPerCampaign.length < 2) continue;

    const avg = effHeightsPerCampaign.reduce((s, v) => s + v, 0) / effHeightsPerCampaign.length;
    const min = Math.min(...effHeightsPerCampaign);
    const max = Math.max(...effHeightsPerCampaign);
    const stdDev = Math.sqrt(effHeightsPerCampaign.reduce((s, v) => s + (v - avg) ** 2, 0) / effHeightsPerCampaign.length);
    const cv = avg > 0 ? stdDev / avg : 0;
    const range = max - min;

    lines.push(`  ${kind.padEnd(22)} ${String(effHeightsPerCampaign.length).padStart(10)} ${String(Math.round(avg * 100) / 100).padStart(11)}mm ${String(Math.round(min * 100) / 100).padStart(6)}–${Math.round(max * 100) / 100}mm ${String(Math.round(cv * 100) / 100).padStart(7)}`);

    if (cv <= 0.15) {
      consistentKinds.push(kind);
    } else {
      variableKinds.push(kind);
    }
  }

  lines.push('');
  lines.push(`  Consistent (CV ≤ 15%): ${consistentKinds.length} kinds`);
  lines.push(`  Variable (CV > 15%):   ${variableKinds.length} kinds`);
  lines.push(`  (Fewer campaigns = less reliable CV estimate)`);

  // 5. Conclusion
  lines.push('');
  lines.push('  5. Conclusion');
  lines.push(sub);

  const verdict = avgAbsDelta <= 1
    ? '✓ Per-kind overhead model SOLVES the page count prediction problem (|Δ| ≤ 1).'
    : avgAbsDelta <= 2
      ? `~ Per-kind overhead model is CLOSE (avg |Δ| = ${avgAbsDelta}) but not perfect.`
      : '✗ Per-kind overhead model does NOT solve the problem.';

  lines.push('');
  lines.push(`  ${verdict}`);
  lines.push('');
  lines.push(`  Overhead-scaled (avg |Δ| = 1.33) vs Per-kind overhead (avg |Δ| = ${avgAbsDelta}):`);
  lines.push(`  ${avgAbsDelta <= 1.33 ? 'Per-kind is EQUAL or BETTER' : 'Overhead-scaled is BETTER'}.`);

  const finalBest = Math.min(1.33, avgAbsDelta);
  lines.push('');
  lines.push(`  Final best avg |Δ| across all approaches: ${finalBest}`);
  lines.push(`  ${finalBest <= 1 ? '✓ PROBLEM SOLVED.' : '✗ No approach achieves |Δ| ≤ 1 — fundamental limitation of height-based models.'}`);

  lines.push(div);

  // Save results
  const output = {
    totalCampaigns: allData.length,
    perKindEffectiveHeights: Object.fromEntries(
      sortedByOverhead.map(([kind, stats]) => [kind, {
        avgBareHeightMm: stats.avgBareHeight,
        avgOverheadPerInstanceMm: stats.avgOverhead,
        avgEffectiveHeightMm: stats.avgEffectiveHeight,
        overheadRatio: stats.overheadRatio,
        totalCount: stats.totalCount,
      }])
    ),
    looResults: looResults.map((r) => ({
      name: r.name,
      fragmentCount: r.fragmentCount,
      officialPages: r.officialPages,
      predictedPages: r.predictedPages,
      delta: r.delta,
      totalCapacityUsed: r.totalCapacityMm,
    })),
    stats: {
      avgAbsDelta,
      zeroCount,
      oneCount,
      consistentKindCount: consistentKinds.length,
      variableKindCount: variableKinds.length,
    },
    imports: 0,
    productionChanges: 0,
    decision: avgAbsDelta <= 2 ? 'GO' : 'NO-GO',
  };

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'per-kind-overhead-audit.json'),
    JSON.stringify(output, null, 2),
    'utf-8',
  );

  console.info(lines.join('\n'));
  console.log(`\nOutput saved to: ${OUTPUT_DIR}`);
};

main().catch((e) => {
  console.error('Phase 43H failed:', e);
  process.exit(1);
});
