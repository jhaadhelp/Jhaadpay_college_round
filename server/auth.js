import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { OAuth2Client } from 'google-auth-library';
const derive = promisify(scrypt), lifetime = 12 * 60 * 60 * 1000;
const digest = value => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const cookie = (req, name) => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) || '';
const publicUser = user => user ? { id: user.id, name: user.name, email: user.email, provider: user.google_sub ? 'google' : 'email' } : null;
export const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = value => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = await derive(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 });
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [,salt,hash] = (stored || '').split('$');
  const actual = await hashPassword(password, salt || '00000000000000000000000000000000');
  const bytes = Buffer.from(actual.split('$')[2], 'hex'), expected = Buffer.from(hash || '00'.repeat(64), 'hex');
  return !!stored && bytes.length === expected.length && timingSafeEqual(bytes, expected);
}
export function installAuth(app, { db, publicOrigin = process.env.PUBLIC_ORIGIN, secure = process.env.SECURE_COOKIE === '1', google = {}, googleClient } = {}) {
  const clientId = google.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = google.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = publicOrigin ? `${publicOrigin}/api/auth/google/callback` : null;
  const configured = !!(clientId && clientSecret && redirectUri);
  const client = configured ? googleClient || new OAuth2Client(clientId, clientSecret, redirectUri) : null;
  const options = { httpOnly: true, secure, sameSite: 'lax', path: '/' };
  const attempts = new Map(); let hashing = 0;
  const limited = req => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    if (attempts.size > 10000) return true;
    // Configure TRUST_PROXY only for the known reverse proxy to avoid spoofed IPs.
    const keys = [`ip:${req.ip}`];
    if (req.body?.email) keys.push(`email:${digest(normalizeEmail(req.body.email))}`);
    return keys.map(key => { const value = attempts.get(key) || { count: 0, until: now + 15 * 60000 }; value.count++; attempts.set(key,value); return value.count > (key.startsWith('ip:') ? 50 : 10); }).some(Boolean);
  };
  const beginSession = (req,res,user) => {
    db.removeSession(digest(cookie(req,'so_session')));
    const token = secret(); db.saveSession(digest(token),user.id,Date.now() + lifetime);
    res.cookie('so_session',token,{ ...options,maxAge: lifetime });
    return { authenticated: true, protected: true, googleEnabled: configured, user: publicUser(user) };
  };
  app.use('/api', (req,res,next) => { req.user = db.sessionUser(digest(cookie(req,'so_session'))); next(); });
  app.get('/api/session', (req,res) => res.json({ authenticated: !!req.user, protected: true, googleEnabled: configured, user: publicUser(req.user) }));
  for (const action of ['register','login']) app.post(`/api/auth/${action}`, async (req,res) => {
    if (limited(req)) return res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
    const email = normalizeEmail(req.body?.email), password = req.body?.password, name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!validEmail(email) || typeof password !== 'string' || password.length > 128 || !password.length) return res.status(400).json({ error: 'Enter a valid email and a password of up to 128 characters.' });
    if (action === 'register' && (password.length < 15 || !name || name.length > 80)) return res.status(400).json({ error: 'Enter your name (up to 80 characters) and a password of at least 15 characters.' });
    if (hashing >= 2) return res.status(429).json({ error: 'Sign-in is busy. Please try again shortly.' });
    hashing++;
    try {
      let user = db.userByEmail(email);
      if (action === 'register') {
        const passwordHash = await hashPassword(password);
        if (user) return res.status(409).json({ error: 'An account already uses this email. Sign in using its original method.' });
        try { user = db.createUser({ id: randomUUID(),email,name,passwordHash }); }
        catch(e) { if (db.userByEmail(email)) return res.status(409).json({ error: 'An account already uses this email. Sign in using its original method.' }); throw e; }
      } else if (!await verifyPassword(password,user?.password_hash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
      res.status(action === 'register' ? 201 : 200).json(beginSession(req,res,user));
    } finally { hashing--; }
  });
  app.post('/api/logout', (req,res) => { db.removeSession(digest(cookie(req,'so_session'))); res.clearCookie('so_session',options).json({ ok: true }); });
  app.get('/api/auth/google', (req,res) => {
    if (!configured) return res.status(503).json({ error: 'Google sign-in is not configured on this server yet.' });
    if (limited(req)) return res.status(429).json({ error: 'Too many sign-in attempts. Try again later.' });
    const state = secret(), browser = secret(), nonce = secret(), verifier = secret();
    db.saveOAuth(digest(state),digest(browser),nonce,verifier,Date.now() + 10 * 60000);
    res.cookie('so_oauth',browser,{ ...options,maxAge: 10 * 60000 });
    res.redirect(client.generateAuthUrl({ scope: ['openid','email','profile'],state,nonce,prompt: 'select_account',code_challenge: createHash('sha256').update(verifier).digest('base64url'),code_challenge_method: 'S256' }));
  });
  app.get('/api/auth/google/callback', async (req,res) => {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const pending = db.takeOAuth(digest(state),digest(cookie(req,'so_oauth')));
    res.clearCookie('so_oauth',options);
    const fail = code => res.redirect(`/?auth_error=${code}`);
    if (!configured || !pending || req.query.error || typeof req.query.code !== 'string') return fail('google_failed');
    try {
      const { tokens } = await client.getToken({ code: req.query.code,codeVerifier: pending.verifier,redirect_uri: redirectUri });
      if (!tokens.id_token) return fail('google_failed');
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token,audience: clientId });
      const identity = ticket.getPayload();
      // The library verifies Google's signature, issuer, audience and expiry.
      if (!identity || identity.nonce !== pending.nonce || !identity.sub || identity.email_verified !== true || !validEmail(normalizeEmail(identity.email))) return fail('google_failed');
      let user = db.userByGoogle(identity.sub);
      if (!user) {
        const email = normalizeEmail(identity.email);
        // Never merge an unverified password account just because emails match.
        if (db.userByEmail(email)) return fail('account_exists');
        user = db.createUser({ id: randomUUID(),email,name: String(identity.name || email.split('@')[0]).slice(0,80),googleSub: identity.sub });
      }
      beginSession(req,res,user); res.redirect('/');
    } catch { return fail('google_failed'); }
  });
  return (req,res,next) => req.user ? next() : res.status(401).json({ error: 'Sign in to your account to continue.' });
}
