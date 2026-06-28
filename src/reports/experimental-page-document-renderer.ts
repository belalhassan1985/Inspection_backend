import * as fs from 'fs';
import * as path from 'path';

type ExperimentalPdfRenderMode = 'strictPages' | 'flow';

export type ExperimentalPdfPageDensity = 'compact' | 'normal' | 'comfortable';

/**
 * Style controls for the EXPERIMENTAL export only (Phase 8A). All values are
 * sanitized/whitelisted before reaching CSS — no raw CSS is ever injected.
 */
export type ExperimentalPdfStyleOptions = {
  fontFamily?: string;
  fontSize?: number;
  headingColor?: string;
  tableHeaderColor?: string;
  pageDensity?: ExperimentalPdfPageDensity;
};

export type ExperimentalPdfOptions = {
  includeDiagnostics?: boolean;
  renderMode?: ExperimentalPdfRenderMode;
  pageNumbers?: boolean;
  returnHtmlPreview?: boolean;
  returnDiagnostics?: boolean;
  /**
   * When true, per-fragment debug headers (kind | id) are rendered.
   * Defaults to false so normal exports look like the official report.
   */
  debug?: boolean;
  /** Sanitized style controls (font/colors/density) for the experimental export. */
  style?: ExperimentalPdfStyleOptions;
};

/** Whitelist of font families allowed for the experimental export. */
const ALLOWED_FONT_FAMILIES: Record<string, string> = {
  Cairo: "'Cairo'",
  Amiri: "'Amiri'",
  Tahoma: 'Tahoma',
  Arial: 'Arial',
  'Times New Roman': "'Times New Roman'",
};

const PAGE_DENSITY_MAP: Record<
  ExperimentalPdfPageDensity,
  { lineHeight: number; fragMargin: number; cellPad: number }
> = {
  compact: { lineHeight: 1.4, fragMargin: 1, cellPad: 4 },
  normal: { lineHeight: 1.6, fragMargin: 2, cellPad: 6 },
  comfortable: { lineHeight: 1.9, fragMargin: 6, cellPad: 9 },
};

type ResolvedStyle = {
  fontStack: string;
  fontSize: number;
  headingColor: string;
  tableHeaderColor: string;
  density: { lineHeight: number; fragMargin: number; cellPad: number };
};

/** Strict #RGB / #RGBA / #RRGGBB / #RRGGBBAA validator (no other CSS allowed). */
function sanitizeHexColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value.trim())
    ? value.trim()
    : fallback;
}

function resolveStyleOptions(style: ExperimentalPdfStyleOptions = {}): ResolvedStyle {
  const requestedFont = typeof style.fontFamily === 'string' ? style.fontFamily.trim() : '';
  const safeFont = ALLOWED_FONT_FAMILIES[requestedFont] ?? ALLOWED_FONT_FAMILIES.Cairo;
  // Always keep a safe fallback chain so Arabic still renders.
  const fontStack = `${safeFont}, 'Times New Roman', Arial, sans-serif`;

  const rawSize = typeof style.fontSize === 'number' && Number.isFinite(style.fontSize) ? style.fontSize : 13;
  const fontSize = Math.min(20, Math.max(9, Math.round(rawSize)));

  const density =
    style.pageDensity && PAGE_DENSITY_MAP[style.pageDensity]
      ? PAGE_DENSITY_MAP[style.pageDensity]
      : PAGE_DENSITY_MAP.normal;

  return {
    fontStack,
    fontSize,
    headingColor: sanitizeHexColor(style.headingColor, '#0f172a'),
    tableHeaderColor: sanitizeHexColor(style.tableHeaderColor, '#e2e8f0'),
    density,
  };
}

/** Builds the additive options CSS layer (values already sanitized). */
function buildStyleOverrideCss(s: ResolvedStyle): string {
  return `
    /* ── Phase 8A experimental style controls (sanitized) ── */
    body { font-family: ${s.fontStack}; font-size: ${s.fontSize}px; line-height: ${s.density.lineHeight}; }
    .fragment { margin-bottom: ${s.density.fragMargin}px; }
    .rt-title, .st-section-title, .st-title, .fe-title, .ont-title, .rst-title,
    .at-title, .apt-title, .idt-title, .flt-title, .nct-title, .dt-title,
    .fe-statement, .sst-title { color: ${s.headingColor}; }
    .st-th, .dt-th { background: ${s.tableHeaderColor}; }
    .st-th, .st-td, .st-td-num, .st-td-empty, .dt-th, .dt-td, .dt-td-empty { padding: ${s.density.cellPad}px; }`;
}

/**
 * Whether per-fragment debug meta (kind | id) should be emitted.
 * Set at the start of each (synchronous) render; the whole render path runs
 * synchronously with no re-entrancy, so a module-level flag is race-free here
 * and avoids threading the option through all 24 fragment renderers.
 */
let fragmentMetaEnabled = false;

type ExperimentalFragment = {
  id?: string;
  kind?: string;
  title?: string;
  data?: unknown;
};

type ExperimentalPage = {
  pageNumber?: number;
  fragments?: ExperimentalFragment[];
  oversized?: boolean;
  breakReason?: string;
};

export type ExperimentalPageDocumentModel = {
  source?: string;
  pages?: ExperimentalPage[];
  fragments?: ExperimentalFragment[];
  generatedAt?: string;
  layout?: {
    pageSize?: string;
    widthMm?: number;
    heightMm?: number;
    marginsMm?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
  };
};

export type ExperimentalPageDocumentVerificationReport = {
  pageCount: number;
  documentFragmentCount: number;
  pageFragmentCount: number;
  visitedFragmentCount: number;
  allPageFragmentsVisited: boolean;
  orderPreserved: boolean;
  documentFragmentsAccountedFor: boolean;
  missingFragmentCount: number;
};

export type ExperimentalFragmentMappingReport = {
  totalFragments: number;
  kinds: string[];
  countsByKind: Record<string, number>;
  supportedKinds: string[];
  unsupportedKinds: string[];
  fragmentsWithoutKind: number;
  fragmentsWithoutId: number;
  needsDedicatedRendererKinds: string[];
};

export type ExperimentalPageDocumentRenderResult = {
  html: string;
  verification: ExperimentalPageDocumentVerificationReport;
  fragmentMapping: ExperimentalFragmentMappingReport;
};

