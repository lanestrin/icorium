import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Browser tests run their own API and UI on separate ports with a fresh data folder,
// so they never touch the dev server or its data. Every run starts from the five samples.
process.env.RECLAIM_DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), 'reclaim-e2e-'));
const API_PORT = 3101;
const UI_PORT = 5199;

export default defineConfig({
  testDir: 'e2e',
  workers: 1, // one shared server; tests run in order
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalTeardown: './e2e/teardown.ts',
  use: {
    baseURL: `http://localhost:${UI_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'npx tsx server/src/index.ts',
      url: `http://localhost:${API_PORT}/api/files`,
      env: { PORT: String(API_PORT) },
      reuseExistingServer: false,
    },
    {
      command: `npm run dev -w client -- --port ${UI_PORT} --strictPort`,
      url: `http://localhost:${UI_PORT}`,
      env: { API_URL: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
    },
  ],
});
