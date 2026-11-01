import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { completeClaims, derivedTarget, ownedDatabase, REQUIRED_CLAIMS } from "../scripts/playable-recovery.mjs";
import { resolveTarget } from "../scripts/test-database.mjs";

it("refuses legacy backup arguments rather than treating them as destructive authorization", () => {
  const result = spawnSync("bash", ["scripts/backup-restore.sh", "existing_database", "another_database"], { encoding: "utf8", env: { PATH: process.env.PATH, NODE_ENV: "test" } });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Legacy positional arguments refused");
});

it("requires every independent claim, not merely archive restoration", () => {
  expect(completeClaims({ archiveRestoration: true })).toBe(false);
  const claims = Object.fromEntries(REQUIRED_CLAIMS.map(k => [k, true]));
  expect(completeClaims(claims)).toBe(true);
  delete claims.legalContinuation;
  expect(completeClaims(claims)).toBe(false);
});

it("leaves an existing database untouched after a create collision", () => {
  const target = derivedTarget(resolveTarget(), "target");
  const run = (exe: string, args: string[]) => {
    const r = spawnSync(exe, args, { env: target.env, encoding: "utf8" });
    expect(r.status).toBe(0);
    return r.stdout.trim();
  };
  run("createdb", [target.database]);
  const owned = ownedDatabase(target);
  try {
    expect(() => owned.create()).toThrow("createdb failed");
    expect(owned.created).toBe(false);
    owned.cleanup();
    expect(run("psql", ["-XAtc", "SELECT current_database()"])).toBe(target.database);
  } finally { run("dropdb", [target.database]); }
});

it("creates and cleans only a successfully allocated owned database", () => {
  const target = derivedTarget(resolveTarget(), "source");
  const owned = ownedDatabase(target);
  owned.create();
  expect(owned.created).toBe(true);
  owned.cleanup();
  expect(owned.created).toBe(false);
  const r = spawnSync("psql", ["-XAt", "--dbname=postgres", "-c", `SELECT datname FROM pg_database WHERE datname='${target.database}'`], { env: target.env, encoding: "utf8" });
  expect(r.status).toBe(0);
  expect(r.stdout.trim()).toBe("");
});

it.each([undefined, "postgresql://user:secret@remote.invalid/data_test", "postgresql://user:secret@127.0.0.1/data_test?host=remote.invalid"])("refuses unsafe input without credential disclosure", (url) => {
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/playable-recovery.mts"], {
    env: { PATH: process.env.PATH, NODE_ENV: "test", ...(url ? { DATABASE_URL: url } : {}) }, encoding: "utf8",
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).not.toContain("secret");
  expect(result.stderr).not.toContain("remote.invalid");
});
