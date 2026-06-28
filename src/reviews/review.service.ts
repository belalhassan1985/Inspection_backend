import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { ReportsService } from '../reports/reports.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewCacheService } from './review-cache.service';
import { ReviewArtifact, ReviewMetadata, ReviewPage, ReviewWarning, ReviewSession, ReviewState, ReviewDiagnostics } from './interfaces/review-artifact.interface';
import { extractPdfTextByPage } from '../../scripts/pdf-text-oracle/pdf-text-extractor';
import * as crypto from 'crypto';

const TRUNCATE_LENGTH = 120;

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly reportsService: ReportsService,
    private readonly cacheService: ReviewCacheService,
    private readonly prisma: PrismaService,
  ) {}

  async generateReview(campaignId: string, payload?: Record<string, unknown>): Promise<ReviewArtifact> {
    const payloadStr = JSON.stringify(payload || {});
    const payloadHash = crypto.createHash('sha256').update(payloadStr).digest('hex');

    const resolvedId = await this.resolveCampaignId(campaignId);

    const cached = this.cacheService.get(resolvedId);
    if (cached && cached.payloadHash === payloadHash && cached.state === 'ready') {
      this.logger.log(`Returning cached review for campaign ${resolvedId.slice(0, 8)}...`);
      return cached;
    }

    const startTime = Date.now();
    const artifactId = crypto.randomUUID();

    const artifact: ReviewArtifact = {
      id: artifactId,
      campaignId: resolvedId,
      payloadHash,
      state: 'generating',
      pdf: Buffer.alloc(0),
      metadata: { pageCount: 0, generationTimeMs: 0, pages: [], warnings: [] },
      diagnostics: { htmlSizeBytes: 0, payloadSizeBytes: Buffer.byteLength(payloadStr, 'utf-8'), renderRetries: 0 },
      createdAt: new Date(),
      confirmedAt: null,
      generationDurationMs: 0,
    };

    try {
      const pdfBuffer = await this.reportsService.generateCampaignReportPdf(resolvedId, payload);
      const generationTimeMs = Date.now() - startTime;

      const metadata = this.buildMetadata(pdfBuffer, generationTimeMs);

      artifact.state = 'ready';
      artifact.pdf = pdfBuffer;
      artifact.metadata = metadata;
      artifact.generationDurationMs = generationTimeMs;
      artifact.diagnostics.htmlSizeBytes = 0;

      this.cacheService.set(resolvedId, artifact);

      this.logger.log(`Review generated: ${metadata.pageCount} pages, ${metadata.warnings.length} warnings, ${generationTimeMs}ms`);
      return artifact;
    } catch (error) {
      artifact.state = 'stale';
      this.logger.error(`Review generation failed for campaign ${resolvedId.slice(0, 8)}...`, (error as Error).message);
      throw error;
    }
  }

  async getSession(campaignId: string): Promise<ReviewSession | null> {
    const resolvedId = await this.resolveCampaignId(campaignId);
    const artifact = this.cacheService.get(resolvedId);
    if (!artifact) return null;
    return this.toSession(artifact);
  }

  async confirmReview(campaignId: string): Promise<ReviewSession> {
    const resolvedId = await this.resolveCampaignId(campaignId);
    const artifact = this.cacheService.get(resolvedId);
    if (!artifact) {
      throw new NotFoundException(`No review session found for campaign ${campaignId}`);
    }
    if (artifact.state !== 'ready') {
      throw new ConflictException(`Review session is in state "${artifact.state}", cannot confirm`);
    }
    artifact.state = 'confirmed';
    artifact.confirmedAt = new Date();
    this.cacheService.set(resolvedId, artifact);
    return this.toSession(artifact);
  }

  async discardReview(campaignId: string): Promise<void> {
    const resolvedId = await this.resolveCampaignId(campaignId);
    this.cacheService.delete(resolvedId);
  }

  private toSession(artifact: ReviewArtifact): ReviewSession {
    return {
      id: artifact.id,
      campaignId: artifact.campaignId,
      artifactId: artifact.id,
      state: artifact.state,
      pageCount: artifact.metadata.pageCount,
      warnings: artifact.metadata.warnings,
      createdAt: artifact.createdAt,
      confirmedAt: artifact.confirmedAt,
      generationDurationMs: artifact.generationDurationMs,
    };
  }

  private buildMetadata(pdfBuffer: Buffer, generationTimeMs: number): ReviewMetadata {
    const extracted = extractPdfTextByPage(pdfBuffer);

    const pages: ReviewPage[] = extracted.pages.map((p) => {
      const text = p.text.trim();
      return {
        pageNumber: p.pageNumber,
        startsWith: text.slice(0, TRUNCATE_LENGTH).replace(/\s+/g, ' ') || '(empty)',
        endsWith: text.length > TRUNCATE_LENGTH
          ? text.slice(-TRUNCATE_LENGTH).replace(/\s+/g, ' ') || '(empty)'
          : text.replace(/\s+/g, ' ') || '(empty)',
        textLength: text.length,
        extractionWarnings: p.extractionWarnings,
      };
    });

    const warnings: ReviewWarning[] = [];
    const allText = extracted.pages.map((p) => p.text);

    const lastPageText = allText[allText.length - 1] || '';
    const hasSignatureOnLastPage = /توقيع|signature|التوقيع/i.test(lastPageText);

    if (!hasSignatureOnLastPage && allText.length > 1) {
      for (let i = 0; i < allText.length; i++) {
        if (/توقيع|signature|التوقيع/i.test(allText[i])) {
          warnings.push({
            type: 'signature-not-final',
            page: i + 1,
            message: `Signatures appear on page ${i + 1}, NOT on the final page (${allText.length}).`,
          });
          break;
        }
      }
    }

    for (let i = 1; i < allText.length; i++) {
      const prevEnd = allText[i - 1].trim().slice(-100);
      const currStart = allText[i].trim().slice(0, 100);
      if (/\d\s*\|/.test(prevEnd) && /\|\s*\d/.test(currStart)) {
        warnings.push({
          type: 'table-split',
          page: i + 1,
          message: `Table may split across pages ${i}–${i + 1}.`,
        });
      }
    }

    for (const p of pages) {
      if (p.textLength > 0 && p.textLength < 50 && p.pageNumber > 1) {
        warnings.push({
          type: 'orphan-section-start',
          page: p.pageNumber,
          message: `Page ${p.pageNumber} has only ${p.textLength} characters — possible orphan.`,
        });
      }
    }

    return { pageCount: pages.length, generationTimeMs, pages, warnings };
  }

  private async resolveCampaignId(input: string): Promise<string> {
    if (input.length === 36 && input.includes('-')) return input;
    if (input.length === 32 && /^[0-9a-f]+$/i.test(input)) return input;

    const all = await this.prisma.campaign.findMany({ select: { id: true } });
    const match = all.find((c: any) => c.id.startsWith(input));
    if (!match) {
      throw new NotFoundException(`Campaign not found: ${input}`);
    }
    return (match as any).id;
  }
}
