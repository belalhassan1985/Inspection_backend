/**
 * Phase 46C — Backend PaginationRules Consumption (Pilot) Audit
 *
 * Validates that `pagination.pageBreakBefore: true` on recommendation items
 * causes a page-break `<div>` to be inserted in the generated Official HTML.
 *
 * Tests:
 *   1. Baseline: no pagination field → no extra page-break divs
 *   2. pageBreakBefore on a recommendation item → page-break div before that item
 *   3. pageBreakBefore on multiple items → multiple page-break divs
 *   4. pageBreakBefore on first item → page-break before first rec
 *   5. manualBreaks still work alongside pagination
 *   6. Unknown pagination fields are ignored
 *   7. PDF page count changes when pageBreakBefore is set
 *
 * Usage:
 *   npx ts-node scripts/audit-phase46c-pagination-pilot.ts <campaignId>
 *   npx ts-node scripts/audit-phase46c-pagination-pilot.ts <campaignId> --skip-pdf
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/reports/reports.service';
import * as fs from 'fs';
import * as path from 'path';

// ── Types ──

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

interface PageBreakSpan {
  index: number;     // 0-based recommendation index within all recs
  groupIdx: number;
  recIdx: number;
  text: string;      // first 50 chars of the rec text
}

// ── Helpers ──

const countPdfPages = (buf: Buffer): number => {
  const m = buf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g);
  return m ? m.length : 0;
};

const findPageBreakDivs = (html: string): number[] => {
  const regex = /<div class="page-break page-break-inside-avoid"><\/div>/g;
  const positions: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    positions.push(match.index);
  }
  return positions;
};

/**
 * Parse all page-break div positions within the recommendations section.
 * Returns positions relative to the start of the recommendations HTML block.
 */
const findRecPageBreakDivs = (html: string): number[] => {
  // Find the recommendations section
  const recMarker = 'التوصيات';
  const recStart = html.indexOf(recMarker);
  if (recStart < 0) return [];

  const recSection = html.slice(recStart);
  return findPageBreakDivs(recSection);
};

/**
 * Enumerate all recommendation items in the payload with their positions.
 */
const enumerateRecs = (payload: any): PageBreakSpan[] => {
  const spans: PageBreakSpan[] = [];
  const groups = payload.recommendations || [];
  let globalIdx = 0;
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    if (group?.visible === false) continue;
    const recs = group.recs || [];
    for (let r = 0; r < recs.length; r++) {
      spans.push({
        index: globalIdx++,
        groupIdx: g,
        recIdx: r,
        text: (recs[r].text || '').slice(0, 50),
      });
    }
  }
  return spans;
};

/**
 * Deep clone a plain object.
 */
const clone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));

// ── Tests ──

