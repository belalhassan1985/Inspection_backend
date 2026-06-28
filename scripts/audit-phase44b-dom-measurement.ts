/**
 * Phase 44B: official DOM measurement proof of concept.
 *
 * Shadow-only script. It reads campaign payloads, uses the existing official
 * HTML generator unchanged, measures that DOM, and prints the same page to PDF.
 */
import { NestFactory } from '@nestjs/core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import puppeteer, { type Page } from 'puppeteer';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportDocumentV1Builder } from '../src/reports/report-document-v1-shadow/report-document-v1.builder';
import { ReportsService } from '../src/reports/reports.service';

const PX_PER_MM = 96 / 25.4;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGINS_MM = { top: 20, right: 10, bottom: 22, left: 10 } as const;
const PRINTABLE_WIDTH_MM = A4_WIDTH_MM - MARGINS_MM.left - MARGINS_MM.right;
const PRINTABLE_HEIGHT_MM = A4_HEIGHT_MM - MARGINS_MM.top - MARGINS_MM.bottom;
const MAX_CAMPAIGNS = 3;
const OUTPUT_DIR = join(process.cwd(), 'audit-output', 'phase44b');

type DomRectMeasurement = {
  x: number;
  y: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

type SemanticMeasurement = {
  shadowId: string;
  semanticKind: string;
  tagName: string;
  className: string;
  textPreview: string;
  rect: DomRectMeasurement;
  clientRects: DomRectMeasurement[];
  computedFlow: {
    display: string;
    position: string;
    marginTop: string;
    marginBottom: string;
    breakBefore: string;
    breakAfter: string;
    breakInside: string;
    pageBreakBefore: string;
    pageBreakAfter: string;
    pageBreakInside: string;
  };
};

type CampaignMeasurement = {
  campaignId: string;
  campaignName: string;
  reportDocumentV1FragmentCount: number;
  resourceReadiness: {
    fontsStatus: string;
    imageCount: number;
    incompleteImages: number;
    stabilizationSamplesPx: number[];
    stable: boolean;
  };
  document: {
    scrollHeightPx: number;
    scrollHeightMm: number;
    bodyRect: DomRectMeasurement;
    pdfPageRect: DomRectMeasurement | null;
  };
  semanticFragments: SemanticMeasurement[];
  pdf: {
    file: string;
    bytes: number;
    pages: number;
    mediaBoxA4: boolean;
  };
  aggregateComparison: {
    actualPdfPages: number;
    documentHeightMm: number;
    totalPrintableHeightMm: number;
    unusedPrintableHeightMm: number;
    documentHeightPerActualPdfPageMm: number;
  };
};

const round = (value: number, precision = 2): number => {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
};

const countPdfPages = (buffer: Buffer): number =>
  (buffer.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;

const hasA4MediaBox = (buffer: Buffer): boolean => {
  const source = buffer.toString('latin1');
  return /\/MediaBox\s*\[\s*0\s+0\s+595(?:\.\d+)?\s+841(?:\.\d+)?\s*\]/.test(source)
    || /\/MediaBox\s*\[\s*0\s+0\s+595(?:\.\d+)?\s+842(?:\.\d+)?\s*\]/.test(source);
};

const safeName = (value: string): string => value
  .normalize('NFKD')
  .replace(/[^a-zA-Z0-9-_]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 48) || 'campaign';

const waitForStableLayout = async (page: Page): Promise<CampaignMeasurement['resourceReadiness']> => {
  const readiness = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(Array.from(document.images).map(async (image) => {
      if (image.complete) return;
      try {
        await image.decode();
      } catch {
        // A failed image is reported below and must not block the audit.
      }
    }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return {
      fontsStatus: document.fonts.status,
      imageCount: document.images.length,
      incompleteImages: Array.from(document.images).filter((image) => !image.complete).length,
    };
  });

  const stabilizationSamplesPx: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    stabilizationSamplesPx.push(await page.evaluate(() => document.documentElement.scrollHeight));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    ...readiness,
    stabilizationSamplesPx,
    stable: new Set(stabilizationSamplesPx).size === 1,
  };
};

const collectMeasurements = async (page: Page): Promise<{
  document: CampaignMeasurement['document'];
  semanticFragments: SemanticMeasurement[];
}> => page.evaluate(() => {
  const roundValue = (value: number): number => Math.round(value * 100) / 100;
  const rectValue = (rect: DOMRect): DomRectMeasurement => ({
    x: roundValue(rect.x),
    y: roundValue(rect.y),
    top: roundValue(rect.top),
    right: roundValue(rect.right),
    bottom: roundValue(rect.bottom),
    left: roundValue(rect.left),
    width: roundValue(rect.width),
    height: roundValue(rect.height),
  });
  const isVisible = (element: HTMLElement): boolean => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const semanticKind = (element: HTMLElement): string => {
    if (element.classList.contains('report-title')) return 'reportTitle';
    if (element.classList.contains('section-num')) return 'sectionHeading';
    if (element.classList.contains('section-title')) return 'sectionTitle';
    if (element.classList.contains('page-break')) return 'manualPageBreak';
    if (element.classList.contains('signatures-container') || element.classList.contains('signatures')) return 'signatures';
    if (element.matches('table.military-table')) return 'table';
    if (element.matches('table.military-table thead')) return 'tableHeader';
    if (element.matches('table.military-table tbody > tr')) return 'tableRow';
    if (element.matches('.section-body > *')) return 'sectionBodyBlock';
    return 'contentBlock';
  };

  const root = document.querySelector<HTMLElement>('.pdf-page') || document.body;
  const explicitSelector = [
    '.report-title',
    '.section-num',
    '.section-title',
    '.page-break',
    '.signatures-container',
    '.signatures',
    'table.military-table',
    'table.military-table thead',
    'table.military-table tbody > tr',
    '.section-body > *',
  ].join(',');
  const explicit = Array.from(root.querySelectorAll<HTMLElement>(explicitSelector));
  const leafBlocks = Array.from(root.querySelectorAll<HTMLElement>('div, p, li'))
    .filter((element) => {
      if (!isVisible(element)) return false;
      const display = getComputedStyle(element).display;
      if (!['block', 'flex', 'grid', 'list-item'].includes(display)) return false;
      return !Array.from(element.children).some((child) => {
        const childDisplay = getComputedStyle(child).display;
        return ['block', 'flex', 'grid', 'table'].includes(childDisplay) && (child as HTMLElement).innerText.trim().length > 0;
      });
    });
  const nodes = [...new Set([...explicit, ...leafBlocks])]
    .filter(isVisible)
    .sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      return a.top - b.top || a.left - b.left || a.height - b.height;
    });

  const semanticFragments = nodes.map((element, index) => {
    const shadowId = `shadow-semantic-${String(index + 1).padStart(5, '0')}`;
    element.dataset.shadowMeasurementId = shadowId;
    const style = getComputedStyle(element);
    return {
      shadowId,
      semanticKind: semanticKind(element),
      tagName: element.tagName.toLowerCase(),
      className: element.className || '',
      textPreview: element.innerText.replace(/\s+/g, ' ').trim().slice(0, 160),
      rect: rectValue(element.getBoundingClientRect()),
      clientRects: Array.from(element.getClientRects()).map((rect) => rectValue(rect as DOMRect)),
      computedFlow: {
        display: style.display,
        position: style.position,
        marginTop: style.marginTop,
        marginBottom: style.marginBottom,
        breakBefore: style.breakBefore,
        breakAfter: style.breakAfter,
        breakInside: style.breakInside,
        pageBreakBefore: style.pageBreakBefore,
        pageBreakAfter: style.pageBreakAfter,
        pageBreakInside: style.pageBreakInside,
      },
    };
  });
  const pageRoot = document.querySelector<HTMLElement>('.pdf-page');

  return {
    document: {
      scrollHeightPx: document.documentElement.scrollHeight,
      scrollHeightMm: 0,
      bodyRect: rectValue(document.body.getBoundingClientRect()),
      pdfPageRect: pageRoot ? rectValue(pageRoot.getBoundingClientRect()) : null,
    },
    semanticFragments,
  };
});

