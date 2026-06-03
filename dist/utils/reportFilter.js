"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasMeaningfulQuantitativeData = hasMeaningfulQuantitativeData;
exports.pruneTemplateTree = pruneTemplateTree;
function hasMeaningfulQuantitativeData(data) {
    if (data == null)
        return false;
    const isLabelKey = (key) => {
        const k = key.toLowerCase();
        return k === 'category' || k === 'name' || k === 'label' || k === 'id';
    };
    const isValNotEmpty = (v) => {
        if (v == null)
            return false;
        if (typeof v === 'number')
            return v > 0;
        if (typeof v === 'string') {
            const trimmed = v.trim();
            return trimmed !== '' && trimmed !== '0' && trimmed !== '0%';
        }
        if (typeof v === 'boolean')
            return v;
        if (Array.isArray(v))
            return v.length > 0 && v.some(isValNotEmpty);
        if (typeof v === 'object') {
            return Object.entries(v).some(([key, val]) => !isLabelKey(key) && isValNotEmpty(val));
        }
        return false;
    };
    if (Array.isArray(data)) {
        if (data.length === 0)
            return false;
        return data.some((entry) => {
            if (entry == null)
                return false;
            if (typeof entry === 'object') {
                return Object.entries(entry).some(([key, val]) => !isLabelKey(key) && isValNotEmpty(val));
            }
            return isValNotEmpty(entry);
        });
    }
    if (typeof data === 'object') {
        const obj = data;
        if (Object.keys(obj).length === 0)
            return false;
        if ('rows' in obj) {
            const rows = obj.rows;
            if (!Array.isArray(rows)) {
                return hasMeaningfulQuantitativeData(rows);
            }
            if (rows.length === 0)
                return false;
            return rows.some((row) => {
                if (row == null)
                    return false;
                if (typeof row === 'object') {
                    return Object.entries(row).some(([key, val]) => !isLabelKey(key) && isValNotEmpty(val));
                }
                return isValNotEmpty(row);
            });
        }
        return Object.entries(obj).some(([key, val]) => !isLabelKey(key) && isValNotEmpty(val));
    }
    return isValNotEmpty(data);
}
function pruneTemplateTree(template, gradesMap) {
    const cloned = JSON.parse(JSON.stringify(template));
    return cloned
        .map((pri) => {
        if (pri.secondaryCriteria) {
            pri.secondaryCriteria = pri.secondaryCriteria.filter((sec) => {
                if (!sec.details || sec.details.length === 0)
                    return false;
                return sec.details.some((det) => {
                    const grade = gradesMap.get(det.id);
                    if (!grade)
                        return false;
                    const earned = grade.gradeEarned != null
                        ? parseFloat(typeof grade.gradeEarned === 'number' ||
                            typeof grade.gradeEarned === 'string'
                            ? String(grade.gradeEarned)
                            : '0') || 0
                        : 0;
                    const score = earned;
                    const hasScore = score > 0;
                    const hasNotes = !!(grade.notes && grade.notes.trim() !== '');
                    const hasSelectedOptions = !!(grade.selectedOptions && grade.selectedOptions.length > 0);
                    const hasQuantData = hasMeaningfulQuantitativeData(grade.quantitativeData);
                    return hasScore || hasNotes || hasSelectedOptions || hasQuantData;
                });
            });
        }
        return pri;
    })
        .filter((pri) => !!(pri.secondaryCriteria && pri.secondaryCriteria.length > 0));
}
//# sourceMappingURL=reportFilter.js.map