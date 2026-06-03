"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_FORMATTING_CONFIG = void 0;
exports.getRoman = getRoman;
exports.getArabicLetter = getArabicLetter;
exports.getEnglishLetter = getEnglishLetter;
exports.getOrdinal = getOrdinal;
exports.getLevel1Number = getLevel1Number;
exports.getLevel2ArabicLetter = getLevel2ArabicLetter;
exports.getLevel3Ordinal = getLevel3Ordinal;
exports.getLevel4Number = getLevel4Number;
exports.getLevel5ArabicLetter = getLevel5ArabicLetter;
exports.getIndentation = getIndentation;
exports.DEFAULT_FORMATTING_CONFIG = {
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
function getRoman(num) {
    return romanNumbers[num - 1] || `${num}`;
}
function getArabicLetter(num) {
    return arabicLetters[num - 1] || `${num}`;
}
function getEnglishLetter(num) {
    return String.fromCharCode(64 + num);
}
function getOrdinal(num) {
    return ordinals[num - 1] || `${num}`;
}
function getLevel1Number(index, config = exports.DEFAULT_FORMATTING_CONFIG) {
    if (!config.enableLevels.level1)
        return '';
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
function getLevel2ArabicLetter(index, config = exports.DEFAULT_FORMATTING_CONFIG) {
    if (!config.enableLevels.level2)
        return '';
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
function getLevel3Ordinal(index, config = exports.DEFAULT_FORMATTING_CONFIG) {
    if (!config.enableLevels.level3)
        return '';
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
function getLevel4Number(index, config = exports.DEFAULT_FORMATTING_CONFIG) {
    if (!config.enableLevels.level4)
        return '';
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
function getLevel5ArabicLetter(index, config = exports.DEFAULT_FORMATTING_CONFIG) {
    if (!config.enableLevels.level5)
        return '';
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
function getIndentation(level, config = exports.DEFAULT_FORMATTING_CONFIG) {
    const indentVal = config.indentations[`level${level}`];
    return `${indentVal}px`;
}
//# sourceMappingURL=reportNumbering.js.map