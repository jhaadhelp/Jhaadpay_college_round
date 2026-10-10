import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
export function openDatabase(directory = process.env.DATA_DIR || './data') {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'audits.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS audits (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL, input TEXT NOT NULL, result TEXT, error TEXT, progress TEXT);');
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS reviews (audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE, claim_id TEXT NOT NULL, verdict TEXT NOT NULL, note TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (audit_id, claim_id)); CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, name TEXT NOT NULL, sources TEXT NOT NULL, created_at TEXT NOT NULL);');
  db.prepare("UPDATE audits SET status='failed', error='Server restarted before the audit finished. Run it again.' WHERE status IN ('queued','running')").run();
  return {
    create(id, input) { db.prepare('INSERT INTO audits (id,title,created_at,status,input,progress) VALUES (?,?,?,?,?,?)').run(id, input.title, new Date().toISOString(), 'queued', JSON.stringify(input), JSON.stringify({ done: 0, total: input.claims.length, stage: 'Waiting for the checker' })); },
    update(id, patch) { const allowed = ['status', 'result', 'error', 'progress']; const entries = Object.entries(patch).filter(([k]) => allowed.includes(k)); if (!entries.length) return; db.prepare(`UPDATE audits SET ${entries.map(([k]) => `${k}=?`).join(',')} WHERE id=?`).run(...entries.map(([k,v]) => ['result','progress'].includes(k) ? JSON.stringify(v) : v), id); },
    get(id) { const row = db.prepare('SELECT * FROM audits WHERE id=?').get(id); return row ? { ...row, input: JSON.parse(row.input), result: row.result ? JSON.parse(row.result) : null, progress: row.progress ? JSON.parse(row.progress) : null, reviews: db.prepare('SELECT claim_id,verdict,note,updated_at FROM reviews WHERE audit_id=?').all(id) } : null; },
    list() { return db.prepare('SELECT id,title,created_at,status,error FROM audits ORDER BY created_at DESC LIMIT 100').all(); },
    remove(id) { return db.prepare('DELETE FROM audits WHERE id=?').run(id).changes; },
    review(auditId, claimId, verdict, note) { db.prepare('INSERT INTO reviews (audit_id,claim_id,verdict,note,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(audit_id,claim_id) DO UPDATE SET verdict=excluded.verdict,note=excluded.note,updated_at=excluded.updated_at').run(auditId, claimId, verdict, note, new Date().toISOString()); },
    collections() { return db.prepare('SELECT * FROM collections ORDER BY created_at DESC').all().map(row => ({ ...row, sources: JSON.parse(row.sources) })); },
    saveCollection(id, name, sources) { db.prepare('INSERT INTO collections (id,name,sources,created_at) VALUES (?,?,?,?)').run(id, name, JSON.stringify(sources), new Date().toISOString()); },
    removeCollection(id) { return db.prepare('DELETE FROM collections WHERE id=?').run(id).changes; },
    close() { db.close(); }
  };
}
