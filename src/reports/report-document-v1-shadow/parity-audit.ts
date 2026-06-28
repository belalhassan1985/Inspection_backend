import type { ReportFragmentV1 } from '../../contracts/report-document-v1/types';
import type { ShadowReportDocumentV1 } from './report-document-v1.builder';

type JsonRecord = Record<string, unknown>;

export type LegacyParityFragment = {
  id: string;
  kind: string;
  title?: string;
  data?: unknown;
};

export type ParityMappingStatus =
  | 'matched'
  | 'renamed'
  | 'merged'
  | 'split'
  | 'missing-in-v1'
  | 'extra-in-v1';

export type ParityMappingEntry = {
  legacyFragmentId: string | null;
  v1FragmentIds: readonly string[];
  legacyKind: string | null;
  v1Kinds: readonly string[];
  category: string;
  status: ParityMappingStatus;
  contentImpact: 'none' | 'structural' | 'content';
  reason: string;
};

export type ParityAuditReport = {
  legacyFragmentCount: number;
  v1FragmentCount: number;
  delta: number;
  kindDistribution: {
    legacy: Readonly<Record<string, number>>;
    v1: Readonly<Record<string, number>>;
  };
  categorySummary: Readonly<Record<string, {
    legacy: number;
    v1: number;
    missingInV1: number;
    extraInV1: number;
  }>>;
  mapping: readonly ParityMappingEntry[];
  logicalOrder: {
    stable: boolean;
    firstViolationLegacyFragmentId: string | null;
  };
  actualMissingContent: readonly ParityMappingEntry[];
  structuralDifferences: readonly ParityMappingEntry[];
  detailedTablesCoverage: {
    legacyContainers: number;
    sourceTables: number;
    v1TableTitles: number;
    v1TableHeaders: number;
    sourceRows: number;
    v1Rows: number;
    missingTablePaths: readonly string[];
    duplicateTablePaths: readonly string[];
    rowCountMismatches: readonly string[];
    rowValueMismatches: readonly string[];
  };
  officerInfoCoverage: {
    subsections: number;
    expectedFields: number;
    v1Rows: number;
    missingFieldPaths: readonly string[];
    duplicateFieldPaths: readonly string[];
    valueMismatches: readonly string[];
  };
  appendicesCoverage: {
    fixturePresent: boolean;
    sourceAppendices: number;
    v1AppendicesTitles: number;
    v1AppendixTitles: number;
    sourceParagraphs: number;
    v1Paragraphs: number;
    missingAppendixPaths: readonly string[];
    duplicateAppendixPaths: readonly string[];
    paragraphCountMismatches: readonly string[];
    textMismatches: readonly string[];
    orderStable: boolean;
  };
  appendicesFixturePresent: boolean;
};

const asRecord = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];

const isVisible = (value: JsonRecord): boolean => value.visible !== false;

const stableValue = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as JsonRecord;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableValue(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
};

const distribution = (fragments: readonly { kind: string }[]): Record<string, number> =>
  fragments.reduce<Record<string, number>>((counts, fragment) => {
    counts[fragment.kind] = (counts[fragment.kind] ?? 0) + 1;
    return counts;
  }, {});

const normalizedKind = (legacyKind: string, legacyId: string): string => {
  if (legacyKind === 'summaryTables') return 'tableTitle';
  if (legacyKind === 'narrative') return legacyId.includes('-sub-') ? 'subsectionNarrative' : 'sectionNarrative';
  if (legacyKind === 'findingListTitle' || legacyKind === 'inspectionDetailsTitle') return 'findingGroupTitle';
  if (legacyKind === 'findingListItem' || legacyKind === 'inspectionDetailItem') return 'findingItem';
  if (legacyKind === 'notesCategoryTitle') return 'noteCategoryTitle';
  if (legacyKind === 'recommendationAuthorityTitle') return 'recommendationGroupTitle';
  return legacyKind;
};

