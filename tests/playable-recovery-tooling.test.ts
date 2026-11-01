import { expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { completeClaims, derivedTarget, ownedDatabase, REQUIRED_CLAIMS } from "../scripts/playable-recovery.mjs";
import { resolveTarget } from "../scripts/test-database.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { virtualRecovery } from './helpers/recovery-virtual';

it.each(['recorded', 'standalone'] as const)('proves unchanged final identity in %s mode', async mode => {
  const result = await virtualRecovery(mode, 'none');
  expect(result.passed).toBe(true);
  expect(result.report.fingerprint).toEqual({ complete: true });
  expect(result.report.cleanup).toEqual({ complete: true, failed: [] });
  expect(result.liveChildren).toBe(0);
  expect(result.privateFiles).toEqual([]);
});

it.each([
  ['recorded', 'artifact'], ['standalone', 'artifact'], ['standalone', 'source'], ['standalone', 'test'],
  ['recorded', 'lock'], ['recorded', 'schema'], ['recorded', 'migration'],
  ['standalone', 'missing-artifact'], ['standalone', 'unreadable-artifact'],
] as const)('rejects late %s %s drift after worker completion and app shutdown', async (mode, mutation) => {
  const result = await virtualRecovery(mode, mutation);
  expect(result.events.indexOf('late-mutation')).toBeGreaterThan(result.events.indexOf('worker-complete'));
  expect(result.passed).toBe(false);
  expect(result.report.complete).toBe(false);
  expect(result.report.failureStage).toBe('fingerprint');
  expect(result.report.fingerprint?.complete).toBe(false);
  expect(result.serialized).not.toContain('private-secret-row');
  expect(result.report.cleanup).toEqual({ complete: true, failed: [] });
  expect(result.events.filter(e => e.startsWith('dropdb:'))).toHaveLength(2);
  expect(result.events.filter(e => e === 'release-lease')).toHaveLength(2);
  expect(result.liveChildren).toBe(0);
  expect(result.privateFiles).toEqual([]);
});

it('checks the standalone captured working source, not later checkout edits', async () => {
  const result = await virtualRecovery('standalone', 'checkout');
  expect(result.passed).toBe(true);
  expect(result.report.fingerprint).toEqual({ complete: true });
});

it('preserves an earlier dump failure without completion while recording fingerprint failure and cleaning', async () => {
  const result = await virtualRecovery('standalone', 'unreadable-artifact', true);
  expect(result.passed).toBe(false);
  expect(result.report.failureStage).toBe('dump');
  expect(result.report.failure).toBe('pg_dump failed (exit 1)');
  expect(result.report.fingerprint).toEqual({ complete: false, failure: 'Recovery stage failed; private details withheld' });
  expect(result.serialized).not.toContain('private-secret-row');
  expect(result.report.cleanup).toEqual({ complete: true, failed: [] });
  expect(result.events.filter(e => e.startsWith('dropdb:'))).toHaveLength(1);
  expect(result.events.filter(e => e === 'release-lease')).toHaveLength(2);
  expect(result.liveChildren).toBe(0);
  expect(result.privateFiles).toEqual([]);
});

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

it("refuses cleanup when ownership changes, without dropping the created database", () => {
  const target = derivedTarget(resolveTarget(), "target");
  const owned = ownedDatabase(target);
  const file = path.join(os.tmpdir(), 'sies-baseline-' + createHash('sha256').update(target.key).digest('hex') + '.lock');
  const original = fs.readFileSync(file, 'utf8');
  try {
    owned.create();
    fs.writeFileSync(file, JSON.stringify({ token: 'different-owner', pid: process.pid }));
    expect(() => owned.cleanup()).toThrow('ownership');
    expect(owned.created).toBe(true);
    const r = spawnSync('psql', ['-XAtc', 'SELECT current_database()'], { env: target.env, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(target.database);
  } finally { fs.writeFileSync(file, original); owned.cleanup(); }
});

it.each([undefined, "postgresql://user:secret@remote.invalid/data_test", "postgresql://user:secret@127.0.0.1/data_test?host=remote.invalid"])("refuses unsafe input without credential disclosure", (url) => {
  const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/playable-recovery.mts"], {
    env: { PATH: process.env.PATH, NODE_ENV: "test", ...(url ? { DATABASE_URL: url } : {}) }, encoding: "utf8",
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).not.toContain("secret");
  expect(result.stderr).not.toContain("remote.invalid");
});

it("refuses a wrong PostgreSQL tool major before connecting or allocating", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recovery-wrong-tools-'));
  try {
    fs.writeFileSync(path.join(dir, 'psql'), '#!/bin/sh\nprintf "psql (PostgreSQL) 15.0\\n"\n', { mode: 0o700 });
    const result = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'scripts/playable-recovery.mts', '--output', path.join(dir, 'output')], {
      env: { PATH: dir, NODE_ENV: 'test', DATABASE_URL: 'postgresql://user:secret@127.0.0.1:1/unavailable_test' }, encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Recovery preflight refused');
    expect(result.stderr).not.toContain('secret');
    expect(fs.existsSync(path.join(dir, 'output'))).toBe(false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
