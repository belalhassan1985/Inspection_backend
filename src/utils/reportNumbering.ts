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
    level1: number; // in pixels
    level2: number;
    level3: number;
    level4: number;
    level5: number;
  };
  showEmptySubheadings: boolean;
}

export const DEFAULT_FORMATTING_CONFIG: ReportFormattingConfig = {
  enableLevels: {
    level1: true,
    level2: true,
    level3: true,
    level4: true,
    level5: true,
  },
  styles: {
    level1: 'numeric',
    level2: 'arabic_letter',
    level3: 'ordinal',
    level4: 'parenthesized_numeric',
    level5: 'parenthesized_letter',
  },
  indentations: {
    level1: 0,
    level2: 12,
    level3: 24,
    level4: 36,
    level5: 48,
  },
  showEmptySubheadings: false,
};

const romanNumbers = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

const arabicLetters = [
  'أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي', 'ك', 'ل', 'م',
  'ن', 'س', 'ع', 'ف', 'ص', 'ق', 'ر', 'ش', 'ت', 'ث', 'خ', 'ذ', 'ض', 'ظ', 'غ'
];

const ordinals = [
  'أولاً', 'ثانياً', 'ثالثاً', 'رابعاً', 'خامساً', 'سادساً', 'سابعاً',
  'ثامناً', 'تاسعاً', 'عاشراً', 'حادي عشر', 'ثاني عشر', 'ثالث عشر',
  'رابع عشر', 'خامس عشر', 'سادس عشر', 'سابع عشر', 'ثامن عشر', 'تاسع عشر', 'عشرون'
];

export function getRoman(num: number): string {
  return romanNumbers[num - 1] || `${num}`;
}

export function getArabicLetter(num: number): string {
  return arabicLetters[num - 1] || `${num}`;
}

export function getEnglishLetter(num: number): string {
  return String.fromCharCode(64 + num); // A, B, C...
}

export function getOrdinal(num: number): string {
  return ordinals[num - 1] || `${num}`;
}

// Level 1: 1. / I. / -
export function getLevel1Number(index: number, config: ReportFormattingConfig = DEFAULT_FORMATTING_CONFIG): string {
  if (!config.enableLevels.level1) return '';
  switch (config.styles.level1) {
    case 'roman':
      return `${getRoman(index)}.`;
    case 'dashed':
      return '-';
    case 'numeric':
    default:
      return `${index}.`;
  }
}

// Level 2: أ. / A. / •
export function getLevel2ArabicLetter(index: number, config: ReportFormattingConfig = DEFAULT_FORMATTING_CONFIG): string {
  if (!config.enableLevels.level2) return '';
  switch (config.styles.level2) {
    case 'english_letter':
      return `${getEnglishLetter(index)}.`;
    case 'bullet':
      return '•';
    case 'arabic_letter':
    default:
      return `${getArabicLetter(index)}.`;
  }
}

// Level 3: أولاً. / 1. / -
export function getLevel3Ordinal(index: number, config: ReportFormattingConfig = DEFAULT_FORMATTING_CONFIG): string {
  if (!config.enableLevels.level3) return '';
  switch (config.styles.level3) {
    case 'numeric':
      return `${index}.`;
    case 'dashed':
      return '-';
    case 'ordinal':
    default:
      return `${getOrdinal(index)}.`;
  }
}

// Level 4: (1) / 1- / •
export function getLevel4Number(index: number, config: ReportFormattingConfig = DEFAULT_FORMATTING_CONFIG): string {
  if (!config.enableLevels.level4) return '';
  switch (config.styles.level4) {
    case 'numeric_dashed':
      return `${index}-`;
    case 'bullet':
      return '•';
    case 'parenthesized_numeric':
    default:
      return `(${index})`;
  }
}

// Level 5: (أ) / أ- / -
export function getLevel5ArabicLetter(index: number, config: ReportFormattingConfig = DEFAULT_FORMATTING_CONFIG): string {
  if (!config.enableLevels.level5) return '';
  switch (config.styles.level5) {
    case 'letter_dashed':
      return `${getArabicLetter(index)}-`;
    case 'dashed':
      return '-';
    case 'parenthesized_letter':
    default:
      return `(${getArabicLetter(index)})`;
  }
}

export function getIndentation(level: 1 | 2 | 3 | 4 | 5, config: ReportFormattingConfig = DEFAULT_FORMATTING_CONFIG): string {
  const indentVal = config.indentations[`level${level}`];
  return `${indentVal}px`;
}
