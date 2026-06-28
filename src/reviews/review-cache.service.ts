import { Injectable, Logger } from '@nestjs/common';
import { ReviewArtifact } from './interfaces/review-artifact.interface';

const MAX_CACHE_ENTRIES = 100;
const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class ReviewCacheService {
  private readonly logger = new Logger(ReviewCacheService.name);
  private readonly cache = new Map<string, { artifact: ReviewArtifact; expiresAt: number }>();

  get(campaignId: string): ReviewArtifact | null {
    const entry = this.cache.get(campaignId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(campaignId);
      return null;
    }
    return entry.artifact;
  }

  set(campaignId: string, artifact: ReviewArtifact): void {
    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = this.cache.entries().next().value;
      if (oldest) this.cache.delete(oldest[0]);
    }
    this.cache.set(campaignId, { artifact, expiresAt: Date.now() + CACHE_TTL_MS });
    this.logger.log(`Cached review artifact for campaign ${campaignId.slice(0, 8)}...`);
  }

  delete(campaignId: string): void {
    this.cache.delete(campaignId);
  }

  invalidateAll(): void {
    this.cache.clear();
    this.logger.log('Review cache cleared');
  }

  get size(): number {
    return this.cache.size;
  }
}
