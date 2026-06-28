export type {
  ContractValidationResult,
  FlowRulesV1,
  FragmentKind,
  FragmentRegistryEntry,
  LayoutProfileV1,
  ManualBreakV1,
  PagePlacementV1,
  PagePlanV1,
  ReportDocumentV1,
  ReportFragmentV1,
  StyleTokensV1,
  TableContinuationV1,
} from './types';

export { REPORT_FRAGMENT_REGISTRY_V1 } from './registry';
export {
  LEGACY_REPORT_EXPORT_FALLBACK,
  OFFICIAL_PDF_V1,
  OFFICIAL_WORD_V1,
  PAGE_PLAN_V1_SAVE,
  REPORT_DOCUMENT_V1_BUILD,
  REPORT_DOCUMENT_V1_DESIGNER,
  REPORT_DOCUMENT_V1_FEATURE_FLAGS,
  REPORT_DOCUMENT_V1_SHADOW_COMPARE,
  REPORT_DOCUMENT_V1_STRICT_VALIDATION,
} from './featureFlags';
export type { ReportDocumentV1FeatureFlagName } from './featureFlags';
export {
  validateFragmentOrder,
  validateManualBreakTargets,
  validateNoUnknownFragmentIds,
  validatePagePlanRevision,
} from './validation';
