/**
 * Phase 7W — Experimental Dual Run Audit (audit only, no production changes)
 *
 * Runs BOTH report paths side-by-side on real campaigns and compares output:
 *   1. Official path:      getCampaignReportPayload → generateHtmlFromPayload (+ optional PDF)
 *   2. Experimental path:  getCampaignReportPayload → buildFragments → PageDocument
 *                          → renderExperimentalPageDocumentHtmlWithVerification (+ optional PDF)
 *
 * Nothing is replaced. The official pipeline is only invoked read-only.
 * `buildFragments` is ported verbatim from frontend/src/utils/reportFragments.ts
 * (the real Designer converter) so the experimental stream is faithful; the only
 * change is importing numbering helpers from the backend equivalent module.
 *
 * Usage: npx ts-node scripts/audit-7w-dual-run.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/reports/reports.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  renderExperimentalPageDocumentHtmlWithVerification,
  type ExperimentalPageDocumentModel,
} from '../src/reports/experimental-page-document-renderer';
import { ExperimentalPuppeteerPdfAdapter } from '../src/reports/experimental-puppeteer-pdf.adapter';
import {
  getLevel1Number,
  getLevel2ArabicLetter,
  getLevel3Ordinal,
  getLevel4Number,
  getLevel5ArabicLetter,
  DEFAULT_FORMATTING_CONFIG,
} from '../src/utils/reportNumbering';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.join(__dirname, '..', 'audit-output', '7w');

// ─── Ported faithfully from frontend/src/utils/reportFragments.ts ────────────
type FragmentKind = string;
type Fragment = { id: string; kind: FragmentKind; title: string; atomicity: 'atomic' | 'splittable'; keepWithNext?: boolean; keepTogether?: boolean; data: any };
const LIST_TYPES = ['positives', 'negatives', 'impediments', 'obstacles'] as const;
type ListType = (typeof LIST_TYPES)[number];
const LIST_COLORS: Record<ListType, string> = { positives: '#1a5235', negatives: '#742a2a', impediments: '#7b341e', obstacles: '#5a3e2b' };
const SEC_TITLES: Record<ListType, string> = { positives: 'الإيجابيات وعوامل القوة العامة:', negatives: 'السلبيات ونقاط التقصير العامة:', impediments: 'المعوقات العامة:', obstacles: 'المعاضل العامة:' };
const SUB_TITLES: Record<ListType, string> = { positives: 'الإيجابيات وعوامل القوة المرصودة:', negatives: 'السلبيات ونقاط التقصير الإداري والتنظيمي:', impediments: 'المعوقات ونقص الدعم اللوجستي والبشري:', obstacles: 'المعاضل والمشاكل الهيكلية الحرجة (تتطلب تدخل المراجع):' };
const MANUAL_TITLES: Record<ListType, string> = { positives: 'الإيجابيات ورصد كفاءة الأداء:', negatives: 'السلبيات ونقاط الضعف المرصودة:', impediments: 'المعوقات التي تواجه العمل:', obstacles: 'المعاضل التي واجهت الأداء الميداني:' };
const OFFICIAL_NOTE_TITLES: Record<ListType, string> = { positives: 'الإيجابيات', negatives: 'السلبيات', impediments: 'المعوقات', obstacles: 'المعاضل' };
const showFlag = (type: ListType): string => `show${type.charAt(0).toUpperCase()}${type.slice(1)}`;
const hasItems = (list: unknown): list is any[] => Array.isArray(list) && list.length > 0;
const splitAppendixParagraphs = (text: unknown): string[] => { if (typeof text !== 'string') return ['']; const parts = text.split(/\r?\n\s*\r?\n/); return parts.length > 0 ? parts : [text]; };
const buildOfficerInfoItems = (officerInfo: any): string[] => {
  if (!officerInfo) return [];
  const items = [
    `الرتبة والاسم الكامل / ${officerInfo.rank} ${officerInfo.fullName}.`,
    `الرقم الإحصائي/ (${officerInfo.statisticalNumber}).`,
    `تاريخ استلام المنصب/ ${officerInfo.joinedDate} (${officerInfo.positionStatus}).`,
  ];
  if (officerInfo.education && officerInfo.education !== '—') items.push(`التحصيل الدراسي/ ${officerInfo.education}.`);
  return items;
};

const buildFragments = (payload: any): Fragment[] => {
  if (!payload) return [];
  const fc = payload.formatting || DEFAULT_FORMATTING_CONFIG;
  const frags: Fragment[] = [];
  frags.push({ id: 'frag-report-header', kind: 'reportHeader', title: 'رأس التقرير', atomicity: 'atomic', data: { startDateText: payload.startDateText, startDate: payload.startDate, formationNumber: payload.formationNumber } });
  frags.push({ id: 'frag-report-title', kind: 'reportTitle', title: 'عنوان التقرير', atomicity: 'atomic', keepWithNext: true, data: { title: payload.title || '' } });
  if (payload.assignmentText) frags.push({ id: 'frag-assignment', kind: 'assignment', title: 'التكليف', atomicity: 'atomic', data: { number: getLevel1Number(1, fc), assignmentText: payload.assignmentText } });
  if (Array.isArray(payload.committeeMembers) && payload.committeeMembers.length > 0) frags.push({ id: 'frag-committee', kind: 'committee', title: 'التأليف', atomicity: 'atomic', data: { number: getLevel1Number(2, fc), committeeMembers: payload.committeeMembers } });
  if (payload.purposeText) frags.push({ id: 'frag-purpose', kind: 'purpose', title: 'الغاية', atomicity: 'atomic', data: { number: getLevel1Number(3, fc), purposeText: payload.purposeText } });
  if (payload.durationText) frags.push({ id: 'frag-visit-date', kind: 'visitDate', title: 'تاريخ التفتيش', atomicity: 'atomic', data: { number: getLevel1Number(4, fc), durationText: payload.durationText } });
  if (Array.isArray(payload.positions)) frags.push({ id: 'frag-summary-tables', kind: 'summaryTables', title: 'جدول المدراء والآمرين وشاغلي المناصب الأساسية', atomicity: 'atomic', data: { number: getLevel1Number(5, fc), positions: payload.positions } });
  frags.push({ id: 'frag-inspection-details-title', kind: 'sectionTitle', title: 'تفاصيل التفتيش', atomicity: 'atomic', keepWithNext: true, data: { number: getLevel1Number(6, fc), title: 'تفاصيل التفتيش' } });
  let level2 = 1;
  const sections = Array.isArray(payload.sections) ? payload.sections : [];
  sections.forEach((sec: any, si: number) => {
    if (sec?.visible === false) return;
    if (sec?.isManual) return;
    const secNumber = sec.numbering || getLevel2ArabicLetter(level2++, fc);
    frags.push({ id: `sec-${si}-title`, kind: 'sectionTitle', title: sec.title || 'قسم رئيسي', atomicity: 'atomic', keepWithNext: true, data: { number: secNumber, title: sec.title || '' } });
    if (sec.narrativeText) frags.push({ id: `sec-${si}-narrative`, kind: 'narrative', title: `سرد القسم: ${sec.title || ''}`, atomicity: 'atomic', data: { text: sec.narrativeText, variant: 'section', formattingConfig: fc } });
    if (sec.isManual) {
      let manualCounter = 1;
      LIST_TYPES.forEach((type) => {
        const list = sec[`${type}List`];
        if (sec[showFlag(type)] && hasItems(list)) {
          frags.push({ id: `sec-${si}-manual-${type}-title`, kind: 'manualFindingListTitle', title: MANUAL_TITLES[type], atomicity: 'atomic', keepWithNext: true, data: { number: getLevel2ArabicLetter(manualCounter++, fc), titleText: MANUAL_TITLES[type], color: LIST_COLORS[type], formattingConfig: fc } });
          list.forEach((text: string, itemIdx: number) => { frags.push({ id: `sec-${si}-manual-${type}-item-${itemIdx}`, kind: 'manualFindingListItem', title: MANUAL_TITLES[type], atomicity: 'atomic', data: { number: getLevel3Ordinal(itemIdx + 1, fc), text, color: LIST_COLORS[type], formattingConfig: fc } }); });
        }
      });
    } else {
      let secListCounter = 1;
      LIST_TYPES.forEach((type) => {
        const list = sec[`${type}List`];
        if (sec[showFlag(type)] && hasItems(list)) {
          frags.push({ id: `sec-${si}-list-${type}-title`, kind: 'findingListTitle', title: SEC_TITLES[type], atomicity: 'atomic', keepWithNext: true, data: { number: getLevel4Number(secListCounter++, fc), titleText: SEC_TITLES[type], color: LIST_COLORS[type], fontSize: '13.5px', formattingConfig: fc } });
          list.forEach((text: string, itemIdx: number) => { frags.push({ id: `sec-${si}-list-${type}-item-${itemIdx}`, kind: 'findingListItem', title: SEC_TITLES[type], atomicity: 'atomic', data: { number: getLevel5ArabicLetter(itemIdx + 1, fc), text, color: LIST_COLORS[type], fontSize: '13.5px', formattingConfig: fc } }); });
        }
      });
      const subs = Array.isArray(sec.subsections) ? sec.subsections : [];
      subs.forEach((sub: any, sj: number) => {
        if (sub?.visible === false) return;
        const subNumber = sub.numbering || getLevel3Ordinal(sj + 1, fc);
        frags.push({ id: `sec-${si}-sub-${sj}-title`, kind: 'subsectionTitle', title: sub.title || 'قسم فرعي', atomicity: 'atomic', keepWithNext: true, data: { number: subNumber, title: sub.title || '' } });
        const officerItems = buildOfficerInfoItems(sub.officerInfo);
        officerItems.forEach((text, itemIdx) => { frags.push({ id: `sec-${si}-sub-${sj}-officer-${itemIdx}`, kind: 'inspectionDetailItem', title: `تفاصيل: ${sub.title || ''}`, atomicity: 'atomic', data: { number: itemIdx + 1, text, formattingConfig: fc } }); });
        const baseIdx = sub.officerInfo ? (sub.officerInfo.education && sub.officerInfo.education !== '—' ? 4 : 3) : 0;
        if (hasItems(sub.findings)) sub.findings.forEach((text: string, itemIdx: number) => { frags.push({ id: `sec-${si}-sub-${sj}-finding-${itemIdx}`, kind: 'inspectionDetailItem', title: `مكتشفات: ${sub.title || ''}`, atomicity: 'atomic', data: { number: baseIdx + itemIdx + 1, text, formattingConfig: fc } }); });
        if (sub.narrativeText) frags.push({ id: `sec-${si}-sub-${sj}-narrative`, kind: 'narrative', title: `سرد فرعي: ${sub.title || ''}`, atomicity: 'atomic', data: { text: sub.narrativeText, variant: 'subsection', formattingConfig: fc } });
        let subListCounter = 1;
        if (sub.showDetails) {
          const detailsNumber = getLevel4Number(subListCounter++, fc);
          frags.push({ id: `sec-${si}-sub-${sj}-details-title`, kind: 'inspectionDetailsTitle', title: 'الدرجات والملاحظات التفصيلية للبنود', atomicity: 'atomic', keepWithNext: true, data: { number: detailsNumber, titleText: 'الدرجات والملاحظات التفصيلية للبنود:', formattingConfig: fc } });
          (Array.isArray(sub.detailsList) ? sub.detailsList : []).forEach((text: string, itemIdx: number) => { frags.push({ id: `sec-${si}-sub-${sj}-details-${itemIdx}`, kind: 'inspectionDetailItem', title: 'ملاحظة تفصيلية', atomicity: 'atomic', data: { text, formattingConfig: fc, variant: 'detail' } }); });
        }
        LIST_TYPES.forEach((type) => {
          const list = sub[`${type}List`];
          if (sub[showFlag(type)] && hasItems(list)) {
            const number = type === 'obstacles' ? undefined : getLevel4Number(subListCounter++, fc);
            frags.push({ id: `sec-${si}-sub-${sj}-list-${type}-title`, kind: 'findingListTitle', title: SUB_TITLES[type], atomicity: 'atomic', keepWithNext: true, data: { number, titleText: SUB_TITLES[type], color: LIST_COLORS[type], fontSize: '13px', formattingConfig: fc } });
            list.forEach((text: string, itemIdx: number) => { frags.push({ id: `sec-${si}-sub-${sj}-list-${type}-item-${itemIdx}`, kind: 'findingListItem', title: SUB_TITLES[type], atomicity: 'atomic', data: { number: getLevel5ArabicLetter(itemIdx + 1, fc), text, color: LIST_COLORS[type], fontSize: '13px', formattingConfig: fc } }); });
          }
        });
        if (hasItems(sub.detailedTables)) frags.push({ id: `sec-${si}-sub-${sj}-tables`, kind: 'detailedTables', title: `جداول تفصيلية: ${sub.title || ''}`, atomicity: 'atomic', data: { tables: sub.detailedTables, formattingConfig: fc } });
      });
    }
  });
  const officialNotesSection = Array.isArray(payload.sections) ? payload.sections.find((sec: any) => sec?.id === 'manual-notes' || sec?.isManual) : null;
  frags.push({ id: 'frag-official-notes-title', kind: 'officialNotesTitle', title: 'الملاحظات', atomicity: 'atomic', keepWithNext: true, data: { number: getLevel1Number(7, fc), formattingConfig: fc } });
  LIST_TYPES.forEach((type, idx) => {
    const list = officialNotesSection?.[`${type}List`] || [];
    frags.push({ id: `frag-official-notes-${type}-title`, kind: 'notesCategoryTitle', title: OFFICIAL_NOTE_TITLES[type], atomicity: 'atomic', keepWithNext: true, data: { number: getLevel2ArabicLetter(idx + 1, fc), titleText: OFFICIAL_NOTE_TITLES[type], formattingConfig: fc } });
    if (list.length > 0) list.forEach((text: string, itemIdx: number) => { frags.push({ id: `frag-official-notes-${type}-item-${itemIdx}`, kind: 'noteItem', title: OFFICIAL_NOTE_TITLES[type], atomicity: 'atomic', data: { number: getLevel3Ordinal(itemIdx + 1, fc), text, formattingConfig: fc } }); });
    else frags.push({ id: `frag-official-notes-${type}-empty`, kind: 'noteItem', title: OFFICIAL_NOTE_TITLES[type], atomicity: 'atomic', data: { text: 'لا توجد ملاحظات ضمن هذا التصنيف.', isEmpty: true, formattingConfig: fc } });
  });
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  frags.push({ id: 'frag-recommendations-title', kind: 'recommendationsTitle', title: 'التوصيات', atomicity: 'atomic', keepWithNext: true, data: { number: getLevel1Number(8, fc), formattingConfig: fc } });
  if (recommendations.length > 0) {
    recommendations.forEach((recGroup: any, grpIdx: number) => {
      if (!recGroup?.visible) return;
      frags.push({ id: `frag-recommendations-group-${recGroup.id || grpIdx}-title`, kind: 'recommendationAuthorityTitle', title: recGroup.authority || 'جهة توصية', atomicity: 'atomic', keepWithNext: true, data: { number: getLevel2ArabicLetter(grpIdx + 1, fc), authority: recGroup.authority, formattingConfig: fc } });
      if (Array.isArray(recGroup.recs) && recGroup.recs.length > 0) recGroup.recs.forEach((rec: any, recIdx: number) => { frags.push({ id: `frag-recommendations-group-${recGroup.id || grpIdx}-item-${rec.id || recIdx}`, kind: 'recommendationItem', title: recGroup.authority || 'توصية', atomicity: 'atomic', data: { number: getLevel3Ordinal(recIdx + 1, fc).replace('.', ':'), recommendation: rec, formattingConfig: fc } }); });
      else frags.push({ id: `frag-recommendations-group-${recGroup.id || grpIdx}-empty`, kind: 'recommendationItem', title: recGroup.authority || 'توصية', atomicity: 'atomic', data: { isEmpty: true, text: 'لا توجد توصيات مدخلة تحت هذه الجهة.', formattingConfig: fc } });
    });
  } else {
    frags.push({ id: 'frag-recommendations-empty', kind: 'recommendationItem', title: 'التوصيات', atomicity: 'atomic', data: { isSectionEmpty: true, text: 'لا توجد توصيات مدخلة.', formattingConfig: fc } });
  }
  const appendices = Array.isArray(payload.appendices) ? payload.appendices : [];
  if (appendices.some((appendix: any) => appendix?.visible)) {
    frags.push({ id: 'frag-appendices-title', kind: 'appendicesTitle', title: 'الملاحق', atomicity: 'atomic', keepWithNext: true, data: { number: getLevel1Number(9, fc), formattingConfig: fc } });
    appendices.forEach((appendix: any, appendixIdx: number) => {
      if (!appendix?.visible) return;
      frags.push({ id: `frag-appendix-${appendix.id || appendixIdx}-title`, kind: 'appendixTitle', title: `ملحق (${appendix.symbol})`, atomicity: 'atomic', keepWithNext: true, data: { number: getLevel2ArabicLetter(appendixIdx + 1, fc), symbol: appendix.symbol, formattingConfig: fc } });
      splitAppendixParagraphs(appendix.text).forEach((paragraph: string, paragraphIdx: number) => { frags.push({ id: `frag-appendix-${appendix.id || appendixIdx}-paragraph-${paragraphIdx}`, kind: 'appendixParagraph', title: `نص ملحق (${appendix.symbol})`, atomicity: 'atomic', data: { text: paragraph, formattingConfig: fc } }); });
    });
  }
  frags.push({ id: 'frag-final-evaluation', kind: 'finalEvaluation', title: 'التقييم النهائي', atomicity: 'atomic', data: { number: getLevel1Number(10, fc), finalEvaluation: payload.finalEvaluation, formattingConfig: fc } });
  if (payload.signatures) frags.push({ id: 'frag-signatures', kind: 'signatures', title: 'التوقيعات', atomicity: 'atomic', keepTogether: true, data: { signatures: payload.signatures } });
  return frags;
};
// ─── end ported buildFragments ───────────────────────────────────────────────

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
}
function wordCount(html: string): number {
  return stripHtml(html).split(/\s+/).filter(Boolean).length;
}
function countPdfPages(buf: Buffer): number {
  const s = buf.toString('latin1');
  const matches = s.match(/\/Type\s*\/Page(?![s])/g);
  return matches ? matches.length : 0;
}

function toPageDocument(fragments: Fragment[]): ExperimentalPageDocumentModel {
  return {
    source: 'designer',
    layout: { pageSize: 'A4', widthMm: 210, heightMm: 297, marginsMm: { top: 20, right: 15, bottom: 20, left: 15 } },
    fragments: fragments as any,
    pages: [{ pageNumber: 1, fragments: fragments as any }],
  };
}

type Severity = 'Blocking' | 'Major' | 'Minor';
type Diff = { severity: Severity; text: string };

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reportsService = app.get(ReportsService);
  const prisma = app.get(PrismaService);
  const adapter = new ExperimentalPuppeteerPdfAdapter();

  const allCampaigns = await prisma.campaign.findMany({ select: { id: true, name: true, type: true } });

  console.log('='.repeat(74));
  console.log('Phase 7W — Experimental Dual Run Audit');
  console.log('='.repeat(74));
  console.log(`Real campaigns available: ${allCampaigns.length}`);
  console.log('');

  type Row = {
    id: string; name: string; type: string;
    fragments: number; expKinds: number;
    sections: number;
    officialWords: number; expWords: number; wordRatio: number;
    officialPages: number | null; expPages: number | null;
    hasDetailedTables: boolean; hasSummaryTables: boolean; positions: number;
    officialLogo: boolean; expLogo: boolean;
    officialCairo: boolean; expCairo: boolean;
    officialSignatures: boolean; expSignatures: boolean;
    officialRecs: boolean; expRecs: boolean;
    officialFindings: boolean; expFindings: boolean;
    verificationOk: boolean; orderPreserved: boolean; missing: number;
    diffs: Diff[];
  };
  const rows: Row[] = [];

  for (const c of allCampaigns) {
    console.log(`── Dual run: ${c.name} (${c.id.slice(0, 8)}…) ──`);
    const payload = await reportsService.getCampaignReportPayload(c.id);
    const officialHtml = reportsService.generateHtmlFromPayload(payload);
    const fragments = buildFragments(payload);
    const pageDocument = toPageDocument(fragments);
    const expResult = renderExperimentalPageDocumentHtmlWithVerification(pageDocument, { renderMode: 'strictPages', pageNumbers: true, returnDiagnostics: true });
    const expHtml = expResult.html;

    fs.writeFileSync(path.join(OUTPUT_DIR, `official-${c.id.slice(0, 8)}.html`), officialHtml, 'utf-8');
    fs.writeFileSync(path.join(OUTPUT_DIR, `experimental-${c.id.slice(0, 8)}.html`), expHtml, 'utf-8');

    // PDF page counts (best-effort; both via puppeteer).
    let officialPages: number | null = null;
    let expPages: number | null = null;
    try {
      const offPdf = await reportsService.generateCampaignReportPdf(c.id);
      officialPages = countPdfPages(offPdf);
      const expPdf = await adapter.renderPdfBufferFromHtml(expHtml);
      expPages = countPdfPages(expPdf);
    } catch (e: any) {
      console.log(`   (PDF render skipped: ${e?.message || e})`);
    }

    const visibleSections = (payload.sections || []).filter((s: any) => s?.visible !== false && !s?.isManual).length;
    const positions = Array.isArray(payload.positions) ? payload.positions.length : 0;
    const kindsSet = new Set(fragments.map((f) => f.kind));
    const kindCount = (k: string) => fragments.filter((f) => f.kind === k).length;

    // Ground-truth signals derived from the SHARED payload (avoids asymmetric
    // heuristics that produce false "parity mismatch" diffs). In education
    // reports finding content flows through inspectionDetailItem + detailedTables,
    // and the recommendations section is always emitted (placeholder when empty)
    // on BOTH paths by design.
    const sectionsArr = payload.sections || [];
    const payloadFindings = sectionsArr.some((s: any) =>
      LIST_TYPES.some((t) => hasItems(s?.[`${t}List`])) ||
      (Array.isArray(s?.subsections) && s.subsections.some((sub: any) =>
        LIST_TYPES.some((t) => hasItems(sub?.[`${t}List`])) || hasItems(sub?.findings) || sub?.showDetails)));
    const expRenderedFindings = kindCount('findingListItem') + kindCount('inspectionDetailItem') + kindCount('detailedTables') > 0;
    const payloadRecs = Array.isArray(payload.recommendations) && payload.recommendations.length > 0;
    const expRenderedRecs = kindCount('recommendationItem') > 0; // includes empty-state placeholder, matching official

    const row: Row = {
      id: c.id, name: c.name, type: c.type,
      fragments: fragments.length, expKinds: kindsSet.size,
      sections: visibleSections,
      officialWords: wordCount(officialHtml), expWords: wordCount(expHtml), wordRatio: 0,
      officialPages, expPages,
      hasDetailedTables: kindsSet.has('detailedTables'),
      hasSummaryTables: kindsSet.has('summaryTables'),
      positions,
      officialLogo: officialHtml.includes('data:image/png;base64') || officialHtml.includes('logo'),
      expLogo: expHtml.includes('data:image/png;base64') || expHtml.includes('logo-header'),
      officialCairo: officialHtml.includes('Cairo'),
      expCairo: expHtml.includes('Cairo'),
      officialSignatures: officialHtml.includes('signatures-container') || !!payload.signatures,
      expSignatures: expHtml.includes('fragment-signatures') || expHtml.includes('sig-container'),
      officialRecs: payloadRecs,
      expRecs: payloadRecs ? expRenderedRecs : false,
      officialFindings: payloadFindings,
      expFindings: payloadFindings ? expRenderedFindings : false,
      verificationOk: expResult.verification.allPageFragmentsVisited && expResult.verification.orderPreserved && expResult.verification.documentFragmentsAccountedFor,
      orderPreserved: expResult.verification.orderPreserved,
      missing: expResult.verification.missingFragmentCount,
      diffs: [],
    };
    row.wordRatio = row.expWords / Math.max(row.officialWords, 1);

    // ─── Classify differences ──────────────────────────────────────────────
    const d: Diff[] = [];
    // Blocking: content/verification integrity
    if (!row.verificationOk) d.push({ severity: 'Blocking', text: 'experimental verification failed (fragments dropped or reordered)' });
    if (row.missing > 0) d.push({ severity: 'Blocking', text: `${row.missing} fragment(s) missing in experimental output` });
    if (row.hasDetailedTables && !expHtml.includes('dt-table')) d.push({ severity: 'Blocking', text: 'detailedTables present but no <table> rendered (data loss)' });
    if (positions > 0 && !expHtml.includes('st-table')) d.push({ severity: 'Blocking', text: 'positions present but summaryTables <table> missing' });
    if (row.officialWords > 300 && row.wordRatio < 0.6) d.push({ severity: 'Blocking', text: `severe content shortfall: experimental ${row.expWords}w vs official ${row.officialWords}w (${(row.wordRatio * 100).toFixed(0)}%)` });
    // Major: structural/feature parity
    if (row.officialSignatures !== row.expSignatures) d.push({ severity: 'Major', text: `signatures parity mismatch (official=${row.officialSignatures}, exp=${row.expSignatures})` });
    if (row.officialRecs !== row.expRecs) d.push({ severity: 'Major', text: `recommendations parity mismatch (official=${row.officialRecs}, exp=${row.expRecs})` });
    if (row.officialFindings !== row.expFindings) d.push({ severity: 'Major', text: `findings parity mismatch (official=${row.officialFindings}, exp=${row.expFindings})` });
    if (row.officialLogo !== row.expLogo) d.push({ severity: 'Major', text: `logo parity mismatch (official=${row.officialLogo}, exp=${row.expLogo})` });
    if (row.officialCairo !== row.expCairo) d.push({ severity: 'Major', text: `Cairo font parity mismatch (official=${row.officialCairo}, exp=${row.expCairo})` });
    if (row.officialWords > 300 && (row.wordRatio >= 0.6 && row.wordRatio < 0.8)) d.push({ severity: 'Major', text: `content shortfall: ${(row.wordRatio * 100).toFixed(0)}% of official words` });
    if (officialPages !== null && expPages !== null && officialPages !== expPages) d.push({ severity: 'Major', text: `page count differs: official=${officialPages}, experimental=${expPages}` });
    // Minor: cosmetic/known-by-design
    if (row.wordRatio > 1.2) d.push({ severity: 'Minor', text: `experimental has ${(row.wordRatio * 100).toFixed(0)}% of official words (extra labels/placeholders)` });
    d.push({ severity: 'Minor', text: 'page numbering mechanism differs (official: Puppeteer natural flow; experimental: pre-paginated strictPages on single page in this harness)' });
    row.diffs = d;
    rows.push(row);

    console.log(`   fragments=${row.fragments} kinds=${row.expKinds} sections=${row.sections} positions=${row.positions} detailedTables=${row.hasDetailedTables}`);
    console.log(`   words official=${row.officialWords} exp=${row.expWords} ratio=${(row.wordRatio * 100).toFixed(0)}%  pages official=${officialPages ?? 'N/A'} exp=${expPages ?? 'N/A'}`);
    console.log(`   verification.ok=${row.verificationOk} orderPreserved=${row.orderPreserved} missing=${row.missing}`);
    console.log(`   diffs: Blocking=${d.filter((x) => x.severity === 'Blocking').length} Major=${d.filter((x) => x.severity === 'Major').length} Minor=${d.filter((x) => x.severity === 'Minor').length}`);
    console.log('');
  }

  // ─── Per-campaign comparison tables ────────────────────────────────────────
  console.log('='.repeat(74));
  console.log('PER-CAMPAIGN COMPARISON');
  console.log('='.repeat(74));
  for (const r of rows) {
    console.log(`\n■ ${r.name} (${r.type}) [${r.id.slice(0, 8)}]`);
    const fmt = (label: string, off: any, exp: any) => console.log(`   ${label.padEnd(22)} | official: ${String(off).padEnd(10)} | experimental: ${exp}`);
    fmt('pages', r.officialPages ?? 'N/A', r.expPages ?? 'N/A');
    fmt('words', r.officialWords, `${r.expWords} (${(r.wordRatio * 100).toFixed(0)}%)`);
    fmt('sections (visible)', r.sections, r.sections);
    fmt('fragments', 'N/A', `${r.fragments} (${r.expKinds} kinds)`);
    fmt('detailedTables', r.hasDetailedTables, r.hasDetailedTables);
    fmt('summaryTables/positions', `${r.positions} pos`, r.hasSummaryTables);
    fmt('logo', r.officialLogo, r.expLogo);
    fmt('Cairo font', r.officialCairo, r.expCairo);
    fmt('signatures', r.officialSignatures, r.expSignatures);
    fmt('recommendations', r.officialRecs, r.expRecs);
    fmt('findings', r.officialFindings, r.expFindings);
    fmt('verification.ok', '—', r.verificationOk);
  }

  // ─── Aggregated differences ────────────────────────────────────────────────
  const allBlocking = [...new Set(rows.flatMap((r) => r.diffs.filter((d) => d.severity === 'Blocking').map((d) => d.text)))];
  const allMajor = [...new Set(rows.flatMap((r) => r.diffs.filter((d) => d.severity === 'Major').map((d) => d.text)))];
  const allMinor = [...new Set(rows.flatMap((r) => r.diffs.filter((d) => d.severity === 'Minor').map((d) => d.text)))];

  console.log('\n' + '='.repeat(74));
  console.log('AGGREGATED DIFFERENCES');
  console.log('='.repeat(74));
  console.log(`\nBlocking (${allBlocking.length}):`);
  allBlocking.length ? allBlocking.forEach((t) => console.log(`   - ${t}`)) : console.log('   (none)');
  console.log(`\nMajor (${allMajor.length}):`);
  allMajor.length ? allMajor.forEach((t) => console.log(`   - ${t}`)) : console.log('   (none)');
  console.log(`\nMinor (${allMinor.length}):`);
  allMinor.length ? allMinor.forEach((t) => console.log(`   - ${t}`)) : console.log('   (none)');

  const anyDetailedReal = rows.some((r) => r.hasDetailedTables);
  console.log('\n' + '='.repeat(74));
  console.log(`detailedTables exercised by a REAL campaign: ${anyDetailedReal ? 'YES' : 'NO (only by Phase 7V sample)'}`);
  console.log(`Feature-flag eligibility: ${allBlocking.length === 0 ? 'ELIGIBLE (no Blocking diffs)' : 'NOT ELIGIBLE (Blocking diffs present)'}`);
  console.log('='.repeat(74));

  await app.close();
}

main().catch((err) => { console.error('Dual run failed:', err); process.exit(1); });
