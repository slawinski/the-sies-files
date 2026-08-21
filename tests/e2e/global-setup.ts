import { execSync } from "node:child_process";

// Playwright global setup: reset the E2E database before the run (audit spec
// 24 §2.2). Refuses non-test databases unless explicitly allowed.
export default async function globalSetup(): Promise<void> {
  const url =
    process.env.E2E_DATABASE_URL ??
    `postgresql://${process.env.USER || process.env.PGUSER || "postgres"}@localhost:5432/the_sies_files_test`;
  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, "");

  if (!dbName.includes("_test") && process.env.ALLOW_E2E_DB_RESET !== "1") {
    throw new Error(
      `Refusing to reset non-test database '${dbName}'. ` +
        "Set E2E_DATABASE_URL to a *_test database or ALLOW_E2E_DB_RESET=1 to override.",
    );
  }

  // Pass credentials via libpq env so dropdb/createdb work on any machine/CI.
  const pgEnv = {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGUSER: parsed.username || process.env.USER || "postgres",
    PGPASSWORD: parsed.password || "",
  };

  execSync(`dropdb --if-exists "${dbName}" && createdb "${dbName}"`, { stdio: "inherit", env: pgEnv });
  execSync(`DATABASE_URL='${url}' npx prisma migrate deploy`, {
    stdio: "inherit",
    cwd: process.cwd(),
    env: pgEnv,
  });
}