export function renderExperimentalPageDocumentHtml(
  pageDocument: ExperimentalPageDocumentModel,
  options: ExperimentalPdfOptions = {},
): string {
  return renderExperimentalPageDocumentHtmlWithVerification(pageDocument, options).html;
}

export function renderExperimentalPageDocumentHtmlWithVerification(
  pageDocument: ExperimentalPageDocumentModel,
  options: ExperimentalPdfOptions = {},
): ExperimentalPageDocumentRenderResult {
  console.log('[19C-4 EXPERIMENTAL EXPORT PATH USED]', {
    endpoint: 'renderExperimentalPageDocumentHtmlWithVerification',
    source: pageDocument?.source || 'unknown',
    numPages: pageDocument?.pages?.length || 0,
    timestamp: new Date().toISOString(),
  });
  const widthMm = pageDocument.layout?.widthMm ?? 210;
  const heightMm = pageDocument.layout?.heightMm ?? 297;
  const margins = {
    top: 4,
    right: 10,
    bottom: 3,
    left: 10,
  };
  const pages = pageDocument.pages ?? [];
  const showPageNumbers = options.pageNumbers !== false;
  const expectedPageFragmentKeys = getPageFragmentKeys(pages);
  const visitedFragmentKeys: string[] = [];
  const fragmentMapping = buildFragmentMappingReport(pages);

  // Per-fragment debug meta is opt-in only (debug or diagnostics requested).
  fragmentMetaEnabled =
    options.debug === true || options.returnDiagnostics === true;

  const logoBase64 = loadMinistryLogoBase64();
  const resolvedStyle = resolveStyleOptions(options.style);

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>Experimental Page Document Preview</title>
  <style>
    /*
     * Cairo Arabic font — mirrors the official report mechanism
     * (reports.service.ts uses the same Google Fonts @import). Falls back to
     * Times New Roman / Arial when Google Fonts is unreachable (offline
     * Puppeteer), so Arabic still renders rather than showing tofu boxes.
     */
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700&display=swap');
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #1f2937;
      direction: rtl;
      font-family: 'Cairo', 'Times New Roman', Arial, sans-serif;
      text-align: right;
    }
    .official-header {
      width: 100%;
      border-collapse: collapse;
      border: none;
      margin-bottom: 24px;
      border-bottom: 2px solid #000;
      padding-bottom: 12px;
    }
    .official-header td {
      border: none;
      padding: 0;
      vertical-align: top;
    }
    .oh-right {
      width: 35%;
      font-size: 13px;
      font-weight: 700;
      text-align: right;
      line-height: 1.6;
    }
    .oh-center {
      width: 30%;
      text-align: center;
      vertical-align: middle;
    }
    .oh-center img {
      height: 80px;
      width: auto;
    }
    .oh-left {
      width: 35%;
      font-size: 13px;
      text-align: left;
      direction: rtl;
      line-height: 1.6;
    }
    .experimental-page {
      width: ${widthMm}mm;
      margin: 0 auto;
      padding: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
      background: #ffffff;
      position: relative;
    }
    .page-number {
      position: absolute;
      top: 8mm;
      left: 12mm;
      color: #64748b;
      font-size: 11px;
    }
    .oversized-warning {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      color: #92400e;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 8px;
      text-align: center;
      direction: rtl;
    }
    .manual-break-indicator {
      background: #f1f5f9;
      border: 1px dashed #94a3b8;
      color: #475569;
      padding: 3px 8px;
      font-size: 10px;
      margin-bottom: 6px;
      text-align: center;
      direction: rtl;
    }
    .fragment {
      margin-bottom: 2px;
    }
    .fragment-summary-tables,
    .fragment-final-evaluation,
    .fragment-signatures {
      break-inside: avoid;
    }
    .fragment-meta {
      color: #475569;
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 4px;
      direction: ltr;
      text-align: left;
    }
    .fragment-text {
      color: #1f2937;
      font-size: 13px;
      line-height: 1.7;
      white-space: pre-wrap;
    }
    .st-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      font-size: 12px;
      table-layout: fixed;
    }
    .st-th {
      background: #f2f2f2;
      border: 1px solid #000000;
      padding: 6px 4px;
      font-weight: 700;
      text-align: center;
    }
    .st-td {
      border: 1px solid #000000;
      padding: 5px 4px;
      text-align: center;
      overflow-wrap: break-word;
    }
    .st-td-num {
      border: 1px solid #000000;
      padding: 5px 4px;
      text-align: center;
      width: 24px;
      overflow-wrap: break-word;
    }
    .st-td-empty {
      border: 1px solid #000000;
      padding: 12px 4px;
      text-align: center;
      color: #94a3b8;
    }
    .st-title {
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .fe-title {
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 6px;
    }
    .fe-body {
      font-size: 13px;
      line-height: 1.7;
    }
    .fe-row {
      margin-bottom: 2px;
    }
    .fe-label {
      font-weight: 600;
      color: #475569;
    }
    .fe-value {
      font-weight: 400;
    }
    .fe-rating {
      font-weight: 700;
      color: #1e40af;
    }
    .fe-statement {
      margin-top: 6px;
      font-weight: 700;
      font-size: 14px;
      color: #1f2937;
    }
    .sig-container {
      font-size: 13px;
      line-height: 1.7;
    }
    .sig-blocks-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin-top: 8px;
    }
    .sig-block {
      flex: 1;
      text-align: center;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      padding: 8px;
    }
    .sig-rank {
      font-weight: 700;
      font-size: 12px;
      color: #475569;
    }
    .sig-name {
      font-weight: 700;
      font-size: 14px;
      margin: 4px 0;
    }
    .sig-role {
      font-size: 12px;
      color: #475569;
    }
    .sig-date {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }
    .sig-title {
      font-weight: 700;
      font-size: 13px;
    }
    .flt-title {
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .flt-title-bar {
      height: 4px;
      border-radius: 2px;
      margin-bottom: 6px;
    }
    .fli-item {
      font-size: 13px;
      line-height: 1.7;
      padding: 2px 0;
    }
    .fli-number {
      font-weight: 700;
      margin-left: 4px;
    }
    .fli-text {
      font-weight: 400;
    }
    .ri-item {
      font-size: 13px;
      line-height: 1.7;
      padding: 2px 0;
    }
    .ri-number {
      font-weight: 700;
      margin-left: 4px;
    }
    .ri-text {
      font-weight: 400;
    }
    .ri-empty {
      color: #94a3b8;
      font-style: italic;
    }
    .ni-item {
      font-size: 13px;
      line-height: 1.7;
      padding: 2px 0;
    }
    .ni-number {
      font-weight: 700;
      margin-left: 4px;
    }
    .ni-text {
      font-weight: 400;
    }
    .ni-empty {
      color: #94a3b8;
      font-style: italic;
    }
    .idi-item {
      font-size: 13px;
      line-height: 1.7;
      padding: 2px 0;
    }
    .idi-number {
      font-weight: 700;
      margin-left: 4px;
    }
    .idi-text {
      font-weight: 400;
    }
    .idi-variant-detail {
      font-style: italic;
      color: #475569;
    }
    .nct-title {
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .nct-number {
      font-weight: 700;
      margin-left: 4px;
    }
    .st-section-title {
      font-weight: 700;
      font-size: 16px;
      margin-bottom: 6px;
      color: #0c2340;
      border-bottom: 2px solid #0c2340;
      padding-bottom: 3px;
    }
    .nar-body {
      font-size: 13px;
      line-height: 1.7;
      white-space: pre-wrap;
      color: #1f2937;
    }
    .rh-line {
      font-size: 12px;
      line-height: 1.6;
      color: #475569;
    }
    .rh-formation {
      font-weight: 700;
    }
    .rt-title {
      font-weight: 700;
      font-size: 21px;
      color: #0c2340;
      text-align: center;
      text-decoration: underline;
      margin-bottom: 12px;
    }
    .as-body {
      font-size: 13px;
      line-height: 1.7;
    }
    .as-number {
      font-weight: 700;
      margin-left: 4px;
    }
    .as-text {
      font-weight: 400;
    }
    .cm-body {
      font-size: 13px;
      line-height: 1.7;
    }
    .cm-number {
      font-weight: 700;
      margin-left: 4px;
    }
    .cm-member {
      padding: 1px 0;
    }
    .pu-body {
      font-size: 13px;
      line-height: 1.7;
    }
    .pu-number {
      font-weight: 700;
      margin-left: 4px;
    }
    .vd-body {
      font-size: 13px;
      line-height: 1.7;
    }
    .vd-number {
      font-weight: 700;
      margin-left: 4px;
    }
    .ont-title {
      font-weight: 700;
      font-size: 14px;
      color: #1e293b;
    }
    .rst-title {
      font-weight: 700;
      font-size: 14px;
      color: #1e293b;
    }
    .rat-body {
      font-size: 13px;
      line-height: 1.7;
    }
    .rat-number {
      font-weight: 700;
      margin-left: 4px;
    }
    .at-title {
      font-weight: 700;
      font-size: 14px;
      color: #1e293b;
    }
    .apt-title {
      font-weight: 700;
      font-size: 13px;
      color: #1e293b;
    }
    .app-paragraph {
      font-size: 13px;
      line-height: 1.7;
      white-space: pre-wrap;
    }
    .sst-title {
      font-weight: 700;
      font-size: 14px;
      color: #1a202c;
      padding-right: 8px;
      margin-right: 12px;
    }
    .idt-title {
      font-weight: 700;
      font-size: 13px;
      color: #1e293b;
      margin-bottom: 4px;
    }
    .dt-block {
      margin-bottom: 12px;
      break-inside: avoid;
    }
    .dt-title {
      font-weight: 700;
      font-size: 13px;
      color: #0c2340;
      margin-bottom: 4px;
    }
    .dt-entity {
      font-weight: 400;
      font-size: 11px;
      color: #718096;
    }
    .dt-table {
      width: 100%;
      border-collapse: collapse;
      margin: 4px 0 8px;
      font-size: 12px;
    }
    .dt-th {
      background: #f2f2f2;
      border: 1px solid #000000;
      padding: 6px 8px;
      font-weight: 700;
      text-align: center;
    }
    .dt-td {
      border: 1px solid #000000;
      padding: 6px;
      text-align: center;
    }
    .dt-td-empty {
      border: 1px solid #000000;
      padding: 10px;
      text-align: center;
      color: #94a3b8;
    }
    .dt-empty {
      color: #94a3b8;
      font-style: italic;
      font-size: 12px;
    }
    .dt-json {
      direction: ltr;
      text-align: left;
      white-space: pre-wrap;
      word-break: break-word;
      font-size: 11px;
      margin: 0;
    }
${buildStyleOverrideCss(resolvedStyle)}

    @counter-style cf-arabic {
      system: numeric;
      symbols: "٠" "١" "٢" "٣" "٤" "٥" "٦" "٧" "٨" "٩";
    }
    .confidential-footer {
      position: fixed;
      bottom: 3mm;
      left: 0;
      right: 0;
      text-align: center;
      pointer-events: none;
      z-index: 100;
      font-family: 'Cairo', sans-serif;
      color: #000;
    }
    .confidential-footer .cf-text {
      font-size: 11px;
      font-weight: bold;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .confidential-footer .cf-page {
      font-size: 10px;
      margin-top: 1px;
    }
    .cf-page-current::after {
      content: counter(page, cf-arabic);
    }
  </style>
</head>
<body>
  <div class="confidential-footer">
    <div class="cf-text">سري</div>
    <div class="cf-page">(<span class="cf-page-current"></span> - <span id="total-pages-value">٠</span>)</div>
  </div>
  ${pages.map((page, pageIndex) => renderPage(page, pageIndex, pages.length, showPageNumbers, visitedFragmentKeys, logoBase64, pageDocument)).join('')}
</body>
</html>`;

  return {
    html,
    verification: buildVerificationReport(
      pageDocument,
      pages,
      expectedPageFragmentKeys,
      visitedFragmentKeys,
    ),
    fragmentMapping,
  };
}

function renderPage(
  page: ExperimentalPage,
  pageIndex: number,
  totalPages: number,
  showPageNumbers: boolean,
  visitedFragmentKeys: string[],
  logoBase64: string,
  pageDocument: ExperimentalPageDocumentModel,
): string {
  const fragments = page.fragments ?? [];
  const pageNumber = page.pageNumber ?? pageIndex + 1;

  let headerHtml = '';
  if (pageIndex === 0) {
    const hierarchyText = 'جمهورية العراق<br/>وزارة الداخلية<br/>هيئة تفتيش قوى الامن الداخلي';
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="وزارة الداخلية" style="height:80px;width:auto;" />`
      : '';
    const dateStr = extractHeaderDate(pageDocument);
    const numberStr = extractHeaderFormation(pageDocument);

    headerHtml = `<table class="official-header">
      <tr>
        <td class="oh-right">${hierarchyText}</td>
        <td class="oh-center">${logoHtml}</td>
        <td class="oh-left">
          <div>التاريخ: ${dateStr}</div>
          <div style="margin-top:5px;">العدد: ${numberStr}</div>
        </td>
      </tr>
    </table>`;
  }

  const oversizedHtml = page.oversized
    ? '<div class="oversized-warning">تنبيه: هذا العنصر قد يتجاوز حدود صفحة A4</div>'
    : '';

  const manualBreakHtml = page.breakReason === 'manual'
    ? '<div class="manual-break-indicator">فاصل صفحة يدوي</div>'
    : '';

  return `<section class="experimental-page">
    ${headerHtml}
    ${oversizedHtml}
    ${manualBreakHtml}
    ${fragments.map((fragment, fragmentIndex) => renderFragment(fragment, pageIndex, fragmentIndex, visitedFragmentKeys)).join('')}
  </section>`;
}

function renderFragment(
  fragment: ExperimentalFragment,
  pageIndex: number,
  fragmentIndex: number,
  visitedFragmentKeys: string[],
): string {
  const id = fragment.id ?? '';
  const kind = fragment.kind ?? '';
  visitedFragmentKeys.push(getFragmentKey(fragment, pageIndex, fragmentIndex));

  if (kind === 'summaryTables') {
    return renderSummaryTablesFragment(fragment, id, kind);
  }
  if (kind === 'finalEvaluation') {
    return renderFinalEvaluationFragment(fragment, id, kind);
  }
  if (kind === 'signatures') {
    return renderSignaturesFragment(fragment, id, kind);
  }
  if (kind === 'findingListTitle') {
    return renderFindingListTitleFragment(fragment, id, kind);
  }
  if (kind === 'findingListItem') {
    return renderFindingListItemFragment(fragment, id, kind);
  }
  if (kind === 'recommendationItem') {
    return renderRecommendationItemFragment(fragment, id, kind);
  }
  if (kind === 'noteItem') {
    return renderNoteItemFragment(fragment, id, kind);
  }
  if (kind === 'inspectionDetailItem') {
    return renderInspectionDetailItemFragment(fragment, id, kind);
  }
  if (kind === 'notesCategoryTitle') {
    return renderNotesCategoryTitleFragment(fragment, id, kind);
  }
  if (kind === 'sectionTitle') {
    return renderSectionTitleFragment(fragment, id, kind);
  }
  if (kind === 'narrative') {
    return renderNarrativeFragment(fragment, id, kind);
  }
  if (kind === 'reportHeader') {
    return renderReportHeaderFragment(fragment, id, kind);
  }
  if (kind === 'reportTitle') {
    return renderReportTitleFragment(fragment, id, kind);
  }
  if (kind === 'assignment') {
    return renderAssignmentFragment(fragment, id, kind);
  }
  if (kind === 'committee') {
    return renderCommitteeFragment(fragment, id, kind);
  }
  if (kind === 'purpose') {
    return renderPurposeFragment(fragment, id, kind);
  }
  if (kind === 'visitDate') {
    return renderVisitDateFragment(fragment, id, kind);
  }
  if (kind === 'officialNotesTitle') {
    return renderOfficialNotesTitleFragment(fragment, id, kind);
  }
  if (kind === 'recommendationsTitle') {
    return renderRecommendationsTitleFragment(fragment, id, kind);
  }
  if (kind === 'recommendationAuthorityTitle') {
    return renderRecommendationAuthorityTitleFragment(fragment, id, kind);
  }
  if (kind === 'appendicesTitle') {
    return renderAppendicesTitleFragment(fragment, id, kind);
  }
  if (kind === 'appendixTitle') {
    return renderAppendixTitleFragment(fragment, id, kind);
  }
  if (kind === 'appendixParagraph') {
    return renderAppendixParagraphFragment(fragment, id, kind);
  }
  if (kind === 'subsectionTitle') {
    return renderSubsectionTitleFragment(fragment, id, kind);
  }
  if (kind === 'inspectionDetailsTitle') {
    return renderInspectionDetailsTitleFragment(fragment, id, kind);
  }
  if (kind === 'detailedTables') {
    return renderDetailedTablesFragment(fragment, id, kind);
  }

  const text = extractFragmentText(fragment);
  return `<article class="fragment">
    ${renderFragmentMeta(kind, id)}
    ${text ? `<div class="fragment-text">${escapeHtml(text)}</div>` : ''}
  </article>`;
}

function renderSummaryTablesFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const positions = asArray(data.positions);
  const number = typeof data.number === 'string' ? data.number : '';

  const rows = positions.length > 0
    ? positions.map((pos, i) => {
        const posName = asString(pos.positionName) || asString(pos.name) || '—';
        const rank = asString(pos.rank) || '—';
        const holder = asString(pos.positionHolder) || asString(pos.holder) || '—';
        const statNum = asString(pos.statisticalNumber) || '—';
        const joined = asString(pos.joinedDate) || '—';
        const status = asString(pos.positionStatus) || '—';
        const education = asString(pos.education) || '—';
        const notes = asString(pos.notes) || '—';
        return `<tr>
          <td class="st-td-num">${toEasternArabicDigits(i + 1)}</td>
          <td class="st-td">${escapeHtml(posName)}</td>
          <td class="st-td">${escapeHtml(rank)}</td>
          <td class="st-td">${escapeHtml(holder)}</td>
          <td class="st-td">${escapeHtml(statNum)}</td>
          <td class="st-td">${escapeHtml(joined)}</td>
          <td class="st-td">${escapeHtml(status)}</td>
          <td class="st-td">${escapeHtml(education)}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="9" class="st-td-empty">لا توجد بيانات</td></tr>`;

  const titleText = number
    ? `${number} جدول المدراء والآمرين وشاغلي المناصب الأساسية`
    : 'جدول المدراء والآمرين وشاغلي المناصب الأساسية';

  return `<article class="fragment fragment-summary-tables">
    ${renderFragmentMeta(kind, id)}
    <div class="st-title">${escapeHtml(titleText)}</div>
    <table class="st-table">
      <thead>
        <tr>
          <th class="st-th" style="width:24px">ت</th>
          <th class="st-th" style="width:16%">المنصب</th>
          <th class="st-th" style="width:12%">الرتبة</th>
          <th class="st-th" style="width:18%">الاسم الكامل</th>
          <th class="st-th" style="width:13%">الرقم الإحصائي</th>
          <th class="st-th" style="width:15%">تاريخ الإشغال</th>
          <th class="st-th" style="width:12%">نوع الإشغال</th>
          <th class="st-th" style="width:12%">التحصيل الدراسي</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </article>`;
}

function renderFinalEvaluationFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const fe = asRecord(data.finalEvaluation);
  const number = typeof data.number === 'string' ? data.number : '';

  const entityName = asString(fe.entityName) || '—';
  const earnedSum = typeof fe.earnedSum === 'number' ? fe.earnedSum : 0;
  const maxSum = typeof fe.maxSum === 'number' ? fe.maxSum : 0;
  const percentage = typeof fe.percentage === 'number' ? fe.percentage : 0;
  const rating = asString(fe.rating) || '—';
  const statement = asString(fe.statement) || '';

  const titleText = number
    ? `${number} التقييم النهائي`
    : 'التقييم النهائي';

  return `<article class="fragment fragment-final-evaluation">
    ${renderFragmentMeta(kind, id)}
    <div class="fe-title">${escapeHtml(titleText)}</div>
    <div class="fe-body">
      <div class="fe-row">
        <span class="fe-label">الجهة:</span>
        <span class="fe-value">${escapeHtml(entityName)}</span>
      </div>
      <div class="fe-row">
        <span class="fe-label">الدرجة المستحصلة:</span>
        <span class="fe-value">${earnedSum.toFixed(2)} / ${maxSum.toFixed(2)}</span>
      </div>
      <div class="fe-row">
        <span class="fe-label">النسبة المئوية:</span>
        <span class="fe-value">${percentage.toFixed(2)}%</span>
      </div>
      <div class="fe-row">
        <span class="fe-label">التقييم:</span>
        <span class="fe-value fe-rating">${escapeHtml(rating)}</span>
      </div>
      ${statement ? `<div class="fe-statement">${escapeHtml(statement)}</div>` : ''}
    </div>
  </article>`;
}

function renderSignaturesFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const sig = asRecord(data.signatures);

  const leaderName = asString(sig.leaderName) || '—';
  const leaderRank = asString(sig.leaderRank) || '';
  const leaderRole = asString(sig.leaderRole) || 'رئيس اللجنة';
  const leaderDate = asString(sig.leaderDate) || '';

  const deputyName = asString(sig.deputyName) || '—';
  const deputyRank = asString(sig.deputyRank) || '';
  const deputyRole = asString(sig.deputyRole) || 'رئيس هيئة تفتيش قوى الامن الداخلي';
  const deputyDate = asString(sig.deputyDate) || '';

  const ministerTitle = asString(sig.ministerTitle) || '';
  const ministerName = asString(sig.ministerName) || '';
  const ministerDate = asString(sig.ministerDate) || '';

  return `<article class="fragment fragment-signatures">
    ${renderFragmentMeta(kind, id)}
    <div class="sig-container">
      ${ministerTitle || ministerName ? `<div class="sig-block sig-minister">
        ${ministerTitle ? `<div class="sig-title">${escapeHtml(ministerTitle)}</div>` : ''}
        ${ministerName ? `<div class="sig-name">${escapeHtml(ministerName)}</div>` : ''}
        ${ministerDate ? `<div class="sig-date">${escapeHtml(ministerDate)}</div>` : ''}
      </div>` : ''}
      <div class="sig-blocks-row">
        <div class="sig-block">
          ${leaderRank ? `<div class="sig-rank">${escapeHtml(leaderRank)}</div>` : ''}
          <div class="sig-name">${escapeHtml(leaderName)}</div>
          <div class="sig-role">${escapeHtml(leaderRole)}</div>
          ${leaderDate ? `<div class="sig-date">${escapeHtml(leaderDate)}</div>` : ''}
        </div>
        <div class="sig-block">
          ${deputyRank ? `<div class="sig-rank">${escapeHtml(deputyRank)}</div>` : ''}
          <div class="sig-name">${escapeHtml(deputyName)}</div>
          <div class="sig-role">${escapeHtml(deputyRole)}</div>
          ${deputyDate ? `<div class="sig-date">${escapeHtml(deputyDate)}</div>` : ''}
        </div>
      </div>
    </div>
  </article>`;
}

function renderFindingListTitleFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const titleText = asString(data.titleText) || asString(data.title) || asString(fragment.title) || '';
  const number = asString(data.number) || '';
  const color = asString(data.color) || '#475569';

  return `<article class="fragment fragment-finding-list-title">
    ${renderFragmentMeta(kind, id)}
    <div class="flt-title-bar" style="background:${escapeHtml(color)}"></div>
    <div class="flt-title">${number ? `${escapeHtml(number)} ` : ''}${escapeHtml(titleText)}</div>
  </article>`;
}

function renderFindingListItemFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const text = asString(data.text) || '';
  const number = asString(data.number) || '';
  const color = asString(data.color) || '#1f2937';

  return `<article class="fragment fragment-finding-list-item">
    ${renderFragmentMeta(kind, id)}
    <div class="fli-item">
      ${number ? `<span class="fli-number" style="color:${escapeHtml(color)}">${escapeHtml(number)}</span>` : ''}
      <span class="fli-text">${escapeHtml(text)}</span>
    </div>
  </article>`;
}

function renderRecommendationItemFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const number = asString(data.number) || '';
  const isEmpty = data.isEmpty === true || data.isSectionEmpty === true;
  const text = asString(data.text) || '';
  const rec = asRecord(data.recommendation);
  const recText = asString(rec.text) || '';

  const displayText = isEmpty
    ? (text || 'لا توجد توصيات مدخلة.')
    : (recText || text || '');

  return `<article class="fragment fragment-recommendation-item">
    ${renderFragmentMeta(kind, id)}
    <div class="ri-item">
      ${number && !isEmpty ? `<span class="ri-number">${escapeHtml(number)}</span>` : ''}
      <span class="${isEmpty ? 'ri-empty' : 'ri-text'}">${escapeHtml(displayText)}</span>
    </div>
  </article>`;
}

function renderNoteItemFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const text = asString(data.text) || '';
  const number = asString(data.number) || '';
  const isEmpty = data.isEmpty === true;

  return `<article class="fragment fragment-note-item">
    ${renderFragmentMeta(kind, id)}
    <div class="ni-item">
      ${number && !isEmpty ? `<span class="ni-number">${escapeHtml(number)}</span>` : ''}
      <span class="${isEmpty ? 'ni-empty' : 'ni-text'}">${escapeHtml(text || '')}</span>
    </div>
  </article>`;
}

function renderInspectionDetailItemFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const text = asString(data.text) || '';
  const number = typeof data.number === 'number' ? String(data.number) : asString(data.number) || '';
  const variant = asString(data.variant) || '';

  return `<article class="fragment fragment-inspection-detail-item">
    ${renderFragmentMeta(kind, id)}
    <div class="idi-item">
      ${number ? `<span class="idi-number">${escapeHtml(number)}.</span>` : ''}
      <span class="idi-text${variant === 'detail' ? ' idi-variant-detail' : ''}">${escapeHtml(text)}</span>
    </div>
  </article>`;
}

function renderNotesCategoryTitleFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const titleText = asString(data.titleText) || asString(fragment.title) || '';
  const number = asString(data.number) || '';

  return `<article class="fragment fragment-notes-category-title">
    ${renderFragmentMeta(kind, id)}
    <div class="nct-title">
      ${number ? `<span class="nct-number">${escapeHtml(number)}</span>` : ''}
      ${escapeHtml(titleText)}
    </div>
  </article>`;
}

function renderSectionTitleFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const title = asString(data.title) || asString(fragment.title) || '';
  const number = asString(data.number) || '';

  return `<article class="fragment fragment-section-title">
    ${renderFragmentMeta(kind, id)}
    <div class="st-section-title">${number ? `${escapeHtml(number)} ` : ''}${escapeHtml(title)}</div>
  </article>`;
}

function renderNarrativeFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const text = asString(data.text) || '';

  return `<article class="fragment fragment-narrative">
    ${renderFragmentMeta(kind, id)}
    ${text ? `<div class="nar-body">${escapeHtml(text)}</div>` : ''}
  </article>`;
}

function renderReportHeaderFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const code = asString(data.code);
  const formation = asString(data.formation);
  const date = asString(data.date);
  const location = asString(data.location);
  const type = asString(data.type);
  const pageNum = asString(data.page);
  const ofNum = asString(data.of);
  const lines: string[] = [];
  if (code) lines.push(`<div class="rh-line">&#1585;&#1602;&#1605; &#1575;&#1604;&#1603;&#1578;&#1575;&#1576;: ${escapeHtml(code)}</div>`);
  if (formation) lines.push(`<div class="rh-line"><span class="rh-formation">${escapeHtml(formation)}</span></div>`);
  if (date) lines.push(`<div class="rh-line">&#1575;&#1604;&#1578;&#1575;&#1585;&#1610;&#1582;: ${escapeHtml(date)}</div>`);
  if (location) lines.push(`<div class="rh-line">&#1575;&#1604;&#1605;&#1603;&#1575;&#1606;: ${escapeHtml(location)}</div>`);
  if (type) lines.push(`<div class="rh-line">&#1575;&#1604;&#1606;&#1608;&#1593;: ${escapeHtml(type)}</div>`);
  if (pageNum || ofNum) lines.push(`<div class="rh-line">&#1575;&#1604;&#1589;&#1601;&#1581;&#1577;: ${escapeHtml(pageNum || '')} / ${escapeHtml(ofNum || '')}</div>`);
  return `<article class="fragment fragment-report-header">
    ${renderFragmentMeta(kind, id)}
    ${lines.join('')}
  </article>`;
}

function renderReportTitleFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const titleText = asString(data.titleText) || asString(data.text) || '';
  return `<article class="fragment fragment-report-title">
    ${renderFragmentMeta(kind, id)}
    ${titleText ? `<div class="rt-title">${escapeHtml(titleText)}</div>` : ''}
  </article>`;
}

function renderAssignmentFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const assignmentText = asString(data.assignmentText) || asString(data.text) || '';
  return `<article class="fragment fragment-assignment">
    ${renderFragmentMeta(kind, id)}
    ${assignmentText ? `<div class="as-body"><span class="as-number">&#1575;&#1604;&#1575;&#1606;&#1578;&#1583;&#1575;&#1576;:</span> <span class="as-text">${escapeHtml(assignmentText)}</span></div>` : ''}
  </article>`;
}

function renderCommitteeFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const number = asString(data.number);
  const members = asArray(data.members);
  const memberItems = members.length > 0
    ? members.map((m) => {
        const memRecord = asRecord(m);
        const name = asString(memRecord.name) || asString(memRecord.displayName) || asString(m);
        const title = asString(memRecord.title) || '';
        const role = asString(memRecord.role) || '';
        const parts = [name];
        if (title) parts.push(title);
        if (role) parts.push(`(${role})`);
        return `<div class="cm-member">${escapeHtml(parts.join(' - '))}</div>`;
      }).join('')
    : '';
  return `<article class="fragment fragment-committee">
    ${renderFragmentMeta(kind, id)}
    <div class="cm-body">
      ${number ? `<span class="cm-number">&#1575;&#1604;&#1604;&#1580;&#1606;&#1577; &#1585;&#1602;&#1605; ${escapeHtml(number)}:</span>` : ''}
      ${memberItems || '<div>&#1604;&#1575; &#1610;&#1608;&#1580;&#1583; &#1571;&#1593;&#1590;&#1575;&#1569;</div>'}
    </div>
  </article>`;
}

function renderPurposeFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const purposeText = asString(data.purposeText) || asString(data.text) || '';
  return `<article class="fragment fragment-purpose">
    ${renderFragmentMeta(kind, id)}
    ${purposeText ? `<div class="pu-body"><span class="pu-number">&#1575;&#1604;&#1594;&#1585;&#1590;:</span> ${escapeHtml(purposeText)}</div>` : ''}
  </article>`;
}

function renderVisitDateFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const durationText = asString(data.durationText) || asString(data.text) || '';
  return `<article class="fragment fragment-visit-date">
    ${renderFragmentMeta(kind, id)}
    ${durationText ? `<div class="vd-body"><span class="vd-number">&#1578;&#1575;&#1585;&#1610;&#1582; &#1575;&#1604;&#1586;&#1610;&#1575;&#1585;&#1577;:</span> ${escapeHtml(durationText)}</div>` : ''}
  </article>`;
}

function renderOfficialNotesTitleFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const titleText = asString(data.titleText) || asString(data.text) || '&#1575;&#1604;&#1605;&#1604;&#1575;&#1581;&#1592;&#1575;&#1578; &#1575;&#1604;&#1585;&#1587;&#1605;&#1610;&#1577;';
  return `<article class="fragment fragment-official-notes-title">
    ${renderFragmentMeta(kind, id)}
    <div class="ont-title">${escapeHtml(titleText)}</div>
  </article>`;
}

function renderRecommendationsTitleFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const titleText = asString(data.titleText) || asString(data.text) || '&#1575;&#1604;&#1578;&#1608;&#1589;&#1610;&#1575;&#1578;';
  return `<article class="fragment fragment-recommendations-title">
    ${renderFragmentMeta(kind, id)}
    <div class="rst-title">${escapeHtml(titleText)}</div>
  </article>`;
}

function renderRecommendationAuthorityTitleFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const number = asString(data.number);
  const authorityText = asString(data.authorityText) || asString(data.text) || '';
  return `<article class="fragment fragment-recommendation-authority-title">
    ${renderFragmentMeta(kind, id)}
    <div class="rat-body">
      ${number ? `<span class="rat-number">&#1580;&#1607;&#1577; &#1575;&#1604;&#1578;&#1608;&#1589;&#1610;&#1577; &#1585;&#1602;&#1605; ${escapeHtml(number)}:</span> ` : ''}
      ${authorityText ? escapeHtml(authorityText) : ''}
    </div>
  </article>`;
}

function renderAppendicesTitleFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const titleText = asString(data.titleText) || asString(data.text) || '&#1575;&#1604;&#1605;&#1585;&#1575;&#1601;&#1602;';
  return `<article class="fragment fragment-appendices-title">
    ${renderFragmentMeta(kind, id)}
    <div class="at-title">${escapeHtml(titleText)}</div>
  </article>`;
}

function renderAppendixTitleFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const titleText = asString(data.titleText) || asString(data.text) || '';
  return `<article class="fragment fragment-appendix-title">
    ${renderFragmentMeta(kind, id)}
    ${titleText ? `<div class="apt-title">${escapeHtml(titleText)}</div>` : ''}
  </article>`;
}

function renderAppendixParagraphFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const paragraphText = asString(data.paragraphText) || asString(data.text) || '';
  return `<article class="fragment fragment-appendix-paragraph">
    ${renderFragmentMeta(kind, id)}
    ${paragraphText ? `<div class="app-paragraph">${escapeHtml(paragraphText)}</div>` : ''}
  </article>`;
}

function renderSubsectionTitleFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const titleText = asString(data.titleText) || asString(data.text) || '';
  return `<article class="fragment fragment-subsection-title">
    ${renderFragmentMeta(kind, id)}
    ${titleText ? `<div class="sst-title">${escapeHtml(titleText)}</div>` : ''}
  </article>`;
}

function renderInspectionDetailsTitleFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const titleText =
    asString(data.titleText) ||
    asString(fragment.title) ||
    '&#1575;&#1604;&#1583;&#1585;&#1580;&#1575;&#1578; &#1608;&#1575;&#1604;&#1605;&#1604;&#1575;&#1581;&#1592;&#1575;&#1578; &#1575;&#1604;&#1578;&#1601;&#1589;&#1610;&#1604;&#1610;&#1577; &#1604;&#1604;&#1576;&#1606;&#1608;&#1583;';
  const number = asString(data.number);
  return `<article class="fragment fragment-inspection-details-title">
    ${renderFragmentMeta(kind, id)}
    <div class="idt-title">${number ? `${escapeHtml(number)} ` : ''}${escapeHtml(titleText)}</div>
  </article>`;
}

function renderDetailedTablesFragment(
  fragment: ExperimentalFragment,
  id: string,
  kind: string,
): string {
  const data = asRecord(fragment.data);
  const tables = asArray(data.tables);

  const body = tables.length > 0
    ? tables.map((table) => renderSingleDetailedTable(table)).join('')
    : `<div class="dt-empty">&#1604;&#1575; &#1578;&#1608;&#1580;&#1583; &#1580;&#1583;&#1575;&#1608;&#1604; &#1578;&#1601;&#1589;&#1610;&#1604;&#1610;&#1577;</div>`;

  return `<article class="fragment fragment-detailed-tables">
    ${renderFragmentMeta(kind, id)}
    ${body}
  </article>`;
}

