export type ReviewState = 'generating' | 'ready' | 'confirmed' | 'stale';

export interface ReviewPage {
  pageNumber: number;
  startsWith: string;
  endsWith: string;
  textLength: number;
  extractionWarnings: string[];
}

export interface ReviewWarning {
  type: 'table-split' | 'section-across-pages' | 'signature-not-final' | 'orphan-section-start';
  page: number;
  message: string;
}

export interface ReviewMetadata {
  pageCount: number;
  generationTimeMs: number;
  pages: ReviewPage[];
  warnings: ReviewWarning[];
}

export interface ReviewDiagnostics {
  htmlSizeBytes: number;
  payloadSizeBytes: number;
  renderRetries: number;
}

export interface ReviewArtifact {
  id: string;
  campaignId: string;
  payloadHash: string;
  state: ReviewState;
  pdf: Buffer;
  metadata: ReviewMetadata;
  diagnostics: ReviewDiagnostics;
  createdAt: Date;
  confirmedAt: Date | null;
  generationDurationMs: number;
}

export interface ReviewSession {
  id: string;
  campaignId: string;
  artifactId: string;
  state: ReviewState;
  pageCount: number;
  warnings: ReviewWarning[];
  createdAt: Date;
  confirmedAt: Date | null;
  generationDurationMs: number;
}
