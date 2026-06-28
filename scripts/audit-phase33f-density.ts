/**
 * Phase 33F — Rendering Density Root Cause Audit
 *
 * Compares rendered heights between:
 *   A) Official HTML (generateHtmlFromPayload) — reference
 *   B) FragmentRenderer simulation — designer equivalent
 *
 * No code changes. Read-only measurement.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/reports/reports.service';
import { buildFragments } from '../src/reports/report-fragments';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const MM_TO_PX = 96 / 25.4;
const AUDIT_DIR = path.join(__dirname, '..', 'audit-output');
const CONTENT_WIDTH_MM = 190;

// ═══════════════════════════════════════════════════════════
// FragmentRenderer simulation: HTML builders per fragment kind
// Extracted verbatim from FragmentRenderer.tsx inline styles
// ═══════════════════════════════════════════════════════════

const INDENT = (level: number) => `${level * 15}px`;

function getIndentationCSS(level: number): string {
  return `margin-right: ${INDENT(level)}`;
}

function renderFragment(f: any): string {
  const k = f.kind;
  const d = f.data || {};
  switch (k) {
    case 'reportHeader':
      return `<div style="margin-bottom: 8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">
          <div>${d.startDateText || ''}</div>
          <div>${d.formationNumber || ''}</div>
        </div>
      </div>`;

    case 'reportTitle':
      return `<h1 style="font-size:18px;font-weight:bold;text-align:center;margin:15px 0;">${d.title || ''}</h1>`;

    case 'assignment':
      return `<div class="section-num" style="font-size:16px;font-weight:bold;color:#0c2340;margin-top:30px;margin-bottom:10px;">${d.number || ''}</div>
        <div class="section-body" style="margin-right:15px;margin-bottom:20px;text-align:justify;font-size:13px;line-height:1.7;color:#2d3748;">${d.assignmentText || ''}</div>`;

    case 'committee':
      return `<div class="section-num" style="font-size:16px;font-weight:bold;color:#0c2340;margin-top:30px;margin-bottom:10px;">${d.number || ''}</div>
        <div class="section-body" style="margin-right:15px;margin-bottom:20px;text-align:justify;font-size:13px;line-height:1.7;color:#2d3748;">
          ${(d.committeeMembers || []).map((m: any) => `<div style="margin-bottom:4px;">${m.name || m}</div>`).join('')}
        </div>`;

    case 'purpose':
      return `<div class="section-num" style="font-size:16px;font-weight:bold;color:#0c2340;margin-top:30px;margin-bottom:10px;">${d.number || ''}</div>
        <div class="section-body" style="margin-right:15px;margin-bottom:20px;text-align:justify;font-size:13px;line-height:1.7;color:#2d3748;">${d.purposeText || ''}</div>`;

    case 'visitDate':
      return `<div class="section-num" style="font-size:16px;font-weight:bold;color:#0c2340;margin-top:30px;margin-bottom:10px;">${d.number || ''}</div>
        <div class="section-body" style="margin-right:15px;margin-bottom:20px;text-align:justify;font-size:13px;line-height:1.7;color:#2d3748;">${d.durationText || ''}</div>`;

    case 'sectionTitle':
      return `<div style="font-weight:bold;font-size:15px;color:#0c2340;border-bottom:1.5px solid #0c2340;padding-bottom:3px;margin-bottom:10px;">
        <span>${d.number || ''}</span> <span>${d.title || ''}</span></div>`;

    case 'subsectionTitle':
      return `<div style="font-weight:bold;font-size:14px;color:#1a202c;margin-bottom:10px;padding-right:8px;">
        <span>${d.number || ''}</span> <span>${d.title || ''}</span></div>`;

    case 'narrative': {
      const variant = d.variant || 'paragraph';
      const lineH = variant === 'compact' ? '1.5' : '1.7';
      return `<div class="rd-paragraph-text" style="font-size:13px;line-height:${lineH};margin-bottom:8px;${getIndentationCSS(2)}text-align:justify;color:#2d3748;">${d.text || ''}</div>`;
    }

    case 'inspectionDetailItem': {
      const isDetail = d.variant === 'detail';
      if (isDetail) {
        return `<div class="rd-paragraph-text" style="font-size:13px;margin-bottom:4px;color:#2d3748;display:flex;align-items:center;gap:8px;${getIndentationCSS(5)}">${d.text || ''}</div>`;
      }
      return `<div class="rd-paragraph-text" style="font-size:13.5px;line-height:2;display:flex;gap:6px;margin-bottom:4px;text-align:justify;${getIndentationCSS(4)}">
        ${d.number !== undefined ? `<span style="font-weight:bold;min-width:28px;color:#0c2340;">(${d.number})</span>` : ''}
        <span>${d.text || ''}</span></div>`;
    }

    case 'inspectionDetailsTitle':
      return `<div style="margin-top:8px;${getIndentationCSS(4)}">
        <div style="font-weight:bold;font-size:13px;color:#4a5568;margin-bottom:6px;">
          <span>${d.number || ''}</span> <span>${d.titleText || ''}</span></div></div>`;

    case 'detailedTables': {
      const tables = d.tables || [];
      return tables.map((tbl: any) => {
        const schema = tbl.schema || [];
        const rows = tbl.rows || [];
        return `<div style="margin-top:15px;${getIndentationCSS(4)}">
          <div style="font-weight:bold;font-size:13px;color:#0c2340;margin-bottom:6px;display:flex;align-items:center;gap:6px;">
            <span>📊 ${tbl.title || ''}</span>
            <span style="font-size:11px;font-weight:normal;color:#718096;">(${tbl.entityName || ''})</span></div>
          <div style="${getIndentationCSS(4)}overflow-x:auto;width:100%;">
            <table style="margin:0;width:100%;border-collapse:collapse;border:1px solid #000;">
              <thead><tr style="background-color:#f2f2f2;">
                ${schema.map((col: any) => `<th style="padding:6px 8px;border:1px solid #000;font-weight:bold;text-align:center;font-size:12px;">${col.label}</th>`).join('')}
              </tr></thead>
              <tbody>
                ${rows.length === 0 ? `<tr><td colspan="${schema.length}" style="padding:10px;color:#a0aec0;text-align:center;border:1px solid #000;">لا توجد سجلات.</td></tr>` :
                  rows.map((row: any) => `<tr>${schema.map((col: any, cIdx: number) => {
                    const val = row[col.key] !== undefined ? row[col.key] : '';
                    let color = '#000000';
                    if (col.role === 'deficit' && Number(val) > 0) color = '#c53030';
                    if (col.role === 'increase' && Number(val) > 0) color = '#2b6cb0';
                    const isBold = col.role === 'label' || col.role === 'percentage' || col.role === 'deficit' || col.role === 'increase';
                    return `<td style="padding:6px;border:1px solid #000;text-align:center;font-size:12px;color:${color};font-weight:${isBold ? 'bold' : 'normal'};">${val}</td>`;
                  }).join('')}</tr>`).join('')}
              </tbody>
            </table>
          </div></div>`;
      }).join('\n');
    }

    case 'findingList': {
      const items = d.items || [];
      return `<div style="margin-top:8px;${getIndentationCSS(4)}">
        <div style="font-weight:bold;font-size:${d.fontSize || '13.5px'};color:${d.color || '#c53030'};margin-bottom:6px;">
          ${d.number ? `<span>${d.number}</span> ` : ''}<span>${d.titleText || ''}</span></div>
        ${items.map((item: any, idx: number) =>
          `<div style="${getIndentationCSS(5)}font-size:${d.fontSize || '13.5px'};margin-bottom:4px;color:${d.color || '#c53030'};display:flex;align-items:center;gap:8px;">
            ${item.number ? `<span>${item.number}</span>` : ''} <span>${item.text || ''}</span></div>`
        ).join('')}
      </div>`;
    }

    case 'findingListTitle':
      return `<div style="margin-top:8px;${getIndentationCSS(4)}">
        <div style="font-weight:bold;font-size:${d.fontSize || '13.5px'};color:${d.color || '#c53030'};margin-bottom:6px;">
          ${d.number ? `<span>${d.number}</span> ` : ''}<span>${d.titleText || ''}</span></div></div>`;

    case 'findingListItem':
      return `<div style="${getIndentationCSS(5)}font-size:${d.fontSize || '13.5px'};margin-bottom:4px;color:${d.color || '#c53030'};display:flex;align-items:center;gap:8px;">
        ${d.number ? `<span>${d.number}</span>` : ''} <span>${d.text || ''}</span></div>`;

    case 'officialNotesTitle':
      return `<div style="margin-bottom:0;"><h3 style="font-size:16px;font-weight:bold;color:#0c2340;margin-top:30px;margin-bottom:10px;"><span>${d.number || ''}</span> <span>الملاحظات</span></h3></div>`;

    case 'notesCategoryTitle':
      return `<div style="font-weight:bold;font-size:14px;${getIndentationCSS(2)}margin-top:12px;">
        <span>${d.number || ''}</span> <span>${d.titleText || ''}</span></div>`;

    case 'noteItem':
      return `<div style="font-size:13.5px;text-align:justify;margin-bottom:6px;${getIndentationCSS(3)}color:${d.isEmpty ? '#718096' : '#2d3748'};">
        ${d.number ? `<span>${d.number} </span>` : ''}${d.text || ''}</div>`;

    case 'recommendationsTitle':
      return `<div style="margin-bottom:0;"><h3 style="font-size:16px;font-weight:bold;color:#0c2340;margin-top:30px;margin-bottom:10px;"><span>${d.number || ''}</span> <span>التوصيات</span></h3></div>`;

    case 'recommendationAuthorityTitle':
      return `<div style="margin-bottom:8px;${getIndentationCSS(2)}font-weight:bold;color:#0c2340;">
        <span>${d.number || ''}</span> <span>${d.authority || ''}</span></div>`;

    case 'recommendationItem': {
      if (d.isSectionEmpty) {
        return `<div style="font-size:13.5px;color:#718096;${getIndentationCSS(2)}">${d.text || 'لا توجد توصيات مسجلة.'}</div>`;
      }
      if (d.isEmpty) {
        return `<div style="font-size:13.5px;color:#718096;font-style:italic;margin-bottom:10px;${getIndentationCSS(3)}">${d.text || ''}</div>`;
      }
      const rec = d.recommendation || {};
      const children = rec.children || [];
      return `<div style="margin-bottom:10px;${getIndentationCSS(3)}">
        <div style="margin-bottom:4px;font-size:13.5px;font-weight:500;">
          ${d.number ? `<span>${d.number}</span> ` : ''}<span>${rec.text || ''}</span></div>
        ${children.length > 0 ? `<div style="${getIndentationCSS(4)}display:flex;flex-direction:column;gap:4px;">
          ${children.map((child: any) => `<div style="font-size:13px;color:#4a5568;">• ${child.text || ''}</div>`).join('')}
        </div>` : ''}
      </div>`;
    }

    case 'finalEvaluation':
      return `<div style="margin-bottom:20px;">
        <h3 style="font-size:16px;font-weight:bold;color:#0c2340;margin-top:30px;margin-bottom:10px;"><span>${d.number || ''}</span> <span>التقييم الختامي</span></h3>
        <div style="font-size:13px;line-height:1.7;color:#2d3748;text-align:justify;">${d.finalEvaluation || ''}</div>
      </div>`;

    case 'signatures': {
      const sigs = Array.isArray(d.signatures) ? d.signatures : (d.signatures ? [d.signatures] : []);
      return `<div style="display:flex;justify-content:space-around;margin-top:40px;padding:20px;border-top:1px solid #ccc;">
        ${sigs.map((s: any) =>
          `<div style="text-align:center;"><div style="font-weight:bold;">${s.name || s.title || ''}</div><div style="font-size:12px;">${s.title || ''}</div></div>`
        ).join('')}
      </div>`;
    }

    case 'vertical_spacer': {
      const hMm = d.heightMm ?? 10;
      return `<div style="height:${hMm * MM_TO_PX}px;min-height:4px;"></div>`;
    }

    default:
      return `<div style="padding:12px;color:#64748b;font-size:13px;background:#f8fafc;">${k}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════
// Main audit
// ═══════════════════════════════════════════════════════════

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reportsService = app.get(ReportsService);

  const payload = await reportsService.getCampaignReportPayload('b225a9f1-8b5a-4eff-b7ae-74ce0883430d');
  const officialHtml = reportsService.generateHtmlFromPayload(payload);
  const fragments = buildFragments(payload);

  console.log('='.repeat(78));
  console.log('Phase 33F — Rendering Density Root Cause Audit');
  console.log('Campaign: b225a9f1-8b5a-4eff-b7ae-74ce0883430d');
  console.log('Fragments:', fragments.length);
  console.log('='.repeat(78));

  // Build FragmentRenderer-simulated HTML
  const fragHtml = fragments.map((f: any, i: number) => {
    const content = renderFragment(f);
    return `<div class="frag frag-${f.kind}" data-kind="${f.kind}" data-idx="${i}" style="position:relative;">${content}</div>`;
  }).join('\n');

  const designerHtml = `<!doctype html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Cairo', 'Times New Roman', Arial, sans-serif; direction: rtl; text-align: right; background: #fff; font-size: 13px; }
  .measurer { width: ${CONTENT_WIDTH_MM}mm; margin: 0 auto; background: #fff; }
</style></head>
<body><div class="measurer">${fragHtml}</div></body></html>`;

  // Save for reference
  fs.writeFileSync(path.join(AUDIT_DIR, 'phase33f-designer-sim.html'), designerHtml);
  fs.writeFileSync(path.join(AUDIT_DIR, 'phase33f-official-html.html'), officialHtml);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1600 });

  // ── HELPER: measure per-kind heights ──
  async function measureByKind(html: string, selector: string, kindAttr: string): Promise<Record<string, { count: number; totalHeight: number; avgHeight: number; heights: number[] }>> {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));
    return page.evaluate((sel, attr) => {
      const elMap = new Map<string, { count: number; totalHeight: number; heights: number[] }>();
      const items = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
      for (const item of items) {
        const kind = item.getAttribute(attr) || 'unknown';
        const h = item.getBoundingClientRect().height;
        if (!elMap.has(kind)) elMap.set(kind, { count: 0, totalHeight: 0, heights: [] });
        const entry = elMap.get(kind)!;
        entry.count++;
        entry.totalHeight += h;
        entry.heights.push(h);
      }
      const result: Record<string, any> = {};
      for (const [k, v] of elMap) {
        result[k] = { count: v.count, totalHeight: v.totalHeight, avgHeight: v.totalHeight / v.count, heights: v.heights };
      }
      return result;
    }, selector, kindAttr);
  }

  // ── MEASUREMENT 1: Official HTML — categorize by element type ──
  console.log('\n── Official HTML — Section-based Measurement ──');
  const offDom = await measureByKind(officialHtml, '.frag', 'data-kind');
  // Official HTML doesn't have data-kind attributes. Let me use tag-based measurement.
  await page.setContent(officialHtml, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));
  
  const offSections = await page.evaluate(() => {
    const body = document.body;
    const totalH = body.scrollHeight;
    const hTags = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
    const tables = Array.from(document.querySelectorAll('table'));
    const paragraphs = Array.from(document.querySelectorAll('p, div.section-body, div.paragraph-text'));
    
    // Collect heights by tag type
    const byTag: Record<string, { count: number; total: number }> = {};
    const allEls = Array.from(document.querySelectorAll('body > *')) as HTMLElement[];
    for (const el of allEls) {
      const tag = el.tagName.toLowerCase();
      if (!byTag[tag]) byTag[tag] = { count: 0, total: 0 };
      byTag[tag].count++;
      byTag[tag].total += el.getBoundingClientRect().height;
    }
    return { totalH, byTag, hCount: hTags.length, tableCount: tables.length, pCount: paragraphs.length };
  });
  console.log('  Total body height:', offSections.totalH.toFixed(0), 'px');
  console.log('  Elements by tag:');
  for (const [tag, info] of Object.entries(offSections.byTag).sort((a: any, b: any) => b[1].total - a[1].total)) {
    console.log(`    <${tag}>: ${info.count} elements, ${info.total.toFixed(0)}px total (avg ${(info.total / info.count).toFixed(0)}px)`);
  }

  // ── MEASUREMENT 2: Designer simulation — per fragment kind ──
  console.log('\n── Designer Simulation — Per-Fragment-Kind Measurement ──');
  const desKinds = await measureByKind(designerHtml, '.frag', 'data-kind');
  let desTotal = 0;
  const desSorted = Object.entries(desKinds).sort((a: any, b: any) => b[1].totalHeight - a[1].totalHeight);
  for (const [kind, info] of desSorted) {
    console.log(`  ${kind}: ${info.count} fragments, ${info.totalHeight.toFixed(0)}px total (avg ${info.avgHeight.toFixed(0)}px)`);
    desTotal += info.totalHeight;
  }
  console.log(`  TOTAL: ${desTotal.toFixed(0)}px`);

  // ── COMPARISON TABLE ──
  console.log('\n── Height Comparison ──');
  const officialTotalH = offSections.totalH;
  const designerTotalH = desTotal;
  const diff = officialTotalH - designerTotalH;
  const diffPct = (diff / officialTotalH * 100);
  console.log(`  Official HTML total:         ${officialTotalH.toFixed(0)}px`);
  console.log(`  Designer simulation total:   ${designerTotalH.toFixed(0)}px`);
  console.log(`  Difference:                  ${diff.toFixed(0)}px (${diffPct.toFixed(1)}%)`);
  console.log(`  Designer is ${diffPct > 0 ? 'MORE compact by' : 'LESS compact by'} ${Math.abs(diffPct).toFixed(1)}%`);

  // ── SPACING AUDIT ──
  console.log('\n── Spacing Audit — Key spacing values in FragmentRenderer ──');
  
  // Extract the margin structure from the official HTML
  await page.setContent(officialHtml, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));

  const offSpacing = await page.evaluate(() => {
    const body = document.body;
    const bodyStyle = window.getComputedStyle(body);
    const h3s = Array.from(document.querySelectorAll('h3'));
    const tables = Array.from(document.querySelectorAll('table'));
    const divs = Array.from(document.querySelectorAll('div.section-body'));
    
    return {
      bodyMargin: bodyStyle.margin,
      bodyPadding: bodyStyle.padding,
      bodyFontSize: bodyStyle.fontSize,
      bodyLineHeight: bodyStyle.lineHeight,
      h3Samples: h3s.slice(0, 3).map(h => ({
        text: (h.textContent || '').substring(0, 30),
        marginTop: window.getComputedStyle(h).marginTop,
        marginBottom: window.getComputedStyle(h).marginBottom,
        fontSize: window.getComputedStyle(h).fontSize,
        fontWeight: window.getComputedStyle(h).fontWeight,
        height: h.getBoundingClientRect().height,
      })),
      tableSamples: tables.slice(0, 2).map(t => ({
        marginTop: window.getComputedStyle(t).marginTop,
        marginBottom: window.getComputedStyle(t).marginBottom,
        borderCollapse: window.getComputedStyle(t).borderCollapse,
        height: t.getBoundingClientRect().height,
      })),
      divSectionBodySamples: divs.slice(0, 3).map(d => ({
        marginRight: window.getComputedStyle(d).marginRight,
        marginBottom: window.getComputedStyle(d).marginBottom,
        fontSize: window.getComputedStyle(d).fontSize,
        lineHeight: window.getComputedStyle(d).lineHeight,
        height: d.getBoundingClientRect().height,
      })),
    };
  });

  console.log('  Official HTML body:');
  console.log('    margin:', offSpacing.bodyMargin, 'padding:', offSpacing.bodyPadding);
  console.log('    font-size:', offSpacing.bodyFontSize, 'line-height:', offSpacing.bodyLineHeight);
  console.log('  Official HTML <h3> samples:');
  for (const h of offSpacing.h3Samples) {
    console.log(`    "${h.text}": margin-top=${h.marginTop} margin-bottom=${h.marginBottom} font-size=${h.fontSize} height=${h.height.toFixed(0)}px`);
  }
  console.log('  Official HTML .section-body samples:');
  for (const d of offSpacing.divSectionBodySamples) {
    console.log(`    margin-right=${d.marginRight} margin-bottom=${d.marginBottom} font-size=${d.fontSize} line-height=${d.lineHeight} height=${d.height.toFixed(0)}px`);
  }
  console.log('  Official HTML table samples:');
  for (const t of offSpacing.tableSamples) {
    console.log(`    margin-top=${t.marginTop} margin-bottom=${t.marginBottom} height=${t.height.toFixed(0)}px`);
  }

  // ── NOW measure FragmentRenderer spacing ──
  await page.setContent(designerHtml, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));

  const desSpacing = await page.evaluate(() => {
    const body = document.body;
    const bodyStyle = window.getComputedStyle(body);
    // Find h3-like elements (section titles)
    const titleEls = Array.from(document.querySelectorAll('h3, [style*="font-weight: bold"][style*="font-size: 16px"]'));
    const tableEls = Array.from(document.querySelectorAll('table'));
    const paraEls = Array.from(document.querySelectorAll('.rd-paragraph-text'));
    
    return {
      bodyMargin: bodyStyle.margin,
      bodyPadding: bodyStyle.padding,
      bodyFontSize: bodyStyle.fontSize,
      bodyLineHeight: bodyStyle.lineHeight,
      titleSamples: titleEls.slice(0, 3).map(el => ({
        text: (el.textContent || '').substring(0, 30),
        marginTop: window.getComputedStyle(el).marginTop,
        marginBottom: window.getComputedStyle(el).marginBottom,
        fontSize: window.getComputedStyle(el).fontSize,
        height: el.getBoundingClientRect().height,
      })),
      tableSamples: tableEls.slice(0, 2).map(t => ({
        marginTop: window.getComputedStyle(t).marginTop,
        marginBottom: window.getComputedStyle(t).marginBottom,
        height: t.getBoundingClientRect().height,
      })),
    };
  });

  console.log('\n  Designer simulation body:');
  console.log('    margin:', desSpacing.bodyMargin, 'padding:', desSpacing.bodyPadding);
  console.log('    font-size:', desSpacing.bodyFontSize, 'line-height:', desSpacing.bodyLineHeight);
  console.log('  Designer title samples:');
  for (const h of desSpacing.titleSamples) {
    console.log(`    "${h.text}": margin-top=${h.marginTop} margin-bottom=${h.marginBottom} font-size=${h.fontSize} height=${h.height.toFixed(0)}px`);
  }
  console.log('  Designer table samples:');
  for (const t of desSpacing.tableSamples) {
    console.log(`    margin-top=${t.marginTop} margin-bottom=${t.marginBottom} height=${t.height.toFixed(0)}px`);
  }

  // ── BREAKDOWN: top 5 contributors to density gap ──
  console.log('\n── Top Contributors to Density Gap ──');
  
  // Map fragment kinds to official HTML sections for comparison
  const kindToOfficialTag: Record<string, string> = {
    'sectionTitle': 'h3 or div with border',
    'subsectionTitle': 'h4 or div',
    'narrative': 'div.section-body',
    'inspectionDetailItem': 'p or div',
    'summaryTableTitle': 'h3',
    'summaryTableHeader': 'table',
    'summaryTableRow': 'table',
    'detailedTableTitle': 'div',
    'detailedTableHeader': 'table thead',
    'detailedTableRow': 'table tbody',
    'noteItem': 'div or p',
    'recommendationItem': 'div',
    'finalEvaluation': 'div.section-body',
  };

  // Compute gap per kind group
  // We only have detailed kind data for the designer side.
  // For official we have tag-level data. Map broadly.
  const kindGroups: Record<string, string[]> = {
    'Section titles': ['sectionTitle', 'subsectionTitle', 'inspectionDetailsTitle',
      'findingListTitle', 'officialNotesTitle', 'notesCategoryTitle',
      'recommendationsTitle', 'recommendationAuthorityTitle', 'appendicesTitle', 'appendixTitle'],
    'Narrative / Paragraphs': ['narrative', 'inspectionDetailItem', 'noteItem',
      'findingListItem', 'recommendationItem', 'appendixParagraph'],
    'Tables (summary + detailed)': ['summaryTableTitle', 'summaryTableHeader', 'summaryTableRow',
      'detailedTableTitle', 'detailedTableHeader', 'detailedTableRow', 'detailedTables'],
    'Sections (assignment, committee, etc.)': ['assignment', 'committee', 'purpose', 'visitDate'],
    'Header / Title / Signatures': ['reportHeader', 'reportTitle', 'finalEvaluation', 'signatures'],
  };

  interface KindTotal {
    count: number;
    total: number;
  }
  const groupDesigner: Record<string, KindTotal> = {};
  for (const [group, kinds] of Object.entries(kindGroups)) {
    groupDesigner[group] = { count: 0, total: 0 };
    for (const kind of kinds) {
      const info = (desKinds as any)[kind];
      if (info) {
        groupDesigner[group].count += info.count;
        groupDesigner[group].total += info.totalHeight;
      }
    }
  }

  // Sort groups by designer total (descending)
  const sortedGroups = Object.entries(groupDesigner).sort((a: any, b: any) => b[1].total - a[1].total);
  console.log('  Group breakdown in designer simulation:');
  for (const [group, info] of sortedGroups) {
    const pct = (info.total / designerTotalH * 100);
    console.log(`  ${group}: ${info.total.toFixed(0)}px (${pct.toFixed(1)}%) — ${info.count} elements`);
  }

  // ── FRAGMENT COUNT PER KIND ──
  console.log('\n── Fragment Count by Kind ──');
  const kindCounts: Record<string, number> = {};
  for (const f of fragments) {
    const k = (f as any).kind;
    kindCounts[k] = (kindCounts[k] || 0) + 1;
  }
  const sortedFrags = Object.entries(kindCounts).sort((a: any, b: any) => b[1] - a[1]);
  for (const [kind, count] of sortedFrags) {
    console.log(`  ${kind}: ${count}`);
  }

  // ── OUTPUT ──
  console.log('\n' + '='.repeat(78));
  console.log('Phase 33F — Density Audit Summary');
  console.log('='.repeat(78));
  console.log('');
  console.log(`Official HTML total height:   ${officialTotalH.toFixed(0)}px`);
  console.log(`Designer simulation total:    ${designerTotalH.toFixed(0)}px`);
  console.log(`Difference:                   ${diff.toFixed(0)}px (${Math.abs(diffPct).toFixed(1)}%)`);
  console.log(`Designer is:                  ${diffPct > 0 ? 'MORE compact' : 'LESS compact'} by ${Math.abs(diffPct).toFixed(1)}%`);
  console.log('');
  console.log('Page estimates with 964px/page (post-patch):');
  console.log(`  Official:  ${Math.ceil(officialTotalH / 964)} pages`);
  console.log(`  Designer:  ${Math.ceil(designerTotalH / 964)} pages`);
  console.log('');

  // Top 5 gap contributors
  console.log('Top 5 density gap contributors (height difference):');
  const gapContributors: Array<{ group: string; officialPx: number; designerPx: number; diffPx: number }> = [];
  // We can't directly get official per-group heights from tag data, so estimate.
  // The official tag data gives <h3> (section titles) vs designer's sectionTitle/subsectionTitle etc.
  console.log('  (Requires more precise section mapping — see detailed per-kind data above)');

  // Save screenshot
  await page.setContent(designerHtml, { waitUntil: 'load' });
  await page.evaluate(() => (document as any).fonts?.ready?.then(() => undefined));
  await page.screenshot({ path: path.join(AUDIT_DIR, 'phase33f-designer-sim.png'), fullPage: true });

  await browser.close();
  await app.close();
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
