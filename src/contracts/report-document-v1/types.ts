export type FragmentKind =
  | 'reportHeader'
  | 'reportTitle'
  | 'reportFooter'
  | 'assignment'
  | 'committee'
  | 'purpose'
  | 'visitDate'
  | 'tableTitle'
  | 'tableHeader'
  | 'tableRow'
  | 'sectionTitle'
  | 'sectionNarrative'
  | 'subsectionTitle'
  | 'subsectionNarrative'
  | 'findingGroupTitle'
  | 'findingItem'
  | 'recommendationsTitle'
  | 'recommendationGroupTitle'
  | 'recommendationItem'
  | 'officialNotesTitle'
  | 'noteCategoryTitle'
  | 'noteItem'
  | 'appendicesTitle'
  | 'appendixTitle'
  | 'appendixParagraph'
  | 'finalEvaluation'
  | 'signatures';

export type FlowRulesV1 = {
  keepTogether: boolean;
  keepWithNext: boolean;
  repeatHeader: boolean;
};

export type LayoutProfileV1 = {
  profileId: string;
  pageSize: 'A4';
  widthMm: number;
  heightMm: number;
  marginsMm: { top: number; right: number; bottom: number; left: number };
  locale: 'ar-IQ';
  direction: 'rtl';
  measurementUnit: 'mm';
  fontMetricsVersion: string;
};

export type StyleTokensV1 = {
  profileId: string;
  fontFamily: string;
  fallbackFontFamilies: readonly string[];
  baseFontSizePx: number;
  lineHeight: number;
  colors: Readonly<Record<string, string>>;
  fontSizesPx: Readonly<Record<string, number>>;
  spacingPx: Readonly<Record<string, number>>;
  table: {
    borderColor: string;
    borderWidthPx: number;
    headerBackgroundColor: string;
    cellPaddingPx: number;
  };
};

export type ReportFragmentV1<TContent = unknown> = {
  id: string;
  kind: FragmentKind;
  parentId?: string;
  sourceRef: {
    sourceType: string;
    sourceId: string;
    sourcePath?: string;
  };
  content: TContent;
  styleRef?: string;
  visible: boolean;
  layoutDefaults: FlowRulesV1;
};

export type FragmentRegistryEntry = {
  kind: FragmentKind;
  label: string;
  category: 'system' | 'introduction' | 'table' | 'section' | 'finding' | 'recommendation' | 'note' | 'appendix' | 'closing';
  contentSchemaVersion: 1;
  status: 'skeleton';
  capabilities: {
    canStartPage: boolean;
    splittable: boolean;
    repeatableHeader: boolean;
  };
  defaultFlowRules: FlowRulesV1;
  rendererSupport: {
    designer: 'planned';
    pdf: 'planned';
    word: 'planned';
  };
};

export type ReportDocumentV1 = {
  schemaVersion: 1;
  documentId: string;
  campaignId: string;
  revision: number;
  contentHash: string;
  generatedAt: string;
  locale: 'ar-IQ';
  direction: 'rtl';
  metadata: Readonly<Record<string, unknown>>;
  layoutProfile: LayoutProfileV1;
  styleTokens: StyleTokensV1;
  assets: readonly {
    assetId: string;
    kind: 'image' | 'font';
    source: string;
    contentHash?: string;
  }[];
  fragmentOrder: readonly string[];
  fragments: Readonly<Record<string, ReportFragmentV1>>;
  hierarchy: readonly {
    fragmentId: string;
    parentFragmentId?: string;
    childFragmentIds: readonly string[];
  }[];
};

export type PagePlacementV1 = {
  placementId: string;
  pageId: string;
  fragmentId: string;
  sequence: number;
  role: 'original' | 'repeatedHeader' | 'continuation';
  tableContinuationId?: string;
};

export type ManualBreakV1 = {
  breakId: string;
  beforeFragmentId: string;
  origin: 'user' | 'migration';
  createdAt: string;
};

export type TableContinuationV1 = {
  continuationId: string;
  tableId: string;
  pageId: string;
  segmentIndex: number;
  rowFragmentIds: readonly string[];
  repeatedHeaderFragmentIds: readonly string[];
  previousContinuationId?: string;
  nextContinuationId?: string;
  isFirstSegment: boolean;
  isLastSegment: boolean;
};

export type PagePlanV1 = {
  planVersion: 1;
  planId: string;
  documentId: string;
  documentRevision: number;
  documentContentHash: string;
  generatedAt: string;
  generatorVersion: string;
  metricsProfileId: string;
  pages: readonly {
    pageId: string;
    pageNumber: number;
    placements: readonly PagePlacementV1[];
  }[];
  manualBreaks: readonly ManualBreakV1[];
  flowRules: Readonly<Record<string, FlowRulesV1>>;
  tableContinuations: readonly TableContinuationV1[];
  warnings: readonly {
    code: string;
    fragmentId?: string;
    message: string;
  }[];
};

export type ContractValidationResult = {
  valid: boolean;
  errors: readonly string[];
};
