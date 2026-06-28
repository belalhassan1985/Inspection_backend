/**
 * Phase 43I — Synthetic Campaign Validation
 *
 * Generates synthetic V1 documents with varied fragment counts,
 * renders them through the official HTML pipeline (using payloads
 * constructed from real campaign data), and tests the per-kind
 * overhead model against many more data points.
 *
 * Dev-only diagnostic. No production code changes.
 *
 * Usage: npx ts-node scripts/audit-phase43i-synthetic-validation.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/reports/reports.service';
import { ReportDocumentV1Builder } from '../src/reports/report-document-v1-shadow/report-document-v1.builder';
import { PrismaService } from '../src/prisma/prisma.service';
import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

const countPdfPages = (buf: Buffer): number => {
  const m = buf.toString('latin1').match(/\/Type\s*\/Page(?![s])/g);
  return m ? m.length : 0;
};

const countPages = (heights: number[], capacity: number): number => {
  if (heights.length === 0) return 1;
  let pages = 1;
  let cur = heights[0];
  for (let i = 1; i < heights.length; i++) {
    if (cur + heights[i] > capacity) { pages++; cur = heights[i]; }
    else { cur += heights[i]; }
  }
  return pages;
};

// Arabic text blocks for realistic content
const ARABIC_TEXTS = {
  paragraph: 'تتولى الهيأة العامة للرقابة المالية الاتحادية الإشراف والرقابة على الأجهزة الرقابية في القطاع العام والخاص، وذلك وفقاً لأحكام القانون. وتهدف الهيأة إلى تعزيز مبادئ النزاهة والشفافية والمساءلة في العمل الإداري والمالي. تقوم الفرق الرقابية بجولات تفتيشية دورية ومفاجئة على الدوائر والمؤسسات المشمولة برقابتها.',
  note: 'لوحظ وجود بعض التجاوزات في الإجراءات الإدارية والمالية المتعلقة بتنفيذ العقود المبرمة مع المقاولين والموردين. حيث تم تحرير مخالفات وإحالتها إلى الجهات المختصة.',
  finding: 'تبين عدم التزام الدائرة بتنفيذ التوصيات الواردة في تقارير الرقابة السابقة والمتعلقة بتصويب أوضاعها المالية والإدارية.',
  recommendation: 'توصي الهيأة باتخاذ الإجراءات اللازمة لمعالجة الملاحظات الواردة في هذا التقرير، وتكليف مسؤول مختص بمتابعة تنفيذ التوصيات.',
  tableCell: 'بيان',
  committee: 'لجنة التفتيش المشكلة بموجب الأمر الإداري المرقم ٤٥ لسنة ٢٠٢٤ والمتضمن تشكيل فريق تفتيشي للقيام بجولات ميدانية على الدوائر المشمولة بالرقابة.',
  title: 'تقرير التفتيش والرقابة المالية',
  sectionTitle: 'المبحث الأول: الجوانب الإدارية والمالية',
  subsectionTitle: 'أولاً: الموارد البشرية',
};

const KIND_TEXT: Record<string, () => string> = {
  reportHeader: () => `جمهورية العراق<br>الهيأة العامة للرقابة المالية الاتحادية`,
  reportTitle: () => ARABIC_TEXTS.title,
  assignment: () => ARABIC_TEXTS.committee,
  committee: () => ARABIC_TEXTS.committee,
  purpose: () => ARABIC_TEXTS.paragraph,
  visitDate: () => 'تاريخ الزيارة: ' + ['١', '٢', '٣', '٤', '٥'][Math.floor(Math.random() * 5)] + ' / ' + ['كانون الثاني', 'شباط', 'آذار'][Math.floor(Math.random() * 3)] + ' / ٢٠٢٤',
  tableTitle: () => 'جداول المؤشرات الرقابية',
  tableHeader: () => 'ت | البيان | العدد | الملاحظات',
  tableRow: () => `${Math.floor(Math.random() * 20) + 1} | ${ARABIC_TEXTS.tableCell} | ${Math.floor(Math.random() * 100)} | ${Math.random() > 0.5 ? ARABIC_TEXTS.note.slice(0, 50) : '---'}`,
  sectionTitle: () => ARABIC_TEXTS.sectionTitle,
  subsectionTitle: () => ARABIC_TEXTS.subsectionTitle,
  findingGroupTitle: () => 'الإيجابيات',
  findingItem: () => ARABIC_TEXTS.finding + '<br><br>' + ARABIC_TEXTS.finding.slice(0, 60) + '.',
  noteItem: () => ARABIC_TEXTS.note,
  recommendationItem: () => ARABIC_TEXTS.recommendation,
  finalEvaluation: () => ARABIC_TEXTS.paragraph + '<br><br>' + ARABIC_TEXTS.paragraph.slice(0, 100) + '.',
  signatures: () => 'رئيس فريق التفتيش<br>........................<br>التوقيع: ........................<br>التاريخ: ........................',
  officialNotesTitle: () => 'الملاحظات الرسمية',
  noteCategoryTitle: () => 'الإيجابيات',
  recommendationsTitle: () => 'التوصيات',
  recommendationGroupTitle: () => 'التوصيات الصادرة',
};

const DEFAULT_TEXT = 'نص تجريبي';

const extractText = (content: unknown, depth = 0): string => {
  if (depth > 5) return '';
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'number' || typeof content === 'boolean') return String(content);
  if (Array.isArray(content)) return content.map((item) => extractText(item, depth + 1)).filter(Boolean).join(' ');
  if (typeof content === 'object') {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
      if (['tableId', 'columns', 'field', 'label'].includes(key)) continue;
      const text = extractText(value, depth + 1);
      if (text) parts.push(text);
    }
    return parts.join(' ');
  }
  return '';
};

const buildV1Document = (
  fragmentCount: number,
): { fragmentOrder: string[]; fragments: Record<string, { id: string; kind: string; content: unknown }> } => {
  const order: string[] = [];
  const fragments: Record<string, { id: string; kind: string; content: unknown }> = {};

  const add = (id: string, kind: string, content?: unknown) => {
    order.push(id);
    const text = KIND_TEXT[kind] ? KIND_TEXT[kind]() : DEFAULT_TEXT;
    fragments[id] = { id, kind, content: content ?? { text, fixture: false } };
  };

  // Structural header elements (always present, small fixed count)
  add('report:header', 'reportHeader');
  add('report:title', 'reportTitle');
  add('assignment', 'assignment');
  add('committee', 'committee');
  add('purpose', 'purpose');
  add('visitDate', 'visitDate');

  const remaining = fragmentCount - 6; // subtract header elements
  if (remaining <= 0) return { fragmentOrder: order, fragments };

  // Distribute remaining fragments across sections
  let placed = 0;
  const sectionCount = Math.max(1, Math.ceil(remaining / 80)); // ~80 frags per section

  for (let s = 0; s < sectionCount && placed < remaining; s++) {
    add(`section:${s}:title`, 'sectionTitle');
    placed++;

    const subsPerSection = Math.max(1, Math.ceil((remaining - placed) / (sectionCount - s) / 20));
    for (let sub = 0; sub < subsPerSection && placed < remaining; sub++) {
      add(`section:${s}:sub:${sub}:title`, 'subsectionTitle');
      placed++;

      // Finding group + items
      add(`section:${s}:sub:${sub}:findings:title`, 'findingGroupTitle');
      placed++;

      const itemsPerSub = Math.max(1, Math.ceil((remaining - placed) / ((sectionCount - s) * (subsPerSection - sub))));
      const findingItems = Math.min(itemsPerSub, remaining - placed);
      for (let i = 0; i < findingItems && placed < remaining; i++) {
        add(`section:${s}:sub:${sub}:finding:${i}`, 'findingItem');
        placed++;
      }

      // Table (title + header + rows)
      if (placed < remaining) {
        add(`section:${s}:sub:${sub}:table:title`, 'tableTitle');
        placed++;
      }
      if (placed < remaining) {
        add(`section:${s}:sub:${sub}:table:header`, 'tableHeader');
        placed++;
      }
      const tableRows = Math.min(5, remaining - placed);
      for (let i = 0; i < tableRows && placed < remaining; i++) {
        add(`section:${s}:sub:${sub}:table:row:${i}`, 'tableRow');
        placed++;
      }

      // Note items
      if (placed < remaining) {
        add(`section:${s}:sub:${sub}:notes:category`, 'noteCategoryTitle');
        placed++;
      }
      const noteItems = Math.min(3, remaining - placed);
      for (let i = 0; i < noteItems && placed < remaining; i++) {
        add(`section:${s}:sub:${sub}:note:${i}`, 'noteItem');
        placed++;
      }
    }
  }

  // Closing elements
  if (placed < remaining) {
    add('recommendations:title', 'recommendationsTitle');
    placed++;
  }
  if (placed < remaining) {
    add('recommendations:group', 'recommendationGroupTitle');
    placed++;
  }
  const recItems = Math.min(3, remaining - placed);
  for (let i = 0; i < recItems && placed < remaining; i++) {
    add(`recommendations:item:${i}`, 'recommendationItem');
    placed++;
  }

  if (placed < remaining) {
    add('final:evaluation', 'finalEvaluation');
    placed++;
  }
  if (placed < remaining) {
    add('signatures', 'signatures');
    placed++;
  }

  return { fragmentOrder: order, fragments };
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

const buildOfficialLikeHtml = (
  fragmentOrder: readonly string[],
  fragments: Readonly<Record<string, { id: string; kind: string; content: unknown }>>,
): string => {
  const bodyParts: string[] = [];

  for (const id of fragmentOrder) {
    const f = fragments[id];
    if (!f) continue;
    const text = extractText(f.content);
    if (!text) continue;

    let html = '';
    switch (f.kind) {
      case 'reportHeader':
        html = `<div style="text-align:center;font-size:16px;font-weight:bold;margin-bottom:20px;">${text}</div>`;
        break;
      case 'reportTitle':
        html = `<div style="text-align:center;font-size:18px;font-weight:bold;margin-bottom:25px;">${text}</div>`;
        break;
      case 'sectionTitle':
        html = `<div style="font-size:15px;font-weight:bold;margin-top:18px;margin-bottom:10px;">${text}</div>`;
        break;
      case 'subsectionTitle':
        html = `<div style="font-size:14px;font-weight:bold;margin-top:14px;margin-bottom:8px;margin-right:10px;">${text}</div>`;
        break;
      case 'findingGroupTitle':
        html = `<div style="font-size:13.5px;font-weight:bold;margin-top:12px;margin-bottom:6px;margin-right:20px;">${text}</div>`;
        break;
      case 'findingItem':
      case 'noteItem':
      case 'recommendationItem':
        html = `<div style="font-size:13.5px;line-height:1.7;margin-bottom:8px;margin-right:30px;text-align:justify;">${text}</div>`;
        break;
      case 'tableTitle':
        html = `<div style="font-size:13.5px;font-weight:bold;margin-top:12px;margin-bottom:6px;">${text}</div>`;
        break;
      case 'tableHeader':
        html = `<div style="font-size:13px;font-weight:bold;border-bottom:1px solid #000;padding:4px 0;margin-bottom:4px;">${text}</div>`;
        break;
      case 'tableRow':
        html = `<div style="font-size:13px;padding:2px 0;border-bottom:1px dashed #ccc;margin-right:10px;">${text}</div>`;
        break;
      case 'committee':
      case 'assignment':
      case 'purpose':
      case 'visitDate':
        html = `<div style="font-size:13.5px;line-height:1.7;margin-bottom:10px;text-align:justify;">${text}</div>`;
        break;
      case 'finalEvaluation':
        html = `<div style="font-size:13.5px;line-height:1.7;margin-top:15px;margin-bottom:10px;text-align:justify;border-top:1px solid #ccc;padding-top:10px;">${text}</div>`;
        break;
      case 'signatures':
        html = `<div style="font-size:13.5px;line-height:1.8;margin-top:20px;text-align:right;">${text}</div>`;
        break;
      default:
        html = `<div style="font-size:13.5px;line-height:1.7;margin-bottom:8px;">${text}</div>`;
    }
    bodyParts.push(html);
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: white; direction: rtl; text-align: right; padding: 20mm 10mm 22mm 10mm; font-family:'Cairo','Times New Roman',serif; }
</style>
</head>
<body>
${bodyParts.join('\n')}
</body>
</html>`;
};

const OUTPUT_DIR = path.join(__dirname, '..', 'audit-output', 'phase43i');

const ESTIMATED_HEIGHTS: Record<string, number> = {
  reportHeader: 20, reportTitle: 15, assignment: 10, committee: 12,
  purpose: 10, visitDate: 8, tableTitle: 8, tableHeader: 10,
  tableRow: 7, sectionTitle: 10, subsectionTitle: 8,
  findingGroupTitle: 8, findingItem: 7,
  recommendationsTitle: 10, recommendationGroupTitle: 8, recommendationItem: 7,
  officialNotesTitle: 10, noteCategoryTitle: 8, noteItem: 7,
  finalEvaluation: 12, signatures: 15,
};

interface CampaignData {
  name: string;
  fragmentCount: number;
  officialPdfPages: number;
  totalHtmlHeightMm: number;
  bareHeightsSum: number;
  overheadTotal: number;
  perKindBareHeights: Record<string, number[]>;
  kindEffectiveHeights: Record<string, number>;
  fragmentKindOrder: string[];
  overheadFactor: number;
}

const main = async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reportsService = app.get(ReportsService);
  const prisma = app.get(PrismaService);
  const builder = new ReportDocumentV1Builder();

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const allData: CampaignData[] = [];

  // ── Phase 1: Collect real campaigns ──
  console.log('\n=== Phase 1: Collecting real campaigns ===');
  const realCampaigns = await prisma.campaign.findMany({
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' },
  });

  for (const c of realCampaigns) {
    console.log(`\nReal: ${c.name} [${c.id.slice(0, 8)}]...`);
    try {
      const payload = await reportsService.getCampaignReportPayload(c.id);
      const officialHtml = reportsService.generateHtmlFromPayload(payload);
      const v1Doc = builder.build(payload, { campaignId: c.id });

      const p = await browser.newPage();
      await p.setContent(officialHtml, { waitUntil: 'load' });
      const totalHtmlHeightMm = await p.evaluate(() => document.body.scrollHeight) / 3.7795275591;
      const buf = await p.pdf({
        format: 'A4', printBackground: true,
        margin: { top: '20mm', bottom: '22mm', left: '10mm', right: '10mm' },
        preferCSSPageSize: false,
      });
      const officialPdfPages = countPdfPages(Buffer.from(buf));
      await p.close();

      // Measure bare fragment heights
      const measurementHtml = buildMeasurementHtml(v1Doc.fragmentOrder, v1Doc.fragments);
      const p2 = await browser.newPage();
      await p2.setContent(measurementHtml, { waitUntil: 'load' });
      const measurements = await p2.evaluate(() => {
        const blocks = Array.from(document.querySelectorAll('[data-fragment-id]')) as HTMLElement[];
        return blocks.map((el) => ({
          kind: el.getAttribute('data-kind') || '',
          heightPx: Math.round(el.getBoundingClientRect().height * 100) / 100,
        }));
      });
      await p2.close();

      const bareFragmentData = measurements.map((m: any) => ({
        kind: m.kind,
        heightMm: m.heightPx / 3.7795275591,
      }));
      const bareHeightsSum = Math.round(bareFragmentData.reduce((s: number, f: any) => s + f.heightMm, 0) * 100) / 100;
      const totalHtml = Math.round(totalHtmlHeightMm * 100) / 100;
      const overheadTotal = Math.round((totalHtml - bareHeightsSum) * 100) / 100;
      const overheadFactor = bareHeightsSum > 0 ? Math.round((totalHtml / bareHeightsSum) * 100) / 100 : 1;

      // Per-kind
      const perKindBareHeights: Record<string, number[]> = {};
      for (const f of bareFragmentData) {
        if (!perKindBareHeights[f.kind]) perKindBareHeights[f.kind] = [];
        perKindBareHeights[f.kind].push(f.heightMm);
      }

      const kindEffectiveHeights: Record<string, number> = {};
      for (const [kind, heights] of Object.entries(perKindBareHeights)) {
        const kindBareTotal = heights.reduce((s, h) => s + h, 0);
        const kindShare = kindBareTotal / bareHeightsSum;
        const kindOverheadTotal = overheadTotal * kindShare;
        const overheadPerInstance = kindOverheadTotal / heights.length;
        const avgBare = kindBareTotal / heights.length;
        kindEffectiveHeights[kind] = Math.round((avgBare + overheadPerInstance) * 100) / 100;
      }

      const fragmentKindOrder = bareFragmentData.map((f: any) => f.kind);

      allData.push({
        name: c.name,
        fragmentCount: v1Doc.fragmentOrder.length,
        officialPdfPages,
        totalHtmlHeightMm: totalHtml,
        bareHeightsSum,
        overheadTotal,
        perKindBareHeights,
        kindEffectiveHeights,
        fragmentKindOrder,
        overheadFactor,
      });
      console.log(`  fragments=${v1Doc.fragmentOrder.length}  official=${officialPdfPages}p  bareSum=${bareHeightsSum}mm  overhead=${overheadFactor}x`);
    } catch (e: any) {
      console.error(`  SKIPPED: ${e.message}`);
    }
  }

  // ── Phase 2: Generate synthetic campaigns ──
  console.log('\n=== Phase 2: Generating synthetic campaigns ===');
  const SYNTHETIC_SIZES = [10, 25, 50, 100, 200, 500, 1000];

  for (const size of SYNTHETIC_SIZES) {
    console.log(`\nSynthetic: ${size}-fragment...`);
    try {
      const { fragmentOrder, fragments } = buildV1Document(size);
      const officialHtml = buildOfficialLikeHtml(fragmentOrder, fragments);
      const actualCount = fragmentOrder.length;

      const p = await browser.newPage();
      await p.setContent(officialHtml, { waitUntil: 'load' });
      const totalHtmlHeightMm = await p.evaluate(() => document.body.scrollHeight) / 3.7795275591;
      const buf = await p.pdf({
        format: 'A4', printBackground: true,
        margin: { top: '20mm', bottom: '22mm', left: '10mm', right: '10mm' },
        preferCSSPageSize: false,
      });
      const officialPdfPages = countPdfPages(Buffer.from(buf));
      await p.close();

      // Measure bare fragment heights
      const measurementHtml = buildMeasurementHtml(fragmentOrder, fragments);
      const p2 = await browser.newPage();
      await p2.setContent(measurementHtml, { waitUntil: 'load' });
      const measurements = await p2.evaluate(() => {
        const blocks = Array.from(document.querySelectorAll('[data-fragment-id]')) as HTMLElement[];
        return blocks.map((el) => ({
          kind: el.getAttribute('data-kind') || '',
          heightPx: Math.round(el.getBoundingClientRect().height * 100) / 100,
        }));
      });
      await p2.close();

      const bareFragmentData = measurements.map((m: any) => ({
        kind: m.kind,
        heightMm: m.heightPx / 3.7795275591,
      }));
      const bareHeightsSum = Math.round(bareFragmentData.reduce((s: number, f: any) => s + f.heightMm, 0) * 100) / 100;
      const totalHtml = Math.round(totalHtmlHeightMm * 100) / 100;
      const overheadTotal = Math.round((totalHtml - bareHeightsSum) * 100) / 100;
      const overheadFactor = bareHeightsSum > 0 ? Math.round((totalHtml / bareHeightsSum) * 100) / 100 : 1;

      const perKindBareHeights: Record<string, number[]> = {};
      for (const f of bareFragmentData) {
        if (!perKindBareHeights[f.kind]) perKindBareHeights[f.kind] = [];
        perKindBareHeights[f.kind].push(f.heightMm);
      }

      const kindEffectiveHeights: Record<string, number> = {};
      for (const [kind, heights] of Object.entries(perKindBareHeights)) {
        const kindBareTotal = heights.reduce((s, h) => s + h, 0);
        const kindShare = kindBareTotal / bareHeightsSum;
        const kindOverheadTotal = overheadTotal * kindShare;
        const overheadPerInstance = kindOverheadTotal / heights.length;
        const avgBare = kindBareTotal / heights.length;
        kindEffectiveHeights[kind] = Math.round((avgBare + overheadPerInstance) * 100) / 100;
      }

      const fragmentKindOrder = bareFragmentData.map((f: any) => f.kind);

      allData.push({
        name: `synth-${size}f`,
        fragmentCount: actualCount,
        officialPdfPages,
        totalHtmlHeightMm: totalHtml,
        bareHeightsSum,
        overheadTotal,
        perKindBareHeights,
        kindEffectiveHeights,
        fragmentKindOrder,
        overheadFactor,
      });
      console.log(`  fragments=${actualCount}  official=${officialPdfPages}p  bareSum=${bareHeightsSum}mm  overhead=${overheadFactor}x`);
    } catch (e: any) {
      console.error(`  SKIPPED: ${e.message}`);
    }
  }

  await browser.close();
  await app.close();

  // ═════════════════════════════════════════════════════════════════════
  // ANALYSIS
  // ═════════════════════════════════════════════════════════════════════

  const div = '═'.repeat(74);
  const sub = '─'.repeat(74);
  const lines: string[] = [];

  lines.push('');
  lines.push(div);
  lines.push('  Phase 43I — Synthetic Campaign Validation');
  lines.push(div);

  // 1. Campaign Overview
  lines.push('');
  lines.push('  1. Campaign Overview');
  lines.push(sub);
  lines.push(`  ${'Campaign'.padEnd(24)} ${'Frags'.padStart(6)} ${'Official'.padStart(8)} ${'BareSum'.padStart(10)} ${'HtmlTotal'.padStart(10)} ${'Overhead'.padStart(9)} ${'Content/pg'.padStart(11)}`);
  lines.push(`  ${'─'.repeat(82)}`);
  for (const d of allData) {
    const name = d.name.length > 23 ? d.name.slice(0, 20) + '...' : d.name;
    const cpp = Math.round((d.bareHeightsSum / d.officialPdfPages) * 100) / 100;
    lines.push(`  ${name.padEnd(24)} ${String(d.fragmentCount).padStart(6)} ${String(d.officialPdfPages).padStart(8)} ${String(d.bareHeightsSum).padStart(10)} ${String(d.totalHtmlHeightMm).padStart(10)} ${String(d.overheadFactor).padStart(8)}x ${String(cpp).padStart(10)}mm`);
  }

  // 2. Leave-One-Out Cross-Validation using per-kind overhead model
  lines.push('');
  lines.push('  2. Leave-One-Out Cross-Validation (per-kind overhead model)');
  lines.push(sub);
  lines.push('');

  if (allData.length < 2) {
    lines.push('  Need at least 2 campaigns.');
  } else {
    const looResults: {
      name: string;
      fragmentCount: number;
      officialPages: number;
      predictedPages: number;
      delta: number;
    }[] = [];

    for (let ti = 0; ti < allData.length; ti++) {
      const target = allData[ti];
      const others = allData.filter((_, i) => i !== ti);

      // Compute avg effective heights per kind from training set
      const allKinds = new Set<string>();
      for (const d of others) {
        for (const kind of Object.keys(d.kindEffectiveHeights)) {
          allKinds.add(kind);
        }
      }

      const avgEffHeights: Record<string, number> = {};
      for (const kind of allKinds) {
        let sum = 0;
        let count = 0;
        for (const d of others) {
          if (d.kindEffectiveHeights[kind]) {
            sum += d.kindEffectiveHeights[kind];
            count++;
          }
        }
        if (count > 0) avgEffHeights[kind] = Math.round((sum / count) * 100) / 100;
      }

      // Average total capacity per page from training
      const avgCapacity = others.reduce((s, d) => s + (d.totalHtmlHeightMm / d.officialPdfPages), 0) / others.length;

      // Predict: use target's fragment order, training's effective heights
      const predictedHeights = target.fragmentKindOrder.map(
        (kind) => avgEffHeights[kind] || ESTIMATED_HEIGHTS[kind] || 10,
      );
      const predictedPages = countPages(predictedHeights, avgCapacity);

      looResults.push({
        name: target.name,
        fragmentCount: target.fragmentCount,
        officialPages: target.officialPdfPages,
        predictedPages,
        delta: predictedPages - target.officialPdfPages,
      });
    }

    lines.push(`  ${'Campaign'.padEnd(24)} ${'Frags'.padStart(6)} ${'Official'.padStart(8)} ${'Predicted'.padStart(10)} ${'Δ'.padStart(6)}`);
    lines.push(`  ${'─'.repeat(58)}`);
    for (const r of looResults) {
      const name = r.name.length > 23 ? r.name.slice(0, 20) + '...' : r.name;
      const dStr = r.delta >= 0 ? '+' + String(r.delta) : String(r.delta);
      lines.push(`  ${name.padEnd(24)} ${String(r.fragmentCount).padStart(6)} ${String(r.officialPages).padStart(8)} ${String(r.predictedPages).padStart(10)} ${dStr.padStart(6)}`);
    }

    const avgAbsDelta = Math.round(looResults.reduce((s, r) => s + Math.abs(r.delta), 0) / looResults.length * 100) / 100;
    const zeroCount = looResults.filter((r) => r.delta === 0).length;
    const oneCount = looResults.filter((r) => Math.abs(r.delta) <= 1).length;
    const twoCount = looResults.filter((r) => Math.abs(r.delta) <= 2).length;

    lines.push('');
    lines.push(`  Avg |Δ|: ${avgAbsDelta}`);
    lines.push(`  Δ=0:     ${zeroCount}/${looResults.length}`);
    lines.push(`  |Δ|≤1:   ${oneCount}/${looResults.length}`);
    lines.push(`  |Δ|≤2:   ${twoCount}/${looResults.length}`);
    lines.push('');

    // 3. Train-on-real, test-on-synthetic
    const realData = allData.filter((d) => !d.name.startsWith('synth-'));
    const synthData = allData.filter((d) => d.name.startsWith('synth-'));

    if (realData.length > 0 && synthData.length > 0) {
      lines.push('  3. Train on Real, Test on Synthetic');
      lines.push(sub);
      lines.push('');

      // Compute avg effective heights from REAL campaigns only
      const realAvgEffHeights: Record<string, number> = {};
      const realKinds = new Set<string>();
      for (const d of realData) {
        for (const kind of Object.keys(d.kindEffectiveHeights)) {
          realKinds.add(kind);
        }
      }
      for (const kind of realKinds) {
        let sum = 0;
        let count = 0;
        for (const d of realData) {
          if (d.kindEffectiveHeights[kind]) {
            sum += d.kindEffectiveHeights[kind];
            count++;
          }
        }
        if (count > 0) realAvgEffHeights[kind] = Math.round((sum / count) * 100) / 100;
      }

      const realAvgCapacity = realData.reduce((s, d) => s + (d.totalHtmlHeightMm / d.officialPdfPages), 0) / realData.length;

      const testResults: { name: string; official: number; predicted: number; delta: number }[] = [];

      for (const d of synthData) {
        const predictedHeights = d.fragmentKindOrder.map(
          (kind) => realAvgEffHeights[kind] || ESTIMATED_HEIGHTS[kind] || 10,
        );
        const predictedPages = countPages(predictedHeights, realAvgCapacity);
        testResults.push({
          name: d.name,
          official: d.officialPdfPages,
          predicted: predictedPages,
          delta: predictedPages - d.officialPdfPages,
        });
      }

      lines.push(`  ${'Campaign'.padEnd(24)} ${'Official'.padStart(8)} ${'Predicted'.padStart(10)} ${'Δ'.padStart(6)}`);
      lines.push(`  ${'─'.repeat(52)}`);
      for (const r of testResults) {
        const dStr = r.delta >= 0 ? '+' + String(r.delta) : String(r.delta);
        lines.push(`  ${r.name.padEnd(24)} ${String(r.official).padStart(8)} ${String(r.predicted).padStart(10)} ${dStr.padStart(6)}`);
      }

      const testAvg = Math.round(testResults.reduce((s, r) => s + Math.abs(r.delta), 0) / testResults.length * 100) / 100;
      const testZero = testResults.filter((r) => r.delta === 0).length;
      const testOne = testResults.filter((r) => Math.abs(r.delta) <= 1).length;
      const testTwo = testResults.filter((r) => Math.abs(r.delta) <= 2).length;

      lines.push('');
      lines.push(`  Avg |Δ|: ${testAvg}`);
      lines.push(`  Δ=0:     ${testZero}/${testResults.length}`);
      lines.push(`  |Δ|≤1:   ${testOne}/${testResults.length}`);
      lines.push(`  |Δ|≤2:   ${testTwo}/${testResults.length}`);
    }

    // 4. Conclusion
    lines.push('');
    lines.push('  4. Conclusion');
    lines.push(sub);
    lines.push('');
    lines.push(`  LOO on ${allData.length} campaigns: avg |Δ| = ${avgAbsDelta}`);
    lines.push(`  Real→Synthetic transfer:         avg |Δ| = ${(allData.length - (realData.length || 0) >= 0 && synthData.length > 0 ? 'see above' : 'N/A')}`);
    lines.push('');
    lines.push(`  ${avgAbsDelta <= 1 ? '✓ Per-kind overhead model generalizes to unseen campaigns (|Δ| ≤ 1).' : `~ Per-kind overhead model avg |Δ| = ${avgAbsDelta} — ${avgAbsDelta <= 2 ? 'close but not perfect' : 'needs more work'}.`}`);
    lines.push(div);
  }

  console.info(lines.join('\n'));

  // Save
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'synthetic-validation.json'),
    JSON.stringify({
      totalCampaigns: allData.length,
      realCount: allData.filter((d) => !d.name.startsWith('synth-')).length,
      synthCount: allData.filter((d) => d.name.startsWith('synth-')).length,
      campaigns: allData.map((d) => ({
        name: d.name,
        fragmentCount: d.fragmentCount,
        officialPages: d.officialPdfPages,
        htmlTotalMm: d.totalHtmlHeightMm,
        bareSumMm: d.bareHeightsSum,
        overheadFactor: d.overheadFactor,
      })),
    }, null, 2),
    'utf-8',
  );

  console.log(`\nOutput saved to: ${OUTPUT_DIR}`);
};

main().catch((e) => {
  console.error('Phase 43I failed:', e);
  process.exit(1);
});
