import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const { openDatabase } = await import('./db.js');
const { createApp } = await import('./app.js');
const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 3001);
if (!['127.0.0.1','localhost','::1'].includes(host)) {
  const origin = new URL(process.env.PUBLIC_ORIGIN || 'http://invalid');
  if (origin.protocol !== 'https:' || origin.origin !== process.env.PUBLIC_ORIGIN || process.env.SECURE_COOKIE !== '1') throw new Error('Public hosting requires an exact HTTPS PUBLIC_ORIGIN and SECURE_COOKIE=1.');
}
const db = openDatabase();
const server = createApp({ db }).listen(port, host, () => console.log(`Second Opinion by Jhaad Labs is ready at http://${host}:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
