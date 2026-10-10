import test from 'node:test';
import assert from 'node:assert/strict';
import { extract } from '../server/extract.js';

function pdfFixture() {
  const text = 'BT /F1 12 Tf 50 750 Td (The pilot enrolled 120 adults.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`
  ];
  let body = '%PDF-1.4\n', offsets = [0];
  objects.forEach((o,i) => { offsets.push(Buffer.byteLength(body)); body += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(body);
  body += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}
test('real PDF extraction preserves text and page coordinates', async () => {
  const result = await extract({ originalname: 'pilot.pdf', buffer: pdfFixture() });
  assert.match(result.text, /120 adults/); assert.equal(result.pages[0].page, 1); assert.equal(result.pages.map(p => p.text).join('\n\n'), result.text);
});
test('invalid PDF, invalid encoding and overlong sources fail explicitly', async () => {
  await assert.rejects(extract({ originalname: 'fake.pdf', buffer: Buffer.from('not a PDF') }), /valid PDF/);
  await assert.rejects(extract({ originalname: 'bad.txt', buffer: Buffer.from([0xff, 0xff]) }));
  await assert.rejects(extract({ originalname: 'long.txt', buffer: Buffer.from('a'.repeat(60001)) }), /60,000/);
});
