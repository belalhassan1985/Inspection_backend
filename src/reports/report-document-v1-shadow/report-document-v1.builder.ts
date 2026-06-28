import { createHash } from 'crypto';
import { REPORT_FRAGMENT_REGISTRY_V1 } from '../../contracts/report-document-v1/registry';
import type {
  FragmentKind,
  LayoutProfileV1,
  ReportDocumentV1,
  ReportFragmentV1,
  StyleTokensV1,
} from '../../contracts/report-document-v1/types';

type JsonRecord = Record<string, unknown>;

export type ReportDocumentV1Capabilities = {
  registryVersion: 1;
  fragmentKinds: Readonly<Record<FragmentKind, {
    canStartPage: boolean;
    splittable: boolean;
    repeatableHeader: boolean;
  }>>;
};

export type ShadowReportDocumentV1 = ReportDocumentV1 & {
  capabilities: ReportDocumentV1Capabilities;
};

export type ReportDocumentV1BuildOptions = {
  campaignId: string;
  documentId?: string;
  revision?: number;
  generatedAt?: string;
};

const LIST_TYPES = ['positives', 'negatives', 'impediments', 'obstacles'] as const;

const asRecord = (value: unknown): JsonRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};

const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const asString = (value: unknown): string => typeof value === 'string' ? value : '';
const isVisible = (value: unknown): boolean => asRecord(value).visible !== false;

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as JsonRecord)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

const hash = (value: unknown, length = 64): string =>
  createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, length);

const sourceEntityId = (value: JsonRecord, fallback: string): string =>
  asString(value.id) || asString(value.uuid) || fallback;

const itemIds = (items: unknown[], prefix: string): string[] => {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    const record = asRecord(item);
    const explicitId = asString(record.id) || asString(record.uuid);
    if (explicitId) return `${prefix}:${explicitId}`;
    const itemHash = hash(item, 12);
    const occurrence = (occurrences.get(itemHash) ?? 0) + 1;
    occurrences.set(itemHash, occurrence);
    return `${prefix}:${itemHash}:${occurrence}`;
  });
};

const layoutProfile = (): LayoutProfileV1 => ({
  profileId: 'official-a4-v1',
  pageSize: 'A4',
  widthMm: 210,
  heightMm: 297,
  marginsMm: { top: 20, right: 10, bottom: 22, left: 10 },
  locale: 'ar-IQ',
  direction: 'rtl',
  measurementUnit: 'mm',
  fontMetricsVersion: 'cairo-v1',
});

const styleTokens = (payload: JsonRecord): StyleTokensV1 => {
  const formatting = asRecord(payload.formatting);
  return {
    profileId: 'official-style-v1',
    fontFamily: asString(formatting.fontFamily) || 'Cairo',
    fallbackFontFamilies: ['Tahoma', 'Arial', 'sans-serif'],
    baseFontSizePx: typeof formatting.baseFontSize === 'number' ? formatting.baseFontSize : 14,
    lineHeight: typeof formatting.lineHeight === 'number' ? formatting.lineHeight : 1.6,
    colors: {
      title: asString(formatting.titleColor) || '#0c2340',
      numbering: asString(formatting.numberingColor) || '#0c2340',
      text: '#1f2937',
    },
    fontSizesPx: { title: 24, sectionTitle: 16, body: 14, table: 12 },
    spacingPx: { fragment: 6, section: 12, paragraph: 8 },
    table: {
      borderColor: asString(formatting.tableBorderColor) || '#000000',
      borderWidthPx: 1,
      headerBackgroundColor: asString(formatting.tableHeaderBg) || '#f2f2f2',
      cellPaddingPx: 6,
    },
  };
};