/**
 * Renders one detailed table. The known shape (from reportFragments.ts) is:
 *   { title, entityName, schema: [{ key, label, role?, type? }], rows: [{ [key]: value }] }
 * For any unrecognized shape (no schema array) it falls back to an escaped JSON
 * diagnostic table so no data is ever lost.
 */
function renderSingleDetailedTable(table: Record<string, unknown>): string {
  const schema = asArray(table.schema);
  const rows = asArray(table.rows);
  const title = asString(table.title);
  const entityName = asString(table.entityName);

  if (schema.length === 0) {
    return renderDetailedTableFallback(table);
  }

  const titleHtml = title || entityName
    ? `<div class="dt-title">${title ? escapeHtml(title) : ''}${
        entityName ? ` <span class="dt-entity">(${escapeHtml(entityName)})</span>` : ''
      }</div>`
    : '';

  const headerCells = schema
    .map((col) => {
      const label = asString(col.label) || asString(col.key);
      return `<th class="dt-th">${escapeHtml(label)}</th>`;
    })
    .join('');

  const bodyRows = rows.length > 0
    ? rows
        .map((row) => {
          const cells = schema
            .map((col) => {
              const key = asString(col.key);
              const role = asString(col.role);
              let text = cellToString(key in row ? row[key] : '');
              if (role === 'percentage' && text !== '') {
                text = `${text}%`;
              }
              return `<td class="dt-td">${escapeHtml(text)}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('')
    : `<tr><td class="dt-td-empty" colspan="${schema.length}">&#1604;&#1575; &#1578;&#1608;&#1580;&#1583; &#1587;&#1580;&#1604;&#1575;&#1578;.</td></tr>`;

  return `<div class="dt-block">
    ${titleHtml}
    <table class="dt-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </div>`;
}

function renderDetailedTableFallback(table: Record<string, unknown>): string {
  let json: string;
  try {
    json = JSON.stringify(table, null, 2);
  } catch {
    json = String(table);
  }
  return `<div class="dt-block">
    <table class="dt-table dt-fallback">
      <thead><tr><th class="dt-th">&#1576;&#1610;&#1575;&#1606;&#1575;&#1578; &#1575;&#1604;&#1580;&#1583;&#1608;&#1604; (&#1588;&#1603;&#1604; &#1594;&#1610;&#1585; &#1605;&#1593;&#1585;&#1608;&#1601;)</th></tr></thead>
      <tbody><tr><td class="dt-td"><pre class="dt-json">${escapeHtml(json)}</pre></td></tr></tbody>
    </table>
  </div>`;
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Loads the ministry logo as a base64 data URI, mirroring the official
 * pipeline's path resolution (reports.service.ts) without modifying it.
 * Returns '' on any failure so the export never breaks.
 */
function loadMinistryLogoBase64(): string {
  try {
    const logoPath = path.join(
      __dirname,
      '..',
      '..',
      'uploads',
      'system',
      'ministry-logo.png',
    );
    if (fs.existsSync(logoPath)) {
      const logoBuffer = fs.readFileSync(logoPath);
      return `data:image/png;base64,${logoBuffer.toString('base64')}`;
    }
  } catch {
    // Safe fallback: render without a logo rather than failing the export.
  }
  return '';
}

/**
 * Per-fragment debug header (kind | id). Emitted only when debug/diagnostics
 * are requested; otherwise hidden so normal output resembles the official PDF.
 */
function renderFragmentMeta(kind: string, id: string): string {
  return fragmentMetaEnabled
    ? `<div class="fragment-meta">${escapeHtml(kind)} | ${escapeHtml(id)}</div>`
    : '';
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function buildVerificationReport(
  pageDocument: ExperimentalPageDocumentModel,
  pages: ExperimentalPage[],
  expectedPageFragmentKeys: string[],
  visitedFragmentKeys: string[],
): ExperimentalPageDocumentVerificationReport {
  const documentFragmentKeys = (pageDocument.fragments ?? []).map((fragment, index) =>
    getFragmentKey(fragment, -1, index),
  );
  const missingDocumentKeys = documentFragmentKeys.filter(
    (key) => !expectedPageFragmentKeys.includes(key),
  );

  return {
    pageCount: pages.length,
    documentFragmentCount: pageDocument.fragments?.length ?? 0,
    pageFragmentCount: expectedPageFragmentKeys.length,
    visitedFragmentCount: visitedFragmentKeys.length,
    allPageFragmentsVisited: expectedPageFragmentKeys.length === visitedFragmentKeys.length,
    orderPreserved: expectedPageFragmentKeys.every(
      (key, index) => visitedFragmentKeys[index] === key,
    ),
    documentFragmentsAccountedFor: missingDocumentKeys.length === 0,
    missingFragmentCount: missingDocumentKeys.length,
  };
}

function getPageFragmentKeys(pages: ExperimentalPage[]): string[] {
  return pages.flatMap((page, pageIndex) =>
    (page.fragments ?? []).map((fragment, fragmentIndex) =>
      getFragmentKey(fragment, pageIndex, fragmentIndex),
    ),
  );
}

function getFragmentKey(
  fragment: ExperimentalFragment,
  pageIndex: number,
  fragmentIndex: number,
): string {
  return fragment.id || `__missing_id_${pageIndex}_${fragmentIndex}`;
}

function buildFragmentMappingReport(
  pages: ExperimentalPage[],
): ExperimentalFragmentMappingReport {
  const fragments = pages.flatMap((page) => page.fragments ?? []);
  const countsByKind: Record<string, number> = {};
  let fragmentsWithoutKind = 0;
  let fragmentsWithoutId = 0;

  fragments.forEach((fragment) => {
    const kind = typeof fragment.kind === 'string' && fragment.kind.trim()
      ? fragment.kind
      : '';

    if (!kind) {
      fragmentsWithoutKind += 1;
    } else {
      countsByKind[kind] = (countsByKind[kind] ?? 0) + 1;
    }

    if (!fragment.id) {
      fragmentsWithoutId += 1;
    }
  });

  const kinds = Object.keys(countsByKind).sort();

  const hasDedicatedRenderer = new Set([
    'summaryTables', 'finalEvaluation', 'signatures',
    'findingListTitle', 'findingListItem', 'recommendationItem', 'noteItem',
    'inspectionDetailItem', 'notesCategoryTitle', 'sectionTitle', 'narrative',
    'reportHeader', 'reportTitle', 'assignment', 'committee', 'purpose', 'visitDate',
    'officialNotesTitle', 'recommendationsTitle', 'recommendationAuthorityTitle',
    'appendicesTitle', 'appendixTitle', 'appendixParagraph', 'subsectionTitle',
    'inspectionDetailsTitle', 'detailedTables',
  ]);

  return {
    totalFragments: fragments.length,
    kinds,
    countsByKind,
    supportedKinds: kinds.filter((k) => hasDedicatedRenderer.has(k)),
    unsupportedKinds: [],
    fragmentsWithoutKind,
    fragmentsWithoutId,
    needsDedicatedRendererKinds: kinds.filter((k) => !hasDedicatedRenderer.has(k)),
  };
}

function extractFragmentText(fragment: ExperimentalFragment): string {
  const data = asRecord(fragment.data);
  const candidates = [
    fragment.title,
    data.text,
    data.title,
    data.titleText,
    data.assignmentText,
    data.purposeText,
    data.durationText,
    data.statement,
    asRecord(data.recommendation).text,
  ];

  const firstText = candidates.find(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0,
  );
  return firstText ?? '';
}

function toEasternArabicDigits(value: number | string): string {
  const digits = '٠١٢٣٤٥٦٧٨٩';
  return String(value).replace(/[0-9]/g, (d) => digits[parseInt(d, 10)]);
}

function extractHeaderDate(pageDocument: ExperimentalPageDocumentModel): string {
  if (pageDocument.generatedAt) {
    try {
      const d = new Date(pageDocument.generatedAt);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('ar-IQ');
      }
    } catch {}
  }
  return new Date().toLocaleDateString('ar-IQ');
}

function extractHeaderFormation(pageDocument: ExperimentalPageDocumentModel): string {
  const allFragments = (pageDocument.pages ?? []).flatMap((p) => p.fragments ?? []);
  const headerFrag = allFragments.find((f) => f.kind === 'reportHeader');
  if (headerFrag) {
    const data = asRecord(headerFrag.data);
    return asString(data.code) || asString(data.formation) || '\u2014';
  }
  const fragments = pageDocument.fragments ?? [];
  const docHeaderFrag = fragments.find((f) => f.kind === 'reportHeader');
  if (docHeaderFrag) {
    const data = asRecord(docHeaderFrag.data);
    return asString(data.code) || asString(data.formation) || '\u2014';
  }
  return '\u2014';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
