import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecommendationStatus, RiskLevel } from '@prisma/client';

@Injectable()
export class HealthAnalyticsService {
  private readonly logger = new Logger(HealthAnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Calculates the Health Score (0 to 100) for a recommendation tracking item
   */
  calculateHealthScore(tracking: any): number {
    if (tracking.status === RecommendationStatus.CLOSED || tracking.status === RecommendationStatus.VERIFIED || tracking.status === RecommendationStatus.REJECTED) {
      return 100;
    }

    let score = 100;
    const now = new Date();

    // 1. Check Overdue Status
    if (tracking.dueDate && new Date(tracking.dueDate) < now) {
      const diffTime = Math.abs(now.getTime() - new Date(tracking.dueDate).getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays > 15) {
        score -= 60; // Critical delay
      } else {
        score -= 40; // Moderate delay
      }
    }

    // 2. Check Escalation Level
    if (tracking.escalationLevel === 1) {
      score -= 15;
    } else if (tracking.escalationLevel === 2) {
      score -= 30;
    } else if (tracking.escalationLevel >= 3) {
      score -= 50;
    }

    // 3. Check Inactivity (Updated > 30 days ago)
    const lastUpdate = new Date(tracking.updatedAt);
    const inactiveTime = Math.abs(now.getTime() - lastUpdate.getTime());
    const inactiveDays = Math.ceil(inactiveTime / (1000 * 60 * 60 * 24));
    if (inactiveDays > 30) {
      score -= 20;
    }

    // 4. Check Progress without Evidence
    const hasEvidence = tracking.evidence && tracking.evidence.length > 0;
    if (tracking.progressPercent > 50 && !hasEvidence) {
      score -= 15;
    }

    // Ensure score is bounded between 0 and 100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Maps a numeric health score to status categories
   */
  getHealthStatus(score: number): 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'CRITICAL' {
    if (score >= 90) return 'EXCELLENT';
    if (score >= 75) return 'GOOD';
    if (score >= 60) return 'NEEDS_ATTENTION';
    if (score >= 40) return 'AT_RISK';
    return 'CRITICAL';
  }

  /**
   * Logs health history snapshot for a specific tracking item
   */
  async logHealthHistory(trackingId: string) {
    const tracking = await this.prisma.recommendationTracking.findUnique({
      where: { id: trackingId },
      include: { evidence: true },
    });

    if (!tracking) {
      this.logger.error(`Tracking record not found: ${trackingId}`);
      return;
    }

    const score = this.calculateHealthScore(tracking);

    await this.prisma.recommendationHealthHistory.create({
      data: {
        trackingId,
        score,
        statusSnapshot: tracking.status,
      },
    });
  }

  /**
   * Logs health history snapshot for all existing tracking items
   */
  async recordAllHealthScores() {
    this.logger.log('Recording health scores history for all active recommendations...');
    const trackings = await this.prisma.recommendationTracking.findMany({
      include: { evidence: true },
    });

    for (const tracking of trackings) {
      const score = this.calculateHealthScore(tracking);
      await this.prisma.recommendationHealthHistory.create({
        data: {
          trackingId: tracking.id,
          score,
          statusSnapshot: tracking.status,
        },
      });
    }

    this.logger.log(`Successfully recorded health history for ${trackings.length} recommendations.`);
  }
}
