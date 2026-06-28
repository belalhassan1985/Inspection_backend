import { inflateSync } from 'zlib';

type PdfObjectMap = Map<number, string>;

export type ExtractedPdfPage = {
  pageNumber: number;
  pageObjectId: number;
  text: string;
  extractionWarnings: string[];
};

export type ExtractedPdfText = {
  pages: ExtractedPdfPage[];
  fontsWithToUnicode: number;
  warnings: string[];
};

const parseObjects = (buffer: Buffer): PdfObjectMap => {
  const source = buffer.toString('latin1');
  const objects = new Map<number, string>();
  for (const match of source.matchAll(/(\d+)\s+0\s+obj\s*([\s\S]*?)\s*endobj/g)) {
    objects.set(Number(match[1]), match[2]);
  }
  return objects;
};

const streamBytes = (object: string): Buffer | null => {
  const marker = object.match(/stream\r?\n/);
  if (!marker || marker.index === undefined) return null;
  const start = marker.index + marker[0].length;
  const end = object.lastIndexOf('endstream');
  if (end < start) return null;
  let stream = Buffer.from(object.slice(start, end), 'latin1');
  while (stream.length > 0 && (stream[stream.length - 1] === 10 || stream[stream.length - 1] === 13)) {
    stream = stream.subarray(0, stream.length - 1);
  }
  return stream;
};

const decodedStream = (object: string): string | null => {
  const bytes = streamBytes(object);
  if (!bytes) return null;
  try {
    return object.includes('/FlateDecode') ? inflateSync(bytes).toString('latin1') : bytes.toString('latin1');
  } catch {
    return null;
  }
};

const utf16Be = (hex: string): string => {
  const clean = hex.replace(/\s+/g, '');
  let result = '';
  for (let index = 0; index + 3 < clean.length; index += 4) {
    const code = Number.parseInt(clean.slice(index, index + 4), 16);
    if (!Number.isNaN(code) && code !== 0xfeff) result += String.fromCharCode(code);
  }
  return result;
};

const parseLiteral = (value: string): string => value
  .replace(/\\([()\\])/g, '$1')
  .replace(/\\n/g, '\n')
  .replace(/\\r/g, '\r')
  .replace(/\\t/g, '\t');

const destinationText = (token: string): string => token.startsWith('<')
  ? utf16Be(token.slice(1, -1))
  : parseLiteral(token.slice(1, -1));

const parseCMap = (source: string): Map<number, string> => {
  const map = new Map<number, string>();
  for (const line of source.split(/\r?\n/)) {
    const range = line.match(/^\s*<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>\s*$/);
    if (range) {
      const start = Number.parseInt(range[1], 16);
      const end = Number.parseInt(range[2], 16);
      const destination = Number.parseInt(range[3], 16);
      for (let code = start; code <= end; code += 1) {
        map.set(code, String.fromCharCode(destination + code - start));
      }
      continue;
    }
    const character = line.match(/^\s*<([0-9A-Fa-f]+)>\s+(<[^>]+>|\((?:\\.|[^)])*\))\s*$/);
    if (!character) continue;
    const sourceCode = Number.parseInt(character[1], 16);
    const text = destinationText(character[2]);
    if (!Number.isNaN(sourceCode) && text) map.set(sourceCode, text);
  }
  return map;
};

const fontMaps = (objects: PdfObjectMap): Map<number, Map<number, string>> => {
  const maps = new Map<number, Map<number, string>>();
  objects.forEach((object, objectId) => {
    const reference = object.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (!reference) return;
    const cmapObject = objects.get(Number(reference[1]));
    const cmapSource = cmapObject ? decodedStream(cmapObject) : null;
    if (cmapSource) maps.set(objectId, parseCMap(cmapSource));
  });
  return maps;
};

const decodeGlyphs = (hex: string, map: Map<number, string> | undefined): string => {
  if (!map) return '';
  const clean = hex.replace(/\s+/g, '');
  let result = '';
  for (let index = 0; index + 3 < clean.length; index += 4) {
    const code = Number.parseInt(clean.slice(index, index + 4), 16);
    result += map.get(code) ?? '';
  }
  return result;
};

