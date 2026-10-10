import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
const { openDatabase } = await import('../server/db.js');
const email = process.argv[2]?.trim().toLowerCase();
if (!email || process.argv[3] !== '--confirm') {
  console.error('Stop the app and back up the data directory first. Then run: node scripts/assign-legacy-workspace.js owner@example.com --confirm');
  process.exit(1);
}
const db = openDatabase();
try { console.log('Assigned previously shared work:', db.assignLegacy(email)); }
finally { db.close(); }
