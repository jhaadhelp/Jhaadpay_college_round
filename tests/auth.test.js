import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { openDatabase } from '../server/db.js';
import { createApp } from '../server/app.js';
const password = 'a unique testing passphrase';
const input = { title: 'Private report', answer: 'Adults participated.', sources: [{ name: 'Private source', text: 'Adults participated.' }] };
async function fixture(auth = {}) {
  const dir = mkdtempSync(path.join(tmpdir(),'second-auth-')); let db,server,base;
  async function start() { db = openDatabase(dir); server = createApp({ db,auth,runAudit: async () => ({ claims: [{ id: 'c1',text: input.answer,status: 'supported' }] }) }).listen(0,'127.0.0.1'); await new Promise(r => server.on('listening',r)); base = `http://127.0.0.1:${server.address().port}`; }
  await start();
  const send = (route,data,token = '',method = 'POST',headers = {}) => fetch(base + route,{ method,redirect: 'manual',headers: { 'Content-Type': 'application/json',Cookie: token,...headers },...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
  return { dir, get db() { return db; },send,
    register: async email => { const r = await send('/api/auth/register',{ name: email.split('@')[0],email,password }); assert.equal(r.status,201); return { user: (await r.json()).user,cookie: r.headers.get('set-cookie').split(';')[0] }; },
    restart: async () => { await new Promise(r => server.close(r)); db.close(); await start(); },
    close: async () => { await new Promise(r => server.close(r)); db.close(); rmSync(dir,{ recursive: true,force: true }); }
  };
}
test('email accounts have unique IDs, salted hashes, persistent sessions, and revoked logout', async () => {
  const f = await fixture(); try {
    const a = await f.register('ALICE@example.com'), b = await f.register('bob@example.com');
    assert.notEqual(a.user.id,b.user.id); assert.equal(a.user.email,'alice@example.com'); assert.equal(a.user.password_hash,undefined);
    const stored = f.db.userByEmail('alice@example.com'); assert.match(stored.password_hash,/^scrypt\$/); assert.ok(!stored.password_hash.includes(password)); assert.notEqual(stored.password_hash,f.db.userByEmail('bob@example.com').password_hash);
    const raw = new DatabaseSync(path.join(f.dir,'audits.sqlite'));
    assert.notEqual(raw.prepare('SELECT token_hash FROM sessions LIMIT 1').get().token_hash,a.cookie.split('=')[1]); raw.close();
    assert.equal((await f.send('/api/auth/register',{ name: 'Duplicate',email: 'alice@EXAMPLE.com',password })).status,409);
    assert.equal((await f.send('/api/auth/login',{ email: a.user.email,password: 'wrong' })).status,401);
    assert.equal((await f.send('/api/auth/register',{ name: 'Short',email: 'short@example.com',password: 'short' })).status,400);
    await f.restart();
    assert.equal((await (await f.send('/api/session',undefined,a.cookie,'GET')).json()).user.id,a.user.id);
    const login = await f.send('/api/auth/login',{ email: a.user.email,password },a.cookie); assert.equal(login.status,200);
    const next = login.headers.get('set-cookie').split(';')[0]; assert.notEqual(next,a.cookie);
    assert.equal((await f.send('/api/audits',undefined,a.cookie,'GET')).status,401);
    await f.send('/api/logout',{},next); assert.equal((await f.send('/api/audits',undefined,next,'GET')).status,401);
  } finally { await f.close(); }
});
test('every workspace route rejects another user including guessed IDs and revision parents', async () => {
  const f = await fixture(); try {
    const a = await f.register('a@example.com'), b = await f.register('b@example.com');
    const { id } = await (await f.send('/api/audits',{ ...input,user_id: b.user.id },a.cookie)).json();
    const collection = await (await f.send('/api/collections',{ name: 'Private collection',sources: input.sources },a.cookie)).json();
    assert.equal((await f.send('/api/audits/'+id,undefined,a.cookie,'GET')).status,200);
    assert.deepEqual(await (await f.send('/api/audits',undefined,b.cookie,'GET')).json(),[]);
    assert.deepEqual(await (await f.send('/api/collections',undefined,b.cookie,'GET')).json(),[]);
    for (const [route,method,data] of [[`/api/audits/${id}`,'GET'],[`/api/audits/${id}`,'DELETE'],[`/api/audits/${id}/cancel`,'POST',{}],[`/api/audits/${id}/reviews/c1`,'PUT',{ verdict: 'contradicted',note: 'Overwrite' }],[`/api/collections/${collection.id}`,'DELETE']]) assert.equal((await f.send(route,data,b.cookie,method)).status,404,route);
    assert.equal((await f.send('/api/audits',{ ...input,parentId: id },b.cookie)).status,400);
    assert.equal((await f.send('/api/extract',{},'')).status,401);
    assert.equal(f.db.scope(a.user.id).get(id).reviews.length,0);
    assert.equal(f.db.scope(b.user.id).update(id,{ title: 'stolen',status: 'failed' }),0);
    assert.throws(() => f.db.scope(b.user.id).review(id,'c1','supported','stolen'));
    assert.equal(f.db.scope(a.user.id).collections().length,1);
  } finally { await f.close(); }
});
test('auth rejects cross-site writes, expires sessions, limits guesses and uses secure cookies', async () => {
  const f = await fixture({ secure: true }); try {
    assert.equal((await f.send('/api/auth/register',{ name: 'A',email: 'a@example.com',password },'','POST',{ Origin: 'https://evil.example' })).status,403);
    const a = await f.register('a@example.com');
    const login = await f.send('/api/auth/login',{ email: a.user.email,password });
    assert.match(login.headers.get('set-cookie'),/HttpOnly/); assert.match(login.headers.get('set-cookie'),/Secure/); assert.match(login.headers.get('set-cookie'),/SameSite=Lax/);
    f.db.saveSession(createHash('sha256').update('expired').digest('hex'),a.user.id,Date.now()-1000);
    assert.equal((await f.send('/api/audits',undefined,'so_session=expired','GET')).status,401);
    assert.equal((await f.send('/api/logout',{},a.cookie,'POST',{ 'Sec-Fetch-Site': 'cross-site' })).status,403);
    for (let i=0;i<11;i++) { const r=await f.send('/api/auth/login',{ email: 'guess@example.com',password: '' }); if (i===10) assert.equal(r.status,429); }
    assert.equal((await f.send('/api/auth/google',undefined,'','GET')).status,503);
  } finally { await f.close(); }
});
test('Google flow binds state to browser, verifies token/nonce, avoids email takeover and preserves subject identity', async () => {
  let authorize,tokenRequest,verification,identity, rejectVerification=false;
  const client = { generateAuthUrl(params) { authorize=params; return 'https://accounts.google.com/test'; },async getToken(params) { tokenRequest=params; return { tokens: { id_token: 'signed-token' } }; },async verifyIdToken(params) { verification=params; if(rejectVerification) throw Error('invalid signature'); return { getPayload: () => identity }; } };
  const f = await fixture({ publicOrigin: 'https://audit.example.com',google: { clientId: 'test-client',clientSecret: 'test-secret' },googleClient: client });
  async function begin() { const r=await f.send('/api/auth/google',undefined,'','GET'); assert.equal(r.status,302); return { cookie:r.headers.get('set-cookie').split(';')[0],state:authorize.state,nonce:authorize.nonce }; }
  const finish = p => f.send(`/api/auth/google/callback?state=${p.state}&code=code`,undefined,p.cookie,'GET');
  try {
    const p=await begin(); identity={ sub:'google-123',email:'google@example.com',email_verified:true,name:'Google User',nonce:p.nonce };
    assert.match((await finish({ ...p,cookie:'so_oauth=other-browser' })).headers.get('location'),/google_failed/);
    const r=await finish(p); assert.equal(r.headers.get('location'),'/'); assert.deepEqual(verification,{ idToken:'signed-token',audience:'test-client' });
    assert.equal(createHash('sha256').update(tokenRequest.codeVerifier).digest('base64url'),authorize.code_challenge); assert.equal(tokenRequest.redirect_uri,'https://audit.example.com/api/auth/google/callback');
    const session=await (await f.send('/api/session',undefined,r.headers.getSetCookie().find(c=>c.startsWith('so_session=')).split(';')[0],'GET')).json(); assert.equal(session.user.provider,'google');
    assert.match((await finish(p)).headers.get('location'),/google_failed/);
    for (const changed of [{nonce:'wrong'},{email_verified:false}]) { const q=await begin(); identity={ ...identity,nonce:q.nonce,email_verified:true,...changed }; assert.match((await finish(q)).headers.get('location'),/google_failed/); }
    const q=await begin(); identity={ ...identity,nonce:q.nonce,email_verified:true,email:'renamed@example.com' }; const again=await finish(q); assert.equal(again.headers.get('location'),'/'); assert.equal(f.db.userByGoogle('google-123').id,session.user.id);
    const local=await f.register('local@example.com'),collision=await begin(); identity={ sub:'different-sub',email:local.user.email,email_verified:true,nonce:collision.nonce }; assert.match((await finish(collision)).headers.get('location'),/account_exists/); assert.equal(f.db.userByEmail(local.user.email).google_sub,null);
    const invalid=await begin(); identity={ ...identity,nonce:invalid.nonce }; rejectVerification=true; assert.match((await finish(invalid)).headers.get('location'),/google_failed/);
  } finally { await f.close(); }
});
test('legacy shared data is retained privately until explicitly assigned; migration is repeatable', () => {
  const dir=mkdtempSync(path.join(tmpdir(),'second-legacy-'));
  const old=new DatabaseSync(path.join(dir,'audits.sqlite'));
  old.exec('CREATE TABLE audits (id TEXT PRIMARY KEY,title TEXT NOT NULL,created_at TEXT NOT NULL,status TEXT NOT NULL,input TEXT NOT NULL,result TEXT,error TEXT,progress TEXT); CREATE TABLE collections (id TEXT PRIMARY KEY,name TEXT NOT NULL,sources TEXT NOT NULL,created_at TEXT NOT NULL);');
  old.prepare('INSERT INTO audits (id,title,created_at,status,input) VALUES (?,?,?,?,?)').run('legacy','Old audit','2026-01-01','complete',JSON.stringify(input));
  old.prepare('INSERT INTO collections VALUES (?,?,?,?)').run('old-source','Old collection',JSON.stringify(input.sources),'2026-01-01'); old.close();
  let db=openDatabase(dir); try {
    db.createUser({ id:'owner',email:'owner@example.com',name:'Owner' }); db.createUser({ id:'other',email:'other@example.com',name:'Other' });
    assert.deepEqual(db.scope('owner').list(),[]); assert.equal(db.scope('other').get('legacy'),null);
    assert.throws(()=>db.assignLegacy('missing@example.com'));
    assert.deepEqual(db.assignLegacy('owner@example.com'),{ audits:1,collections:1 });
    assert.equal(db.scope('owner').get('legacy').input.sources[0].text,input.sources[0].text); assert.deepEqual(db.scope('other').collections(),[]);
    db.close(); db=openDatabase(dir); assert.deepEqual(db.assignLegacy('other@example.com'),{ audits:0,collections:0 }); assert.equal(db.scope('owner').list().length,1);
  } finally { db.close(); rmSync(dir,{recursive:true,force:true}); }
});
