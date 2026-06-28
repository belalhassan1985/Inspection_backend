import { REPORT_DOCUMENT_V1_BUILD } from '../../contracts/report-document-v1/featureFlags';
import {
  ReportDocumentV1Builder,
  type ReportDocumentV1BuildOptions,
  type ShadowReportDocumentV1,
} from './report-document-v1.builder';
import {
  compareShadowReportDocumentV1,
  type ShadowCompareReport,
  type ShadowReferenceFragment,
} from './shadow-compare';

export type ShadowRunResult =
  | { status: 'disabled' }
  | { status: 'built'; document: ShadowReportDocumentV1; comparison: ShadowCompareReport };

export type ShadowRunOptions = ReportDocumentV1BuildOptions & {
  enabled?: boolean;
  referenceFragments?: readonly ShadowReferenceFragment[];
};

export const runReportDocumentV1Shadow = (
  payload: unknown,
  options: ShadowRunOptions,
): ShadowRunResult => {
  if (!(options.enabled ?? REPORT_DOCUMENT_V1_BUILD)) return { status: 'disabled' };
  const document = new ReportDocumentV1Builder().build(payload, options);
  return {
    status: 'built',
    document,
    comparison: compareShadowReportDocumentV1(document, options.referenceFragments),
  };
};
