import { defineConfig, devices } from '@playwright/test';
import { resolveTarget, serverEnvironment } from './scripts/test-database.mjs';
import { randomUUID } from 'node:crypto';

const profile = process.env.BASELINE_PROFILE === 'production' ? 'production' : 'development';
process.env.STORYTELLER_RECOVERY_SECRET ??= randomUUID();
const target = resolveTarget();
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'e2e-12-access-boundaries.spec.ts',
  workers: 1, fullyParallel: false, retries: 0, timeout: 60_000,
  expect: { timeout: 10_000 }, globalSetup: './tests/e2e/global-setup.ts',
  reporter: [['list']],
  use: { baseURL: 'http://localhost:3100', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'security-chromium', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: process.env.BASELINE_DB_LEASE
      ? `npx tsx scripts/test-database.mts serve ${profile} security`
      : `npm run ${profile === 'production' ? 'start' : 'dev'} -- --port 3100`,
    env: serverEnvironment(target, profile, 'security') as Record<string, string>,
    url: 'http://localhost:3100', reuseExistingServer: false, timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