export class ReportDocumentV1Builder {
  build(payloadValue: unknown, options: ReportDocumentV1BuildOptions): ShadowReportDocumentV1 {
    const payload = asRecord(payloadValue);
    const fragments: Record<string, ReportFragmentV1> = {};
    const fragmentOrder: string[] = [];

    const add = (fragment: Omit<ReportFragmentV1, 'layoutDefaults' | 'visible'> & { visible?: boolean }): string => {
      if (fragments[fragment.id]) throw new Error(`Duplicate ReportDocumentV1 fragment ID '${fragment.id}'.`);
      const registryEntry = REPORT_FRAGMENT_REGISTRY_V1[fragment.kind];
      fragments[fragment.id] = {
        ...fragment,
        visible: fragment.visible ?? true,
        layoutDefaults: { ...registryEntry.defaultFlowRules },
      };
      fragmentOrder.push(fragment.id);
      return fragment.id;
    };

    add({
      id: 'report:header',
      kind: 'reportHeader',
      sourceRef: { sourceType: 'campaign', sourceId: options.campaignId, sourcePath: '$' },
      content: {
        targetEntityName: payload.targetEntityName,
        formationNumber: payload.formationNumber,
        startDate: payload.startDate,
      },
    });
    add({
      id: 'report:title',
      kind: 'reportTitle',
      sourceRef: { sourceType: 'campaign', sourceId: options.campaignId, sourcePath: '$.title' },
      content: { title: payload.title },
    });

    this.addIntroduction(payload, options.campaignId, add);
    this.addSummaryTable(payload, options.campaignId, add);
    this.addSections(payload, add);
    this.addOfficialNotes(payload, add);
    this.addRecommendations(payload, add);
    this.addAppendices(payload, add);

    if (payload.finalEvaluation !== undefined && payload.finalEvaluation !== null) {
      add({
        id: 'final-evaluation',
        kind: 'finalEvaluation',
        sourceRef: { sourceType: 'campaign', sourceId: options.campaignId, sourcePath: '$.finalEvaluation' },
        content: payload.finalEvaluation,
      });
    }
    if (payload.signatures !== undefined && payload.signatures !== null) {
      add({
        id: 'signatures',
        kind: 'signatures',
        sourceRef: { sourceType: 'campaign', sourceId: options.campaignId, sourcePath: '$.signatures' },
        content: payload.signatures,
      });
    }

    const hierarchy = fragmentOrder.map((fragmentId) => ({
      fragmentId,
      parentFragmentId: fragments[fragmentId].parentId,
      childFragmentIds: fragmentOrder.filter((candidateId) => fragments[candidateId].parentId === fragmentId),
    }));
    const documentId = options.documentId || `campaign:${options.campaignId}:report`;
    const revision = options.revision ?? 1;
    const metadata = {
      title: payload.title,
      campaignName: payload.campaignName,
      targetEntityName: payload.targetEntityName,
      startDate: payload.startDate,
      endDate: payload.endDate,
      formationNumber: payload.formationNumber,
      isEducation: payload.isEducation === true,
    };
    const resolvedLayoutProfile = layoutProfile();
    const resolvedStyleTokens = styleTokens(payload);
    const capabilities: ReportDocumentV1Capabilities = {
      registryVersion: 1,
      fragmentKinds: Object.fromEntries(Object.entries(REPORT_FRAGMENT_REGISTRY_V1).map(([kind, value]) => [kind, value.capabilities])) as ReportDocumentV1Capabilities['fragmentKinds'],
    };
    const contentHash = hash({
      documentId,
      revision,
      metadata,
      layoutProfile: resolvedLayoutProfile,
      styleTokens: resolvedStyleTokens,
      fragmentOrder,
      fragments,
      capabilities,
    });

    return {
      schemaVersion: 1,
      documentId,
      campaignId: options.campaignId,
      revision,
      contentHash,
      generatedAt: options.generatedAt || new Date().toISOString(),
      locale: 'ar-IQ',
      direction: 'rtl',
      metadata,
      layoutProfile: resolvedLayoutProfile,
      styleTokens: resolvedStyleTokens,
      assets: [{ assetId: 'ministry-logo', kind: 'image', source: 'system:ministry-logo' }],
      fragmentOrder,
      fragments,
      hierarchy,
      capabilities,
    };
  }

  private addIntroduction(payload: JsonRecord, campaignId: string, add: AddFragment): void {
    const entries: Array<{ id: string; kind: FragmentKind; path: string; content: unknown }> = [
      { id: 'introduction:assignment', kind: 'assignment', path: '$.assignmentText', content: { text: payload.assignmentText, reference: payload.assignmentReference, date: payload.assignmentDate } },
      { id: 'introduction:committee', kind: 'committee', path: '$.committeeMembers', content: { members: asArray(payload.committeeMembers) } },
      { id: 'introduction:purpose', kind: 'purpose', path: '$.purposeText', content: { text: payload.purposeText } },
      { id: 'introduction:visit-date', kind: 'visitDate', path: '$.durationText', content: { text: payload.durationText, startDate: payload.startDate, endDate: payload.endDate } },
    ];
    for (const value of entries) add({ id: value.id, kind: value.kind, sourceRef: { sourceType: 'campaign', sourceId: campaignId, sourcePath: value.path }, content: value.content });
  }

