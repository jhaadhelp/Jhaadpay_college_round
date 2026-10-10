import { readFileSync, writeFileSync } from 'node:fs';
import { audit } from '../server/audit.js';
import { validateInput } from '../server/text.js';
import { MODEL, REVISION, loadModel } from '../server/model.js';
const cases = JSON.parse(readFileSync(new URL('../evaluation/cases.json', import.meta.url), 'utf8'));
await loadModel();
const results = [];
for (const item of cases) {
  const result = await audit(validateInput({ title: item.id, answer: item.answer, sources: item.sources || [{ name: 'Reference', text: item.source }] }));
  const actual = result.claims[0].status;
  results.push({ id: item.id, expected: item.expected, actual, correct: actual === item.expected, evidence: result.claims[0].evidence.map(e => ({ relation: e.relation, scores: e.scores })) });
  console.log(`${actual === item.expected ? 'PASS' : 'MISS'} ${item.id}: expected ${item.expected}, got ${actual}`);
}
const classes = ['supported','contradicted','insufficient','ambiguous'];
const confusion = Object.fromEntries(classes.map(expected => [expected, Object.fromEntries(classes.map(actual => [actual, results.filter(r => r.expected === expected && r.actual === actual).length]))]));
const flagged = results.filter(r => r.actual === 'contradicted'), real = results.filter(r => r.expected === 'contradicted'), tp = results.filter(r => r.actual === 'contradicted' && r.expected === 'contradicted').length;
const report = { generatedAt: new Date().toISOString(), model: MODEL, revision: REVISION, count: results.length, correct: results.filter(r => r.correct).length, contradictionPrecision: flagged.length ? tp / flagged.length : null, contradictionRecall: real.length ? tp / real.length : null, confusion, limitations: 'Small authored development set, not a held-out benchmark or calibrated accuracy estimate. Results are disclosed even when they miss the expected label.', results };
writeFileSync(new URL('../evaluation/results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(`\n${report.correct}/${report.count} development cases matched. Precision ${report.contradictionPrecision}; recall ${report.contradictionRecall}.`);
// Quality gate catches broad regression, while retaining all misses for review.
if (report.correct / report.count < 0.6) process.exitCode = 1;
