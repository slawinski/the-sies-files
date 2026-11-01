import { defineConfig, devices } from '@playwright/test';

// Lifecycle belongs to the parent orchestrator. No reset or webServer fallback.
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'e2e-11-playable-recovery.spec.ts',
  workers: 1, fullyParallel: false, retries: 0, timeout: 180_000,
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://localhost:3100', trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'recovery-chromium', use: { ...devices['Pixel 7'] } }],
});
