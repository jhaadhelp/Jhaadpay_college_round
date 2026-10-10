import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const { openDatabase } = await import('./db.js');
const { createApp } = await import('./app.js');
const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 3001);
if (!['127.0.0.1','localhost','::1'].includes(host) && !process.env.APP_PASSWORD) throw new Error('Set APP_PASSWORD before binding beyond localhost.');
const db = openDatabase();
const server = createApp({ db }).listen(port, host, () => console.log(`Second Opinion by Jhaad Labs is ready at http://${host}:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
