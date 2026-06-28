/**
 * Phase 33D v2 — Accurate Designer Simulation After Width Patch
 * 
 * Uses the backend bridge (buildFragments) + experimental renderer to produce
 * a faithful HTML rendering of the campaign content, then overrides the CSS
 * to match the Phase 33B designer margins (20/10/20/10 mm) and measures the
 * actual content height at 190mm content width.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/reports/reports.service';
import { PageDocumentBridgeService } from '../src/reports/page-document-bridge.service';
import { renderExperimentalPageDocumentHtmlWithVerification } from '../src/reports/experimental-page-document-renderer';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const MM_TO_PX = 96 / 25.4;

// Phase 33B constants
const CONTENT_WIDTH_MM = 190;
const CONTENT_HEIGHT_PX = (297 - 20 - 20) * MM_TO_PX;
const PAGE_NUMBER_RESERVE_PX = 24;
const BUFFER_PX = 8;
const AVAILABLE_PX = CONTENT_HEIGHT_PX - PAGE_NUMBER_RESERVE_PX - BUFFER_PX;

// Official PDF constants
const OFFICIAL_TOP_MM = 20;
const OFFICIAL_BOTTOM_MM = 22;
const OFFICIAL_CONTENT_H_MM = 297 - OFFICIAL_TOP_MM - OFFICIAL_BOTTOM_MM;
const OFFICIAL_CONTENT_H_PX = OFFICIAL_CONTENT_H_MM * MM_TO_PX;

// OLD Designer constants (Phase 32B)
const OLD_CONTENT_WIDTH_MM = 180;
const OLD_AVAILABLE_PX = CONTENT_HEIGHT_PX - PAGE_NUMBER_RESERVE_PX - BUFFER_PX;

const CAMPAIGN_ID = 'b225a9f1-8b5a-4eff-b7ae-74ce0883430d';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reportsService = app.get(ReportsService);
  const bridge = app.get(PageDocumentBridgeService);

  console.log('='.repeat(78));
  console.log('Phase 33D v2 — Accurate Designer Simulation After Width Patch');
  console.log('='.repeat(78));
  console.log(`Campaign: ${CAMPAIGN_ID}`);
  console.log('');

  // Get payload and build PageDocument via bridge
  const payload = await reportsService.getCampaignReportPayload(CAMPAIGN_ID);
  const pageDocument = await bridge.buildPageDocumentFromCampaign(CAMPAIGN_ID);
  console.log(`Fragments from bridge: ${pageDocument.fragments?.length || 0}`);
  console.log(`Bridge layout margins:`, JSON.stringify(pageDocument.layout?.marginsMm));

  // Generate experimental HTML (renderer uses own hardcoded margins internally)
  const result = renderExperimentalPageDocumentHtmlWithVerification(pageDocument, {
    renderMode: 'strictPages',
    pageNumbers: true,
    returnDiagnostics: true,
  });
  const expHtml = result.html;

  // ── PATCH the HTML to use Phase 33B margins (20/10/20/10) ──
  // The renderer generates `.experimental-page` with fixed padding.
  // We replace the page size/padding to match the new designer.
  const patchedHtml190 = expHtml
    // Fix page width to 190mm content width (210mm page, 10mm each side)
    .replace(/\.experimental-page\s*\{[^}]*width:\s*\d+mm[^}]*\}/s,
      `.experimental-page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm 10mm 20mm 10mm; background: #ffffff; position: relative; }`)
    // Remove internal borders/padding that add extra height not present in designer
    .replace(/\.fragment\s*\{[^}]*\}/g, '.fragment { }')
    // Make sure all width-constrained elements match 190mm content area
    .replace(/width:\s*100%/g, 'width: 100%')
    // Ensure body has no extra margins
    .replace(/body\s*\{/g, 'body { margin: 0; padding: 0; background: #fff;');

  // For OLD measurement (180mm content width)
  const patchedHtml180 = expHtml
    .replace(/\.experimental-page\s*\{[^}]*width:\s*\d+mm[^}]*\}/s,
      `.experimental-page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm 15mm 20mm 15mm; background: #ffffff; position: relative; }`)
    .replace(/\.fragment\s*\{[^}]*\}/g, '.fragment { }')
    .replace(/body\s*\{/g, 'body { margin: 0; padding: 0; background: #fff;');

  // Save patched HTML for reference
  fs.writeFileSync(path.join(__dirname, '..', 'audit-output', 'phase33d-patched-190.html'), patchedHtml190);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1600 });

  const officialHtml = reportsService.generateHtmlFromPayload(payload);

  // ── 1. Patched @190mm (Phase 33B) content height ──
  await page.setContent(patchedHtml190, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));
  const totalH190 = await page.evaluate(() => document.body.scrollHeight);

  // ── 2. Patched @180mm (Phase 32B old) content height ──
  await page.setContent(patchedHtml180, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));
  const totalH180 = await page.evaluate(() => document.body.scrollHeight);

  // ── 3. Official HTML content height + PDF page count ──
  await page.setContent(officialHtml, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));
  const totalHOff = await page.evaluate(() => document.body.scrollHeight);
  
  // Official PDF with real Puppeteer margins
  const offPdfBuf = Buffer.from(await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '22mm', left: '10mm', right: '10mm' } }));
  const offPdfPages = (offPdfBuf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g) || []).length;

  // ── 4. Patched @190mm as PDF (designer-matched margins) ──
  await page.setContent(patchedHtml190, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));
  const exp190PdfBuf = Buffer.from(await page.pdf({ format: 'A4', printBackground: true, margin: { top: '20mm', bottom: '20mm', left: '10mm', right: '10mm' } }));
  const exp190PdfPages = (exp190PdfBuf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g) || []).length;

  // ── 5. Page count estimates from DOM ──
  const designerPages190 = Math.ceil(totalH190 / AVAILABLE_PX);
  const designerPages180 = Math.ceil(totalH180 / OLD_AVAILABLE_PX);
  const officialDomPages = Math.ceil(totalHOff / OFFICIAL_CONTENT_H_PX);

  // ── 6. Summary Table Data (from 190mm page) ──
  const tableData = await page.evaluate(() => {
    // Find all summary table elements
    const allDivs = Array.from(document.querySelectorAll('div')) as HTMLElement[];
    const titles = allDivs.filter(d => d.textContent?.includes('جدول المدراء'));
    const tables = Array.from(document.querySelectorAll('.st-table, table')) as HTMLElement[];
    
    // Look for table rows specifically in summary tables
    const allRows = Array.from(document.querySelectorAll('.st-table tbody tr, table.military-table tbody tr')) as HTMLElement[];
    const allHeaders = Array.from(document.querySelectorAll('.st-table thead tr, table.military-table thead tr')) as HTMLElement[];

    return {
      totalTables: tables.length,
      totalRows: allRows.length,
      totalHeaders: allHeaders.length,
      rows: allRows.map((r, i) => ({
        index: i,
        height: r.getBoundingClientRect().height,
        top: Math.round(r.getBoundingClientRect().top),
        bottom: Math.round(r.getBoundingClientRect().bottom),
        text: (r.textContent || '').substring(0, 60),
      })),
      headers: allHeaders.map((h, i) => ({
        index: i,
        height: h.getBoundingClientRect().height,
        top: Math.round(h.getBoundingClientRect().top),
        bottom: Math.round(h.getBoundingClientRect().bottom),
      })),
      titleElements: titles.map(t => ({
        height: t.getBoundingClientRect().height,
        text: (t.textContent || '').substring(0, 40),
      })),
    };
  });

  // ── OUTPUT ──
  console.log('\n── Measured Content Heights ──');
  console.log(`  Official HTML (total body scroll): ${totalHOff.toFixed(0)}px`);
  console.log(`  Patched @190mm (Phase 33B new):    ${totalH190.toFixed(0)}px`);
  console.log(`  Patched @180mm (Phase 32B old):    ${totalH180.toFixed(0)}px`);
  console.log(`  Width patch savings (180→190):     ${(totalH180 - totalH190).toFixed(0)}px`);
  console.log('');

  console.log('── Vertical Space Constants ──');
  console.log(`  Official:  top=${OFFICIAL_TOP_MM}mm  bottom=${OFFICIAL_BOTTOM_MM}mm  content=${OFFICIAL_CONTENT_H_MM}mm  content_px=${OFFICIAL_CONTENT_H_PX.toFixed(1)}px`);
  console.log(`  Designer:  top=20mm  bottom=20mm  content_raw=${(297-40).toFixed(0)}mm  content_px=${CONTENT_HEIGHT_PX.toFixed(1)}px  reserve=${PAGE_NUMBER_RESERVE_PX}px  buffer=${BUFFER_PX}px  available=${AVAILABLE_PX.toFixed(1)}px`);
  console.log('');

  console.log('── Page Count Results ──');
  console.log(`  Official PDF (20/22 margins):             ${offPdfPages}`);
  console.log(`  Experimental @190mm PDF (20/20 margins):  ${exp190PdfPages}`);
  console.log(`  Designer estimate @190mm (DOM/AVAIL):     ${designerPages190}`);
  console.log(`  Designer estimate @180mm (DOM/OLD):       ${designerPages180}`);
  console.log(`  Official DOM estimate (DOM/OFF_CONTENT):  ${officialDomPages}`);
  console.log(`  Phase32b audit JSON reported:             24`);
  console.log('');

  console.log('── Gap Analysis ──');
  console.log(`  Official PDF - Designer @190mm est: ${offPdfPages - designerPages190} pages`);
  console.log(`  Official PDF - Experimental PDF:    ${offPdfPages - exp190PdfPages} pages`);
  console.log('');

  const rawGapPx = OFFICIAL_CONTENT_H_PX - AVAILABLE_PX;
  console.log('── Vertical Per-Page Gap ──');
  console.log(`  Official content height:  ${OFFICIAL_CONTENT_H_PX.toFixed(1)}px`);
  console.log(`  Designer available:       ${AVAILABLE_PX.toFixed(1)}px`);
  console.log(`  Gap per page:             ${rawGapPx.toFixed(1)}px (${(rawGapPx / MM_TO_PX).toFixed(1)}mm)`);
  console.log(`  Gap × ${designerPages190} pages:       ${(rawGapPx * designerPages190).toFixed(0)}px = ${((rawGapPx * designerPages190) / MM_TO_PX / OFFICIAL_CONTENT_H_MM * OFFICIAL_CONTENT_H_MM).toFixed(0)}mm`);
  console.log('');

  // Check double-counted footer
  const footerReserveTotalMm = 20 + (PAGE_NUMBER_RESERVE_PX + BUFFER_PX) / MM_TO_PX + 4;
  console.log('── Footer Double-Count Check ──');
  console.log(`  bottom margin:          20mm`);
  console.log(`  PAGE_NUMBER_RESERVE:    ${(PAGE_NUMBER_RESERVE_PX / MM_TO_PX).toFixed(1)}mm`);
  console.log(`  BUFFER:                 ${(BUFFER_PX / MM_TO_PX).toFixed(1)}mm`);
  console.log(`  A4Canvas absolute:      4mm`);
  console.log(`  Total footer concept:   ${footerReserveTotalMm.toFixed(1)}mm`);
  console.log(`  Official bottom:        22mm`);
  console.log(`  Double-counted?         ${footerReserveTotalMm > 24 ? 'YES' : 'Partial (margin + reserve overlap)'}`);
  console.log('');

  // Summary table analysis
  console.log('── Summary Table Row Heights (@190mm) ──');
  if (tableData.rows.length > 0) {
    console.log(`  Found ${tableData.rows.length} data rows in tables`);
    let cumulative = 0;
    const rowsPerPage = Math.floor((AVAILABLE_PX - 100) / 60); // ~100px for title, ~60px per row
    
    for (const row of tableData.rows.slice(0, 20)) {
      console.log(`  Row ${row.index}: top=${row.top} bottom=${row.bottom} height=${row.height}px  "${row.text}"`);
      cumulative += row.height;
    }
    
    // Find where rows page-break
    const headerHeight = tableData.headers.length > 0 ? tableData.headers[0].height : 60;
    const titleHeight = tableData.titleElements.length > 0 ? tableData.titleElements[0].height : 30;
    const tableOverhead = titleHeight + headerHeight + 20; // 20px for margins
    
    console.log(`\n  Table overhead (title + header + margin): ~${tableOverhead}px`);
    console.log(`  Available for rows per page: ${(AVAILABLE_PX - tableOverhead).toFixed(0)}px`);
    console.log(`  Rows fitting first page: ~${Math.floor((AVAILABLE_PX - tableOverhead) / 62)} (at ~62px/row)`);
  } else {
    console.log('  No table rows found in experimental output.');
    console.log('  (Backend uses kind="summaryTables" not individual row fragments)');
  }

  // Take screenshot
  await page.setContent(patchedHtml190, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));
  await page.screenshot({
    path: path.join(__dirname, '..', 'audit-output', 'phase33d-full-page.png'),
    fullPage: false, captureBeyondViewport: true,
  });
  console.log('\n  Screenshot: audit-output/phase33d-full-page.png');

  await browser.close();
  await app.close();
}

main().catch(console.error);