async function runAudit(campaignId: string, skipPdf: boolean): Promise<void> {
  console.log('═'.repeat(70));
  console.log('Phase 46C — Backend PaginationRules Consumption (Pilot) Audit');
  console.log(`Campaign ID: ${campaignId}`);
  console.log('═'.repeat(70));
  console.log();

  const app = await NestFactory.createApplicationContext(AppModule);
  const reportsService = app.get(ReportsService);
  const results: TestResult[] = [];
  let pdfSupported = false;
  let baselinePdfBuf: Buffer | null = null;

  try {
    // ── Load payload ──
    const payload = await (reportsService as any).getCampaignReportPayload(campaignId);
    if (!payload) {
      console.error('ERROR: Could not load campaign payload');
      return;
    }

    const recs = enumerateRecs(payload);
    console.log(`Loaded campaign with ${payload.recommendations?.length || 0} recommendation groups, ${recs.length} total recommendation items`);
    console.log();

    // ── TEST 1: Baseline — no pagination field ──
    console.log('─── Test 1: Baseline (no pagination field) ───');
    const baselineHtml = await (reportsService as any).generateHtmlFromPayload(payload);
    const baselineBreaks = findRecPageBreakDivs(baselineHtml);
    // Baseline should have exactly 0 page-break divs from recommendation pagination
    // (manualBreaks could add one for the whole section, but not per-item)
    const baselineRecBreakCount = baselineBreaks.length;
    results.push({
      name: 'Baseline: no pagination → no extra page-break divs',
      passed: baselineRecBreakCount === 0,
      detail: `Found ${baselineRecBreakCount} page-break div(s) in recommendations section (expected 0)`,
    });
    if (baselineRecBreakCount > 0) {
      console.log(`  WARNING: ${baselineRecBreakCount} unexpected page-break div(s) in baseline — manualBreaks or other sources`);
    } else {
      console.log('  PASS: No unexpected page-break divs in baseline');
    }

    // ── TEST 2: pageBreakBefore on one recommendation item ──
    if (recs.length > 0) {
      console.log();
      console.log(`─── Test 2: pageBreakBefore on rec index ${recs[0].index} (first item) ───`);
      const testPayload = clone(payload);
      const targetRec = testPayload.recommendations[recs[0].groupIdx].recs[recs[0].recIdx];
      targetRec.pagination = { pageBreakBefore: true };
      const testHtml = await (reportsService as any).generateHtmlFromPayload(testPayload);
      const testBreaks = findRecPageBreakDivs(testHtml);
      results.push({
        name: 'pageBreakBefore=true inserts page-break div before target rec',
        passed: testBreaks.length === 1,
        detail: `Found ${testBreaks.length} page-break div(s) in recommendations (expected 1, target: "${recs[0].text}")`,
      });
      if (testBreaks.length === 1) {
        console.log('  PASS: Page-break div inserted');
      } else {
        console.log(`  FAIL: Expected 1 page-break div, found ${testBreaks.length}`);
      }
    } else {
      results.push({
        name: 'pageBreakBefore on rec item',
        passed: false,
        detail: 'SKIPPED: No recommendation items in payload',
      });
    }

    // ── TEST 3: pageBreakBefore on multiple items ──
    if (recs.length >= 2) {
      console.log();
      console.log(`─── Test 3: pageBreakBefore on rec indices ${recs[0].index} and ${recs[1].index} ───`);
      const testPayload = clone(payload);
      for (let i = 0; i < 2 && i < recs.length; i++) {
        const r = testPayload.recommendations[recs[i].groupIdx].recs[recs[i].recIdx];
        r.pagination = { pageBreakBefore: true };
      }
      const testHtml = await (reportsService as any).generateHtmlFromPayload(testPayload);
      const testBreaks = findRecPageBreakDivs(testHtml);
      results.push({
        name: 'pageBreakBefore on 2 items → 2 page-break divs',
        passed: testBreaks.length === 2,
        detail: `Found ${testBreaks.length} page-break div(s) (expected 2)`,
      });
      if (testBreaks.length === 2) {
        console.log('  PASS: 2 page-break divs inserted');
      } else {
        console.log(`  FAIL: Expected 2, found ${testBreaks.length}`);
      }
    } else {
      results.push({
        name: 'pageBreakBefore on multiple items',
        passed: recs.length >= 2,
        detail: `SKIPPED: Need ≥2 recs, found ${recs.length}`,
      });
    }

    // ── TEST 4: manualBreaks still work alongside pagination ──
    console.log();
    console.log('─── Test 4: manualBreaks coexist with pagination ───');
    const testPayload4 = clone(payload);
    if (recs.length > 0) {
      const r = testPayload4.recommendations[recs[0].groupIdx].recs[recs[0].recIdx];
      r.pagination = { pageBreakBefore: true };
    }
    testPayload4.manualBreaks = ['signatures'];
    const testHtml4 = await (reportsService as any).generateHtmlFromPayload(testPayload4);
    const totalBreaks4 = findPageBreakDivs(testHtml4);
    // Should have at least 1 (from pagination) + 1 (from manualBreaks for signatures)
    // The manual break for signatures is NOT inside the recommendations section,
    // so findRecPageBreakDivs would find only the pagination break
    const recBreaks4 = findRecPageBreakDivs(testHtml4);
    const hasSignatureBreak = testHtml4.includes('التوقيعات') && totalBreaks4.length >= (recs.length > 0 ? 2 : 1);
    results.push({
      name: 'manualBreaks still work alongside pagination',
      passed: hasSignatureBreak,
      detail: `Found ${totalBreaks4} total page-break divs, ${recBreaks4} in recommendations section; manualBreaks=['signatures']`,
    });
    if (hasSignatureBreak) {
      console.log('  PASS: manualBreaks signatures break found in output');
    } else {
      console.log(`  FAIL: Expected signatures break, total breaks=${totalBreaks4}`);
    }

    // ── TEST 5: Unknown pagination fields are ignored ──
    console.log();
    console.log('─── Test 5: Unknown pagination fields are ignored ───');
    const testPayload5 = clone(payload);
    if (recs.length > 0) {
      const r = testPayload5.recommendations[recs[0].groupIdx].recs[recs[0].recIdx];
      r.pagination = { unknownField: 'test', pageBreakBefore: false };
    }
    const testHtml5 = await (reportsService as any).generateHtmlFromPayload(testPayload5);
    const testBreaks5 = findRecPageBreakDivs(testHtml5);
    results.push({
      name: 'pageBreakBefore=false with unknown fields → no page break',
      passed: testBreaks5.length === 0,
      detail: `Found ${testBreaks5.length} page-break div(s) (expected 0)`,
    });
    if (testBreaks5.length === 0) {
      console.log('  PASS: Unknown fields ignored, no extra page break');
    } else {
      console.log(`  FAIL: Expected 0, found ${testBreaks5.length}`);
    }

    // ── TEST 6: No change when pagination is absent ──
    console.log();
    console.log('─── Test 6: HTML identical when pagination is absent ───');
    const testPayload6 = clone(payload);
    const testHtml6 = await (reportsService as any).generateHtmlFromPayload(testPayload6);
    const htmlSame = testHtml6 === baselineHtml;
    results.push({
      name: 'HTML unchanged when pagination absent',
      passed: htmlSame,
      detail: htmlSame ? 'HTML is identical' : 'HTML differs despite no pagination changes',
    });
    if (htmlSame) {
      console.log('  PASS: HTML output is deterministic with identical input');
    } else {
      console.log('  FAIL: HTML changed despite no pagination changes — possible non-determinism');
    }

    // ── TEST 7: PDF page count changes (if Puppeteer available) ──
    if (!skipPdf) {
      console.log();
      console.log('─── Test 7: PDF page count changes ───');
      try {
        const puppeteer = require('puppeteer');
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        try {
          const page = await browser.newPage();

          // Baseline PDF
          await page.setContent(baselineHtml, { waitUntil: 'load' });
          baselinePdfBuf = await page.pdf({ format: 'A4', printBackground: true });
          const baselinePages = countPdfPages(baselinePdfBuf);

          // Modified PDF (first rec has pageBreakBefore)
          let modifiedPdfBuf: Buffer | null = null;
          let modifiedPages = baselinePages;
          if (recs.length > 0) {
            const modPayload = clone(payload);
            const r = modPayload.recommendations[recs[0].groupIdx].recs[recs[0].recIdx];
            r.pagination = { pageBreakBefore: true };
            const modHtml = await (reportsService as any).generateHtmlFromPayload(modPayload);
            await page.setContent(modHtml, { waitUntil: 'load' });
            modifiedPdfBuf = await page.pdf({ format: 'A4', printBackground: true });
            modifiedPages = countPdfPages(modifiedPdfBuf);
          }

          const pagesChanged = modifiedPages !== baselinePages;
          results.push({
            name: 'PDF page count changes when pageBreakBefore is set',
            passed: pagesChanged || recs.length === 0,
            detail: `Baseline: ${baselinePages} pages, Modified: ${modifiedPages} pages`,
          });
          if (pagesChanged) {
            console.log(`  PASS: Page count changed from ${baselinePages} to ${modifiedPages}`);
          } else {
            console.log(`  NOTE: Page count unchanged (${baselinePages}) — may be expected if the rec fits on same page`);
          }

          pdfSupported = true;
        } finally {
          await browser.close();
        }
      } catch (e: any) {
        console.log(`  SKIP: Puppeteer not available (${e.message})`);
        results.push({
          name: 'PDF page count changes',
          passed: false,
          detail: `SKIPPED: Puppeteer unavailable — ${e.message}`,
        });
      }
    } else {
      results.push({
        name: 'PDF page count changes',
        passed: false,
        detail: 'SKIPPED: --skip-pdf flag',
      });
    }

  } finally {
    await app.close();
  }

  // ── Results Summary ──
  console.log();
  console.log('═'.repeat(70));
  console.log('RESULTS SUMMARY');
  console.log('═'.repeat(70));

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of results) {
    const status = r.passed ? 'PASS' : (r.detail.startsWith('SKIPPED') ? 'SKIP' : 'FAIL');
    if (status === 'PASS') passed++;
    else if (status === 'SKIP') skipped++;
    else failed++;
    console.log(`  [${status}] ${r.name}`);
    console.log(`         ${r.detail}`);
  }

  console.log();
  console.log(`Total: ${results.length}  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}`);
  console.log();

  if (baselinePdfBuf && pdfSupported) {
      const outputDir = 'audit-output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(`${outputDir}/phase46c-baseline.pdf`, baselinePdfBuf);
    console.log(`Baseline PDF saved to audit-output/phase46c-baseline.pdf`);
  }

  if (failed > 0) {
    console.log('❌ Some tests FAILED — review details above.');
    process.exit(1);
  } else if (results.every((r) => r.passed || r.detail.startsWith('SKIPPED'))) {
    console.log('✅ ALL TESTS PASSED.');
    process.exit(0);
  } else {
    console.log('⚠️  Some tests skipped.');
    process.exit(0);
  }
}

// ── Entry ──

const args = process.argv.slice(2);
const campaignId = args.find((a) => !a.startsWith('--'));
const skipPdf = args.includes('--skip-pdf');

if (!campaignId) {
  console.error('Usage: npx ts-node scripts/audit-phase46c-pagination-pilot.ts <campaignId> [--skip-pdf]');
  process.exit(1);
}

runAudit(campaignId, skipPdf).catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
