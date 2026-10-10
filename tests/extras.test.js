import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
import { matchClaims } from '../src/comparison.js';
import { validateInput } from '../server/text.js';
const payload = { title: 'Initial', answer: 'The study enrolled adults.', sources: [{ name: 'Reference', text: 'The study enrolled adults.' }] };
async function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), 'second-opinion-extras-')), db = openDatabase(dir);
  const server = createApp({ db, password: '', runAudit: async () => ({ claims: [{ id: 'c1', text: payload.answer, status: 'supported' }], counts: { supported: 1 } }) }).listen(0, '127.0.0.1');
  await new Promise(r => server.on('listening', r)); const base = `http://127.0.0.1:${server.address().port}`;
  return { db, send: (route, data, method = 'POST') => fetch(base + route, { method, headers: { 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) }), close: async () => { await new Promise(r => server.close(r)); db.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test('review notes persist independently of original AI verdicts and are deleted with their audit', async () => {
  const f = await fixture(); try {
    const { id } = await (await f.send('/api/audits', payload)).json();
    const review = await f.send(`/api/audits/${id}/reviews/c1`, { verdict: 'ambiguous', note: 'The population needs clarification.' }, 'PUT');
    assert.equal(review.status, 200); const row = await review.json();
    assert.equal(row.result.claims[0].status, 'supported'); assert.equal(row.reviews[0].verdict, 'ambiguous'); assert.match(row.reviews[0].note, /population/);
    assert.equal((await f.send(`/api/audits/${id}/reviews/c99`, { verdict: 'supported', note: '' }, 'PUT')).status, 400);
    assert.equal((await f.send(`/api/audits/${id}/reviews/c1`, { verdict: 'fake', note: '' }, 'PUT')).status, 400);
    assert.equal((await f.send(`/api/audits/${id}/reviews/c1`, { verdict: 'supported', note: 'x'.repeat(2001) }, 'PUT')).status, 400);
    assert.equal((await f.send(`/api/audits/${id}`, null, 'DELETE')).status, 200);
    assert.equal(f.db.get(id), null);
  } finally { await f.close(); }
});
test('source collections retain sources, validate sizes and can be removed', async () => {
  const f = await fixture(); try {
    const result = await f.send('/api/collections', { name: 'Pilot documents', sources: payload.sources }); assert.equal(result.status, 201);
    const { id } = await result.json(); const list = await (await f.send('/api/collections', null, 'GET')).json();
    assert.equal(list[0].sources[0].text, payload.sources[0].text);
    assert.equal((await f.send('/api/collections', { name: '', sources: payload.sources })).status, 400);
    assert.equal((await f.send('/api/collections', { name: 'Bad', sources: [] })).status, 400);
    assert.equal((await f.send('/api/collections/' + id, null, 'DELETE')).status, 200);
    assert.equal((await f.send('/api/collections/' + id, null, 'DELETE')).status, 404);
  } finally { await f.close(); }
});
test('revisions link to an existing audit and reject missing parents', async () => {
  const f = await fixture(); try {
    const { id } = await (await f.send('/api/audits', payload)).json();
    const { id: revised } = await (await f.send('/api/audits', { ...payload, parentId: id })).json();
    assert.equal(f.db.get(revised).input.parentId, id);
    assert.equal((await f.send('/api/audits', { ...payload, parentId: 'not-found' })).status, 400);
  } finally { await f.close(); }
});
test('comparison matches unchanged text before pairing edited claims, including reordered sentences', () => {
  const before = [{ id: 'c1', text: 'The study included 120 adults.', status: 'supported' }, { id: 'c2', text: 'Users grew by 30 percent.', status: 'contradicted' }];
  const after = [{ id: 'c1', text: 'Users grew by 20 percent.', status: 'supported' }, { id: 'c2', text: 'The study included 120 adults.', status: 'supported' }, { id: 'c3', text: 'Revenue rose.', status: 'insufficient' }];
  const rows = matchClaims(before, after); assert.equal(rows[0].before.id, 'c2'); assert.equal(rows[0].match, 'similar'); assert.equal(rows[1].match, 'exact'); assert.equal(rows[2].match, 'new');
});
test('comparison preserves removed claims instead of misaligning by index', () => {
  const rows = matchClaims([{ text: 'Cats are mammals.' }, { text: 'Solar panels produce energy.' }], [{ text: 'Cats are mammals.' }]);
  assert.equal(rows[1].match, 'removed'); assert.equal(rows[1].after, null);
});
test('validation preserves parent linkage but strips unrelated user fields', () => {
  const result = validateInput({ ...payload, parentId: 'prior-audit', admin: true }); assert.equal(result.parentId, 'prior-audit'); assert.equal(result.admin, undefined);
});
