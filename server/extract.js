import { LIMITS } from './text.js';
export async function extract(file) {
  const ext = file.originalname.toLowerCase().split('.').pop();
  if (['txt','md','csv'].includes(ext)) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer).replace(/^\uFEFF/, '');
    if (!text.trim()) throw new Error('This file is empty.');
    if (text.length > LIMITS.sourceChars) throw new Error('This source exceeds 60,000 characters. Upload a shorter excerpt.');
    return { name: file.originalname, text };
  }
  if (ext !== 'pdf') throw new Error('Supported files: PDF, TXT, Markdown, and CSV.');
  if (file.buffer.subarray(0, 5).toString() !== '%PDF-') throw new Error('This file is not a valid PDF.');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(file.buffer), isEvalSupported: false, useSystemFonts: true });
  let document;
  try {
    document = await task.promise;
    if (document.numPages > LIMITS.pages) throw new Error(`PDFs are limited to ${LIMITS.pages} pages. Upload an excerpt.`);
    const pages = []; let length = 0;
    for (let page = 1; page <= document.numPages; page++) {
      const content = await (await document.getPage(page)).getTextContent();
      const text = content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('').trim();
      length += text.length;
      if (length + pages.length * 2 > LIMITS.sourceChars) throw new Error('PDF exceeds 60,000 extracted characters. Upload a shorter excerpt.');
      pages.push({ page, text });
    }
    const text = pages.map(p => p.text).join('\n\n');
    if (text.trim().length < 20) throw new Error('No readable PDF text found. Scanned PDFs need OCR before upload.');
    const empty = pages.filter(p => p.text.trim().length < 20).length;
    return { name: file.originalname, text, pages, warning: empty ? `${empty} page(s) have little or no extracted text. Scanned content and images are not checked.` : 'PDF text extracted. Complex tables, images, and multi-column reading order need review.' };
  } finally { await task.destroy(); }
}
