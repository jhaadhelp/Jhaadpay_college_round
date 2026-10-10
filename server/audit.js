import { makePassages, retrieve, normalized, tokens, splitClaims } from './text.js';
import { classify, MODEL, REVISION } from './model.js';
export const THRESHOLDS = { entailment: 0.86, contradiction: 0.88, overlap: 0.18 };
const safetyCue = /\b(ignore|bypass|disable|skip|stop taking|double (?:the|your)|share (?:the|your) password|without (?:approval|permission|consent))\b/i;

export function arithmeticCheck(text) {
  // A narrow, explainable checker: all three values must be in this same claim.
  const match = text.match(/\bfrom\s+([$£€₹]?)([\d,]+(?:\.\d+)?)\s*(?:million|billion|thousand)?\s+to\s+([$£€₹]?)([\d,]+(?:\.\d+)?)\s*(?:million|billion|thousand)?[^.!?]*?([\d.]+)\s*%/i);
  if (!match) return null;
  const before = Number(match[2].replaceAll(',', '')), after = Number(match[4].replaceAll(',', '')), reported = Number(match[5]);
  if (!before || !Number.isFinite(reported)) return null;
  // Do not compare mixed scale words/currencies or percentage-point changes.
  const fromTo = match[0].split(/\bto\b/i);
  const scale = s => (s.match(/million|billion|thousand/i)?.[0] || '').toLowerCase();
  if (scale(fromTo[0]) !== scale(fromTo[1]) || match[1] !== match[3] || /percentage points?/i.test(text)) return null;
  const value = (after - before) / before * 100;
  const expected = /decreas|declin|fell|drop|reduc/i.test(text) ? Math.abs(value) : value;
  if (Math.abs(expected - reported) <= 0.15) return null;
  const corrected = Number(expected.toFixed(2));
  return { kind: 'arithmetic', title: 'Percentage change does not match', explanation: `(${after} − ${before}) ÷ ${before} × 100 = ${Number(value.toFixed(2))}%. The answer reports ${reported}%.`, expected: corrected, reported, correction: text.replace(new RegExp(`${String(reported).replace('.', '\\.')}\\s*%`), `${corrected}%`) };
}

export function decide(evidence, arithmetic) {
  const support = evidence.filter(e => e.relation === 'supporting');
  const contradiction = evidence.filter(e => e.relation === 'contradicting');
  if (support.length && contradiction.length) return { status: 'ambiguous', reason: 'Retrieved passages point in different directions. Check dates, scope, and source authority before deciding.' };
  if (arithmetic) return { status: 'contradicted', reason: arithmetic.explanation };
  if (contradiction.length) return { status: 'contradicted', reason: 'The local inference model found a conflict with the cited passage. Review the exact wording and context.' };
  if (support.length) return { status: 'supported', reason: support.some(e => e.method === 'exact') ? 'This statement appears directly in the source material.' : 'The cited passage supports this statement according to the local inference model.' };
  if (evidence.some(e => Math.max(e.scores?.entailment || 0, e.scores?.contradiction || 0) >= 0.55)) return { status: 'ambiguous', reason: 'Related evidence was found, but it does not establish a clear verdict at the configured thresholds.' };
  return { status: 'insufficient', reason: 'No sufficiently supporting or contradicting evidence was found in the retrieved passages. This does not prove the claim false.' };
}

export function dependencyHints(claims) {
  return claims.flatMap((claim, i) => {
    if (!i || !/^(therefore|thus|hence|consequently|as a result|so\b|this (?:means|proves|shows|suggests))/i.test(claim.text)) return [];
    const prior = claims[i - 1];
    return [{ from: prior.id, to: claim.id, kind: 'possible-dependency', needsReview: prior.status !== 'supported', explanation: 'A conclusion marker connects this sentence to the preceding claim. This is a reading aid, not a proven causal relationship.' }];
  });
}

export async function audit(input, { infer = classify, progress = () => {}, cancelled = () => false } = {}) {
  const started = Date.now(), passages = makePassages(input.sources), findings = [];
  if (!passages.length) throw new Error('No readable source passages were found.');
  for (let i = 0; i < input.claims.length; i++) {
    if (cancelled()) throw new Error('Audit cancelled.');
    const claim = input.claims[i];
    progress({ done: i, total: input.claims.length, stage: `Checking claim ${i + 1} of ${input.claims.length}` });
    const candidates = retrieve(claim.text, passages, 4), evidence = [];
    for (const p of candidates) {
      if (cancelled()) throw new Error('Audit cancelled.');
      if (p.overlap < THRESHOLDS.overlap) continue;
      const exact = splitClaims(p.quote).some(s => normalized(s.text) === normalized(claim.text)) && normalized(claim.text).length >= 12;
      const scores = exact ? null : await infer(p.quote, claim.text);
      const relation = exact || scores?.entailment >= THRESHOLDS.entailment ? 'supporting' : scores?.contradiction >= THRESHOLDS.contradiction ? 'contradicting' : 'related';
      const { words, ...publicPassage } = p;
      evidence.push({ ...publicPassage, scores, relation, method: exact ? 'exact' : 'nli' });
    }
    const arithmetic = arithmeticCheck(claim.text);
    const verdict = decide(evidence, arithmetic);
    const warning = safetyCue.test(claim.text) ? 'Potentially consequential instruction: review against source restrictions and applicable expert guidance. This flag is a language heuristic, not a safety verdict.' : null;
    const sourceCorrection = evidence.find(e => e.relation === 'contradicting');
    findings.push({ ...claim, ...verdict, evidence, checks: arithmetic ? [arithmetic] : [], warning,
      correction: arithmetic?.correction || (verdict.status === 'contradicted' && sourceCorrection ? sourceCorrection.quote : null),
      correctionKind: arithmetic ? 'arithmetic' : sourceCorrection ? 'source-excerpt' : null });
  }
  // Examine a bounded set of closely related answer pairs for internal inconsistency.
  const inconsistencies = [];
  let compared = 0;
  for (let i = 0; i < findings.length && compared < 12; i++) {
    for (let j = i + 1; j < findings.length && compared < 12; j++) {
      const a = new Set(tokens(findings[i].text)), b = new Set(tokens(findings[j].text));
      const common = [...a].filter(x => b.has(x)).length;
      if (common < 3 || common / Math.min(a.size || 1, b.size || 1) < 0.65) continue;
      if (cancelled()) throw new Error('Audit cancelled.');
      compared++; const score = await infer(findings[i].text, findings[j].text);
      if (score.contradiction >= 0.92) inconsistencies.push({ from: findings[i].id, to: findings[j].id, reason: 'These answer statements may conflict. Check their entities, dates, and qualifications.', score: score.contradiction });
    }
  }
  const counts = { supported: 0, contradicted: 0, insufficient: 0, ambiguous: 0 };
  findings.forEach(c => counts[c.status]++);
  progress({ done: findings.length, total: findings.length, stage: 'Audit complete' });
  return { claims: findings, counts, dependencies: dependencyHints(findings), inconsistencies, durationMs: Date.now() - started,
    engine: { model: MODEL, revision: REVISION, thresholds: THRESHOLDS, version: '1.0.0', sourcePassages: passages.length, internalPairsChecked: compared },
    limitations: ['English-focused sentence and clause checks; compound claims may need manual splitting.', 'BM25 retrieval checks up to four passages per claim and can miss paraphrases or distant context.', 'Model scores are uncalibrated signals, not probabilities of truth.', 'Source quality is not independently verified. Conclusions apply only to the supplied material.', 'Safety flags and dependency links are heuristics. Internal consistency checks cover up to 12 related pairs.'] };
}
