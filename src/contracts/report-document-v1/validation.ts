import type {
  ContractValidationResult,
  ManualBreakV1,
  PagePlanV1,
  ReportDocumentV1,
} from './types';

const result = (errors: string[]): ContractValidationResult => ({
  valid: errors.length === 0,
  errors,
});

export const validateFragmentOrder = (
  expectedFragmentIds: readonly string[],
  actualFragmentIds: readonly string[],
): ContractValidationResult => {
  const errors: string[] = [];
  if (expectedFragmentIds.length !== actualFragmentIds.length) {
    errors.push(`Fragment count mismatch: expected ${expectedFragmentIds.length}, received ${actualFragmentIds.length}.`);
  }
  const length = Math.min(expectedFragmentIds.length, actualFragmentIds.length);
  for (let index = 0; index < length; index += 1) {
    if (expectedFragmentIds[index] !== actualFragmentIds[index]) {
      errors.push(`Fragment order mismatch at index ${index}: expected '${expectedFragmentIds[index]}', received '${actualFragmentIds[index]}'.`);
    }
  }
  if (new Set(actualFragmentIds).size !== actualFragmentIds.length) {
    errors.push('Actual fragment order contains duplicate fragment IDs.');
  }
  return result(errors);
};

export const validateNoUnknownFragmentIds = (
  knownFragmentIds: readonly string[],
  referencedFragmentIds: readonly string[],
): ContractValidationResult => {
  const known = new Set(knownFragmentIds);
  const unknown = [...new Set(referencedFragmentIds.filter((id) => !known.has(id)))];
  return result(unknown.map((id) => `Unknown fragment ID '${id}'.`));
};

export const validatePagePlanRevision = (
  document: Pick<ReportDocumentV1, 'documentId' | 'revision' | 'contentHash'>,
  pagePlan: Pick<PagePlanV1, 'documentId' | 'documentRevision' | 'documentContentHash'>,
): ContractValidationResult => {
  const errors: string[] = [];
  if (document.documentId !== pagePlan.documentId) errors.push('PagePlan documentId does not match ReportDocument documentId.');
  if (document.revision !== pagePlan.documentRevision) errors.push('PagePlan documentRevision does not match ReportDocument revision.');
  if (document.contentHash !== pagePlan.documentContentHash) errors.push('PagePlan documentContentHash does not match ReportDocument contentHash.');
  return result(errors);
};

export const validateManualBreakTargets = (
  manualBreaks: readonly ManualBreakV1[],
  knownFragmentIds: readonly string[],
): ContractValidationResult => {
  const known = new Set(knownFragmentIds);
  const errors: string[] = [];
  const seenTargets = new Set<string>();
  for (const manualBreak of manualBreaks) {
    if (!known.has(manualBreak.beforeFragmentId)) errors.push(`Manual break '${manualBreak.breakId}' targets unknown fragment '${manualBreak.beforeFragmentId}'.`);
    if (seenTargets.has(manualBreak.beforeFragmentId)) errors.push(`Multiple manual breaks target fragment '${manualBreak.beforeFragmentId}'.`);
    seenTargets.add(manualBreak.beforeFragmentId);
  }
  return result(errors);
};
