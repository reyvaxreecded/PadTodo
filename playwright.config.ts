import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env['E2E_BASE_URL'] || 'http://localhost:4000',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  reporter: 'list',
});
