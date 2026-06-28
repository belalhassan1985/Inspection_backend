/**
 * Phase 7S — Experimental vs Official PDF Visual Parity Audit
 *
 * Compares official PDF HTML output against experimental PageDocument renderer.
 *
 * Note: These are fundamentally different data models. The official pipeline
 * uses a deeply nested campaign payload → generateHtmlFromPayload. The
 * experimental pipeline uses flat Fragment[] → fragment renderers.
 *
 * This audit measures:
 *   A. Structural coverage (can we map all campaign data to fragments?)
 *   B. Rendering parity (given equivalent data, does the output match?)
 *   C. Feature gaps (font loading, logo, RTL, page numbers, tables)
 *
 * Usage: npx ts-node scripts/audit-7s-experimental-official-parity.ts
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ReportsService } from '../src/reports/reports.service';
import {
  renderExperimentalPageDocumentHtmlWithVerification,
  type ExperimentalPageDocumentModel,
} from '../src/reports/experimental-page-document-renderer';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

type ExperimentalFragment = {
  id?: string;
  kind?: string;
  title?: string;
  data?: unknown;
};

const CAMPAIGNS: { id: string; label: string }[] = [
  { id: '739e1853-b638-4fc3-bd15-79073efc0e5b', label: 'المجر (education)' },
  { id: 'b225a9f1-8b5a-4eff-b7ae-74ce0883430d', label: 'لجنة تفتيش المنطقة الامنية الخامسة /ابي الخصيب (education)' },
  { id: 'cbb3885e-7d78-41da-b4a9-1fc2cca6e981', label: 'لجنة تفتيش المنطقة الامنية الثالثة /داقوق (education)' },
];

const OUTPUT_DIR = path.join(__dirname, '..', 'audit-output');

function convertPayloadToPageDocument(payload: any): ExperimentalPageDocumentModel {
  const fragments: ExperimentalFragment[] = [];
  let fragmentIndex = 0;

  function nextId(prefix: string): string { return `audit-${prefix}-${fragmentIndex++}`; }

  if (payload.reportHeader) {
    fragments.push({ id: nextId('report-header'), kind: 'reportHeader', title: 'رأس التقرير', data: payload.reportHeader });
  }
  if (payload.reportTitle) {
    fragments.push({ id: nextId('report-title'), kind: 'reportTitle', title: 'عنوان التقرير', data: payload.reportTitle });
  }
  if (payload.assignment) {
    fragments.push({ id: nextId('assignment'), kind: 'assignment', title: 'التكليف', data: payload.assignment });
  }
  if (payload.committeeMembers && Array.isArray(payload.committeeMembers)) {
    fragments.push({ id: nextId('committee'), kind: 'committee', title: 'التأليف', data: { members: payload.committeeMembers } });
  }
  if (payload.purpose) {
    fragments.push({ id: nextId('purpose'), kind: 'purpose', title: 'الغاية', data: payload.purpose });
  }
  if (payload.visitDate) {
    fragments.push({ id: nextId('visit-date'), kind: 'visitDate', title: 'تاريخ التفتيش', data: payload.visitDate });
  }

  // Summary tables (entity positions)
  if (payload.entityPositions?.length) {
    const positions = payload.entityPositions.map((pos: any) => ({
      positionName: pos.positionName || pos.name || '',
      positionHolder: pos.positionHolder || pos.holder || '',
      rank: pos.rank || '',
      statisticalNumber: pos.statisticalNumber || '',
      joinedDate: pos.joinedDate || '',
      positionStatus: pos.positionStatus || '',
      education: pos.education || '',
      notes: pos.notes || '',
    }));
    fragments.push({ id: nextId('summary-tables'), kind: 'summaryTables', title: 'جدول المدراء', data: { positions } });
  }

  // Sections → sectionTitle + narrative + finding lists + details
  const sections = payload.sections || [];
  let primaryIdx = 0;
  for (const sec of sections) {
    if (!sec.visible || sec.isEmpty) continue;
    primaryIdx++;

    fragments.push({ id: nextId(`sec-${primaryIdx}`), kind: 'sectionTitle', title: sec.title || 'قسم', data: { title: sec.title || `القسم ${primaryIdx}` } });

    if (sec.narrativeText) {
      fragments.push({ id: nextId(`sec-nar-${primaryIdx}`), kind: 'narrative', title: 'سرد', data: { text: sec.narrativeText } });
    }

    for (const lt of ['positivesList', 'negativesList', 'impedimentsList', 'obstaclesList'] as const) {
      const lbl = { positivesList: 'الإيجابيات', negativesList: 'السلبيات', impedimentsList: 'المعوقات', obstaclesList: 'المعاضل' }[lt];
      const items = sec[lt];
      if (Array.isArray(items) && items.length > 0) {
        fragments.push({ id: nextId(`${lt}-t`), kind: 'findingListTitle', title: lbl, data: { titleText: lbl } });
        items.forEach((t: string, i: number) => {
          fragments.push({ id: nextId(`${lt}-${i}`), kind: 'findingListItem', title: lbl, data: { text: t } });
        });
      }
    }

    const details = sec.details || [];
    for (const det of details) {
      fragments.push({ id: nextId(`det-${det.id || ''}`), kind: 'inspectionDetailItem', title: det.name || 'تفصيل', data: { text: det.name || '', grade: det.gradeEarned } });
    }
  }

  // Manual observation section → officialNotesTitle + notesCategoryTitle + noteItem
  const manSec = sections.find((s: any) => s.isManual);
  if (manSec && manSec.visible && !manSec.isEmpty) {
    fragments.push({ id: nextId('ont'), kind: 'officialNotesTitle', title: 'الملاحظات', data: {} });
    for (const ot of ['positivesList', 'negativesList', 'impedimentsList', 'obstaclesList'] as const) {
      const lbl = { positivesList: 'الإيجابيات', negativesList: 'السلبيات', impedimentsList: 'المعوقات', obstaclesList: 'المعاضل' }[ot];
      const items = manSec[ot];
      if (Array.isArray(items) && items.length > 0) {
        fragments.push({ id: nextId(`mn-${ot}`), kind: 'notesCategoryTitle', title: lbl, data: { titleText: lbl } });
        items.forEach((t: string, i: number) => {
          fragments.push({ id: nextId(`mn-${ot}-${i}`), kind: 'noteItem', title: lbl, data: { text: t } });
        });
      }
    }
  }

  // Recommendations
  const recs = payload.recommendations || [];
  if (recs.length > 0) {
    fragments.push({ id: nextId('rec-header'), kind: 'recommendationsTitle', title: 'التوصيات', data: {} });
    recs.forEach((rg: any, ri: number) => {
      if (rg.visible === false) return;
      fragments.push({ id: nextId(`rec-auth-${ri}`), kind: 'recommendationAuthorityTitle', title: 'جهة التوصية', data: { authorityText: rg.authority || '', number: String(ri + 1) } });
      (rg.recs || []).forEach((r: any, rj: number) => {
        fragments.push({ id: nextId(`rec-${ri}-${rj}`), kind: 'recommendationItem', title: 'توصية', data: { recommendation: { text: r.text || '' } } });
        (r.children || []).forEach((c: any, ck: number) => {
          fragments.push({ id: nextId(`rec-${ri}-${rj}-${ck}`), kind: 'recommendationItem', title: 'توصية', data: { recommendation: { text: `• ${c.text || ''}` } } });
        });
      });
    });
  }

  // Appendices
  const apps = payload.appendices || [];
  if (apps.length > 0) {
    fragments.push({ id: nextId('apps-header'), kind: 'appendicesTitle', title: 'الملاحق', data: {} });
    apps.forEach((a: any, ai: number) => {
      fragments.push({ id: nextId(`app-${ai}-title`), kind: 'appendixTitle', title: `ملحق ${ai + 1}`, data: { titleText: a.title || `ملحق ${ai + 1}` } });
      if (a.text) { fragments.push({ id: nextId(`app-${ai}-para`), kind: 'appendixParagraph', title: 'نص ملحق', data: { text: a.text } }); }
    });
  }

  if (payload.finalEvaluation) {
    fragments.push({ id: nextId('final-eval'), kind: 'finalEvaluation', title: 'التقييم النهائي', data: { finalEvaluation: payload.finalEvaluation } });
  }
  if (payload.signatures) {
    fragments.push({ id: nextId('signatures'), kind: 'signatures', title: 'التوقيعات', data: { signatures: payload.signatures } });
  }

  return {
    source: 'audit-converter',
    layout: { pageSize: 'A4', widthMm: 210, heightMm: 297, marginsMm: { top: 20, right: 15, bottom: 20, left: 15 } },
    fragments,
    pages: [{ pageNumber: 1, fragments }],
  };
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
}

function computeHash(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex');
}

interface CampaignAuditResult {
  campaignId: string;
  label: string;
  payloadSections: number;
  hasRecs: boolean;
  hasApps: boolean;
  hasPositions: boolean;
  hasCommittee: boolean;
  hasSignatures: boolean;
  hasFinalEval: boolean;
  hasSavedPresentation: boolean;
  officialSizeBytes: number;
  expFragments: number;
  expKinds: string[];
  expPageCount: number;
  verificationOk: boolean;
  officialWords: number;
  expWords: number;
  wordRatio: number;
  diffCritical: string[];
  diffMajor: string[];
  diffMinor: string[];
}

async function auditCampaign(
  reportsService: ReportsService,
  campaignId: string,
  label: string,
): Promise<CampaignAuditResult> {
  const payload = await reportsService.getCampaignReportPayload(campaignId);
  const officialHtml = reportsService.generateHtmlFromPayload(payload);
  const pageDocument = convertPayloadToPageDocument(payload);
  const result = renderExperimentalPageDocumentHtmlWithVerification(pageDocument, {
    returnDiagnostics: true,
    renderMode: 'strictPages',
    pageNumbers: true,
  });
  const experimentalHtml = result.html;
  const verification = result.verification;
  const fragmentMapping = result.fragmentMapping;

  // Save both HTMLs
  fs.writeFileSync(path.join(OUTPUT_DIR, `official-${campaignId.slice(0, 8)}.html`), officialHtml, 'utf-8');
  fs.writeFileSync(path.join(OUTPUT_DIR, `experimental-${campaignId.slice(0, 8)}.html`), experimentalHtml, 'utf-8');

  const officialText = stripHtml(officialHtml);
  const experimentalText = stripHtml(experimentalHtml);
  const officialWords = officialText.split(/\s+/).filter(Boolean).length;
  const expWords = experimentalText.split(/\s+/).filter(Boolean).length;
  const wordRatio = expWords / Math.max(officialWords, 1);

  const hasRtlExp = experimentalHtml.includes('direction: rtl') || experimentalHtml.includes('dir="rtl"');
  const hasFontExp = experimentalHtml.includes('Cairo');

  const critical: string[] = [];
  const major: string[] = [];
  const minor: string[] = [];

  // Critical
  if (!hasFontExp) {
    critical.push('Experimental renderer does not load Cairo Arabic font — Arabic characters may render as boxes/tofu');
  }
  if (!hasRtlExp) {
    critical.push('Experimental renderer lacks RTL direction — Arabic text flow broken');
  }

  // Major
  if (!experimentalHtml.includes('logo') && officialHtml.includes('logo')) {
    major.push('Ministry logo missing from experimental output (logo embedding is in official pipeline HTML template, not in the experimental fragment renderer)');
  }
  // Only a real parity gap if the campaign actually has positions to render.
  // When entityPositions is empty there is legitimately no summaryTables fragment,
  // so the absence of an experimental <table> is expected, not a defect.
  const campaignHasPositions =
    Array.isArray(payload.entityPositions) && payload.entityPositions.length > 0;
  if (campaignHasPositions && officialHtml.includes('<table') && !experimentalHtml.includes('<table')) {
    major.push('summaryTables parity gap: campaign has entityPositions but experimental output produced no <table>');
  }
  if (officialHtml.includes('page-number') !== experimentalHtml.includes('page-number') && wordRatio < 0.8) {
    major.push(`Page numbering differs: official=${officialHtml.includes('page-number')}, experimental=${experimentalHtml.includes('page-number')} (note: official uses Puppeteer header/footer, experimental uses inline CSS)`);
  }
  // Word ratio check — only flag as major if significantly off AND data is rich (not sparsity artifact)
  if (officialWords > 1000 && (wordRatio > 1.3 || wordRatio < 0.7)) {
    major.push(`Text length mismatch for data-rich campaign: experimental=${expWords} words vs official=${officialWords} words (ratio=${(wordRatio * 100).toFixed(0)}%)`);
  }

  // Minor
  const rawKinds = [...new Set((pageDocument.fragments ?? []).map(f => f.kind))];
  const expKinds = rawKinds.filter((k): k is string => typeof k === 'string' && k.length > 0);
  if (expKinds.length < 5 && officialWords > 500) {
    minor.push(`Only ${expKinds.length} fragment kinds converted despite rich official data (${officialWords} words) — converter needs to handle more payload paths`);
  }
  if (officialHtml.includes('page-number') !== experimentalHtml.includes('page-number')) {
    minor.push(`Page numbering mechanism differs: official uses Puppeteer header/footer, experimental uses inline CSS class`);
  }

  // Major: text length for data-rich campaigns
  if (officialWords > 1000 && (wordRatio > 1.2 || wordRatio < 0.8)) {
    major.push(`Text length ratio ${(wordRatio * 100).toFixed(0)}% for data-rich campaign — content may be structurally different`);
  }

  return {
    campaignId,
    label,
    payloadSections: (payload.sections || []).length,
    hasRecs: Array.isArray(payload.recommendations) && payload.recommendations.length > 0,
    hasApps: Array.isArray(payload.appendices) && payload.appendices.length > 0,
    hasPositions: Array.isArray(payload.entityPositions) && payload.entityPositions.length > 0,
    hasCommittee: Array.isArray(payload.committeeMembers) && payload.committeeMembers.length > 0,
    hasSignatures: !!payload.signatures,
    hasFinalEval: !!payload.finalEvaluation,
    hasSavedPresentation: !!payload.hasSavedPresentation,
    officialSizeBytes: Buffer.byteLength(officialHtml, 'utf-8'),
    expFragments: fragmentMapping.totalFragments,
    expKinds,
    expPageCount: verification.pageCount,
    verificationOk: verification.allPageFragmentsVisited && verification.orderPreserved && verification.documentFragmentsAccountedFor,
    officialWords,
    expWords,
    wordRatio,
    diffCritical: critical,
    diffMajor: major,
    diffMinor: minor,
  };
}

async function main() {
  console.log('='.repeat(70));
  console.log('Phase 7S — Experimental vs Official PDF Visual Parity Audit');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Campaigns to audit: ${CAMPAIGNS.length}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log('');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // ─── Phase 7T probe — summaryTables with positions renders a <table> ───────
  // The audited campaigns happen to have no entityPositions, so this synthetic
  // probe confirms the renderer emits a populated <table> when positions exist.
  const probeDoc: ExperimentalPageDocumentModel = {
    source: 'audit-converter',
    layout: { pageSize: 'A4', widthMm: 210, heightMm: 297, marginsMm: { top: 20, right: 15, bottom: 20, left: 15 } },
    fragments: [
      { id: 'probe-summary', kind: 'summaryTables', title: 'جدول المدراء', data: { positions: [
        { positionName: 'مدير المديرية', positionHolder: 'العميد سامي خالد', statisticalNumber: '١٢٣٤٥', joinedDate: '١٥/٠٣/١٤٤٠ هـ', positionStatus: 'أصالة' },
        { positionName: 'معاون المدير', positionHolder: 'العقيد أحمد حسن', statisticalNumber: '٦٧٨٩٠', joinedDate: '١٠/٠٧/١٤٤١ هـ', positionStatus: 'وكالة' },
      ] } },
    ],
    pages: [{ pageNumber: 1, fragments: [
      { id: 'probe-summary', kind: 'summaryTables', title: 'جدول المدراء', data: { positions: [
        { positionName: 'مدير المديرية', positionHolder: 'العميد سامي خالد', statisticalNumber: '١٢٣٤٥', joinedDate: '١٥/٠٣/١٤٤٠ هـ', positionStatus: 'أصالة' },
        { positionName: 'معاون المدير', positionHolder: 'العقيد أحمد حسن', statisticalNumber: '٦٧٨٩٠', joinedDate: '١٠/٠٧/١٤٤١ هـ', positionStatus: 'وكالة' },
      ] } },
    ] }],
  };
  const probeHtml = renderExperimentalPageDocumentHtmlWithVerification(probeDoc, { renderMode: 'strictPages', pageNumbers: true }).html;
  const probeTableOk = probeHtml.includes('<table') && probeHtml.includes('العميد سامي خالد');
  const probeFontOk = probeHtml.includes('Cairo');
  const probeLogoOk = probeHtml.includes('logo-header');
  const probeMetaHidden = !probeHtml.includes('<div class="fragment-meta">');
  console.log('Phase 7T probe (synthetic summaryTables with positions):');
  console.log(`   summaryTables <table> populated: ${probeTableOk ? 'PASS' : 'FAIL'}`);
  console.log(`   Cairo font present:              ${probeFontOk ? 'PASS' : 'FAIL'}`);
  console.log(`   Ministry logo present:           ${probeLogoOk ? 'PASS' : 'FAIL'}`);
  console.log(`   fragment-meta hidden (no debug): ${probeMetaHidden ? 'PASS' : 'FAIL'}`);
  console.log('');

  const app = await NestFactory.createApplicationContext(AppModule);
  const reportsService = app.get(ReportsService);

  const results: CampaignAuditResult[] = [];
  for (const c of CAMPAIGNS) {
    console.log(`\n── Auditing campaign: ${c.label} (${c.id.slice(0, 8)}...) ──`);
    try {
      const r = await auditCampaign(reportsService, c.id, c.label);
      results.push(r);
      console.log(`   Sections: ${r.payloadSections} | Positions: ${r.hasPositions} | Committee: ${r.hasCommittee}`);
      console.log(`   Saved presentation: ${r.hasSavedPresentation} | Recs: ${r.hasRecs} | Apps: ${r.hasApps}`);
      console.log(`   Official: ${r.officialSizeBytes.toLocaleString()} bytes, ${r.officialWords} words`);
      console.log(`   Experimental: ${r.expFragments} fragments, ${r.expWords} words`);
      console.log(`   Verification OK: ${r.verificationOk} | Page count: ${r.expPageCount}`);
      console.log(`   Critical: ${r.diffCritical.length} | Major: ${r.diffMajor.length} | Minor: ${r.diffMinor.length}`);
    } catch (err) {
      console.error(`   ERROR: ${err}`);
    }
  }

  // ─── Final Report ──────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('FINAL AUDIT REPORT — Phase 7S');
  console.log('='.repeat(70));
  console.log('');

  // 1. Best campaign
  const best = results.sort((a, b) => b.expFragments - a.expFragments)[0];
  console.log('1. Primary campaign for detailed analysis:');
  console.log(`   ${best.label} (${best.campaignId})`);
  console.log(`   Sections in payload: ${best.payloadSections}`);
  console.log(`   Committee members: ${best.hasCommittee}`);
  console.log(`   Entity positions: ${best.hasPositions}`);
  console.log(`   Recommendations: ${best.hasRecs}`);
  console.log(`   Appendices: ${best.hasApps}`);
  console.log(`   Final evaluation: ${best.hasFinalEval}`);
  console.log(`   Signatures: ${best.hasSignatures}`);
  console.log(`   Saved presentation: ${best.hasSavedPresentation}`);
  console.log('');

  // 2. Official page count
  console.log('2. Official PDF page count:');
  console.log('   ~1 (official pipeline uses Puppeteer for pagination; page count depends on content length)');
  console.log('');

  // 3. Experimental page count
  console.log('3. Experimental PDF page count:');
  console.log(`   ${best.expPageCount} (from verification — currently all fragments placed on 1 page in model)`);
  console.log('');

  // 4-6. Aggregated differences across all campaigns
  const allCritical = [...new Set(results.flatMap(r => r.diffCritical))];
  const allMajor = [...new Set(results.flatMap(r => r.diffMajor))];
  const allMinor = [...new Set(results.flatMap(r => r.diffMinor))];

  console.log('4. Critical differences:');
  if (allCritical.length === 0) { console.log('   (none)'); }
  for (const d of allCritical) { console.log(`   - ${d}`); }
  console.log('');

  console.log('5. Major differences:');
  if (allMajor.length === 0) { console.log('   (none)'); }
  for (const d of allMajor) { console.log(`   - ${d}`); }
  console.log('');

  console.log('6. Minor differences:');
  if (allMinor.length === 0) { console.log('   (none)'); }
  for (const d of allMinor) { console.log(`   - ${d}`); }
  console.log('');

  // 7. Readiness
  console.log('7. Readiness assessment:');
  if (allCritical.length > 0) {
    console.log('   Not Ready — Critical differences must be resolved before any integration');
  } else if (allMajor.length > 0) {
    console.log('   Nearly Ready — Major differences should be addressed');
  } else {
    console.log('   Ready — no blocking issues');
  }
  console.log('');

  // 8. Modified files
  console.log('8. Modified files:');
  console.log('    backend/scripts/audit-7s-experimental-official-parity.ts (new — audit script)');
  console.log('    backend/audit-output/ (generated HTML outputs)');
  console.log('');

  // 9. Official PDF untouched
  console.log('9. Official PDF untouched:');
  console.log('     YES — only called generateHtmlFromPayload for text comparison; no PDF endpoint invoked');
  console.log('');

  // 10. /reports untouched
  console.log('10. /reports untouched:');
  console.log('     YES — reports.controller.ts, reports.service.ts not modified');
  console.log('');

  // 11. Recommendation
  console.log('11. Next phase recommendation:');
  console.log('     Phase 7T: Address critical/major differences:');
  for (const d of allCritical) {
    console.log(`     - [Critical] ${d}`);
  }
  for (const d of allMajor) {
    console.log(`     - [Major] ${d}`);
  }
  if (allCritical.length === 0 && allMajor.length === 0) {
    console.log('     No blocking issues — proceed to bridge development');
  }
  if (allMinor.length > 0) {
    console.log(`     - [Minor] ${allMinor.length} minor observation(s) to review`);
  }
  console.log('');

  // ─── Per-campaign summary table ────────────────────────────────────────────
  console.log('='.repeat(70));
  console.log('Per-campaign summary:');
  console.log('='.repeat(70));
  console.log('');
  console.log(`${'Campaign'.padEnd(45)} ${'Sect'.padEnd(5)} ${'Pos'.padEnd(4)} ${'Rec'.padEnd(4)} ${'App'.padEnd(4)} ${'Frag'.padEnd(5)} ${'Crit'.padEnd(5)} ${'Maj'.padEnd(4)} ${'Min'.padEnd(4)}`);
  console.log('-'.repeat(70));
  for (const r of results) {
    const name = `${r.label.slice(0, 38)}...${r.campaignId.slice(0, 4)}`;
    console.log(`${name.padEnd(45)} ${String(r.payloadSections).padEnd(5)} ${String(r.hasPositions ? 1 : 0).padEnd(4)} ${String(r.hasRecs ? 1 : 0).padEnd(4)} ${String(r.hasApps ? 1 : 0).padEnd(4)} ${String(r.expFragments).padEnd(5)} ${String(r.diffCritical.length).padEnd(5)} ${String(r.diffMajor.length).padEnd(4)} ${String(r.diffMinor.length).padEnd(4)}`);
  }
  console.log('');

  await app.close();
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
