// Deliberately transparent language rules; these do not replace NLI verdicts.
export function confidenceCues(claim) {
  const strong = /\b(proves?|proved|guarantees?|guaranteed|always|never|everyone|all|definitely|certainly|will)\b/gi;
  const weak = /\b(may|might|suggests?|could|some|preliminary|not measured|did not measure|no control|did not include a control)\b/i;
  if (claim.status === 'supported') return [];
  const words = [...new Set((claim.text.match(strong) || []).map(w => w.toLowerCase()))];
  if (!words.length) return [];
  const cautious = claim.evidence?.find(e => weak.test(e.quote));
  return [{ words, reason: cautious ? 'The claim uses certainty language while a retrieved passage contains qualifications. Check that they concern the same point.' : 'This claim uses certainty language without a supported verdict. Check whether its wording exceeds the available evidence.', quote: cautious?.quote || null }];
}

export function evidenceNeeded(claim) {
  if (claim.status === 'supported') return null;
  if (claim.status === 'ambiguous') return 'Resolve the competing passages: check their dates, populations, definitions, and methods. Explain which applies to this specific claim.';
  if (claim.checks?.length) return 'Check the original figures, units, and baseline; recalculate the result and re-audit the corrected sentence.';
  const text = claim.text.toLowerCase();
  if (/retention|long.term|follow.up/.test(text)) return 'Look for follow-up measurements over the claimed period, including who was measured and how retention was defined.';
  if (/prove|caus|because|led to|resulted/.test(text)) return 'Look for a study design that tests the claimed cause, including a comparison group and possible alternative explanations.';
  if (/will|next year|predict|future/.test(text)) return 'Look for a dated forecast with explicit assumptions and uncertainty. A forecast still cannot establish a future outcome as fact.';
  if (/children|adults|everyone|population/.test(text)) return 'Check participant eligibility and the actual population studied before extending the result to another group.';
  if (/launch|approval|ready|bypass/.test(text)) return 'Check documented release criteria and the relevant approval record before making a launch recommendation.';
  return 'Find a directly relevant passage that addresses this exact statement, with matching entities, dates, quantities, and qualifications. Re-audit when the evidence is available.';
}

export function coverageSegments(answer, claims) {
  const parts = []; let cursor = 0;
  for (const c of [...claims].sort((a,b) => a.start - b.start)) {
    if (!Number.isInteger(c.start) || !Number.isInteger(c.end) || c.start < cursor || c.end > answer.length || c.end <= c.start) continue;
    if (c.start > cursor) parts.push({ text: answer.slice(cursor, c.start) });
    parts.push({ text: answer.slice(c.start, c.end), claim: c }); cursor = c.end;
  }
  if (cursor < answer.length) parts.push({ text: answer.slice(cursor) });
  return parts;
}

