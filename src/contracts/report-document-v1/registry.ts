import type { FlowRulesV1, FragmentKind, FragmentRegistryEntry } from './types';

const plannedRenderers = { designer: 'planned', pdf: 'planned', word: 'planned' } as const;
const defaultFlow: FlowRulesV1 = { keepTogether: false, keepWithNext: false, repeatHeader: false };

const entry = (
  kind: FragmentKind,
  label: string,
  category: FragmentRegistryEntry['category'],
  capabilities: FragmentRegistryEntry['capabilities'],
  defaultFlowRules: FlowRulesV1 = defaultFlow,
): FragmentRegistryEntry => ({
  kind,
  label,
  category,
  contentSchemaVersion: 1,
  status: 'skeleton',
  capabilities,
  defaultFlowRules,
  rendererSupport: plannedRenderers,
});

const block = (canStartPage = true) => ({ canStartPage, splittable: false, repeatableHeader: false });
const narrative = { canStartPage: false, splittable: true, repeatableHeader: false };
const item = { canStartPage: false, splittable: false, repeatableHeader: false };

export const REPORT_FRAGMENT_REGISTRY_V1: Readonly<Record<FragmentKind, FragmentRegistryEntry>> = Object.freeze({
  reportHeader: entry('reportHeader', 'Report header', 'system', block(false), { ...defaultFlow, keepTogether: true }),
  reportTitle: entry('reportTitle', 'Report title', 'system', block(), { ...defaultFlow, keepWithNext: true }),
  reportFooter: entry('reportFooter', 'Report footer', 'system', block(false), { ...defaultFlow, keepTogether: true }),
  assignment: entry('assignment', 'Assignment', 'introduction', block(), { ...defaultFlow, keepWithNext: true }),
  committee: entry('committee', 'Committee', 'introduction', block(), { ...defaultFlow, keepTogether: true }),
  purpose: entry('purpose', 'Purpose', 'introduction', block(), { ...defaultFlow, keepWithNext: true }),
  visitDate: entry('visitDate', 'Visit date', 'introduction', block(), { ...defaultFlow, keepWithNext: true }),
  tableTitle: entry('tableTitle', 'Table title', 'table', block(), { ...defaultFlow, keepWithNext: true }),
  tableHeader: entry('tableHeader', 'Table header', 'table', { canStartPage: false, splittable: false, repeatableHeader: true }, { ...defaultFlow, keepWithNext: true, repeatHeader: true }),
  tableRow: entry('tableRow', 'Table row', 'table', item, { ...defaultFlow, keepTogether: true }),
  sectionTitle: entry('sectionTitle', 'Section title', 'section', block(), { ...defaultFlow, keepWithNext: true }),
  sectionNarrative: entry('sectionNarrative', 'Section narrative', 'section', narrative),
  subsectionTitle: entry('subsectionTitle', 'Subsection title', 'section', block(), { ...defaultFlow, keepWithNext: true }),
  subsectionNarrative: entry('subsectionNarrative', 'Subsection narrative', 'section', narrative),
  findingGroupTitle: entry('findingGroupTitle', 'Finding group title', 'finding', block(), { ...defaultFlow, keepWithNext: true }),
  findingItem: entry('findingItem', 'Finding item', 'finding', item),
  recommendationsTitle: entry('recommendationsTitle', 'Recommendations title', 'recommendation', block(), { ...defaultFlow, keepWithNext: true }),
  recommendationGroupTitle: entry('recommendationGroupTitle', 'Recommendation group title', 'recommendation', block(), { ...defaultFlow, keepWithNext: true }),
  recommendationItem: entry('recommendationItem', 'Recommendation item', 'recommendation', item),
  officialNotesTitle: entry('officialNotesTitle', 'Official notes title', 'note', block(), { ...defaultFlow, keepWithNext: true }),
  noteCategoryTitle: entry('noteCategoryTitle', 'Note category title', 'note', block(), { ...defaultFlow, keepWithNext: true }),
  noteItem: entry('noteItem', 'Note item', 'note', item),
  appendicesTitle: entry('appendicesTitle', 'Appendices title', 'appendix', block(), { ...defaultFlow, keepWithNext: true }),
  appendixTitle: entry('appendixTitle', 'Appendix title', 'appendix', block(), { ...defaultFlow, keepWithNext: true }),
  appendixParagraph: entry('appendixParagraph', 'Appendix paragraph', 'appendix', narrative),
  finalEvaluation: entry('finalEvaluation', 'Final evaluation', 'closing', block(), { ...defaultFlow, keepTogether: true }),
  signatures: entry('signatures', 'Signatures', 'closing', block(), { ...defaultFlow, keepTogether: true }),
});
