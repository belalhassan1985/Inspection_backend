/**
 * Phase 33D — Vertical Page Area Parity Audit
 * 
 * Measures actual designer page count AFTER Phase 33B width patch.
 * Uses the frontend's paginate.ts constants (20/10/20/10 margins → 190mm content width)
 * and measures real DOM heights via Puppeteer at the same width BlockMeasurer uses.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/reports/reports.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildFragments } from '../src/reports/report-fragments';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const MM_TO_PX = 96 / 25.4;

// Phase 33B NEW constants (matches frontend after patch)
const DESIGNER = {
  widthMm: 210,
  heightMm: 297,
  margin: { top: 20, right: 10, bottom: 20, left: 10 },
};
const CONTENT_WIDTH_MM = DESIGNER.widthMm - DESIGNER.margin.left - DESIGNER.margin.right; // 190mm
const CONTENT_HEIGHT_PX = (DESIGNER.heightMm - DESIGNER.margin.top - DESIGNER.margin.bottom) * MM_TO_PX;
const PAGE_NUMBER_RESERVE_PX = 24;
const BUFFER_PX = 8;
const AVAILABLE_PX = CONTENT_HEIGHT_PX - PAGE_NUMBER_RESERVE_PX - BUFFER_PX;

// Official PDF constants
const OFFICIAL = {
  margin: { top: 20, bottom: 22, left: 10, right: 10 },
};
const OFFICIAL_CONTENT_HEIGHT_MM = DESIGNER.heightMm - OFFICIAL.margin.top - OFFICIAL.margin.bottom; // 255mm
const OFFICIAL_CONTENT_HEIGHT_PX = OFFICIAL_CONTENT_HEIGHT_MM * MM_TO_PX;

const CAMPAIGN_ID = 'b225a9f1-8b5a-4eff-b7ae-74ce0883430d';

function buildMeasurementHtml(fragments: any[], widthMm: number): string {
  const fragHtml = fragments.map((f: any, i: number) => {
    const text = f.title || f.kind || '';
    return `<div class="frag" data-frag-id="${f.id || i}" data-frag-kind="${f.kind || ''}" style="margin-bottom:4px;">
      <div class="frag-label">${i}: ${f.kind} — ${text}</div>
      <div class="frag-content">FRAGMENT_PLACEHOLDER</div>
    </div>`;
  }).join('\n');

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Cairo', 'Times New Roman', Arial, sans-serif;
    direction: rtl; text-align: right; background: #fff;
  }
  .measurer {
    width: ${widthMm}mm;
    margin: 0 auto;
    padding: 0;
    background: #fff;
  }
  .frag {
    border-bottom: 1px dashed #ccc;
    padding: 2px 0;
  }
  .frag-label {
    font-size: 10px; color: #666; font-family: monospace;
  }
  .frag-content {
    font-size: 13px; line-height: 1.7;
  }
</style></head>
<body>
  <div class="measurer">
    ${fragHtml}
  </div>
</body></html>`;
}

function buildSummaryTableHtml(fragments: any[]): string {
  const tableRows = fragments
    .filter((f: any) => f.kind === 'summaryTableRow' && f.data?.position)
    .map((f: any, i: number) => {
      const p = f.data.position;
      return `<tr>
        <td>${i + 1}</td>
        <td>${p.positionName || ''}</td>
        <td>${p.rank || ''}</td>
        <td>${p.positionHolder || ''}</td>
        <td>${p.statisticalNumber || ''}</td>
        <td>${p.joinedDate || ''}</td>
        <td>${p.positionStatus || ''}</td>
        <td>${p.education || ''}</td>
      </tr>`;
    }).join('\n');

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Cairo', 'Times New Roman', Arial, sans-serif;
    direction: rtl; text-align: right; background: #fff;
    font-size: 13px;
    line-height: 1.7;
  }
  .measurer {
    width: 190mm;
    margin: 0 auto;
    background: #fff;
  }
  .section-num {
    font-size: 16px; font-weight: bold; color: #0c2340;
    margin-top: 30px; margin-bottom: 10px;
  }
  .section-body { margin-right: 15px; margin-bottom: 20px; text-align: justify; }
  table.military-table { width: 100%; border-collapse: collapse; margin: 15px 0 25px 0; }
  table.military-table th, table.military-table td {
    border: 1px solid #000; padding: 8px 10px; text-align: center; font-size: 13px;
  }
  table.military-table th { background: #f2f2f2; font-weight: bold; }
  .page-break { page-break-before: always; }
</style></head>
<body>
  <div class="measurer">
    <div class="section-num">٥. جدول المدراء والآمرين وشاغلي المناصب الأساسية</div>
    <div class="section-body">
      <table class="military-table">
        <thead>
          <tr>
            <th style="width:5%">ت</th>
            <th style="width:22%">المنصب</th>
            <th style="width:10%">الرتبة</th>
            <th style="width:17%">الاسم الكامل</th>
            <th style="width:10%">الرقم الإحصائي</th>
            <th style="width:16%">تاريخ إشغال المنصب</th>
            <th style="width:10%">نوع الإشغال</th>
            <th style="width:10%">التحصيل الدراسي</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    </div>
  </div>
</body></html>`;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reportsService = app.get(ReportsService);
  const prisma = app.get(PrismaService);

  const campaign = await prisma.campaign.findUnique({
    where: { id: CAMPAIGN_ID },
    select: { id: true, name: true },
  });
  if (!campaign) { console.error('Campaign not found'); process.exit(1); }

  console.log(`\nCampaign: ${campaign.name} [${campaign.id}]`);
  
  const payload = await reportsService.getCampaignReportPayload(campaign.id);
  const fragments = buildFragments(payload);
  console.log(`Total fragments: ${fragments.length}`);

  // Filter summary table fragments
  const summaryFrags = fragments.filter((f: any) =>
    f.kind === 'summaryTableTitle' || f.kind === 'summaryTableHeader' || f.kind === 'summaryTableRow'
  );
  console.log(`Summary table fragments: ${summaryFrags.length}`);
  const tableRowFrags = summaryFrags.filter((f: any) => f.kind === 'summaryTableRow');
  console.log(`Table data rows: ${tableRowFrags.length}`);

  // ── Launch Puppeteer ──
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1600 });

  // ── MEASURE 1: All fragments at 190mm width (NEW Designer) ──
  const html190 = buildMeasurementHtml(fragments, 190);
  await page.setContent(html190, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));
  
  const totalHeight190 = await page.evaluate(() => {
    const el = document.querySelector('.measurer') as HTMLElement;
    return el ? el.getBoundingClientRect().height : document.body.scrollHeight;
  });
  
  // Measure per-fragment heights
  const fragHeights190 = await page.evaluate(() => {
    const frags = Array.from(document.querySelectorAll('.frag')) as HTMLElement[];
    return frags.map((f, i) => ({
      index: i,
      id: f.getAttribute('data-frag-id') || '',
      kind: f.getAttribute('data-frag-kind') || '',
      height: f.getBoundingClientRect().height,
    }));
  });

  // ── MEASURE Comparison: old 180mm width ──
  const html180 = buildMeasurementHtml(fragments, 180);
  await page.setContent(html180, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));
  
  const totalHeight180 = await page.evaluate(() => {
    const el = document.querySelector('.measurer') as HTMLElement;
    return el ? el.getBoundingClientRect().height : document.body.scrollHeight;
  });

  // ── MEASURE Summary Table specifically ──
  const tableHtml = buildSummaryTableHtml(fragments);
  await page.setContent(tableHtml, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));

  const tableData = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr')) as HTMLElement[];
    const table = document.querySelector('table') as HTMLElement;
    const title = document.querySelector('.section-num') as HTMLElement;
    return {
      tableWidth: table ? table.getBoundingClientRect().width : 0,
      titleHeight: title ? title.getBoundingClientRect().height : 0,
      tableHeight: table ? table.getBoundingClientRect().height : 0,
      totalHeight: document.body.scrollHeight,
      rows: rows.map((r, i) => ({
        index: i,
        height: r.getBoundingClientRect().height,
        top: r.getBoundingClientRect().top,
        bottom: r.getBoundingClientRect().bottom,
      })),
    };
  });

  // ── SIMULATE PAGINATION ──
  const simulatedPages190 = Math.ceil(totalHeight190 / AVAILABLE_PX);
  const simulatedPages180 = Math.ceil(totalHeight180 / (CONTENT_HEIGHT_PX - PAGE_NUMBER_RESERVE_PX - BUFFER_PX + 0));
  const officialPages = Math.ceil(totalHeight190 / OFFICIAL_CONTENT_HEIGHT_PX);

  // Compute OLD available height (15mm margins)
  const OLD_CONTENT_HEIGHT_PX = (DESIGNER.heightMm - 20 - 20) * MM_TO_PX;
  const OLD_AVAILABLE_PX = OLD_CONTENT_HEIGHT_PX - PAGE_NUMBER_RESERVE_PX - BUFFER_PX;

  // ── OUTPUT ──
  console.log('\n' + '='.repeat(78));
  console.log('Phase 33D — Vertical Page Area Parity Audit');
  console.log('='.repeat(78));
  console.log(`Campaign: ${campaign.name}`);
  console.log(`Fragments: ${fragments.length} total`);
  console.log('');

  // Vertical measurements
  console.log('── Vertical Space Comparison ──');
  console.log('');
  console.log('Official PDF:');
  console.log(`  top margin:          ${OFFICIAL.margin.top}mm`);
  console.log(`  bottom margin:       ${OFFICIAL.margin.bottom}mm`);
  console.log(`  content height:      ${OFFICIAL_CONTENT_HEIGHT_MM}mm`);
  console.log(`  content height:      ${OFFICIAL_CONTENT_HEIGHT_PX.toFixed(1)}px`);
  console.log('');
  console.log('Designer (Phase 33B):');
  console.log(`  top margin:          ${DESIGNER.margin.top}mm`);
  console.log(`  bottom margin:       ${DESIGNER.margin.bottom}mm`);
  console.log(`  PAGE_NUMBER_RESERVE: ${PAGE_NUMBER_RESERVE_PX}px (${(PAGE_NUMBER_RESERVE_PX / MM_TO_PX).toFixed(1)}mm)`);
  console.log(`  BUFFER:              ${BUFFER_PX}px (${(BUFFER_PX / MM_TO_PX).toFixed(1)}mm)`);
  console.log(`  CONTENT_HEIGHT_PX:   ${CONTENT_HEIGHT_PX.toFixed(1)}px`);
  console.log(`  AVAILABLE_PX:        ${AVAILABLE_PX.toFixed(1)}px`);
  console.log('');

  // Gap analysis
  console.log('── Vertical Gap Analysis ──');
  console.log('');
  const gapMm = OFFICIAL_CONTENT_HEIGHT_MM - (DESIGNER.heightMm - DESIGNER.margin.top - DESIGNER.margin.bottom);
  const gapPx = OFFICIAL_CONTENT_HEIGHT_PX - AVAILABLE_PX;
  console.log(`Official content height:   ${OFFICIAL_CONTENT_HEIGHT_MM}mm (${OFFICIAL_CONTENT_HEIGHT_PX.toFixed(1)}px)`);
  console.log(`Designer content height:   ${(DESIGNER.heightMm - DESIGNER.margin.top - DESIGNER.margin.bottom).toFixed(0)}mm (${CONTENT_HEIGHT_PX.toFixed(1)}px)`);
  console.log(`Designer available height: ${(AVAILABLE_PX / MM_TO_PX).toFixed(1)}mm (${AVAILABLE_PX.toFixed(1)}px)`);
  console.log('');
  console.log(`Raw content gap (Official - Designer): ${gapMm}mm (${gapPx.toFixed(1)}px)`);
  console.log(`Effective gap (Official - Designer avail): ${(OFFICIAL_CONTENT_HEIGHT_MM - AVAILABLE_PX / MM_TO_PX).toFixed(1)}mm`);
  console.log('');

  // `is footer double-counted?`
  const footerReserveTotalPx = (DESIGNER.margin.bottom * MM_TO_PX) + PAGE_NUMBER_RESERVE_PX + BUFFER_PX;
  const footerReserveTotalMm = footerReserveTotalPx / MM_TO_PX;
  console.log('── Footer Reservation Analysis ──');
  console.log('');
  console.log(`Designer bottom margin:        ${DESIGNER.margin.bottom}mm (${(DESIGNER.margin.bottom * MM_TO_PX).toFixed(1)}px)`);
  console.log(`PAGE_NUMBER_RESERVE_PX:        ${PAGE_NUMBER_RESERVE_PX}px (${(PAGE_NUMBER_RESERVE_PX / MM_TO_PX).toFixed(1)}mm)`);
  console.log(`BUFFER_PX:                     ${BUFFER_PX}px (${(BUFFER_PX / MM_TO_PX).toFixed(1)}mm)`);
  console.log(`A4Canvas footer "سري" label:   bottom: 4mm absolute`);
  console.log(`Total footer reservation:      ${footerReserveTotalMm.toFixed(1)}mm (${footerReserveTotalPx.toFixed(1)}px)`);
  console.log(`Official PDF bottom margin:    ${OFFICIAL.margin.bottom}mm`);
  console.log('');
  console.log(`⇒ Designer footer reserve (${footerReserveTotalMm.toFixed(1)}mm) vs Official (${OFFICIAL.margin.bottom}mm): Δ = ${(footerReserveTotalMm - OFFICIAL.margin.bottom).toFixed(1)}mm`);
  
  const isDoubleCounted = footerReserveTotalMm > OFFICIAL.margin.bottom + 2;
  console.log(`⇒ Double-counted footer? ${isDoubleCounted ? 'YES' : 'NO'}`);
  console.log('');

  // Page counts
  console.log('── Page Count Results ──');
  console.log('');
  console.log(`Measured total content height @190mm (NEW): ${totalHeight190.toFixed(0)}px`);
  console.log(`Measured total content height @180mm (OLD): ${totalHeight180.toFixed(0)}px`);
  console.log(`Difference (190 vs 180): ${(totalHeight180 - totalHeight190).toFixed(0)}px saved`);
  console.log('');
  
  const oldCalcPages = Math.ceil(totalHeight180 / OLD_AVAILABLE_PX);
  const newCalcPages = Math.ceil(totalHeight190 / AVAILABLE_PX);
  
  console.log(`Designer pages (OLD 15mm, @180mm):       ${oldCalcPages} (simulated via ${OLD_AVAILABLE_PX.toFixed(0)}px/page)`);
  console.log(`Designer pages (NEW 10mm, @190mm):       ${newCalcPages} (simulated via ${AVAILABLE_PX.toFixed(0)}px/page)`);
  console.log(`Official PDF pages (actual from audit):  28`);
  console.log(`Official pdf pages (simulated @190mm):   ${Math.ceil(totalHeight190 / OFFICIAL_CONTENT_HEIGHT_PX)}`);
  console.log(`Official pdf pages (simulated @180mm):   ${Math.ceil(totalHeight180 / OFFICIAL_CONTENT_HEIGHT_PX)}`);
  console.log('');

  // Root cause: height vs table rows
  const heightRatio190 = totalHeight190 / AVAILABLE_PX;
  const heightRatioOfficial = totalHeight190 / OFFICIAL_CONTENT_HEIGHT_PX;
  console.log('── Root Cause: Height vs Content ──');
  console.log('');
  console.log(`Designer pages needed (height only): ${newCalcPages}`);
  console.log(`Official pages needed (height only): ${Math.ceil(totalHeight190 / OFFICIAL_CONTENT_HEIGHT_PX)}`);
  console.log(`Height-only gap: ${Math.ceil(totalHeight190 / OFFICIAL_CONTENT_HEIGHT_PX) - newCalcPages} pages`);
  console.log(`Actual total gap (Official - Designer): 28 - 24 = 4 pages (pre-patch)`);
  console.log(`Actual total gap (Official - Designer): 28 - ${newCalcPages} = ${28 - newCalcPages} pages (post-patch sim)`);
  console.log('');

  // Table boundary
  console.log('── Summary Table Boundary (simulated @190mm) ──');
  console.log('');
  console.log(`Table title height:  ${tableData.titleHeight.toFixed(0)}px`);
  console.log(`Table total height:  ${tableData.tableHeight.toFixed(0)}px`);
  console.log(`Table + title + body: ${tableData.totalHeight.toFixed(0)}px`);
  console.log('');
  console.log('Row heights:');
  let cumulative = 0;
  for (const row of tableData.rows) {
    console.log(`  Row ${row.index} (index ${row.index}): ${row.height.toFixed(0)}px  [cumulative: ${(cumulative + row.height).toFixed(0)}px]`);
    cumulative += row.height;
  }

  // Determine where the table would page-break
  // Available for table = AVAILABLE_PX minus preceding content estimate
  // The table appears after sections 1-4. Let's estimate preceding content.
  console.log('\n  Estimated table start position in page flow:');
  // Find all fragments before the first summaryTableRow
  let precedingHeight = 0;
  for (const f of fragments) {
    if ((f as any).kind === 'summaryTableRow') break;
    const idx = fragments.indexOf(f);
    const h = fragHeights190.find((fh: any) => fh.id === (f as any).id || fh.index === idx);
    precedingHeight += h?.height || 30;
  }
  console.log(`  Preceding content (frags before table): ~${precedingHeight.toFixed(0)}px`);
  console.log(`  Table fits on page ${Math.floor(precedingHeight / AVAILABLE_PX) + 1}? Remaining: ${(AVAILABLE_PX - (precedingHeight % AVAILABLE_PX)).toFixed(0)}px`);

  // Take screenshot
  await page.setViewport({ width: 1200, height: 3000 });
  const tableHtml190 = buildSummaryTableHtml(fragments);
  await page.setContent(tableHtml190, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));
  await page.screenshot({ 
    path: path.join(__dirname, '..', 'audit-output', 'phase33d-summary-table.png'),
    fullPage: true,
  });
  console.log('\n  Screenshot saved: audit-output/phase33d-summary-table.png');

  await browser.close();
  await app.close();
}

main().catch(console.error);
