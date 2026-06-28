/**
 * Phase 45B — Official Print Review Shadow Proof-of-Concept
 *
 * Demonstrates the complete Official Print Review pipeline:
 *   1. Generate HTML from payload (same code path as official PDF)
 *   2. Render via Puppeteer → review PDF (same settings as official)
 *   3. Extract per-page text → page-boundary metadata
 *   4. Compare review PDF with official PDF (byte-level)
 *   5. Output structured metadata for page review workflow
 *
 * Dev-only diagnostic. No production code changes.
 *
 * Usage:
 *   npx ts-node scripts/phase45b-review-poc.ts <campaignId>
 *   npx ts-node scripts/phase45b-review-poc.ts <campaignId> --overrides ./overrides.json
 *   npx ts-node scripts/phase45b-review-poc.ts <campaignId> --skip-comparison
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/reports/reports.service';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { extractPdfTextByPage } from './pdf-text-oracle/pdf-text-extractor';
import { PrismaService } from '../src/prisma/prisma.service';

// ══════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════

interface ReviewPage {
  pageNumber: number;
  startsWith: string;
  endsWith: string;
  textLength: number;
  extractionWarnings: string[];
}

interface ReviewWarning {
  type: 'table-split' | 'section-across-pages' | 'signature-not-final' | 'orphan-section-start';
  page: number;
  message: string;
}

interface ReviewMetadata {
  pageCount: number;
  generationTimeMs: number;
  pages: ReviewPage[];
  warnings: ReviewWarning[];
}

interface ComparisonResult {
  identical: boolean;
  reviewSha256: string;
  officialSha256: string;
  reviewPageCount: number;
  officialPageCount: number;
  pageCountMatch: boolean;
  sizeMatch: boolean;
  reviewSizeBytes: number;
  officialSizeBytes: number;
  note: string;
}

// ══════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════

const sha256 = (buf: Buffer): string => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(buf).digest('hex');
};

const countPdfPages = (buf: Buffer): number => {
  const m = buf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g);
  return m ? m.length : 0;
};

const TRUNCATE_LENGTH = 120;

const buildMetadata = (
  pdfBuffer: Buffer,
  generationTimeMs: number,
): ReviewMetadata => {
  const extracted = extractPdfTextByPage(pdfBuffer);

  const pages: ReviewPage[] = extracted.pages.map((p) => {
    const text = p.text.trim();
    return {
      pageNumber: p.pageNumber,
      startsWith: text.slice(0, TRUNCATE_LENGTH).replace(/\s+/g, ' ') || '(empty)',
      endsWith: text.length > TRUNCATE_LENGTH
        ? text.slice(-TRUNCATE_LENGTH).replace(/\s+/g, ' ') || '(empty)'
        : text.replace(/\s+/g, ' ') || '(empty)',
      textLength: text.length,
      extractionWarnings: p.extractionWarnings,
    };
  });

  // Detect warnings
  const warnings: ReviewWarning[] = [];
  const allText = extracted.pages.map((p) => p.text);

  // Signature-not-final: check if "التوقيع" or "signatures" keywords
  // appear on a page before the last one
  const lastPageText = allText[allText.length - 1] || '';
  const hasSignatureOnLastPage = /توقيع|signature|التوقيع/i.test(lastPageText);

  if (!hasSignatureOnLastPage && allText.length > 1) {
    // Find which page has signatures
    for (let i = 0; i < allText.length; i++) {
      if (/توقيع|signature|التوقيع/i.test(allText[i])) {
        warnings.push({
          type: 'signature-not-final',
          page: i + 1,
          message: `Signatures appear on page ${i + 1}, NOT on the final page (${allText.length}).`,
        });
        break;
      }
    }
  }

  // Table-split: heuristic — if the same table-like text pattern
  // (numbered rows or "|" delimiters) continues across pages
  for (let i = 1; i < allText.length; i++) {
    const prevEnd = allText[i - 1].trim().slice(-100);
    const currStart = allText[i].trim().slice(0, 100);
    // If previous page ends with a partial row (number + pipe) and
    // current page continues with similar pattern
    if (/\d\s*\|/.test(prevEnd) && /\|\s*\d/.test(currStart)) {
      warnings.push({
        type: 'table-split',
        page: i + 1,
        message: `Table may split across pages ${i}–${i + 1}.`,
      });
    }
  }

  // Orphan section start: page starts with very little text
  // (possible section heading orphaned at bottom of previous page)
  for (const p of pages) {
    if (p.textLength > 0 && p.textLength < 50 && p.pageNumber > 1) {
      warnings.push({
        type: 'orphan-section-start',
        page: p.pageNumber,
        message: `Page ${p.pageNumber} has only ${p.textLength} characters — possible orphan.`,
      });
    }
  }

  return { pageCount: pages.length, generationTimeMs, pages, warnings };
};

const writeOutput = (
  outputDir: string,
  pdfBuffer: Buffer,
  metadata: ReviewMetadata,
  comparison: ComparisonResult | null,
  officialPdfBuffer: Buffer | null,
): void => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Review PDF
  fs.writeFileSync(path.join(outputDir, 'review.pdf'), pdfBuffer);
  console.log(`  ✓ review.pdf  (${(pdfBuffer.length / 1024).toFixed(1)} KB, ${metadata.pageCount} pages)`);

  // Metadata JSON
  fs.writeFileSync(
    path.join(outputDir, 'review-metadata.json'),
    JSON.stringify(metadata, null, 2),
    'utf-8',
  );
  console.log(`  ✓ review-metadata.json  (${metadata.pages.length} pages, ${metadata.warnings.length} warnings)`);

  // Official PDF (if fetched)
  if (officialPdfBuffer) {
    fs.writeFileSync(path.join(outputDir, 'official.pdf'), officialPdfBuffer);
    console.log(`  ✓ official.pdf  (${(officialPdfBuffer.length / 1024).toFixed(1)} KB, ${countPdfPages(officialPdfBuffer)} pages)`);
  }

  // Comparison result
  if (comparison) {
    fs.writeFileSync(
      path.join(outputDir, 'comparison.json'),
      JSON.stringify(comparison, null, 2),
      'utf-8',
    );
    console.log(`  ✓ comparison.json`);
  }
};

// ══════════════════════════════════════════════════════════════════════
// Puppeteer PDF generation (mirrors official generateCampaignReportPdf)
// ══════════════════════════════════════════════════════════════════════

const generatePdf = async (
  html: string,
): Promise<Buffer> => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div style="width:100%;text-align:center;font-family:Cairo,Arial,sans-serif;font-size:10px;font-weight:700;direction:rtl;">سري</div>',
    footerTemplate: '<div style="width:100%;text-align:center;font-family:Cairo,Arial,sans-serif;font-size:9px;font-weight:700;direction:rtl;line-height:1.3;"><div style="text-decoration:underline;text-underline-offset:2px;">سري</div><div>(<span class="pageNumber"></span> - <span class="totalPages"></span>)</div></div>',
    margin: { top: '20mm', bottom: '22mm', left: '10mm', right: '10mm' },
  });
  await browser.close();
  return Buffer.from(pdfBuffer);
};

// ══════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════

const OUTPUT_DIR = path.join(__dirname, '..', 'audit-output', 'phase45b');

interface CliArgs {
  campaignId: string;
  overridesPath: string | null;
  skipComparison: boolean;
}

const parseArgs = (): CliArgs => {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: npx ts-node scripts/phase45b-review-poc.ts <campaignId> [--overrides path] [--skip-comparison]');
    process.exit(1);
  }
  const campaignId = args[0];
  const overridesIdx = args.indexOf('--overrides');
  const overridesPath = overridesIdx >= 0 && overridesIdx + 1 < args.length ? args[overridesIdx + 1] : null;
  const skipComparison = args.includes('--skip-comparison');
  return { campaignId, overridesPath, skipComparison };
};

const main = async () => {
  const { campaignId, overridesPath, skipComparison } = parseArgs();

  console.log('');
  console.log('═'.repeat(74));
  console.log('  Phase 45B — Official Print Review Shadow Proof-of-Concept');
  console.log('═'.repeat(74));
  console.log(`\n  Campaign: ${campaignId.slice(0, 8)}...`);
  if (overridesPath) console.log(`  Overrides: ${overridesPath}`);
  if (skipComparison) console.log(`  Comparison: SKIPPED`);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reportsService = app.get(ReportsService);
  const prisma = app.get(PrismaService);

  try {
    // ── Step 0: Resolve campaign ID (accept 8-char prefix or full UUID) ──
    const allCampaigns = await prisma.campaign.findMany({ select: { id: true, name: true } });
    const match = campaignId.length === 8
      ? allCampaigns.find((c: any) => c.id.startsWith(campaignId))
      : allCampaigns.find((c: any) => c.id === campaignId);
    if (!match) {
      console.error(`  Campaign not found: ${campaignId}`);
      console.error(`  Available campaigns:`);
      for (const c of allCampaigns) console.error(`    ${(c as any).id.slice(0, 8)}...  ${(c as any).name}`);
      await app.close();
      process.exit(1);
    }
    const resolvedId = (match as any).id;
    if (resolvedId.slice(0, 8) !== campaignId) {
      console.log(`  Resolved to: ${resolvedId}`);
    }

    // ── Step 1: Fetch payload ──
    console.log(`\n  Step 1/5: Fetching payload...`);
    const startTime = Date.now();
    const payload = await reportsService.getCampaignReportPayload(resolvedId);
    console.log(`    Payload ready (${Object.keys(payload).length} top-level keys)`);

    // ── Step 2: Apply overrides (if provided) ──
    if (overridesPath) {
      console.log(`  Step 2/5: Applying overrides from ${overridesPath}...`);
      const overrides = JSON.parse(fs.readFileSync(overridesPath, 'utf-8'));
      Object.assign(payload, overrides);
      console.log(`    Overrides applied (${Object.keys(overrides).length} keys merged)`);
    } else {
      console.log(`  Step 2/5: No overrides — using raw payload`);
    }

    // ── Step 3: Generate HTML (same code path as official PDF) ──
    console.log(`  Step 3/5: Generating HTML...`);
    const html = reportsService.generateHtmlFromPayload(payload);
    const htmlSizeKb = (Buffer.byteLength(html, 'utf-8') / 1024).toFixed(1);
    console.log(`    HTML generated  (${htmlSizeKb} KB)`);

    // ── Step 4: Render review PDF via Puppeteer (same settings as official) ──
    console.log(`  Step 4/5: Rendering PDF via Puppeteer...`);
    const renderStart = Date.now();
    const reviewPdfBuffer = await generatePdf(html);
    const renderTime = Date.now() - renderStart;
    const reviewPageCount = countPdfPages(reviewPdfBuffer);
    console.log(`    PDF rendered  (${(reviewPdfBuffer.length / 1024).toFixed(1)} KB, ${reviewPageCount} pages, ${renderTime}ms)`);

    // ── Step 5: Extract metadata ──
    console.log(`  Step 5/5: Extracting page-boundary metadata...`);
    const metadataStart = Date.now();
    const totalTime = Date.now() - startTime;
    const metadata = buildMetadata(reviewPdfBuffer, renderTime);
    console.log(`    Metadata extracted  (${metadata.pages.length} pages, ${metadata.warnings.length} warnings, ${Date.now() - metadataStart}ms)`);

    // ── Fetch official PDF for comparison ──
    let officialPdfBuffer: Buffer | null = null;
    let comparison: ComparisonResult | null = null;

    if (!skipComparison) {
      console.log(`\n  Comparison: Fetching official PDF from dev server...`);
      try {
        const http = require('http');
        const officialPdf = await new Promise<Buffer>((resolve, reject) => {
          http.get(`http://127.0.0.1:3001/reports/campaign/${campaignId}/pdf`, (res: any) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
          }).on('error', (e: Error) => reject(e));
        });

        officialPdfBuffer = officialPdf;
        const officialPageCount = countPdfPages(officialPdfBuffer);
        const reviewHash = sha256(reviewPdfBuffer);
        const officialHash = sha256(officialPdfBuffer);
        const identical = reviewHash === officialHash;

        comparison = {
          identical,
          reviewSha256: reviewHash,
          officialSha256: officialHash,
          reviewPageCount,
          officialPageCount,
          pageCountMatch: reviewPageCount === officialPageCount,
          sizeMatch: reviewPdfBuffer.length === officialPdfBuffer.length,
          reviewSizeBytes: reviewPdfBuffer.length,
          officialSizeBytes: officialPdfBuffer.length,
          note: identical
            ? 'REVIEW PDF IS IDENTICAL TO OFFICIAL PDF (sha256 match).'
            : 'REVIEW PDF DIFFERS from official PDF. See size/page comparison above.',
        };

        console.log(`    Official PDF fetched  (${(officialPdfBuffer.length / 1024).toFixed(1)} KB, ${officialPageCount} pages)`);
        console.log(`    Review sha256: ${reviewHash}`);
        console.log(`    Official sha256: ${officialHash}`);
        console.log(`    ${identical ? '✓ MATCH' : '✗ MISMATCH'}`);
      } catch (e: any) {
        console.log(`    Could not fetch official PDF: ${e.message}`);
        console.log(`    (Is the dev server running on port 3001?)`);
      }
    }

    // ── Write outputs ──
    console.log(`\n  Writing outputs...`);
    writeOutput(OUTPUT_DIR, reviewPdfBuffer, metadata, comparison, officialPdfBuffer);

    // ── Summary ──
    console.log(`\n${'─'.repeat(74)}`);
    console.log('  SUMMARY');
    console.log(`${'─'.repeat(74)}`);
    console.log(`  Total time:      ${totalTime}ms`);
    console.log(`  Render time:     ${renderTime}ms`);
    console.log(`  PDF pages:       ${reviewPageCount}`);
    console.log(`  Warnings:        ${metadata.warnings.length}`);
    console.log(`  Official match:  ${comparison ? (comparison.identical ? 'YES' : 'NO') : 'N/A (skipped)'}`);
    console.log('');

    if (metadata.warnings.length > 0) {
      console.log('  WARNINGS DETECTED:');
      for (const w of metadata.warnings) {
        console.log(`    [${w.type}] Page ${w.page}: ${w.message}`);
      }
      console.log('');
    }

    console.log('  PAGE START/END SAMPLE:');
    for (const p of metadata.pages.slice(0, 3)) {
      console.log(`    Page ${p.pageNumber}:`);
      console.log(`      Starts: "${p.startsWith.slice(0, 80)}..."`);
      console.log(`      Ends:   "${p.endsWith.slice(0, 80)}..."`);
    }
    if (metadata.pages.length > 3) {
      console.log(`    ... (${metadata.pages.length - 3} more pages — see review-metadata.json)`);
    }

    console.log(`\n${'═'.repeat(74)}`);
    console.log(`  Outputs saved to: ${OUTPUT_DIR}`);
    console.log('');

  } catch (e: any) {
    console.error(`\n  ERROR: ${e.message}`);
    console.error(e.stack);
    process.exit(1);
  } finally {
    await app.close();
  }
};

main();
