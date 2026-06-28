import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';

interface ParsedRow {
  rawName: string;
  sourceGroup?: string;
  sourceAssignment?: string;
  notes?: string;
}

export interface ParseResult {
  rows: ParsedRow[];
  groups: string[];
  totalEntries: number;
}

function guessGroupColumn(columns: string[]): string | null {
  const lower = columns.map((c) => c.trim().toLowerCase());
  const groupKeywords = [
    'group',
    'team',
    'division',
    'قسم',
    'فرقة',
    'مجموعة',
    'فريق',
    'لجنة',
    'وحدة',
  ];
  for (const kw of groupKeywords) {
    const idx = lower.findIndex((c) => c.includes(kw));
    if (idx >= 0) return columns[idx];
  }
  return null;
}

function guessNameColumn(columns: string[]): string | null {
  const lower = columns.map((c) => c.trim().toLowerCase());
  const nameKeywords = [
    'name',
    'full name',
    'inspector',
    'member',
    'اسم',
    'الاسم',
    'الاسم الكامل',
    'المفتش',
    'العضو',
    'الرتبة',
    'الضابط',
  ];
  for (const kw of nameKeywords) {
    const idx = lower.findIndex((c) => c.includes(kw));
    if (idx >= 0) return columns[idx];
  }
  return null;
}

function guessAssignmentColumn(columns: string[]): string | null {
  const lower = columns.map((c) => c.trim().toLowerCase());
  const assignKeywords = [
    'assignment',
    'role',
    'position',
    'duty',
    'تكليف',
    'وظيفة',
    'دور',
    'مهمة',
  ];
  for (const kw of assignKeywords) {
    const idx = lower.findIndex((c) => c.includes(kw));
    if (idx >= 0) return columns[idx];
  }
  return null;
}

function parseWorksheet(rows: any[][]): ParsedRow[] {
  if (rows.length < 2) return [];
  const header = rows[0].map((c: any) => String(c || ''));
  const nameCol = guessNameColumn(header);
  const groupCol = guessGroupColumn(header);
  const assignCol = guessAssignmentColumn(header);

  const result: ParsedRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const rawName = nameCol
      ? String(row[header.indexOf(nameCol)] || '').trim()
      : String(row[0] || '').trim();
    if (!rawName) continue;

    result.push({
      rawName,
      sourceGroup: groupCol
        ? String(row[header.indexOf(groupCol)] || '').trim() || undefined
        : undefined,
      sourceAssignment: assignCol
        ? String(row[header.indexOf(assignCol)] || '').trim() || undefined
        : undefined,
    });
  }

  return result;
}

export async function parseExcel(buffer: Buffer): Promise<ParseResult> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const allRows: ParsedRow[] = [];
  const groups = new Set<string>();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    // If sheet name looks like a group name, use it
    const rows = parseWorksheet(data);
    // If no group column was found, assign sheet name as group
    if (
      rows.length > 0 &&
      !rows[0].sourceGroup &&
      sheetName !== 'Sheet1' &&
      !sheetName.startsWith('Sheet')
    ) {
      rows.forEach((r) => {
        r.sourceGroup = sheetName;
      });
    }
    allRows.push(...rows);
    rows.forEach((r) => {
      if (r.sourceGroup) groups.add(r.sourceGroup);
    });
  }

  return {
    rows: allRows,
    groups: Array.from(groups).sort(),
    totalEntries: allRows.length,
  };
}

export async function parseWord(buffer: Buffer): Promise<ParseResult> {
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value;
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows: ParsedRow[] = [];
  let currentGroup: string | undefined;

  for (const line of lines) {
    // Detect group headers (lines ending with colon or all caps short lines)
    if (
      line.endsWith(':') ||
      (line.length < 50 &&
        /^[A-Z\u0600-\u06FF\s]+$/.test(line) &&
        !line.includes(' '))
    ) {
      currentGroup = line.replace(/:$/, '').trim();
      continue;
    }
    // Skip very long lines, likely paragraphs
    if (line.length > 100) continue;
    rows.push({
      rawName: line,
      sourceGroup: currentGroup,
    });
  }

  const groups = [
    ...new Set(rows.map((r) => r.sourceGroup).filter((g): g is string => !!g)),
  ].sort();
  return { rows, groups, totalEntries: rows.length };
}

export function parseFile(
  filename: string,
  buffer: Buffer,
): Promise<ParseResult> {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'xls') {
    return parseExcel(buffer);
  }
  if (ext === 'docx' || ext === 'doc') {
    return parseWord(buffer);
  }
  // TSV/CSV: treat as Excel
  if (ext === 'csv' || ext === 'tsv') {
    return parseExcel(buffer);
  }
  throw new Error(
    'نوع الملف غير مدعوم. الأنواع المدعومة: xlsx, xls, docx, csv',
  );
}