  private addSummaryTable(payload: JsonRecord, campaignId: string, add: AddFragment): void {
    const titleId = add({ id: 'table:summary:title', kind: 'tableTitle', sourceRef: { sourceType: 'campaign', sourceId: campaignId, sourcePath: '$.positions' }, content: { tableId: 'summary' } });
    add({ id: 'table:summary:header', kind: 'tableHeader', parentId: titleId, sourceRef: { sourceType: 'campaign', sourceId: campaignId, sourcePath: '$.positions' }, content: { tableId: 'summary', columns: ['sequence', 'positionName', 'rank', 'positionHolder', 'statisticalNumber', 'joinedDate', 'positionStatus', 'education'] } });
    const positions = asArray(payload.positions);
    const ids = itemIds(positions, 'table:summary:row');
    positions.forEach((position, index) => add({ id: ids[index], kind: 'tableRow', parentId: titleId, sourceRef: { sourceType: 'position', sourceId: ids[index], sourcePath: `$.positions[${index}]` }, content: { tableId: 'summary', position } }));
  }

  private addSections(payload: JsonRecord, add: AddFragment): void {
    const inspectionDetailsId = add({
      id: 'inspection-details:title',
      kind: 'sectionTitle',
      sourceRef: { sourceType: 'campaign', sourceId: 'inspection-details', sourcePath: '$.sections' },
      content: { title: 'تفاصيل التفتيش' },
    });
    asArray(payload.sections).forEach((sectionValue, sectionIndex) => {
      const section = asRecord(sectionValue);
      if (!isVisible(section) || section.isManual === true) return;
      const sectionSourceId = sourceEntityId(section, `section-${hash(section.title || sectionIndex, 12)}`);
      const sectionId = add({ id: `section:${sectionSourceId}:title`, kind: 'sectionTitle', parentId: inspectionDetailsId, sourceRef: { sourceType: 'section', sourceId: sectionSourceId, sourcePath: `$.sections[${sectionIndex}]` }, content: { title: section.title, numbering: section.numbering } });
      if (asString(section.narrativeText)) add({ id: `section:${sectionSourceId}:narrative`, kind: 'sectionNarrative', parentId: sectionId, sourceRef: { sourceType: 'section', sourceId: sectionSourceId, sourcePath: `$.sections[${sectionIndex}].narrativeText` }, content: { text: section.narrativeText } });
      this.addFindingLists(section, `section:${sectionSourceId}`, sectionId, `$.sections[${sectionIndex}]`, add);

      asArray(section.subsections).forEach((subsectionValue, subsectionIndex) => {
        const subsection = asRecord(subsectionValue);
        if (!isVisible(subsection)) return;
        const subsectionSourceId = sourceEntityId(subsection, `subsection-${hash(subsection.title || subsectionIndex, 12)}`);
        const subsectionPath = `$.sections[${sectionIndex}].subsections[${subsectionIndex}]`;
        const subsectionId = add({ id: `subsection:${subsectionSourceId}:title`, kind: 'subsectionTitle', parentId: sectionId, sourceRef: { sourceType: 'subsection', sourceId: subsectionSourceId, sourcePath: subsectionPath }, content: { title: subsection.title, numbering: subsection.numbering } });
        this.addOfficerInfoRows(subsection, subsectionSourceId, subsectionId, subsectionPath, add);
        this.addGenericFindings(subsection, subsectionSourceId, subsectionId, subsectionPath, add);
        if (asString(subsection.narrativeText)) add({ id: `subsection:${subsectionSourceId}:narrative`, kind: 'subsectionNarrative', parentId: subsectionId, sourceRef: { sourceType: 'subsection', sourceId: subsectionSourceId, sourcePath: `${subsectionPath}.narrativeText` }, content: { text: subsection.narrativeText } });
        this.addFindingLists(subsection, `subsection:${subsectionSourceId}`, subsectionId, subsectionPath, add);
        this.addDetailedTables(subsection, subsectionSourceId, subsectionId, subsectionPath, add);
      });
    });
  }