type MarkedContext = { type: 'reversed' | 'actual' | 'other'; buffer: string };

const extractContentText = (
  content: string,
  pageFonts: Map<string, Map<number, string>>,
): string => {
  let currentFont: Map<number, string> | undefined;
  const contexts: MarkedContext[] = [];
  let output = '';

  const append = (value: string): void => {
    if (!value) return;
    const reversed = [...contexts].reverse().find((context) => context.type === 'reversed');
    if (reversed) reversed.buffer += value;
    else output += value;
  };
  const insideActual = (): boolean => contexts.some((context) => context.type === 'actual');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const font = line.match(/\/(F\w+)\s+[\d.]+\s+Tf/);
    if (font) currentFont = pageFonts.get(font[1]);

    if (/\/ReversedChars\s+BMC/.test(line)) {
      contexts.push({ type: 'reversed', buffer: '' });
      continue;
    }
    const actual = line.match(/\/ActualText\s+(<[^>]+>|\((?:\\.|[^)])*\))\s*>>\s*BDC/);
    if (actual) {
      append(destinationText(actual[1]));
      contexts.push({ type: 'actual', buffer: '' });
      continue;
    }
    if (/\bBDC\b/.test(line)) contexts.push({ type: 'other', buffer: '' });
    else if (/\bBMC\b/.test(line)) contexts.push({ type: 'other', buffer: '' });

    if (/^\s*EMC\s*$/.test(line)) {
      const context = contexts.pop();
      if (context?.type === 'reversed') output += Array.from(context.buffer).reverse().join('');
      continue;
    }
    if (insideActual()) continue;

    for (const text of line.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)) append(decodeGlyphs(text[1], currentFont));
    for (const array of line.matchAll(/\[([\s\S]*?)\]\s*TJ/g)) {
      for (const text of array[1].matchAll(/<([0-9A-Fa-f\s]+)>/g)) append(decodeGlyphs(text[1], currentFont));
    }
    if (/\bET\b/.test(line)) append('\n');
  }
  while (contexts.length > 0) {
    const context = contexts.pop();
    if (context?.type === 'reversed') output += Array.from(context.buffer).reverse().join('');
  }
  return output
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const references = (value: string): number[] => [...value.matchAll(/(\d+)\s+0\s+R/g)]
  .map((match) => Number(match[1]));

export const extractPdfTextByPage = (buffer: Buffer): ExtractedPdfText => {
  const objects = parseObjects(buffer);
  const maps = fontMaps(objects);
  const warnings: string[] = [];
  const pageObjects = [...objects.entries()].filter(([, object]) => /\/Type\s*\/Page(?!s)/.test(object));
  const pages = pageObjects.map(([pageObjectId, pageObject], pageIndex): ExtractedPdfPage => {
    const extractionWarnings: string[] = [];
    const pageFonts = new Map<string, Map<number, string>>();
    const fontDictionary = pageObject.match(/\/Font\s*<<([\s\S]*?)>>/);
    if (fontDictionary) {
      for (const match of fontDictionary[1].matchAll(/\/(F\w+)\s+(\d+)\s+0\s+R/g)) {
        const map = maps.get(Number(match[2]));
        if (map) pageFonts.set(match[1], map);
      }
    }
    if (pageFonts.size === 0) extractionWarnings.push('No page fonts with ToUnicode maps were resolved.');

    const contentsToken = pageObject.match(/\/Contents\s*(\[[^\]]+\]|\d+\s+0\s+R)/);
    const contentIds = contentsToken ? references(contentsToken[1]) : [];
    if (contentIds.length === 0) extractionWarnings.push('No page content stream was found.');
    const text = contentIds.map((contentId) => {
      const object = objects.get(contentId);
      const content = object ? decodedStream(object) : null;
      if (!content) {
        extractionWarnings.push(`Content stream ${contentId} could not be decoded.`);
        return '';
      }
      return extractContentText(content, pageFonts);
    }).join('\n');
    return { pageNumber: pageIndex + 1, pageObjectId, text, extractionWarnings };
  });
  if (pages.length === 0) warnings.push('No PDF page objects were found.');
  return { pages, fontsWithToUnicode: maps.size, warnings };
};
