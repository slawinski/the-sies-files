import { defineConfig, devices } from '@playwright/test';
import { resolveTarget } from './scripts/test-database.mjs';

const target = resolveTarget();
const production = process.env.BASELINE_PROFILE === 'production';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: './tests/e2e/global-setup.ts',
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: process.env.BASELINE_DB_LEASE
      ? `npx tsx scripts/test-database.mts serve ${production ? 'production' : 'development'}`
      : production ? 'npm run start -- --port 3100' : 'npm run dev -- --port 3100',
    env: { ...target.env, NODE_ENV: production ? 'production' : 'development', RATE_LIMIT_DISABLED: '1' } as Record<string, string>,
    url: 'http://localhost:3100',
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