const categoryFor = (id: string, kind: string): string => {
  if (id.includes('-officer-') || id.includes(':officer:')) return 'subsection';
  if (kind.startsWith('table') || kind === 'summaryTables' || kind === 'detailedTables') return 'table';
  if (kind === 'signatures') return 'signatures';
  if (kind === 'finalEvaluation') return 'finalEvaluation';
  if (kind.includes('recommendation') || id.includes('recommendation')) return 'recommendationGroup';
  if (kind.includes('note') || kind.includes('Note') || id.includes('official-notes')) return 'officialNotes';
  if (kind.includes('appendix') || kind === 'appendicesTitle' || id.includes('appendix')) return 'appendices';
  if (kind.includes('finding') || kind.includes('Finding') || kind === 'inspectionDetailItem') return 'finding';
  if (id.includes('-sub-') || kind.startsWith('subsection')) return 'subsection';
  if (kind.startsWith('section') || id.includes('inspection-details')) return 'section';
  return 'document';
};

const pathMatch = (
  document: ShadowReportDocumentV1,
  sourcePath: string,
  kind?: string,
): string[] => document.fragmentOrder.filter((id) => {
  const fragment = document.fragments[id];
  return fragment.sourceRef.sourcePath === sourcePath && (!kind || fragment.kind === kind);
});

const occurrenceMatch = (
  legacy: readonly LegacyParityFragment[],
  legacyIndex: number,
  document: ShadowReportDocumentV1,
  targetKind: string,
): string[] => {
  const occurrence = legacy.slice(0, legacyIndex + 1)
    .filter((fragment) => normalizedKind(fragment.kind, fragment.id) === targetKind).length - 1;
  const matches = document.fragmentOrder.filter((id) => document.fragments[id].kind === targetKind);
  return matches[occurrence] ? [matches[occurrence]] : [];
};

