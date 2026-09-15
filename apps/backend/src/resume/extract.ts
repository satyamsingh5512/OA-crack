import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export type SupportedDocument = 'pdf' | 'docx' | 'txt' | 'md' | 'unknown';

export function detectDocumentType(filename: string, contentType?: string): SupportedDocument {
  const ext = path.extname(filename).toLowerCase().replace('.', '');
  if (ext === 'pdf' || contentType === 'application/pdf') return 'pdf';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'txt') return 'txt';
  if (ext === 'md' || ext === 'markdown') return 'md';
  return 'unknown';
}

/**
 * Extracts plain text from an uploaded resume/JD.
 * PDF → pdfjs-dist (bundled, offline), DOCX → mammoth, TXT/MD → utf8.
 * Throws a user-facing error for unsupported or unscannable documents.
 */
export async function extractDocumentText(buffer: Buffer, filename: string, contentType?: string): Promise<string> {
  const type = detectDocumentType(filename, contentType);
  switch (type) {
    case 'txt':
    case 'md':
      return normalize(buffer.toString('utf8'));
    case 'pdf':
      return normalize(await extractPdf(buffer));
    case 'docx':
      return normalize(await extractDocx(buffer));
    default:
      throw new Error(`Unsupported file type: ${path.extname(filename) || 'unknown'}. Upload PDF, DOCX, TXT or MD.`);
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  const standardFonts = `${path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'standard_fonts')}${path.sep}`;
  pdfjs.GlobalWorkerOptions.workerSrc = workerPath;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    standardFontDataUrl: standardFonts,
  });
  const doc = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i += 1) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
      pages.push(text);
    }
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
  const text = pages.join('\n').trim();
  if (text.length === 0) throw new Error('PDF contained no extractable text (scanned image?). Paste the text instead.');
  return text;
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  const text = result.value.trim();
  if (text.length === 0) throw new Error('DOCX contained no extractable text. Paste the text instead.');
  return text;
}

function normalize(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}