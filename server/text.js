export const LIMITS = Object.freeze({ answer: 12000, sources: 6, sourceChars: 60000, totalChars: 180000, claims: 60, fileBytes: 8 * 1024 * 1024, pages: 80 });
const stop = new Set('a an the is are was were be been being in on at to from by for of and or but with as it its this that these those their they them we our you your has have had do does did will would can could should may might not no than then also'.split(' '));
export function tokens(text) { return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(x => !stop.has(x)); }
export function normalized(text) { return text.toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, ' ').trim(); }
export function splitClaims(answer) {
  const segments = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(answer)];
  const claims = [];
  for (const seg of segments) {
    const re = /[^;\n]+[;\n]?/g;
    for (const m of seg.segment.matchAll(re)) {
      const raw = m[0], lead = raw.length - raw.trimStart().length;
      const text = raw.trim().replace(/;$/, '').trimEnd();
      if (text.length < 3) continue;
      const start = seg.index + m.index + lead;
      claims.push({ id: `c${claims.length + 1}`, text, start, end: start + text.length });
    }
  }
  return claims;
}
export function makePassages(sources) {
  const out = [];
  sources.forEach((source, si) => {
    const pages = source.pages?.length ? source.pages : [{ page: null, text: source.text }];
    pages.forEach(({ page, text }) => {
      const sentences = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(text)];
      for (let i = 0; i < sentences.length; i++) {
        const s = sentences[i];
        // Keep short local context, so separate qualifications stay with their statement.
        let passage = s.segment.trim();
        if (i + 1 < sentences.length && passage.length < 260 && passage.length + sentences[i + 1].segment.length < 650) passage += ' ' + sentences[i + 1].segment.trim();
        // Tokenizer truncation must not silently omit the end of a source passage.
        for (let offset = 0; offset < passage.length; offset += 600) {
          const quote = passage.slice(offset, offset + 700).trim();
          if (!quote) continue;
          out.push({ id: `s${si + 1}p${out.length + 1}`, sourceId: source.id, sourceName: source.name, page, line: text.slice(0, s.index + offset).split('\n').length, quote, words: tokens(quote) });
        }
      }
    });
  });
  return out;
}
export function retrieve(claim, passages, count = 4) {
  const query = [...new Set(tokens(claim))];
  if (!query.length || !passages.length) return [];
  const avg = passages.reduce((sum, p) => sum + p.words.length, 0) / passages.length || 1;
  const df = new Map(query.map(q => [q, passages.filter(p => p.words.includes(q)).length]));
  return passages.map(p => {
    let score = 0, matched = 0;
    for (const q of query) {
      const tf = p.words.filter(w => w === q).length;
      if (!tf) continue;
      matched++;
      const idf = Math.log(1 + (passages.length - df.get(q) + 0.5) / (df.get(q) + 0.5));
      score += idf * tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * p.words.length / avg));
    }
    return { ...p, retrievalScore: score, overlap: matched / query.length };
  }).filter(p => p.retrievalScore > 0).sort((a, b) => b.retrievalScore - a.retrievalScore).slice(0, count);
}
export function validateInput(input) {
  if (!input || typeof input.answer !== 'string' || !input.answer.trim()) throw new Error('Paste an answer to audit.');
  if (input.answer.length > LIMITS.answer) throw new Error(`Answer must be under ${LIMITS.answer.toLocaleString()} characters.`);
  if (!Array.isArray(input.sources) || !input.sources.length || input.sources.length > LIMITS.sources) throw new Error(`Add between 1 and ${LIMITS.sources} sources.`);
  let total = 0;
  const sources = input.sources.map((s, i) => {
    if (!s || typeof s.text !== 'string' || !s.text.trim()) throw new Error(`Source ${i + 1} has no readable text.`);
    if (s.text.length > LIMITS.sourceChars) throw new Error(`Source ${i + 1} exceeds ${LIMITS.sourceChars.toLocaleString()} characters.`);
    total += s.text.length;
    // Page locations are accepted only when their content exactly reconstructs the source.
    let pages;
    if (Array.isArray(s.pages) && s.pages.every(p => Number.isInteger(p.page) && p.page > 0 && typeof p.text === 'string') && s.pages.map(p => p.text).join('\n\n') === s.text) pages = s.pages;
    return { id: `source-${i + 1}`, name: String(s.name || `Source ${i + 1}`).slice(0, 160), text: s.text, ...(pages ? { pages } : {}) };
  });
  if (total > LIMITS.totalChars) throw new Error('Combined sources exceed 180,000 characters. Use smaller excerpts.');
  const claims = splitClaims(input.answer);
  if (!claims.length || claims.length > LIMITS.claims) throw new Error(`Use an answer with 1–${LIMITS.claims} sentences or clauses.`);
  if (claims.some(c => c.text.length > 1400)) throw new Error('A claim exceeds 1,400 characters. Split long sentences before auditing.');
  return { answer: input.answer, sources, title: String(input.title || 'Untitled audit').trim().slice(0, 100), claims, ...(typeof input.parentId === 'string' ? { parentId: input.parentId.slice(0, 64) } : {}) };
}