const resolveLegacyMapping = (
  legacy: readonly LegacyParityFragment[],
  legacyIndex: number,
  document: ShadowReportDocumentV1,
): { ids: string[]; status: Exclude<ParityMappingStatus, 'extra-in-v1'>; impact: ParityMappingEntry['contentImpact']; reason: string } => {
  const fragment = legacy[legacyIndex];
  if (fragment.kind === 'summaryTables') {
    const ids = document.fragmentOrder.filter((id) => id.startsWith('table:summary:'));
    return { ids, status: 'split', impact: 'none', reason: 'The atomic legacy summary table is split into title, header, and row fragments.' };
  }
  const officer = fragment.id.match(/^sec-(\d+)-sub-(\d+)-officer-(\d+)$/);
  if (officer) {
    const prefix = `$.sections[${officer[1]}].subsections[${officer[2]}].officerInfo`;
    const fieldsByLegacyRow: Readonly<Record<string, readonly string[]>> = {
      '0': ['rank', 'fullName'],
      '1': ['statisticalNumber'],
      '2': ['joinedDate', 'positionName'],
      '3': ['education'],
    };
    const fields = fieldsByLegacyRow[officer[3]] ?? [];
    const ids = fields.flatMap((field) => pathMatch(document, `${prefix}.${field}`, 'tableRow'));
    return {
      ids,
      status: ids.length === 0 ? 'missing-in-v1' : ids.length === 1 ? 'renamed' : 'split',
      impact: ids.length ? 'none' : 'content',
      reason: 'The legacy officer display row maps to independent field-level V1 tableRow fragments.',
    };
  }
  const finding = fragment.id.match(/^sec-(\d+)-sub-(\d+)-finding-(\d+)$/);
  if (finding) {
    const ids = pathMatch(document, `$.sections[${finding[1]}].subsections[${finding[2]}].findings[${finding[3]}]`, 'findingItem');
    return { ids, status: ids.length ? 'renamed' : 'missing-in-v1', impact: ids.length ? 'none' : 'content', reason: 'Inspection detail finding is represented by the canonical findingItem kind.' };
  }
  if (fragment.kind === 'detailedTables') {
    const table = fragment.id.match(/^sec-(\d+)-sub-(\d+)-tables$/);
    const prefix = table ? `$.sections[${table[1]}].subsections[${table[2]}].detailedTables[` : '';
    const ids = prefix
      ? document.fragmentOrder.filter((id) => {
        const candidate = document.fragments[id];
        return candidate.sourceRef.sourcePath?.startsWith(prefix) === true
          && (candidate.kind === 'tableTitle' || candidate.kind === 'tableHeader' || candidate.kind === 'tableRow');
      })
      : [];
    return { ids, status: ids.length ? 'split' : 'missing-in-v1', impact: ids.length ? 'none' : 'content', reason: 'The legacy detailed-tables container maps to atomic title, header, and row fragments.' };
  }
  const sectionTitle = fragment.id.match(/^sec-(\d+)-title$/);
  if (sectionTitle) {
    const ids = pathMatch(document, `$.sections[${sectionTitle[1]}]`, 'sectionTitle');
    return { ids, status: ids.length ? 'renamed' : 'missing-in-v1', impact: ids.length ? 'none' : 'structural', reason: 'Section title uses a stable source-based V1 ID.' };
  }
  const subsectionTitle = fragment.id.match(/^sec-(\d+)-sub-(\d+)-title$/);
  if (subsectionTitle) {
    const ids = pathMatch(document, `$.sections[${subsectionTitle[1]}].subsections[${subsectionTitle[2]}]`, 'subsectionTitle');
    return { ids, status: ids.length ? 'renamed' : 'missing-in-v1', impact: ids.length ? 'none' : 'structural', reason: 'Subsection title uses a stable source-based V1 ID.' };
  }
  const narrative = fragment.id.match(/^sec-(\d+)(?:-sub-(\d+))?-narrative$/);
  if (narrative) {
    const path = narrative[2] === undefined
      ? `$.sections[${narrative[1]}].narrativeText`
      : `$.sections[${narrative[1]}].subsections[${narrative[2]}].narrativeText`;
    const ids = pathMatch(document, path);
    return { ids, status: ids.length ? 'renamed' : 'missing-in-v1', impact: ids.length ? 'none' : 'content', reason: 'Narrative uses a canonical section-specific kind and stable ID.' };
  }
  const detail = fragment.id.match(/^sec-(\d+)-sub-(\d+)-details(?:-title|-\d+)$/);
  if (detail) return { ids: [], status: 'missing-in-v1', impact: 'content', reason: 'Detailed assessment items are not represented by the Phase 40B builder.' };

  const targetKind = normalizedKind(fragment.kind, fragment.id);
  const ids = occurrenceMatch(legacy, legacyIndex, document, targetKind);
  if (ids.length === 0) return { ids, status: 'missing-in-v1', impact: fragment.kind === 'noteItem' ? 'structural' : 'content', reason: 'No canonical fragment counterpart was found.' };
  const sameIdentity = ids.length === 1 && ids[0] === fragment.id && targetKind === fragment.kind;
  return { ids, status: sameIdentity ? 'matched' : 'renamed', impact: 'none', reason: sameIdentity ? 'Legacy and V1 identity are equal.' : 'Content has a canonical kind or stable V1 identifier.' };
};

const fragmentsAtPath = (
  document: ShadowReportDocumentV1,
  sourcePath: string,
  kind: ReportFragmentV1['kind'],
): ReportFragmentV1[] => pathMatch(document, sourcePath, kind).map((id) => document.fragments[id]);

