const words = text => new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []));
export function matchClaims(before, after) {
  const unused = new Set(before.map((_, i) => i));
  const matches = after.map(current => {
    const exact = [...unused].find(i => before[i].text === current.text);
    if (exact !== undefined) { unused.delete(exact); return { before: before[exact], after: current, match: 'exact' }; }
    return { before: null, after: current, match: 'new' };
  });
  for (const row of matches.filter(x => !x.before)) {
    let best = null, score = .45;
    const a = words(row.after.text);
    for (const i of unused) {
      const b = words(before[i].text), common = [...a].filter(x => b.has(x)).length;
      const similarity = common / (a.size + b.size - common || 1);
      if (similarity > score) { best = i; score = similarity; }
    }
    if (best !== null) { unused.delete(best); row.before = before[best]; row.match = 'similar'; }
  }
  return [...matches, ...[...unused].map(i => ({ before: before[i], after: null, match: 'removed' }))];
}
