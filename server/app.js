import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { installAuth } from './auth.js';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { validateInput, LIMITS } from './text.js';
import { audit } from './audit.js';
import { modelState } from './model.js';
import { extract } from './extract.js';
export function createApp({ db, runAudit = audit, auth = {}, dist = path.resolve('dist') }) {
  const app = express(), cancelled = new Set(), queue = [];
  const trustedOrigins = new Set([
    process.env.PUBLIC_ORIGIN,
    process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ? `https://${process.env.CODESPACE_NAME}-${process.env.PORT || 3001}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}` : null
  ].filter(Boolean));
  let running = false;
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY.split(',').map(v => v.trim()));
  app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' }); next(); });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    // Same-origin write requests only; no permissive CORS or cross-site cookies.
    if (req.get('sec-fetch-site') === 'cross-site' && !['GET','HEAD','OPTIONS'].includes(req.method)) return res.status(403).json({ error: 'Cross-site requests are not allowed.' });
    const origin = req.get('origin');
    if (!['GET','HEAD','OPTIONS'].includes(req.method) && origin) {
      try { if (!trustedOrigins.has(origin) && origin !== `${req.protocol}://${req.get('host')}` && !(new URL(origin).hostname === '127.0.0.1' && req.get('host') === '127.0.0.1:3001' && new URL(origin).port === '5173')) return res.status(403).json({ error: 'Cross-origin writes are not allowed.' }); } catch { return res.status(403).json({ error: 'Invalid origin.' }); }
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  const requireUser = installAuth(app, { db, ...auth });
  app.get('/api/health', (req, res) => res.json(req.user ? { ok: true, model: modelState, limits: LIMITS } : { ok: true }));
  app.use('/api', requireUser, (req,res,next) => { req.workspace = db.scope(req.user.id); next(); });
  app.get('/api/audits', (req, res) => res.json(req.workspace.list()));
  app.get('/api/audits/:id', (req, res) => { const item = req.workspace.get(req.params.id); item ? res.json(item) : res.status(404).json({ error: 'Audit not found.' }); });
  app.put('/api/audits/:id/reviews/:claimId', (req, res) => {
    const row = req.workspace.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Audit not found.' });
    if (row.status !== 'complete' || !row.result?.claims.some(c => c.id === req.params.claimId)) return res.status(400).json({ error: 'Choose a claim from a completed audit.' });
    const { verdict, note } = req.body || {};
    if (!['unreviewed','supported','contradicted','insufficient','ambiguous'].includes(verdict) || typeof note !== 'string' || note.length > 2000) return res.status(400).json({ error: 'Choose a valid verdict and keep notes under 2,000 characters.' });
    req.workspace.review(row.id, req.params.claimId, verdict, note.trim()); res.json(req.workspace.get(row.id));
  });
  app.get('/api/collections', (req, res) => res.json(req.workspace.collections()));
  app.post('/api/collections', (req, res) => {
    try {
      if (req.workspace.collections().length >= 50) return res.status(400).json({ error: 'You can save up to 50 collections. Remove an unused one first.' });
      if (typeof req.body.name !== 'string' || !req.body.name.trim() || req.body.name.length > 100) return res.status(400).json({ error: 'Enter a collection name of 1–100 characters.' });
      const { sources } = validateInput({ answer: 'Collection validation.', sources: req.body.sources });
      const id = randomUUID(); req.workspace.saveCollection(id, req.body.name.trim(), sources); res.status(201).json({ id });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.delete('/api/collections/:id', (req, res) => req.workspace.removeCollection(req.params.id) ? res.json({ ok: true }) : res.status(404).json({ error: 'Collection not found.' }));
  const pump = async () => {
    if (running) return; running = true;
    while (queue.length) {
      const { id, input, userId } = queue.shift();
      const workspace = db.scope(userId);
      if (cancelled.has(id)) { cancelled.delete(id); continue; }
      workspace.update(id, { status: 'running' });
      try {
        const result = await runAudit(input, { progress: p => workspace.update(id, { progress: p }), cancelled: () => cancelled.has(id) });
        if (!cancelled.has(id)) workspace.update(id, { status: 'complete', result });
      } catch (e) { if (!cancelled.has(id)) workspace.update(id, { status: 'failed', error: e.message }); }
      finally { cancelled.delete(id); }
    }
    running = false;
  };
  app.post('/api/audits', (req, res) => {
    try {
      if (queue.length >= 3) return res.status(429).json({ error: 'The checker is busy. Wait for an audit to finish.' });
      const input = validateInput(req.body), id = randomUUID();
      if (input.parentId && !req.workspace.get(input.parentId)) return res.status(400).json({ error: 'The earlier audit was deleted. Start a new audit to continue.' });
      req.workspace.create(id, input); queue.push({ id, input, userId: req.user.id });
      res.status(202).json({ id }); void pump();
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post('/api/audits/:id/cancel', (req, res) => {
    const row = req.workspace.get(req.params.id); if (!row) return res.status(404).json({ error: 'Audit not found.' });
    if (['queued','running'].includes(row.status)) { cancelled.add(row.id); req.workspace.update(row.id, { status: 'cancelled', error: 'Cancelled by you.' }); }
    res.json({ ok: true });
  });
  app.delete('/api/audits/:id', (req, res) => {
    const row = req.workspace.get(req.params.id); if (!row) return res.status(404).json({ error: 'Audit not found.' });
    if (['queued','running'].includes(row.status)) return res.status(409).json({ error: 'Cancel the running audit before deleting it.' });
    req.workspace.remove(row.id); res.json({ ok: true });
  });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.fileBytes, files: 1, fields: 0 } });
  app.post('/api/extract', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose a file.' });
    try { res.json(await extract(req.file)); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  if (existsSync(dist)) { app.use(express.static(dist)); app.get('/{*path}', (req, res) => res.sendFile(path.join(dist, 'index.html'))); }
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the 8 MB limit.' : 'Upload one file at a time.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON request.' });
    res.status(500).json({ error: 'The server could not finish this request.' });
  });
  return app;
}
