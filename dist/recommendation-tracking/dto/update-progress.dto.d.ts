import { RecommendationStatus } from '@prisma/client';
export declare class UpdateProgressDto {
    progressPercent: number;
    status: RecommendationStatus;
    notes: string;
}
