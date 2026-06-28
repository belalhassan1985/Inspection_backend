export interface DutyWeight {
  campaignId: string;
  campaignName: string;
  entityName: string;
  startDate: Date;
  endDate: Date | null;
  daysOnDuty: number;
  role: 'LEADER' | 'DEPUTY' | 'MEMBER';
  baseWeight: number;
  durationWeight: number;
}

export interface WorkloadResult {
  leaderCount: number;
  deputyCount: number;
  memberCount: number;
  totalParticipation: number;
  leaderWeighted: number;
  deputyWeighted: number;
  memberWeighted: number;
  inspectionSum: number;
  openRecSum: number;
  actionLogSum: number;
  workloadScore: number;
  workloadLevel: string;
  duties: DutyWeight[];
}

export const WORKLOAD_WEIGHTS = {
  CAMPAIGN_LEADER: 3.0,
  CAMPAIGN_DEPUTY: 2.0,
  CAMPAIGN_MEMBER: 1.0,
  INSPECTION: 1.5,
  OPEN_RECOMMENDATION: 0.5,
};

export const WORKLOAD_THRESHOLDS = [
  { level: 'FREE', min: 0, max: 0 },
  { level: 'LIGHT', min: 0.1, max: 4.0 },
  { level: 'NORMAL', min: 4.1, max: 10.0 },
  { level: 'HEAVY', min: 10.1, max: 18.0 },
  { level: 'OVERLOADED', min: 18.1, max: Infinity },
];

export function getWorkloadLevel(score: number): string {
  for (const t of WORKLOAD_THRESHOLDS) {
    if (score >= t.min && score <= t.max) return t.level;
  }
  return 'OVERLOADED';
}

export function calculateDaysOnDuty(startDate: Date): number {
  return Math.max(
    1,
    Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
  );
}

export function calculateDutyDurationWeight(
  daysOnDuty: number,
  baseWeight: number,
): number {
  return +(baseWeight * (daysOnDuty / 30)).toFixed(1);
}

export function computeWorkloadScore(params: {
  duties: {
    role: 'LEADER' | 'DEPUTY' | 'MEMBER';
    daysOnDuty: number;
    baseWeight: number;
  }[];
  inspectionSum: number;
  openRecSum: number;
}): number {
  const baseScore =
    params.duties.reduce((sum, d) => sum + d.baseWeight, 0) +
    params.inspectionSum * WORKLOAD_WEIGHTS.INSPECTION +
    params.openRecSum * WORKLOAD_WEIGHTS.OPEN_RECOMMENDATION;

  const durationBonus =
    params.duties.reduce(
      (sum, d) => sum + calculateDutyDurationWeight(d.daysOnDuty, d.baseWeight),
      0,
    ) - params.duties.reduce((sum, d) => sum + d.baseWeight, 0);

  return +(baseScore + durationBonus).toFixed(1);
}
