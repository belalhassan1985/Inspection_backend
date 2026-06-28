import { REPORT_FRAGMENT_REGISTRY_V1 } from '../../contracts/report-document-v1/registry';
import type { ShadowReportDocumentV1 } from './report-document-v1.builder';

export type ShadowReferenceFragment = { id: string; kind: string };

export type ShadowCompareReport = {
  fragmentCount: { document: number; reference: number | null; delta: number | null };
  fragmentOrder: {
    internallyConsistent: boolean;
    matchesReference: boolean | null;
    firstReferenceMismatchIndex: number | null;
  };
  kindDistribution: {
    document: Readonly<Record<string, number>>;
    reference: Readonly<Record<string, number>> | null;
  };
  missingFragmentIds: readonly string[];
  unreferencedFragmentIds: readonly string[];
  duplicateFragmentIds: readonly string[];
  unknownFragmentKinds: readonly string[];
  referenceOnlyFragmentIds: readonly string[];
  documentOnlyFragmentIds: readonly string[];
};

const distribution = (fragments: readonly ShadowReferenceFragment[]): Record<string, number> =>
  fragments.reduce<Record<string, number>>((counts, fragment) => {
    counts[fragment.kind] = (counts[fragment.kind] ?? 0) + 1;
    return counts;
  }, {});

const duplicates = (ids: readonly string[]): string[] => {
  const seen = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicateIds.add(id);
    seen.add(id);
  }
  return [...duplicateIds];
};

export const compareShadowReportDocumentV1 = (
  document: ShadowReportDocumentV1,
  referenceFragments: readonly ShadowReferenceFragment[] = [],
): ShadowCompareReport => {
  const documentIds = document.fragmentOrder;
  const fragmentMapIds = Object.keys(document.fragments);
  const knownKinds = new Set(Object.keys(REPORT_FRAGMENT_REGISTRY_V1));
  const missingFragmentIds = documentIds.filter((id) => !document.fragments[id]);
  const unreferencedFragmentIds = fragmentMapIds.filter((id) => !documentIds.includes(id));
  const duplicateFragmentIds = duplicates(documentIds);
  const documentFragments = documentIds
    .map((id) => document.fragments[id])
    .filter((fragment) => fragment !== undefined)
    .map((fragment) => ({ id: fragment.id, kind: fragment.kind }));
  const unknownFragmentKinds = [...new Set(documentFragments
    .map((fragment) => fragment.kind)
    .filter((kind) => !knownKinds.has(kind)))];
  const referenceIds = referenceFragments.map((fragment) => fragment.id);
  const hasReference = referenceFragments.length > 0;
  const firstReferenceMismatchIndex = hasReference
    ? Array.from({ length: Math.max(referenceIds.length, documentIds.length) })
      .findIndex((_, index) => referenceIds[index] !== documentIds[index])
    : -1;

  return {
    fragmentCount: {
      document: documentIds.length,
      reference: hasReference ? referenceIds.length : null,
      delta: hasReference ? documentIds.length - referenceIds.length : null,
    },
    fragmentOrder: {
      internallyConsistent: missingFragmentIds.length === 0
        && unreferencedFragmentIds.length === 0
        && duplicateFragmentIds.length === 0,
      matchesReference: hasReference ? firstReferenceMismatchIndex === -1 : null,
      firstReferenceMismatchIndex: hasReference && firstReferenceMismatchIndex >= 0
        ? firstReferenceMismatchIndex
        : null,
    },
    kindDistribution: {
      document: distribution(documentFragments),
      reference: hasReference ? distribution(referenceFragments) : null,
    },
    missingFragmentIds,
    unreferencedFragmentIds,
    duplicateFragmentIds,
    unknownFragmentKinds,
    referenceOnlyFragmentIds: hasReference ? referenceIds.filter((id) => !document.fragments[id]) : [],
    documentOnlyFragmentIds: hasReference ? documentIds.filter((id) => !referenceIds.includes(id)) : [],
  };
};
