import { defineConfig, devices } from "@playwright/test";

// Portable E2E database configuration (audit spec 24 §2).
// No developer-specific account is hard-coded. `E2E_DATABASE_URL` is the
// explicit source; the local fallback is generic and clearly test-only.
function resolveDatabaseUrl(): string {
  const env = process.env.E2E_DATABASE_URL;
  if (env) {
    const url = new URL(env);
    const dbName = url.pathname.replace(/^\//, "");
    if (!dbName.includes("_test") && process.env.ALLOW_E2E_DB_RESET !== "1") {
      throw new Error(
        `E2E_DATABASE_URL must target a *_test database (got "${dbName}"). ` +
          "Set ALLOW_E2E_DB_RESET=1 to override for a dedicated throwaway database.",
      );
    }
    return env;
  }
  // Generic, clearly test-only local fallback using the OS user (no
  // developer-specific account hard-coded).
  const user = process.env.USER || process.env.PGUSER || "postgres";
  return `postgresql://${user}@localhost:5432/the_sies_files_test`;
}

const e2eDatabaseUrl = resolveDatabaseUrl();

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  // Serial execution: all specs share one PostgreSQL database (spec 24 §5.4 —
  // parallel execution only after isolation is proven).
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    // Test-only server: rate limiting disabled (limits are production-safe
    // defaults; the E2E suite intentionally exceeds anonymous-IP thresholds).
    command: `DATABASE_URL='${e2eDatabaseUrl}' RATE_LIMIT_DISABLED=1 npm run dev -- --port 3100`,
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