  private addOfficerInfoRows(source: JsonRecord, sourceId: string, parentId: string, sourcePath: string, add: AddFragment): void {
    const officerInfo = asRecord(source.officerInfo);
    if (Object.keys(officerInfo).length === 0) return;
    const fields: Array<{ field: string; label: string }> = [
      { field: 'rank', label: 'Rank' },
      { field: 'fullName', label: 'Name' },
      { field: 'statisticalNumber', label: 'Statistical number' },
      { field: 'joinedDate', label: 'Joined date' },
      { field: 'positionName', label: 'Position' },
      { field: 'education', label: 'Education' },
    ];
    for (const { field, label } of fields) {
      if (!Object.prototype.hasOwnProperty.call(officerInfo, field)) continue;
      if (field === 'education' && (!officerInfo.education || officerInfo.education === '—')) continue;
      add({
        id: `subsection:${sourceId}:officer:${field}`,
        kind: 'tableRow',
        parentId,
        sourceRef: { sourceType: 'officer-info', sourceId, sourcePath: `${sourcePath}.officerInfo.${field}` },
        content: {
          tableId: `officer-info:${sourceId}`,
          field,
          label,
          value: officerInfo[field],
          positionStatus: field === 'joinedDate' || field === 'positionName' ? officerInfo.positionStatus : undefined,
        },
      });
    }
  }

  private addDetailedTables(source: JsonRecord, sourceId: string, parentId: string, sourcePath: string, add: AddFragment): void {
    asArray(source.detailedTables).forEach((tableValue, tableIndex) => {
      const table = asRecord(tableValue);
      const detailId = typeof table.detailId === 'number' || typeof table.detailId === 'string'
        ? String(table.detailId)
        : hash({ sourceId, title: table.title, schema: table.schema, entityId: table.entityId }, 12);
      const tableId = `detailed:${detailId}`;
      const tablePath = `${sourcePath}.detailedTables[${tableIndex}]`;
      const titleId = add({
        id: `table:${tableId}:title`,
        kind: 'tableTitle',
        parentId,
        sourceRef: { sourceType: 'detailed-table', sourceId: detailId, sourcePath: tablePath },
        content: { tableId, title: table.title, entityId: table.entityId, entityName: table.entityName, inspectionId: table.inspectionId, detailId: table.detailId },
      });
      add({
        id: `table:${tableId}:header`,
        kind: 'tableHeader',
        parentId: titleId,
        sourceRef: { sourceType: 'detailed-table', sourceId: detailId, sourcePath: `${tablePath}.schema` },
        content: { tableId, columns: asArray(table.schema) },
      });
      const rows = asArray(table.rows);
      const ids = itemIds(rows, `table:${tableId}:row`);
      rows.forEach((row, rowIndex) => add({
        id: ids[rowIndex],
        kind: 'tableRow',
        parentId: titleId,
        sourceRef: { sourceType: 'detailed-table-row', sourceId: ids[rowIndex], sourcePath: `${tablePath}.rows[${rowIndex}]` },
        content: { tableId, row },
      }));
    });
  }

  private addFindingLists(source: JsonRecord, idPrefix: string, parentId: string, sourcePath: string, add: AddFragment): void {
    for (const listType of LIST_TYPES) {
      const items = asArray(source[`${listType}List`]);
      const showKey = `show${listType.charAt(0).toUpperCase()}${listType.slice(1)}`;
      if (source[showKey] === false || items.length === 0) continue;
      const groupId = add({ id: `${idPrefix}:findings:${listType}:title`, kind: 'findingGroupTitle', parentId, sourceRef: { sourceType: 'finding-group', sourceId: `${idPrefix}:${listType}`, sourcePath: `${sourcePath}.${listType}List` }, content: { findingType: listType } });
      const ids = itemIds(items, `${idPrefix}:finding:${listType}`);
      items.forEach((itemValue, index) => add({ id: ids[index], kind: 'findingItem', parentId: groupId, sourceRef: { sourceType: 'finding', sourceId: ids[index], sourcePath: `${sourcePath}.${listType}List[${index}]` }, content: { findingType: listType, text: typeof itemValue === 'string' ? itemValue : asRecord(itemValue).text } }));
    }
  }

  private addGenericFindings(source: JsonRecord, sourceId: string, parentId: string, sourcePath: string, add: AddFragment): void {
    const items = asArray(source.findings);
    if (items.length === 0) return;
    const groupId = add({ id: `subsection:${sourceId}:findings:general:title`, kind: 'findingGroupTitle', parentId, sourceRef: { sourceType: 'finding-group', sourceId: `${sourceId}:general`, sourcePath: `${sourcePath}.findings` }, content: { findingType: 'general' } });
    const ids = itemIds(items, `subsection:${sourceId}:finding:general`);
    items.forEach((itemValue, index) => add({ id: ids[index], kind: 'findingItem', parentId: groupId, sourceRef: { sourceType: 'finding', sourceId: ids[index], sourcePath: `${sourcePath}.findings[${index}]` }, content: { findingType: 'general', text: typeof itemValue === 'string' ? itemValue : asRecord(itemValue).text } }));
  }

