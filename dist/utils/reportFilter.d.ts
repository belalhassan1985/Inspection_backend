export declare function hasMeaningfulQuantitativeData(data: unknown): boolean;
interface CriteriaDetail {
    id: number;
    detailText?: string;
    maxGrade?: unknown;
    options?: unknown[];
}
interface CriteriaSecondary {
    id: number;
    title: string;
    maxGrade?: unknown;
    details: CriteriaDetail[];
}
interface CriteriaPrimary {
    id: number;
    title: string;
    maxGrade?: unknown;
    secondaryCriteria: CriteriaSecondary[];
}
interface GradeRecord {
    gradeEarned?: unknown;
    notes?: string;
    selectedOptions?: unknown[];
    quantitativeData?: unknown;
}
export declare function pruneTemplateTree(template: CriteriaPrimary[], gradesMap: Map<number, GradeRecord>): CriteriaPrimary[];
export {};
