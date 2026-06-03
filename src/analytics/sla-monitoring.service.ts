import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SlaEngineService } from './sla-engine.service';
import { RecommendationStatus } from '@prisma/client';

@Injectable()
export class SlaMonitoringService {
  private readonly logger = new Logger(SlaMonitoringService.name);

  constructor(
    private prisma: PrismaService,
    private slaEngine: SlaEngineService,
  ) {}

  /**
   * Scans all recommendation tracking records and logs/updates SLA breaches
   * Delegates to SlaEngineService for metrics calculation
   */
  async checkSlaBreaches() {
    this.logger.log('Starting SLA monitoring breach scan (via SlaEngineService)...');
    const result = await this.slaEngine.checkAndLogBreaches();
    const notifResult = await this.slaEngine.createSlaNotifications();
    this.logger.log(
      `SLA breach scan completed. Active breaches: Response: ${result.response}, Resolution: ${result.resolution}, Closure: ${result.closure}. Notifications: ${notifResult.created}`
    );
  }

  /**
   * Helper to write a new breach log or update the breach duration if it already exists
   */
  private async logOrUpdateBreach(trackingId: string, milestoneType: 'RESPONSE' | 'RESOLUTION' | 'CLOSURE', durationDays: number) {
    // Check if a breach for this tracking ID and milestone already exists
    const existing = await this.prisma.slaBreachLog.findFirst({
      where: {
        trackingId,
        milestoneType
      }
    });

    if (existing) {
      // Update duration days to current value
      await this.prisma.slaBreachLog.update({
        where: { id: existing.id },
        data: { breachDurationDays: durationDays }
      });
    } else {
      // Create new log entry
      await this.prisma.slaBreachLog.create({
        data: {
          trackingId,
          milestoneType,
          breachDurationDays: durationDays
        }
      });
    }
  }
}