const pearsonCorrelation = (pairs: Array<{ x: number; y: number }>): number | null => {
  if (pairs.length < 2) return null;
  const meanX = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length;
  const meanY = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length;
  const numerator = pairs.reduce((sum, pair) => sum + (pair.x - meanX) * (pair.y - meanY), 0);
  const denominatorX = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair.x - meanX) ** 2, 0));
  const denominatorY = Math.sqrt(pairs.reduce((sum, pair) => sum + (pair.y - meanY) ** 2, 0));
  return denominatorX === 0 || denominatorY === 0 ? null : round(numerator / (denominatorX * denominatorY), 4);
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
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const results: CampaignMeasurement[] = [];

  try {
    for (const campaign of campaigns) {
      const payload = await reportsService.getCampaignReportPayload(campaign.id);
      const documentV1 = builder.build(payload, { campaignId: campaign.id });
      const officialHtml = reportsService.generateHtmlFromPayload(payload);
      const page = await browser.newPage();
      await page.setContent(officialHtml, { waitUntil: 'load' });
      const resourceReadiness = await waitForStableLayout(page);
      const measured = await collectMeasurements(page);
      measured.document.scrollHeightMm = round(measured.document.scrollHeightPx / PX_PER_MM);

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
      const pdfBuffer = Buffer.from(pdfBytes);
      const pdfPages = countPdfPages(pdfBuffer);
      const pdfFile = `${safeName(campaign.name)}-${campaign.id.slice(0, 8)}.pdf`;
      writeFileSync(join(OUTPUT_DIR, pdfFile), pdfBuffer);
      const documentHeightMm = measured.document.scrollHeightMm;
      const totalPrintableHeightMm = pdfPages * PRINTABLE_HEIGHT_MM;

      results.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        reportDocumentV1FragmentCount: documentV1.fragmentOrder.length,
        resourceReadiness,
        document: measured.document,
        semanticFragments: measured.semanticFragments,
        pdf: {
          file: pdfFile,
          bytes: pdfBuffer.length,
          pages: pdfPages,
          mediaBoxA4: hasA4MediaBox(pdfBuffer),
        },
        aggregateComparison: {
          actualPdfPages: pdfPages,
          documentHeightMm,
          totalPrintableHeightMm,
          unusedPrintableHeightMm: round(totalPrintableHeightMm - documentHeightMm),
          documentHeightPerActualPdfPageMm: round(documentHeightMm / Math.max(pdfPages, 1)),
        },
      });
      await page.close();
    }
  } finally {
    await browser.close();
    await app.close();
  }

  const heightPageCorrelation = pearsonCorrelation(results.map((result) => ({
    x: result.document.scrollHeightMm,
    y: result.pdf.pages,
  })));
  const allStable = results.every((result) => result.resourceReadiness.stable);
  const allResourcesReady = results.every((result) =>
    result.resourceReadiness.fontsStatus === 'loaded' && result.resourceReadiness.incompleteImages === 0);
  const allA4 = results.every((result) => result.pdf.mediaBoxA4);
  const measurement = {
    phase: '44B',
    mode: 'shadow-only',
    generatedAt: new Date().toISOString(),
    productionChanges: 0,
    rendererModified: false,
    pageBreaksEstimated: false,
    officialConfiguration: {
      page: 'A4',
      marginsMm: MARGINS_MM,
      printableWidthMm: PRINTABLE_WIDTH_MM,
      printableHeightMm: PRINTABLE_HEIGHT_MM,
      viewport: 'Puppeteer default; no shadow override',
      mediaType: 'Official default before page.pdf; Chromium print media during page.pdf',
    },
    campaigns: results,
    comparison: {
      campaignsMeasured: results.length,
      heightToActualPdfPageCountPearson: heightPageCorrelation,
      allLayoutsStable: allStable,
      allResourcesReady,
      allPdfsA4: allA4,
      semanticMeasurements: results.reduce((sum, result) => sum + result.semanticFragments.length, 0),
    },
  };
  writeFileSync(join(OUTPUT_DIR, 'measurement.json'), JSON.stringify(measurement, null, 2));

  const report = [
    '# Phase 44B DOM Measurement Comparison',
    '',
    `Campaigns measured: ${results.length}`,
    `Semantic DOM measurements: ${measurement.comparison.semanticMeasurements}`,
    `Height to actual PDF page-count correlation: ${heightPageCorrelation ?? 'not enough variation'}`,
    `Stable layouts: ${allStable ? 'PASS' : 'FAIL'}`,
    `Fonts and images ready: ${allResourcesReady ? 'PASS' : 'FAIL'}`,
    `A4 PDFs: ${allA4 ? 'PASS' : 'FAIL'}`,
    '',
    '## Results',
    '',
    '| Campaign | V1 fragments | Semantic DOM blocks | DOM height mm | Actual PDF pages | DOM mm / actual page |',
    '|---|---:|---:|---:|---:|---:|',
    ...results.map((result) => `| ${result.campaignName.replace(/\|/g, '\\|')} | ${result.reportDocumentV1FragmentCount} | ${result.semanticFragments.length} | ${result.document.scrollHeightMm} | ${result.pdf.pages} | ${result.aggregateComparison.documentHeightPerActualPdfPageMm} |`),
    '',
    '## Accuracy Observations',
    '',
    '- Every measurement and PDF came from the same Puppeteer page and exact official HTML string.',
    '- Bounding boxes are actual Chromium DOM geometry after fonts, images, and layout stabilization; page.pdf then invokes Chromium print layout.',
    '- The comparison uses actual PDF page counts. It does not estimate or assign page breaks.',
    `- Across the measured distributions, DOM height versus actual PDF page count correlation is ${heightPageCorrelation ?? 'not computable'}.`,
    '',
    '## Identified Limitations',
    '',
    '- Official HTML has no ReportDocumentV1 fragment IDs, so measured semantic blocks cannot yet be mapped one-to-one to every V1 fragment.',
    '- Some official containers merge multiple V1 fragments; tables also create nested and overlapping semantic boxes.',
    '- DOM coordinates represent continuous layout. Chromium does not expose the final print-fragment page assignment through getBoundingClientRect().',
    '- PDF page count validates aggregate correlation only; it does not identify the first and last fragment on each page.',
    '- A future phase needs stable semantic identity mapping and a PDF page-position oracle before reconstructing pagination.',
    '',
    '## Decision',
    '',
    allStable && allResourcesReady && results.length > 1 && heightPageCorrelation !== null && heightPageCorrelation >= 0.95
      ? 'GO for a shadow identity-mapping experiment. NO-GO for pagination reconstruction from DOM measurements alone.'
      : 'NO-GO. The proof of concept did not establish stable cross-report correlation.',
    '',
  ].join('\n');
  writeFileSync(join(OUTPUT_DIR, 'comparison-report.md'), report);
  console.log(report);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
