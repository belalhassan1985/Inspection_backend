import { Response } from 'express';
import { ReportsService } from './reports.service';
export declare class ReportsController {
    private reportsService;
    constructor(reportsService: ReportsService);
    getCampaignReportPayload(campaignId: string): Promise<unknown>;
    getCampaignReportPdf(campaignId: string, res: Response): Promise<void>;
    postCampaignReportPdf(campaignId: string, payload: Record<string, unknown>, res: Response): Promise<void>;
    getCampaignReportWord(campaignId: string, res: Response): Promise<void>;
    postCampaignReportWord(campaignId: string, payload: Record<string, unknown>, res: Response): Promise<void>;
    saveCampaignReportPresentation(campaignId: string, payload: Record<string, unknown>): Promise<unknown>;
    deleteCampaignReportPresentation(campaignId: string): Promise<unknown>;
    debugCampaignReportPayload(campaignId: string): Promise<unknown>;
}
