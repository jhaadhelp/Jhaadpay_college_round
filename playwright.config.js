import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 180000, fullyParallel: false, workers: 1, retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://127.0.0.1:3101', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: { command: 'node server/index.js', url: 'http://127.0.0.1:3101/api/session', reuseExistingServer: false, timeout: 30000,
    env: { PORT: '3101', HOST: '127.0.0.1', DATA_DIR: `./.cache/browser-tests-${Date.now()}`, SECURE_COOKIE: '0', PUBLIC_ORIGIN: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', TRUST_PROXY: '' } }
});
