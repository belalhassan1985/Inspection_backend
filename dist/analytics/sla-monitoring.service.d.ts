import { PrismaService } from '../prisma/prisma.service';
import { SlaEngineService } from './sla-engine.service';
export declare class SlaMonitoringService {
    private prisma;
    private slaEngine;
    private readonly logger;
    constructor(prisma: PrismaService, slaEngine: SlaEngineService);
    checkSlaBreaches(): Promise<void>;
    private logOrUpdateBreach;
}
