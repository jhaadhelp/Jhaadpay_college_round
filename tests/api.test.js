import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
const input = { title: 'Test audit', answer: 'The study enrolled adults.', sources: [{ name: 'Paper', text: 'The study enrolled adults.' }] };
async function fixture(options = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'second-opinion-test-')), db = openDatabase(dir);
  const app = createApp({ db, runAudit: async () => ({ claims: [], counts: { supported: 1 } }), ...options });
  const server = app.listen(0, '127.0.0.1'); await new Promise(r => server.on('listening', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(url + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Tester', email: 'tester@example.com', password: 'a long test password' }) });
  const user = (await login.json()).user, cookie = login.headers.get('set-cookie').split(';')[0];
  return { db: db.scope(user.id), url, cookie, fetch: (route, options = {}) => fetch(url + route,{ ...options, headers: { ...options.headers, Cookie: cookie } }), close: async () => { await new Promise(r => server.close(r)); db.close(); rmSync(dir, { recursive: true, force: true }); } };
}
test('API persists, retrieves, lists and deletes an audit', async () => {
  const f = await fixture(); try {
    const response = await f.fetch('/api/audits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(response.status, 202); const { id } = await response.json();
    const result = await (await f.fetch('/api/audits/' + id)).json(); assert.equal(result.input.answer, input.answer); assert.equal(result.status, 'complete');
    assert.equal((await (await f.fetch('/api/audits')).json()).length, 1);
    assert.equal((await f.fetch('/api/audits/' + id, { method: 'DELETE' })).status, 200);
    assert.equal((await f.fetch('/api/audits/' + id)).status, 404);
  } finally { await f.close(); }
});
test('unauthenticated access is blocked and logout revokes the session', async () => {
  const f = await fixture(); try {
    assert.equal((await fetch(f.url + '/api/audits')).status, 401);
    assert.equal((await f.fetch('/api/audits')).status, 200);
    await f.fetch('/api/logout', { method: 'POST' });
    assert.equal((await f.fetch('/api/audits')).status, 401);
  } finally { await f.close(); }
});
test('cross-origin writes and malformed bodies are rejected', async () => {
  const f = await fixture(); try {
    assert.equal((await f.fetch('/api/audits', { method: 'POST', headers: { Origin: 'https://unrelated.example', 'Content-Type': 'application/json' }, body: JSON.stringify(input) })).status, 403);
    assert.equal((await f.fetch('/api/audits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' })).status, 400);
    assert.equal((await f.fetch('/api/audits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
  } finally { await f.close(); }
});
test('plain text uploads work; unsupported files are rejected', async () => {
  const f = await fixture(); try {
    const data = new FormData(); data.append('file', new Blob(['Verifiable source text.']), 'reference.txt');
    const r = await f.fetch('/api/extract', { method: 'POST', body: data }); assert.equal(r.status, 200); assert.equal((await r.json()).text, 'Verifiable source text.');
    const bad = new FormData(); bad.append('file', new Blob(['hello']), 'program.exe');
    assert.equal((await f.fetch('/api/extract', { method: 'POST', body: bad })).status, 400);
  } finally { await f.close(); }
});
test('server restart marks unfinished audits failed without losing their source', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'second-opinion-restart-'));
  let db = openDatabase(dir); db.createUser({ id: 'owner', email: 'owner@example.com', name: 'Owner' }); db.scope('owner').create('test-id', { ...input, claims: [{ text: input.answer }] }); db.close();
  db = openDatabase(dir); try { assert.equal(db.scope('owner').get('test-id').status, 'failed'); assert.equal(db.scope('owner').get('test-id').input.sources[0].text, input.sources[0].text); } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
