import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, splitClaims, makePassages, retrieve } from '../server/text.js';
import { arithmeticCheck, decide, dependencyHints, audit } from '../server/audit.js';
const source = text => [{ name: 'Reference', text }];
test('claim boundaries retain exact source offsets including whitespace and decimals', () => {
  const answer = '  Revenue was 1.5 million.\nCosts fell; margins improved. '; const claims = splitClaims(answer);
  assert.equal(claims.length, 3); claims.forEach(c => assert.equal(answer.slice(c.start, c.end), c.text));
});
test('invalid and excessive inputs fail explicitly', () => {
  assert.throws(() => validateInput({ answer: 'Hi', sources: [] }), /sources/);
  assert.throws(() => validateInput({ answer: 'x'.repeat(12001), sources: source('a') }), /12,000/);
  assert.throws(() => validateInput({ answer: 'A fact.', sources: source(' ') }), /readable/);
  assert.throws(() => validateInput({ answer: 'A fact. '.repeat(61), sources: source('hello') }), /1–60/);
});
test('untrusted page annotations cannot change the evidence text', () => {
  const input = validateInput({ answer: 'A fact.', sources: [{ name: 'x', text: 'Original material.', pages: [{ page: 9, text: 'Fabricated material.' }] }] });
  assert.equal(input.sources[0].pages, undefined);
});
test('retrieval preserves source ID, PDF page and verbatim text', () => {
  const passages = makePassages([{ id: 's1', name: 'report.pdf', text: 'Solar generation increased.', pages: [{ page: 4, text: 'Solar generation increased.' }] }]);
  const found = retrieve('Solar generation grew.', passages);
  assert.equal(found[0].page, 4); assert.equal(found[0].sourceId, 's1'); assert.equal(found[0].quote, 'Solar generation increased.');
});
test('unrelated evidence does not produce a match', () => {
  assert.deepEqual(retrieve('Elephants travel together.', makePassages(source('Quarterly sales increased.'))), []);
});
test('deterministic percentage check explains and corrects a mismatch', () => {
  const r = arithmeticCheck('Users grew from 100 to 120, a 30% increase.');
  assert.equal(r.expected, 20); assert.match(r.correction, /20%/); assert.match(r.explanation, /100/);
});
test('percentage checker accepts correct increases, decreases and zero results', () => {
  assert.equal(arithmeticCheck('Users grew from 100 to 120, a 20% increase.'), null);
  assert.equal(arithmeticCheck('Time fell from 10 to 8, a 20% decrease.'), null);
  assert.equal(arithmeticCheck('Users went from 100 to 100, a 0% change.'), null);
});
test('percentage checker abstains on mixed scale, currency, zero base and percentage points', () => {
  for (const x of ['Revenue rose from 1 million to 2 billion, a 30% increase.', 'Revenue rose from $100 to €120, a 30% increase.', 'Users grew from 0 to 10, a 10% increase.', 'Rate rose from 10 to 15, a 5% percentage points change.']) assert.equal(arithmeticCheck(x), null);
});
test('absent evidence is insufficient, not false', () => assert.equal(decide([], null).status, 'insufficient'));
test('conflicting source evidence produces ambiguity', () => assert.equal(decide([{ relation: 'supporting' }, { relation: 'contradicting' }], null).status, 'ambiguous'));
test('borderline inference abstains', () => assert.equal(decide([{ relation: 'related', scores: { entailment: .7, contradiction: .2 } }], null).status, 'ambiguous'));
test('dependency hints do not claim proven causality', () => {
  const result = dependencyHints([{ id: 'c1', text: 'The study succeeded.', status: 'ambiguous' }, { id: 'c2', text: 'Therefore, we should launch.' }]);
  assert.equal(result.length, 1); assert.equal(result[0].needsReview, true); assert.match(result[0].explanation, /not a proven/);
});
test('full audit retains exact quoted evidence and applies arithmetic', async () => {
  const input = validateInput({ answer: 'Users grew from 100 to 120, a 30% increase.', sources: source('Users grew from 100 to 120, a 20% increase.') });
  const result = await audit(input, { infer: async () => ({ entailment: .05, contradiction: .94, neutral: .01 }) });
  assert.equal(result.counts.contradicted, 1); assert.equal(result.claims[0].checks[0].expected, 20); assert.equal(result.claims[0].evidence[0].sourceName, 'Reference');
});
test('exact statement support avoids unnecessary model inference', async () => {
  const input = validateInput({ answer: 'The study included 120 adults.', sources: source('The study included 120 adults.') });
  const result = await audit(input, { infer: async () => { throw new Error('Unexpected inference'); } });
  assert.equal(result.counts.supported, 1);
});
test('substring inside a negation is not treated as exact support', async () => {
  const input = validateInput({ answer: 'The trial was successful.', sources: source('It is false that the trial was successful.') });
  let called = false;
  const result = await audit(input, { infer: async () => { called = true; return { entailment: .01, contradiction: .98, neutral: .01 }; } });
  assert.equal(called, true); assert.equal(result.counts.contradicted, 1);
});
test('cancelled audit stops without presenting partial results as complete', async () => {
  const input = validateInput({ answer: 'A study enrolled adults.', sources: source('A study enrolled adults.') });
  await assert.rejects(audit(input, { cancelled: () => true }), /cancelled/);
});
test('inference failure is visible rather than silently fabricated', async () => {
  const input = validateInput({ answer: 'The study enrolled children.', sources: source('The study enrolled adults only.') });
  await assert.rejects(audit(input, { infer: async () => { throw new Error('model offline'); } }), /model offline/);
});
