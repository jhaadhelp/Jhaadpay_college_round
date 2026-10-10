import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
export function openDatabase(directory = process.env.DATA_DIR || './data') {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'audits.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT, google_sub TEXT UNIQUE, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_states (state_hash TEXT PRIMARY KEY, browser_hash TEXT NOT NULL, nonce TEXT NOT NULL, verifier TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS audits (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, status TEXT NOT NULL, input TEXT NOT NULL, result TEXT, error TEXT, progress TEXT);
    CREATE TABLE IF NOT EXISTS reviews (audit_id TEXT NOT NULL REFERENCES audits(id) ON DELETE CASCADE, claim_id TEXT NOT NULL, verdict TEXT NOT NULL, note TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (audit_id, claim_id));
    CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, name TEXT NOT NULL, sources TEXT NOT NULL, created_at TEXT NOT NULL);`);
  // Shared records stay unassigned until an operator explicitly migrates them.
  for (const table of ['audits', 'collections']) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === 'user_id')) db.exec(`ALTER TABLE ${table} ADD COLUMN user_id TEXT REFERENCES users(id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS ${table}_owner ON ${table}(user_id)`);
  }
  db.prepare("UPDATE audits SET status='failed', error='Server restarted before the audit finished. Run it again.' WHERE status IN ('queued','running')").run();
  const parse = row => row ? { ...row, input: JSON.parse(row.input), result: row.result ? JSON.parse(row.result) : null, progress: row.progress ? JSON.parse(row.progress) : null, reviews: db.prepare('SELECT claim_id,verdict,note,updated_at FROM reviews WHERE audit_id=?').all(row.id) } : null;
  return {
    userByEmail(email) { return db.prepare('SELECT * FROM users WHERE email=?').get(email); },
    userByGoogle(sub) { return db.prepare('SELECT * FROM users WHERE google_sub=?').get(sub); },
    createUser({ id, email, name, passwordHash = null, googleSub = null }) { db.prepare('INSERT INTO users (id,email,name,password_hash,google_sub,created_at) VALUES (?,?,?,?,?,?)').run(id,email,name,passwordHash,googleSub,new Date().toISOString()); return db.prepare('SELECT * FROM users WHERE id=?').get(id); },
    saveSession(hash, userId, expires) { db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now()); db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash,userId,expires); },
    sessionUser(hash) { return db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?').get(hash,Date.now()); },
    removeSession(hash) { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash); },
    saveOAuth(state, browser, nonce, verifier, expires) { db.prepare('DELETE FROM oauth_states WHERE expires_at<=?').run(Date.now()); db.prepare('INSERT INTO oauth_states VALUES (?,?,?,?,?)').run(state,browser,nonce,verifier,expires); },
    takeOAuth(state, browser) { return db.prepare('DELETE FROM oauth_states WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING *').get(state,browser,Date.now()); },
    scope(userId) {
      if (!userId) throw new Error('A workspace owner is required.');
      const get = id => parse(db.prepare('SELECT * FROM audits WHERE id=? AND user_id=?').get(id,userId));
      return {
        create(id, input) { db.prepare('INSERT INTO audits (id,title,created_at,status,input,progress,user_id) VALUES (?,?,?,?,?,?,?)').run(id,input.title,new Date().toISOString(),'queued',JSON.stringify(input),JSON.stringify({ done: 0,total: input.claims.length,stage: 'Waiting for the checker' }),userId); },
        update(id, patch) { const entries = Object.entries(patch).filter(([k]) => ['status','result','error','progress'].includes(k)); if (!entries.length) return; return db.prepare(`UPDATE audits SET ${entries.map(([k]) => `${k}=?`).join(',')} WHERE id=? AND user_id=?`).run(...entries.map(([k,v]) => ['result','progress'].includes(k) ? JSON.stringify(v) : v),id,userId).changes; },
        get,
        list() { return db.prepare('SELECT id,title,created_at,status,error FROM audits WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(userId); },
        remove(id) { return db.prepare('DELETE FROM audits WHERE id=? AND user_id=?').run(id,userId).changes; },
        review(auditId, claimId, verdict, note) { if (!get(auditId)) throw new Error('Audit not found.'); db.prepare('INSERT INTO reviews (audit_id,claim_id,verdict,note,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(audit_id,claim_id) DO UPDATE SET verdict=excluded.verdict,note=excluded.note,updated_at=excluded.updated_at').run(auditId,claimId,verdict,note,new Date().toISOString()); },
        collections() { return db.prepare('SELECT id,name,sources,created_at FROM collections WHERE user_id=? ORDER BY created_at DESC').all(userId).map(row => ({ ...row,sources: JSON.parse(row.sources) })); },
        saveCollection(id,name,sources) { db.prepare('INSERT INTO collections (id,name,sources,created_at,user_id) VALUES (?,?,?,?,?)').run(id,name,JSON.stringify(sources),new Date().toISOString(),userId); },
        removeCollection(id) { return db.prepare('DELETE FROM collections WHERE id=? AND user_id=?').run(id,userId).changes; }
      };
    },
    assignLegacy(email) {
      const user = db.prepare('SELECT id FROM users WHERE email=?').get(email);
      if (!user) throw new Error('Create the destination account before migrating shared work.');
      db.exec('BEGIN IMMEDIATE');
      try { const audits = db.prepare('UPDATE audits SET user_id=? WHERE user_id IS NULL').run(user.id).changes; const collections = db.prepare('UPDATE collections SET user_id=? WHERE user_id IS NULL').run(user.id).changes; db.exec('COMMIT'); return { audits,collections }; } catch(e) { db.exec('ROLLBACK'); throw e; }
    },
    close() { db.close(); }
  };
}
