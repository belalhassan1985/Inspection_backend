export function hasMeaningfulQuantitativeData(data: unknown): boolean {
  if (data == null) return false;

  const isLabelKey = (key: string) => {
    const k = key.toLowerCase();
    return k === 'category' || k === 'name' || k === 'label' || k === 'id';
  };

  const isValNotEmpty = (v: unknown): boolean => {
    if (v == null) return false;
    if (typeof v === 'number') return v > 0;
    if (typeof v === 'string') {
      const trimmed = v.trim();
      return trimmed !== '' && trimmed !== '0' && trimmed !== '0%';
    }
    if (typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.length > 0 && v.some(isValNotEmpty);
    if (typeof v === 'object') {
      return Object.entries(v as Record<string, unknown>).some(
        ([key, val]) => !isLabelKey(key) && isValNotEmpty(val),
      );
    }
    return false;
  };

  if (Array.isArray(data)) {
    if (data.length === 0) return false;
    return data.some((entry: unknown) => {
      if (entry == null) return false;
      if (typeof entry === 'object') {
        return Object.entries(entry as Record<string, unknown>).some(
          ([key, val]) => !isLabelKey(key) && isValNotEmpty(val),
        );
      }
      return isValNotEmpty(entry);
    });
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Object.keys(obj).length === 0) return false;
    // If it has a rows key, check rows content
    if ('rows' in obj) {
      const rows = obj.rows;
      if (!Array.isArray(rows)) {
        return hasMeaningfulQuantitativeData(rows);
      }
      if (rows.length === 0) return false;
      return rows.some((row: unknown) => {
        if (row == null) return false;
        if (typeof row === 'object') {
          return Object.entries(row as Record<string, unknown>).some(
            ([key, val]) => !isLabelKey(key) && isValNotEmpty(val),
          );
        }
        return isValNotEmpty(row);
      });
    }
    // Generic object without rows: check for any meaningful value
    return Object.entries(obj).some(
      ([key, val]) => !isLabelKey(key) && isValNotEmpty(val),
    );
  }

  return isValNotEmpty(data);
}

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

export function pruneTemplateTree(
  template: CriteriaPrimary[],
  gradesMap: Map<number, GradeRecord>,
): CriteriaPrimary[] {
  // Deep clone template to avoid mutating cached database templates
  const cloned = JSON.parse(JSON.stringify(template)) as CriteriaPrimary[];

  return cloned
    .map((pri: CriteriaPrimary) => {
      if (pri.secondaryCriteria) {
        pri.secondaryCriteria = pri.secondaryCriteria.filter(
          (sec: CriteriaSecondary) => {
            if (!sec.details || sec.details.length === 0) return false;

            // Keep the secondary criteria section if at least one detail inside it has findings/scores/notes/quant
            return sec.details.some((det: CriteriaDetail) => {
              const grade = gradesMap.get(det.id);
              if (!grade) return false;

              const earned =
                grade.gradeEarned != null
                  ? parseFloat(
                      typeof grade.gradeEarned === 'number' ||
                        typeof grade.gradeEarned === 'string'
                        ? String(grade.gradeEarned)
                        : '0',
                    ) || 0
                  : 0;
              const score = earned;
              const hasScore = score > 0;
              const hasNotes = !!(grade.notes && grade.notes.trim() !== '');
              const hasSelectedOptions = !!(
                grade.selectedOptions && grade.selectedOptions.length > 0
              );
              const hasQuantData = hasMeaningfulQuantitativeData(
                grade.quantitativeData,
              );

              return hasScore || hasNotes || hasSelectedOptions || hasQuantData;
            });
          },
        );
      }
      return pri;
    })
    .filter(
      (pri: CriteriaPrimary) =>
        !!(pri.secondaryCriteria && pri.secondaryCriteria.length > 0),
    );
}
