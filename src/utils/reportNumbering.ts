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

  // ── Phase 18D: Display-level formatting overrides ──
  fontFamily?: string;
  baseFontSize?: number;
  headingColor?: string;
  titleColor?: string;
  titleFontSize?: number;
  titleFontWeight?: 'normal' | 'bold' | 400 | 500 | 600 | 700 | 800 | 900;
  titleAlign?: 'left' | 'center' | 'right' | 'justify';
  numberingColor?: string;
  tableBorderColor?: string;
  tableHeaderBg?: string;
  tableCellPadding?: 'compact' | 'normal' | 'comfortable';
  density?: 'compact' | 'normal' | 'comfortable';
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

const romanNumbers = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
  'XIII',
  'XIV',
  'XV',
];

const arabicLetters = [
  'أ',
  'ب',
  'ج',
  'د',
  'هـ',
  'و',
  'ز',
  'ح',
  'ط',
  'ي',
  'ك',
  'ل',
  'م',
  'ن',
  'س',
  'ع',
  'ف',
  'ص',
  'ق',
  'ر',
  'ش',
  'ت',
  'ث',
  'خ',
  'ذ',
  'ض',
  'ظ',
  'غ',
];

const ordinals = [
  'أولاً',
  'ثانياً',
  'ثالثاً',
  'رابعاً',
  'خامساً',
  'سادساً',
  'سابعاً',
  'ثامناً',
  'تاسعاً',
  'عاشراً',
  'حادي عشر',
  'ثاني عشر',
  'ثالث عشر',
  'رابع عشر',
  'خامس عشر',
  'سادس عشر',
  'سابع عشر',
  'ثامن عشر',
  'تاسع عشر',
  'عشرون',
];

const compoundOrdinalUnits = [
  '',
  'حادي',
  'ثاني',
  'ثالث',
  'رابع',
  'خامس',
  'سادس',
  'سابع',
  'ثامن',
  'تاسع',
];

const ordinalTens: Record<number, string> = {
  20: 'عشرون',
  30: 'ثلاثون',
  40: 'أربعون',
  50: 'خمسون',
  60: 'ستون',
  70: 'سبعون',
  80: 'ثمانون',
  90: 'تسعون',
  100: 'مئة',
};

const cardinalUnits = [
  '',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
];

const cardinalTeens: Record<number, string> = {
  10: 'عشرة',
  11: 'أحد عشر',
  12: 'اثنا عشر',
  13: 'ثلاثة عشر',
  14: 'أربعة عشر',
  15: 'خمسة عشر',
  16: 'ستة عشر',
  17: 'سبعة عشر',
  18: 'ثمانية عشر',
  19: 'تسعة عشر',
};

const hundredTexts: Record<number, string> = {
  100: 'مئة',
  200: 'مئتان',
  300: 'ثلاثمئة',
  400: 'أربعمئة',
  500: 'خمسمئة',
  600: 'ستمئة',
  700: 'سبعمئة',
  800: 'ثمانمئة',
  900: 'تسعمئة',
};

function getCardinalBelowHundred(num: number): string {
  if (num < 10) return cardinalUnits[num] || `${num}`;
  if (num < 20) return cardinalTeens[num] || `${num}`;
  const unit = num % 10;
  const tens = num - unit;
  if (unit === 0) return ordinalTens[num] || `${num}`;
  return `${cardinalUnits[unit]} و${ordinalTens[tens]}`;
}

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
  if (!Number.isInteger(num) || num < 1) return `${num}`;
  if (num <= ordinals.length) return ordinals[num - 1];
  if (num <= 100) {
    const unit = num % 10;
    const tens = num - unit;
    if (unit === 0) return ordinalTens[num] || `${num}`;
    return `${compoundOrdinalUnits[unit]} و${ordinalTens[tens]}`;
  }
  if (num <= 999) {
    const remainder = num % 100;
    const hundreds = num - remainder;
    const hundredText = hundredTexts[hundreds];
    if (!hundredText) return `${num}`;
    if (remainder === 0) return hundredText;
    return `${hundredText} و${getCardinalBelowHundred(remainder)}`;
  }
  return `${num}`;
}

export function toEasternArabicDigits(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669'[parseInt(digit, 10)]);
}

export function formatArabicTableValue(value: number | string, options: { percentage?: boolean } = {}): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (raw === '') return '';

  if (options.percentage) {
    const withoutPercent = raw.replace(/[%\u066a]/g, '');
    return `${toEasternArabicDigits(withoutPercent)}\u066a`;
  }

  const trimmed = raw.trim();
  if (/^-?\d+(?:\.\d+)?%?$/.test(trimmed)) {
    return toEasternArabicDigits(raw).replace(/%/g, '\u066a');
  }

  return raw;
}

// Level 1: 1. / I. / -
export function getLevel1Number(
  index: number,
  config: ReportFormattingConfig = DEFAULT_FORMATTING_CONFIG,
): string {
  if (!config.enableLevels.level1) return '';
  switch (config.styles.level1) {
    case 'roman':
      return `${getRoman(index)}.`;
    case 'dashed':
      return '-';
    case 'numeric':
    default:
      return `${toEasternArabicDigits(index)}.`;
  }
}

