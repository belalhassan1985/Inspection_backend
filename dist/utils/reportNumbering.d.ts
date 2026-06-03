export interface ReportFormattingConfig {
    enableLevels: {
        level1: boolean;
        level2: boolean;
        level3: boolean;
        level4: boolean;
        level5: boolean;
    };
    styles: {
        level1: 'numeric' | 'roman' | 'dashed';
        level2: 'arabic_letter' | 'english_letter' | 'bullet';
        level3: 'ordinal' | 'numeric' | 'dashed';
        level4: 'parenthesized_numeric' | 'numeric_dashed' | 'bullet';
        level5: 'parenthesized_letter' | 'letter_dashed' | 'dashed';
    };
    indentations: {
        level1: number;
        level2: number;
        level3: number;
        level4: number;
        level5: number;
    };
    showEmptySubheadings: boolean;
}
export declare const DEFAULT_FORMATTING_CONFIG: ReportFormattingConfig;
export declare function getRoman(num: number): string;
export declare function getArabicLetter(num: number): string;
export declare function getEnglishLetter(num: number): string;
export declare function getOrdinal(num: number): string;
export declare function getLevel1Number(index: number, config?: ReportFormattingConfig): string;
export declare function getLevel2ArabicLetter(index: number, config?: ReportFormattingConfig): string;
export declare function getLevel3Ordinal(index: number, config?: ReportFormattingConfig): string;
export declare function getLevel4Number(index: number, config?: ReportFormattingConfig): string;
export declare function getLevel5ArabicLetter(index: number, config?: ReportFormattingConfig): string;
export declare function getIndentation(level: 1 | 2 | 3 | 4 | 5, config?: ReportFormattingConfig): string;
