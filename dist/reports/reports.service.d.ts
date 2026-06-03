import { PrismaService } from '../prisma/prisma.service';
export declare class ReportsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    private toNumber;
    private getOptionTypeCode;
    private addOptionTextToBuckets;
    private getFinalEvaluationRating;
    private buildFinalEvaluationSummary;
    private dedupeTexts;
    private buildObservationSectionFromLists;
    private mergeObservationSection;
    private buildCampaignObservationSection;
    private calculateFinalEvaluationFromInspections;
    private calculateCampaignFinalEvaluation;
    private normalizeReportSectionsVisibility;
    getCampaignReportPayload(campaignId: string): Promise<any>;
    saveReportPresentation(campaignId: string, payload: any): Promise<any>;
    deleteReportPresentation(campaignId: string): Promise<any>;
    buildDefaultReportPayload(campaignId: string): Promise<any>;
    generateHtmlFromPayload(payload: any): string;
    generateCampaignReportPdf(campaignId: string, payload?: any): Promise<Buffer>;
    generateCampaignReportWord(campaignId: string, payload?: any): Promise<Buffer>;
}
