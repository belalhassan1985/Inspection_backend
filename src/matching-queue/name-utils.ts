const RANK_PREFIXES = [
  'اللواء المفتش',
  'اللواءالمفتش',
  'اللواء',
  'الفريق',
  'العقيد',
  'المقدم',
  'العميد المفتش',
  'العميد',
  'الرائد',
  'النقيب',
  'الملازم',
  'السيد',
].sort((a, b) => b.length - a.length); // longest first

const ARABIC_NORMALIZATION: Record<string, string> = {
  أ: 'ا',
  إ: 'ا',
  آ: 'ا',
  ى: 'ي',
  ة: 'ه',
};

export function normalizeName(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ');
  // Remove quotes
  s = s.replace(/["""']/g, '');
  // Normalize Arabic chars
  s = s
    .split('')
    .map((c) => ARABIC_NORMALIZATION[c] || c)
    .join('');
  return s;
}

export function extractRankAndName(raw: string): {
  rankGuess: string | null;
  restName: string;
  raw: string;
} {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  for (const prefix of RANK_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      const rest = trimmed.substring(prefix.length).trim();
      return { rankGuess: prefix, restName: rest || trimmed, raw: trimmed };
    }
  }
  return { rankGuess: null, restName: trimmed, raw: trimmed };
}

export function computeConfidence(
  normalized: string,
  inspectorName: string,
): number {
  const n1 = normalizeName(normalized);
  // Also strip rank prefix from inspectorName so both sides are compared without prefixes
  const { restName } = extractRankAndName(inspectorName);
  const n2 = normalizeName(restName);
  // Exact match after normalization
  if (n1 === n2) return 100;
  // One contains the other
  if (n1.includes(n2) || n2.includes(n1)) return 85;
  // Levenshtein-based partial match
  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 0;
  const dist = levenshtein(n1, n2);
  const ratio = 1 - dist / maxLen;
  if (ratio >= 0.7) return Math.round(ratio * 100);
  return 0;
}

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