  private addOfficialNotes(payload: JsonRecord, add: AddFragment): void {
    const sections = asArray(payload.sections).map(asRecord);
    const sectionIndex = sections.findIndex((section) => section.isManual === true || section.id === 'manual-notes');
    if (sectionIndex < 0) return;
    const source = sections[sectionIndex];
    const titleId = add({ id: 'official-notes:title', kind: 'officialNotesTitle', sourceRef: { sourceType: 'section', sourceId: sourceEntityId(source, 'manual-notes'), sourcePath: `$.sections[${sectionIndex}]` }, content: { title: source.title } });
    for (const listType of LIST_TYPES) {
      const categoryId = add({ id: `official-notes:${listType}:title`, kind: 'noteCategoryTitle', parentId: titleId, sourceRef: { sourceType: 'official-note-category', sourceId: listType, sourcePath: `$.sections[${sectionIndex}].${listType}List` }, content: { noteType: listType } });
      const items = asArray(source[`${listType}List`]);
      const ids = itemIds(items, `official-notes:${listType}:item`);
      items.forEach((itemValue, index) => add({ id: ids[index], kind: 'noteItem', parentId: categoryId, sourceRef: { sourceType: 'official-note', sourceId: ids[index], sourcePath: `$.sections[${sectionIndex}].${listType}List[${index}]` }, content: { noteType: listType, text: typeof itemValue === 'string' ? itemValue : asRecord(itemValue).text } }));
    }
  }

  private addRecommendations(payload: JsonRecord, add: AddFragment): void {
    const titleId = add({ id: 'recommendations:title', kind: 'recommendationsTitle', sourceRef: { sourceType: 'campaign', sourceId: 'recommendations', sourcePath: '$.recommendations' }, content: {} });
    asArray(payload.recommendations).forEach((groupValue, groupIndex) => {
      const group = asRecord(groupValue);
      if (!isVisible(group)) return;
      const groupSourceId = sourceEntityId(group, `group-${hash(group.authority || groupIndex, 12)}`);
      const groupId = add({ id: `recommendation-group:${groupSourceId}:title`, kind: 'recommendationGroupTitle', parentId: titleId, sourceRef: { sourceType: 'recommendation-group', sourceId: groupSourceId, sourcePath: `$.recommendations[${groupIndex}]` }, content: { authority: group.authority } });
      const items = asArray(group.recs);
      const ids = itemIds(items, `recommendation-group:${groupSourceId}:item`);
      items.forEach((itemValue, index) => add({ id: ids[index], kind: 'recommendationItem', parentId: groupId, sourceRef: { sourceType: 'recommendation', sourceId: ids[index], sourcePath: `$.recommendations[${groupIndex}].recs[${index}]` }, content: itemValue }));
    });
  }

  private addAppendices(payload: JsonRecord, add: AddFragment): void {
    const appendices = asArray(payload.appendices).filter(isVisible);
    if (appendices.length === 0) return;
    const titleId = add({ id: 'appendices:title', kind: 'appendicesTitle', sourceRef: { sourceType: 'campaign', sourceId: 'appendices', sourcePath: '$.appendices' }, content: {} });
    appendices.forEach((appendixValue, appendixIndex) => {
      const appendix = asRecord(appendixValue);
      const appendixSourceId = sourceEntityId(appendix, `appendix-${hash(appendix.symbol || appendixIndex, 12)}`);
      const appendixId = add({ id: `appendix:${appendixSourceId}:title`, kind: 'appendixTitle', parentId: titleId, sourceRef: { sourceType: 'appendix', sourceId: appendixSourceId, sourcePath: `$.appendices[${appendixIndex}]` }, content: { symbol: appendix.symbol } });
      const paragraphs = asString(appendix.text).split(/\r?\n\s*\r?\n/).filter((value) => value.length > 0);
      const ids = itemIds(paragraphs, `appendix:${appendixSourceId}:paragraph`);
      paragraphs.forEach((text, index) => add({ id: ids[index], kind: 'appendixParagraph', parentId: appendixId, sourceRef: { sourceType: 'appendix', sourceId: appendixSourceId, sourcePath: `$.appendices[${appendixIndex}].text` }, content: { text } }));
    });
  }
}

type AddFragment = (fragment: Omit<ReportFragmentV1, 'layoutDefaults' | 'visible'> & { visible?: boolean }) => string;