const auditDetailedTables = (
  legacyFragments: readonly LegacyParityFragment[],
  document: ShadowReportDocumentV1,
  sourcePayload: unknown,
): ParityAuditReport['detailedTablesCoverage'] => {
  let sourceTables = 0;
  let sourceRows = 0;
  let v1TableTitles = 0;
  let v1TableHeaders = 0;
  let v1Rows = 0;
  const missingTablePaths: string[] = [];
  const duplicateTablePaths: string[] = [];
  const rowCountMismatches: string[] = [];
  const rowValueMismatches: string[] = [];
  const payload = asRecord(sourcePayload);

  asArray(payload.sections).forEach((sectionValue, sectionIndex) => {
    const section = asRecord(sectionValue);
    if (!isVisible(section) || section.isManual === true) return;
    asArray(section.subsections).forEach((subsectionValue, subsectionIndex) => {
      const subsection = asRecord(subsectionValue);
      if (!isVisible(subsection)) return;
      asArray(subsection.detailedTables).forEach((tableValue, tableIndex) => {
        sourceTables += 1;
        const table = asRecord(tableValue);
        const tablePath = `$.sections[${sectionIndex}].subsections[${subsectionIndex}].detailedTables[${tableIndex}]`;
        const titles = fragmentsAtPath(document, tablePath, 'tableTitle');
        v1TableTitles += titles.length;
        if (titles.length === 0) missingTablePaths.push(tablePath);
        if (titles.length > 1) duplicateTablePaths.push(tablePath);
        const headers = fragmentsAtPath(document, `${tablePath}.schema`, 'tableHeader');
        v1TableHeaders += headers.length;
        if (headers.length === 0) missingTablePaths.push(`${tablePath}.schema`);
        if (headers.length > 1) duplicateTablePaths.push(`${tablePath}.schema`);

        const rows = asArray(table.rows);
        sourceRows += rows.length;
        let representedRows = 0;
        rows.forEach((row, rowIndex) => {
          const rowPath = `${tablePath}.rows[${rowIndex}]`;
          const fragments = fragmentsAtPath(document, rowPath, 'tableRow');
          representedRows += fragments.length;
          v1Rows += fragments.length;
          if (fragments.length !== 1 || stableValue(asRecord(fragments[0]?.content).row) !== stableValue(row)) {
            rowValueMismatches.push(rowPath);
          }
        });
        if (representedRows !== rows.length) rowCountMismatches.push(tablePath);
      });
    });
  });

  return {
    legacyContainers: legacyFragments.filter((fragment) => fragment.kind === 'detailedTables').length,
    sourceTables,
    v1TableTitles,
    v1TableHeaders,
    sourceRows,
    v1Rows,
    missingTablePaths,
    duplicateTablePaths,
    rowCountMismatches,
    rowValueMismatches,
  };
};

const auditOfficerInfo = (
  document: ShadowReportDocumentV1,
  sourcePayload: unknown,
): ParityAuditReport['officerInfoCoverage'] => {
  const fields = ['rank', 'fullName', 'positionName', 'statisticalNumber', 'education', 'joinedDate'] as const;
  let subsections = 0;
  let expectedFields = 0;
  let v1Rows = 0;
  const missingFieldPaths: string[] = [];
  const duplicateFieldPaths: string[] = [];
  const valueMismatches: string[] = [];
  const payload = asRecord(sourcePayload);

  asArray(payload.sections).forEach((sectionValue, sectionIndex) => {
    const section = asRecord(sectionValue);
    if (!isVisible(section) || section.isManual === true) return;
    asArray(section.subsections).forEach((subsectionValue, subsectionIndex) => {
      const subsection = asRecord(subsectionValue);
      if (!isVisible(subsection)) return;
      const officerInfo = asRecord(subsection.officerInfo);
      if (Object.keys(officerInfo).length === 0) return;
      subsections += 1;
      fields.forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(officerInfo, field)) return;
        if (field === 'education' && (!officerInfo.education || officerInfo.education === '—')) return;
        expectedFields += 1;
        const path = `$.sections[${sectionIndex}].subsections[${subsectionIndex}].officerInfo.${field}`;
        const fragments = fragmentsAtPath(document, path, 'tableRow');
        v1Rows += fragments.length;
        if (fragments.length === 0) missingFieldPaths.push(path);
        if (fragments.length > 1) duplicateFieldPaths.push(path);
        if (fragments.length !== 1 || stableValue(asRecord(fragments[0]?.content).value) !== stableValue(officerInfo[field])) {
          valueMismatches.push(path);
        }
      });
    });
  });

  return { subsections, expectedFields, v1Rows, missingFieldPaths, duplicateFieldPaths, valueMismatches };
};

const splitAppendixParagraphs = (value: unknown): string[] =>
  (typeof value === 'string' ? value : '').split(/\r?\n\s*\r?\n/).filter((paragraph) => paragraph.length > 0);

