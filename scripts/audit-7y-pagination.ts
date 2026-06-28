/**
 * Phase 7Y — Pagination Fidelity Audit (analysis only, NO fixes).
 *
 * Measures WHY the experimental PDF produces more pages than the official PDF.
 * Read-only: builds the PageDocument via the existing bridge, renders via the
 * existing renderer, and measures real DOM heights with Puppeteer. A CSS-strip
 * EXPERIMENT patches only the generated HTML string (never the renderer file)
 * to isolate per-fragment chrome cost. No production code is modified.
 *
 * Usage: npx ts-node scripts/audit-7y-pagination.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/reports/reports.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PageDocumentBridgeService } from '../src/reports/page-document-bridge.service';
import { renderExperimentalPageDocumentHtmlWithVerification } from '../src/reports/experimental-page-document-renderer';
import puppeteer from 'puppeteer';

const MM_TO_PX = 96 / 25.4;
const A4_PRINT_PX = 297 * MM_TO_PX;           // ≈1122.5 (full A4 height, margin 0)
const A4_CONTENT_PX = (297 - 40) * MM_TO_PX;  // ≈971.3 (inside 20mm top/bottom padding)

// CSS override that neutralizes per-fragment + per-page chrome (chrome = borders,
// radius, padding, inter-fragment margins, page border). Injected into the HTML
// string only, for the experiment variant.
const STRIP_CSS = `<style>
.fragment{border:0 !important;border-radius:0 !important;margin:0 0 2px !important;padding:0 !important;break-inside:auto !important;}
.experimental-page{border:0 !important;margin:0 auto !important;}
body{background:#fff !important;}
</style>`;

function countPdfPages(buf: Buffer): number {
  const m = buf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g);
  return m ? m.length : 0;
}

async function measureDom(page: any, html: string) {
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));
  return page.evaluate(() => {
    const frags = Array.from(document.querySelectorAll('.experimental-page > .fragment')) as HTMLElement[];
    const heights = frags.map((f) => f.getBoundingClientRect().height);
    const sec = document.querySelector('.experimental-page') as HTMLElement | null;
    return {
      bodyHeight: document.body.scrollHeight,
      sectionHeight: sec ? sec.getBoundingClientRect().height : document.body.scrollHeight,
      fragCount: frags.length,
      sumFrag: heights.reduce((a, b) => a + b, 0),
      maxFrag: heights.length ? Math.max(...heights) : 0,
      heights,
    };
  });
}

async function pdfPages(page: any, html: string): Promise<number> {
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));
  const buf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' } });
  return countPdfPages(Buffer.from(buf));
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reportsService = app.get(ReportsService);
  const bridge = app.get(PageDocumentBridgeService);
  const prisma = app.get(PrismaService);
  const campaigns = await prisma.campaign.findMany({ select: { id: true, name: true } });

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 1400 });

  console.log('='.repeat(78));
  console.log('Phase 7Y — Pagination Fidelity Audit');
  console.log(`A4 print height = ${A4_PRINT_PX.toFixed(0)}px | A4 content (inside 20mm pad) = ${A4_CONTENT_PX.toFixed(0)}px`);
  console.log('='.repeat(78));

  const summary: any[] = [];

  for (const c of campaigns) {
    const payload = await reportsService.getCampaignReportPayload(c.id);
    const officialHtml = reportsService.generateHtmlFromPayload(payload);
    const pageDocument = await bridge.buildPageDocumentFromCampaign(c.id);
    const expHtml = renderExperimentalPageDocumentHtmlWithVerification(pageDocument, { renderMode: 'strictPages', pageNumbers: true }).html;
    const strippedHtml = expHtml.replace('</head>', `${STRIP_CSS}</head>`);

    // DOM density
    const expDom = await measureDom(page, expHtml);
    const stripDom = await measureDom(page, strippedHtml);
    const offDom = await measureDom(page, officialHtml);

    // PDF page counts (authoritative)
    const offPdf = await pdfPages(page, officialHtml);
    const expPdf = await pdfPages(page, expHtml);
    const stripPdf = await pdfPages(page, strippedHtml);

    const fragCount = expDom.fragCount;
    const avgFrag = fragCount ? expDom.sumFrag / fragCount : 0;
    const avgFragStrip = fragCount ? stripDom.sumFrag / fragCount : 0;
    const chromePerFrag = avgFrag - avgFragStrip;
    const chromeTotalPx = chromePerFrag * fragCount;
    const oversized = expDom.heights.filter((h: number) => h > A4_PRINT_PX).length;

    console.log(`\n■ ${c.name} [${c.id.slice(0, 8)}]`);
    console.log(`  fragments=${fragCount}  oversized(>1 page)=${oversized}  maxFrag=${expDom.maxFrag.toFixed(0)}px`);
    console.log(`  avg fragment height: baseline=${avgFrag.toFixed(1)}px  stripped=${avgFragStrip.toFixed(1)}px  chrome/frag≈${chromePerFrag.toFixed(1)}px`);
    console.log(`  total content height: official=${offDom.bodyHeight}px  experimental=${expDom.sectionHeight.toFixed(0)}px  stripped=${stripDom.sectionHeight.toFixed(0)}px`);
    console.log(`  content density ratio exp/official = ${(expDom.sectionHeight / Math.max(offDom.bodyHeight, 1)).toFixed(2)}x`);
    console.log(`  estimated chrome contribution = ${chromeTotalPx.toFixed(0)}px ≈ ${(chromeTotalPx / A4_PRINT_PX).toFixed(1)} pages`);
    console.log(`  PDF pages: official=${offPdf}  experimental=${expPdf}  experimental(CSS-stripped)=${stripPdf}`);
    console.log(`  density/page: official=${(offDom.bodyHeight / Math.max(offPdf,1)).toFixed(0)}px/pg  exp=${(expDom.sectionHeight / Math.max(expPdf,1)).toFixed(0)}px/pg`);

    summary.push({ name: c.name, fragCount, oversized, offPdf, expPdf, stripPdf, avgFrag, avgFragStrip, chromePerFrag, expH: expDom.sectionHeight, offH: offDom.bodyHeight, stripH: stripDom.sectionHeight });
  }

  // ─── Aggregate estimates ────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(78));
  console.log('AGGREGATE — page count by scenario');
  console.log('='.repeat(78));
  console.log(`${'campaign'.padEnd(42)} ${'off'.padEnd(5)}${'exp'.padEnd(5)}${'cssX'.padEnd(6)} exp/off  cssX/off`);
  let to = 0, te = 0, ts = 0;
  for (const s of summary) {
    to += s.offPdf; te += s.expPdf; ts += s.stripPdf;
    console.log(`${s.name.slice(0, 40).padEnd(42)} ${String(s.offPdf).padEnd(5)}${String(s.expPdf).padEnd(5)}${String(s.stripPdf).padEnd(6)} ${(s.expPdf / Math.max(s.offPdf,1)).toFixed(2)}x   ${(s.stripPdf / Math.max(s.offPdf,1)).toFixed(2)}x`);
  }
  console.log('-'.repeat(78));
  console.log(`${'TOTAL'.padEnd(42)} ${String(to).padEnd(5)}${String(te).padEnd(5)}${String(ts).padEnd(6)} ${(te / Math.max(to,1)).toFixed(2)}x   ${(ts / Math.max(to,1)).toFixed(2)}x`);
  console.log('');
  console.log('Interpretation:');
  console.log(`  exp/off  = current experimental inflation vs official`);
  console.log(`  cssX/off = experimental inflation AFTER stripping per-fragment/page CSS chrome (CSS-only fix estimate)`);
  console.log('='.repeat(78));

  await browser.close();
  await app.close();
}

main().catch((e) => { console.error('Audit 7Y failed:', e); process.exit(1); });