// Level 2: أ. / A. / •
export function getLevel2ArabicLetter(
  index: number,
  config: ReportFormattingConfig = DEFAULT_FORMATTING_CONFIG,
): string {
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
export function getLevel3Ordinal(
  index: number,
  config: ReportFormattingConfig = DEFAULT_FORMATTING_CONFIG,
): string {
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
export function getLevel4Number(
  index: number,
  config: ReportFormattingConfig = DEFAULT_FORMATTING_CONFIG,
): string {
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
export function getLevel5ArabicLetter(
  index: number,
  config: ReportFormattingConfig = DEFAULT_FORMATTING_CONFIG,
): string {
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

export function getIndentation(
  level: 1 | 2 | 3 | 4 | 5,
  config: ReportFormattingConfig = DEFAULT_FORMATTING_CONFIG,
): string {
  const indentVal = config.indentations[`level${level}`];
  return `${indentVal}px`;
}

// ── Phase 18D: Formatting Config Sanitizer ──
// Accepted CSS-safe values per field.
const ALLOWED_FONTS = new Set([
  'Cairo',
  'Arial',
  'Times New Roman',
  'Tahoma',
  'Traditional Arabic',
  'Sakkal Majalla',
  'Noto Naskh Arabic',
]);
const ALLOWED_PADDING = new Set(['compact', 'normal', 'comfortable']);
const ALLOWED_DENSITY = new Set(['compact', 'normal', 'comfortable']);
const ALLOWED_TITLE_WEIGHTS = new Set(['normal', 'bold', '400', '500', '600', '700', '800', '900']);
const ALLOWED_TITLE_ALIGNS = new Set(['left', 'center', 'right', 'justify']);

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const FONT_RE = /^[a-zA-Z\s]+$/;

export function sanitizeFormattingConfig(raw: any): ReportFormattingConfig {
  const out: ReportFormattingConfig = {
    ...DEFAULT_FORMATTING_CONFIG,
  };

  if (!raw || typeof raw !== 'object') return out;

  // Font family — must be known safe value
  if (
    typeof raw.fontFamily === 'string' &&
    ALLOWED_FONTS.has(raw.fontFamily.trim()) &&
    FONT_RE.test(raw.fontFamily.trim())
  ) {
    out.fontFamily = raw.fontFamily.trim();
  }

  // Base font size — numeric, 10–24
  if (
    typeof raw.baseFontSize === 'number' &&
    raw.baseFontSize >= 10 &&
    raw.baseFontSize <= 24
  ) {
    out.baseFontSize = Math.round(raw.baseFontSize);
  }

  // Heading color — strict hex
  if (typeof raw.headingColor === 'string' && HEX_COLOR_RE.test(raw.headingColor.trim())) {
    out.headingColor = raw.headingColor.trim();
  }

  // Title color — strict hex
  if (typeof raw.titleColor === 'string' && HEX_COLOR_RE.test(raw.titleColor.trim())) {
    out.titleColor = raw.titleColor.trim();
  }
  // Title font size - numeric, 16-36
  if (
    typeof raw.titleFontSize === 'number' &&
    raw.titleFontSize >= 16 &&
    raw.titleFontSize <= 36
  ) {
    out.titleFontSize = Math.round(raw.titleFontSize);
  }

  // Title font weight - safe CSS keyword/numeric values
  if (
    (typeof raw.titleFontWeight === 'string' || typeof raw.titleFontWeight === 'number') &&
    ALLOWED_TITLE_WEIGHTS.has(String(raw.titleFontWeight).trim())
  ) {
    const weight = String(raw.titleFontWeight).trim();
    out.titleFontWeight = /^\d+$/.test(weight) ? Number(weight) as any : weight as any;
  }

  // Title alignment - safe CSS text-align values
  if (typeof raw.titleAlign === 'string' && ALLOWED_TITLE_ALIGNS.has(raw.titleAlign.trim())) {
    out.titleAlign = raw.titleAlign.trim() as any;
  }

  // Numbering color — strict hex
  if (typeof raw.numberingColor === 'string' && HEX_COLOR_RE.test(raw.numberingColor.trim())) {
    out.numberingColor = raw.numberingColor.trim();
  }

  // Table border color — strict hex
  if (typeof raw.tableBorderColor === 'string' && HEX_COLOR_RE.test(raw.tableBorderColor.trim())) {
    out.tableBorderColor = raw.tableBorderColor.trim();
  }

  // Table header background — strict hex
  if (typeof raw.tableHeaderBg === 'string' && HEX_COLOR_RE.test(raw.tableHeaderBg.trim())) {
    out.tableHeaderBg = raw.tableHeaderBg.trim();
  }

  // Table cell padding — enum
  if (typeof raw.tableCellPadding === 'string' && ALLOWED_PADDING.has(raw.tableCellPadding)) {
    out.tableCellPadding = raw.tableCellPadding;
  }

  // Density — enum
  if (typeof raw.density === 'string' && ALLOWED_DENSITY.has(raw.density)) {
    out.density = raw.density;
  }

  return out;
}