const auditAppendices = (
  document: ShadowReportDocumentV1,
  sourcePayload: unknown,
): ParityAuditReport['appendicesCoverage'] => {
  const payload = asRecord(sourcePayload);
  const appendices = asArray(payload.appendices).map(asRecord).filter(isVisible);
  const sectionTitles = fragmentsAtPath(document, '$.appendices', 'appendicesTitle');
  let v1AppendixTitles = 0;
  let sourceParagraphs = 0;
  let v1Paragraphs = 0;
  const missingAppendixPaths: string[] = [];
  const duplicateAppendixPaths: string[] = [];
  const paragraphCountMismatches: string[] = [];
  const textMismatches: string[] = [];
  const expectedOrder: Array<{ kind: string; path: string; value: unknown }> = [];

  if (appendices.length > 0) expectedOrder.push({ kind: 'appendicesTitle', path: '$.appendices', value: null });
  if (appendices.length > 0 && sectionTitles.length === 0) missingAppendixPaths.push('$.appendices');
  if (sectionTitles.length > 1) duplicateAppendixPaths.push('$.appendices');

  asArray(payload.appendices).forEach((appendixValue, appendixIndex) => {
    const appendix = asRecord(appendixValue);
    if (!isVisible(appendix)) return;
    const appendixPath = `$.appendices[${appendixIndex}]`;
    const titles = fragmentsAtPath(document, appendixPath, 'appendixTitle');
    v1AppendixTitles += titles.length;
    if (titles.length === 0) missingAppendixPaths.push(appendixPath);
    if (titles.length > 1) duplicateAppendixPaths.push(appendixPath);
    if (titles.length === 1 && stableValue(asRecord(titles[0].content).symbol) !== stableValue(appendix.symbol)) {
      textMismatches.push(`${appendixPath}.symbol`);
    }
    expectedOrder.push({ kind: 'appendixTitle', path: appendixPath, value: appendix.symbol });

    const paragraphPath = `${appendixPath}.text`;
    const expectedParagraphs = splitAppendixParagraphs(appendix.text);
    const paragraphs = fragmentsAtPath(document, paragraphPath, 'appendixParagraph');
    sourceParagraphs += expectedParagraphs.length;
    v1Paragraphs += paragraphs.length;
    if (paragraphs.length !== expectedParagraphs.length) paragraphCountMismatches.push(paragraphPath);
    if (paragraphs.length > expectedParagraphs.length) duplicateAppendixPaths.push(paragraphPath);
    expectedParagraphs.forEach((text, index) => {
      expectedOrder.push({ kind: 'appendixParagraph', path: paragraphPath, value: text });
      if (stableValue(asRecord(paragraphs[index]?.content).text) !== stableValue(text)) {
        textMismatches.push(`${paragraphPath}[${index}]`);
      }
    });
  });

  const actualOrder = document.fragmentOrder
    .map((id) => document.fragments[id])
    .filter((fragment) => fragment.kind === 'appendicesTitle' || fragment.kind === 'appendixTitle' || fragment.kind === 'appendixParagraph')
    .map((fragment) => ({
      kind: fragment.kind,
      path: fragment.sourceRef.sourcePath,
      value: fragment.kind === 'appendixTitle'
        ? asRecord(fragment.content).symbol
        : fragment.kind === 'appendixParagraph' ? asRecord(fragment.content).text : null,
    }));

  return {
    fixturePresent: appendices.length > 0,
    sourceAppendices: appendices.length,
    v1AppendicesTitles: sectionTitles.length,
    v1AppendixTitles,
    sourceParagraphs,
    v1Paragraphs,
    missingAppendixPaths,
    duplicateAppendixPaths,
    paragraphCountMismatches,
    textMismatches,
    orderStable: stableValue(actualOrder) === stableValue(expectedOrder),
  };
};

export const auditReportDocumentV1Parity = (
  legacyFragments: readonly LegacyParityFragment[],
  document: ShadowReportDocumentV1,
  sourcePayload?: unknown,
): ParityAuditReport => {
  const appendicesCoverage = auditAppendices(document, sourcePayload);
  const mappedV1Ids = new Set<string>();
  const mapping: ParityMappingEntry[] = legacyFragments.map((legacyFragment, legacyIndex) => {
    const resolved = resolveLegacyMapping(legacyFragments, legacyIndex, document);
    resolved.ids.forEach((id) => mappedV1Ids.add(id));
    return {
      legacyFragmentId: legacyFragment.id,
      v1FragmentIds: resolved.ids,
      legacyKind: legacyFragment.kind,
      v1Kinds: resolved.ids.map((id) => document.fragments[id].kind),
      category: categoryFor(legacyFragment.id, legacyFragment.kind),
      status: resolved.status,
      contentImpact: resolved.impact,
      reason: resolved.reason,
    };
  });

  for (const id of document.fragmentOrder) {
    if (mappedV1Ids.has(id)) continue;
    const fragment = document.fragments[id];
    mapping.push({
      legacyFragmentId: null,
      v1FragmentIds: [id],
      legacyKind: null,
      v1Kinds: [fragment.kind],
      category: categoryFor(id, fragment.kind),
      status: 'extra-in-v1',
      contentImpact: 'structural',
      reason: fragment.kind === 'findingGroupTitle'
        ? 'V1 introduces an explicit group title for generic subsection findings.'
        : fragment.sourceRef.sourceType === 'officer-info'
          ? 'V1 preserves officer information as field-level rows for pagination fidelity.'
          : fragment.sourceRef.sourceType === 'detailed-table' || fragment.sourceRef.sourceType === 'detailed-table-row'
            ? 'V1 preserves detailed table structure as atomic fragments.'
        : 'V1 introduces a canonical structural fragment with no legacy fragment identity.',
    });
  }

  const v1Indexes = new Map(document.fragmentOrder.map((id, index) => [id, index]));
  let previousIndex = -1;
  let firstViolationLegacyFragmentId: string | null = null;
  for (const item of mapping) {
    if (!item.legacyFragmentId || item.v1FragmentIds.length === 0) continue;
    const index = v1Indexes.get(item.v1FragmentIds[0]);
    if (index === undefined) continue;
    if (index < previousIndex) {
      firstViolationLegacyFragmentId = item.legacyFragmentId;
      break;
    }
    previousIndex = index;
  }

  const categorySummary: Record<string, { legacy: number; v1: number; missingInV1: number; extraInV1: number }> = {};
  const ensureCategory = (category: string) => categorySummary[category] ??= { legacy: 0, v1: 0, missingInV1: 0, extraInV1: 0 };
  legacyFragments.forEach((fragment) => { ensureCategory(categoryFor(fragment.id, fragment.kind)).legacy += 1; });
  document.fragmentOrder.forEach((id) => { const fragment = document.fragments[id]; ensureCategory(categoryFor(id, fragment.kind)).v1 += 1; });
  mapping.forEach((item) => {
    if (item.status === 'missing-in-v1') ensureCategory(item.category).missingInV1 += 1;
    if (item.status === 'extra-in-v1') ensureCategory(item.category).extraInV1 += 1;
  });

  return {
    legacyFragmentCount: legacyFragments.length,
    v1FragmentCount: document.fragmentOrder.length,
    delta: document.fragmentOrder.length - legacyFragments.length,
    kindDistribution: {
      legacy: distribution(legacyFragments),
      v1: distribution(document.fragmentOrder.map((id) => document.fragments[id])),
    },
    categorySummary,
    mapping,
    logicalOrder: { stable: firstViolationLegacyFragmentId === null, firstViolationLegacyFragmentId },
    actualMissingContent: mapping.filter((item) => item.status === 'missing-in-v1' && item.contentImpact === 'content'),
    structuralDifferences: mapping.filter((item) => item.contentImpact === 'structural'),
    detailedTablesCoverage: auditDetailedTables(legacyFragments, document, sourcePayload),
    officerInfoCoverage: auditOfficerInfo(document, sourcePayload),
    appendicesCoverage,
    appendicesFixturePresent: appendicesCoverage.fixturePresent,
  };
};
