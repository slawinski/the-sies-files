import { afterAll, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient, Prisma } from "@prisma/client";
import { execute, restoreCheck, LifecycleFailure, type Options, type Hooks } from "../scripts/game-data-lifecycle.mjs";
import { canonical, families } from "../scripts/game-data-policy.mjs";
import { readPrivate, writePrivate } from "../scripts/game-data-journal.mjs";
import { prisma as applicationDb } from "@/lib/db";
import * as games from "@/modules/game-session/game-session.service";
import { hashToken } from "@/lib/auth/tokens";
import { POST as recoverPost } from "@/app/api/v1/storyteller/recover/route";
import { POST as heartbeatPost } from "@/app/api/v1/games/[gameId]/presence/heartbeat/route";
import { COOKIE_STORYTELLER_SESSION } from "@/lib/auth/cookies";

const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined,
  set: (name: string, value: string) => cookieJar.set(name, value),
  delete: (name: string) => cookieJar.delete(name),
}) }));

const url = process.env.DATABASE_URL!;
const db = new PrismaClient({ datasourceUrl: url });
const observerUrl = new URL(url); observerUrl.pathname = "/postgres";
const observer = new PrismaClient({ datasourceUrl: observerUrl.href });
const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "item7-u3-proof-"));
fs.chmodSync(dir, 0o700);
const secret = "SYNTHETIC_PRIVATE_NEVER_SERIALIZE";
const connection = new URL(url); connection.password = "";
const options = (game: string, label = randomUUID()): Options => ({ database: connection.href, game, plan: path.join(dir, label + ".plan.json"), journal: path.join(dir, label + ".intent.json"), receipt: path.join(dir, label + ".receipt.json"), request: randomUUID(), stoppedApplication: true });
afterAll(async () => { await disconnect(); await observer.$disconnect(); });
beforeEach(async () => {
  vi.restoreAllMocks(); vi.unstubAllEnvs(); cookieJar.clear();
  await db.$executeRaw`TRUNCATE game_retirements, game_sessions, domain_events, command_receipts, checkpoints, presence, rate_limit_buckets CASCADE`;
});

async function fixture() {
  const g = await db.gameSession.create({ data: { name: secret, status: "ENDED", archivedAt: new Date(), version: 3, eventSequence: 1 } });
  const p = await db.player.create({ data: { gameId: g.id, displayName: secret, virtualSeat: 1 } });
  const phase = await db.operationalPhase.create({ data: { gameId: g.id, cycleNumber: 1 } });
  const nomination = await db.nomination.create({ data: { gameId: g.id, cycleNumber: 1, nominatorId: p.id, nomineeId: p.id, sequence: 1 } });
  await db.playerClaim.create({ data: { playerId: p.id, tokenHash: secret + randomUUID(), expiresAt: new Date() } });
  await db.playerSecret.create({ data: { playerId: p.id, trueCharacterId: secret, abilityStateJson: { secret } } });
  await db.browserSession.createMany({ data: [{ playerId: p.id, sessionTokenHash: secret + randomUUID(), expiresAt: new Date() }, { storytellerGameId: g.id, sessionTokenHash: secret + randomUUID(), expiresAt: new Date() }] });
  await db.domainEvent.create({ data: { gameId: g.id, sequence: 1, gameVersion: 3, eventType: "PRIVATE", payload: { secret } } });
  await db.commandReceipt.create({ data: { gameId: g.id, commandId: randomUUID(), resultingVersion: 3, resultJson: { secret } } });
  await db.checkpoint.create({ data: { gameId: g.id, gameVersion: 3, lastEventSequence: 1, snapshotJson: { secret }, checksum: secret } });
  await db.setupDraft.create({ data: { gameId: g.id, generatorVersion: 1, seed: secret, candidateJson: { secret } } });
  await db.operationalAction.create({ data: { operationalPhaseId: phase.id, orderIndex: 1, kind: "PRIVATE", actorPlayerId: p.id, secretJson: { secret } } });
  await db.effect.create({ data: { gameId: g.id, effectType: secret, targetPlayerId: p.id, cycleNumber: 1, expiryBoundary: "NEVER" } });
  await db.investigationState.create({ data: { gameId: g.id, cycleNumber: 1 } });
  await db.vote.create({ data: { nominationId: nomination.id, playerId: p.id } });
  await db.deathRecord.create({ data: { gameId: g.id, playerId: p.id, cycleNumber: 1, phase: "PRIVATE", source: secret } });
  await db.scenarioState.create({ data: { gameId: g.id, stateJson: { secret } } });
  await db.qrScan.create({ data: { gameId: g.id, playerId: p.id, qrTokenId: secret, commandId: randomUUID() } });
  await db.scenarioDiscovery.create({ data: { gameId: g.id, playerId: p.id, objectId: secret, objectType: "PRIVATE", visibilityScope: secret, contentJson: { secret } } });
  await db.taskState.create({ data: { gameId: g.id, playerId: p.id, taskId: secret } });
  await db.scenarioCondition.create({ data: { gameId: g.id, playerId: p.id, conditionId: secret } });
  await db.presence.create({ data: { gameId: g.id, viewerId: p.id } });
  return { g, p, phase, nomination };
}
async function disconnect() {
  await applicationDb.$disconnect(); await db.$disconnect();
  // Client disconnect completion can precede PostgreSQL backend teardown.
  await vi.waitFor(async () => {
    const [sessions] = await observer.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM pg_stat_activity WHERE datname=${decodeURIComponent(new URL(url).pathname.slice(1))}`;
    if (sessions.count) fs.appendFileSync(path.join(dir, "backend-drain.jsonl"), JSON.stringify({ at: new Date().toISOString(), sessionsAfterClientDisconnect: Number(sessions.count) }) + "\n", { mode: 0o600 });
    expect(sessions.count).toBe(BigInt(0));
  });
}
async function run(mode: "plan" | "apply" | "reconcile", opts: Options, hooks: Hooks = {}) {
  await disconnect();
  try { return await execute(mode, opts, hooks); }
  catch (error) {
    if (error instanceof LifecycleFailure) {
      const message = `${error.message} [${error.report.stage}; ${error.report.state}]`;
      error.stack = error.stack?.replace(error.message, message);
      error.message = message;
    }
    throw error;
  }
}
function cli(mode: string, opts: Options) {
  const args = Object.entries(opts).flatMap(([key, value]) => key === "stoppedApplication" ? ["--stopped-application"] : ["--" + key, String(value)]);
  const result = spawnSync(path.join(process.cwd(), "node_modules/.bin/tsx"), ["scripts/game-data-lifecycle.mts", mode, ...args], { env: { ...process.env, DATABASE_URL: "deliberately-invalid-ambient", GAME_DATA_PASSWORD: new URL(url).password }, encoding: "utf8" });
  expect(result.stderr).not.toContain(secret);
  return { code: result.status, report: JSON.parse(result.stdout) };
}
async function allRows() {
  const rows: Record<string, unknown> = {};
  for (const table of [...families.map(f => f.table), "rate_limit_buckets"]) rows[table] = await db.$queryRaw(Prisma.sql`SELECT to_jsonb(t) AS row FROM ${Prisma.raw('public."' + table + '"')} t ORDER BY to_jsonb(t)::text`);
  return canonical(rows);
}

it("real CLI purges all 22 families, retaining the complete other game and global budget", async () => {
  const b = await fixture();
  await db.rateLimitBucket.create({ data: { key: secret, windowStart: new Date(), count: 9 } });
  const retained = await allRows();
  const selected = await fixture(); const actual = options(selected.g.id);
  await disconnect();
  expect(cli("plan", actual)).toMatchObject({ code: 0, report: { outcome: "planned" } });
  const plan = readPrivate(actual.plan) as { counts: Record<string, number> };
  expect(Object.keys(plan.counts)).toHaveLength(22);
  expect(Object.values(plan.counts).every(n => n > 0)).toBe(true);
  expect(cli("apply", actual)).toMatchObject({ code: 0, report: { outcome: "purged" } });
  expect(await allRows()).toBe(retained);
  expect(await db.gameSession.findUnique({ where: { id: b.g.id } })).not.toBeNull();
  expect(await db.gameRetirement.count()).toBe(1);
  for (const file of [actual.plan, actual.journal, actual.receipt]) expect(fs.readFileSync(file, "utf8")).not.toContain(secret);
  expect(JSON.stringify(await db.gameRetirement.findMany())).not.toContain(secret);
  await disconnect();
  expect(cli("apply", actual)).toMatchObject({ code: 0, report: { outcome: "reconciled" } });
  expect(await db.gameRetirement.count()).toBe(1);
  expect(await allRows()).toBe(retained);
});

it("read-only staging checks block old ACTIVE identities, pending evidence and mismatches without private rows", async () => {
  const { g } = await fixture(); const opts = options(g.id);
  await run("plan", opts); await run("apply", opts);
  const evidence = path.join(dir, randomUUID() + ".custody.json");
  writePrivate(evidence, { format: "game-retirement-custody/1", complete: true, entries: [{ journal: opts.journal, receipt: opts.receipt }] });
  const check = async () => { await disconnect(); return restoreCheck({ database: opts.database, evidence, unservedStaging: true }); };
  expect(await check()).toMatchObject({ outcome: "clear", conflictCount: 0 });
  // Characterizes a pre-retirement copy, independently of its later DB anchor.
  await db.gameRetirement.deleteMany();
  await db.gameSession.create({ data: { id: g.id, createdAt: g.createdAt, name: secret, status: "ACTIVE", phase: "INVESTIGATION" } });
  const before = await allRows();
  expect(await check()).toMatchObject({ outcome: "blocked", conflictCount: 1, conflicts: [{ game: g.id, kind: "committed" }] });
  expect(await allRows()).toBe(before);
  await db.gameSession.update({ where: { id: g.id }, data: { createdAt: new Date(0) } });
  const mismatch = await check();
  expect(mismatch).toMatchObject({ outcome: "blocked", conflicts: [{ kind: "immutable-identity-mismatch" }] });
  expect(JSON.stringify(mismatch)).not.toContain(secret);
  replacePrivate(evidence, v => { v.entries = [{ journal: opts.journal, receipt: null }]; });
  expect(await check()).toMatchObject({ outcome: "blocked", uncertainCount: 1 });
  await db.gameSession.deleteMany();
  expect(await check()).toMatchObject({ outcome: "blocked", uncertainCount: 1, conflictCount: 0 });
  for (const entries of [[{ journal: opts.journal, receipt: opts.receipt + ".missing" }], [{ journal: opts.plan, receipt: opts.receipt }]]) {
    replacePrivate(evidence, v => { v.entries = entries; });
    expect(await check()).toMatchObject({ outcome: "blocked", reason: "custody-or-staging-check-incomplete" });
  }
  replacePrivate(evidence, v => { v.complete = false; });
  expect(await check()).toMatchObject({ outcome: "blocked" });
  await disconnect();
  const result = spawnSync(path.join(process.cwd(), "node_modules/.bin/tsx"), ["scripts/game-data-lifecycle.mts", "restore-check", "--database", opts.database, "--evidence", evidence, "--unserved-staging"], { env: process.env, encoding: "utf8" });
  expect(result.status).toBe(1); expect(JSON.parse(result.stdout)).toMatchObject({ outcome: "blocked" });
});

it.each(["version", "sequence", "private", "session", "credential", "claim", "audit", "checkpoint", "presence", "archive"])("refuses same-selection drift: %s", async kind => {
  const { g, p } = await fixture(); const opts = options(g.id);
  await run("plan", opts);
  if (kind === "version") await db.gameSession.update({ where: { id: g.id }, data: { version: 4 } });
  if (kind === "sequence") await db.gameSession.update({ where: { id: g.id }, data: { eventSequence: 2 } });
  if (kind === "archive") await db.gameSession.update({ where: { id: g.id }, data: { archivedAt: null } });
  if (kind === "private") await db.playerSecret.update({ where: { playerId: p.id }, data: { abilityStateJson: { changed: secret } } });
  if (kind === "session") await db.browserSession.updateMany({ where: { playerId: p.id }, data: { revokedAt: new Date() } });
  if (kind === "credential") await db.browserSession.updateMany({ where: { playerId: p.id }, data: { sessionTokenHash: secret + "changed" } });
  if (kind === "claim") await db.playerClaim.update({ where: { playerId: p.id }, data: { tokenHash: secret + "changed" } });
  if (kind === "audit") await db.domainEvent.updateMany({ where: { gameId: g.id }, data: { payload: { changed: secret } } });
  if (kind === "checkpoint") await db.checkpoint.updateMany({ where: { gameId: g.id }, data: { snapshotJson: { changed: secret } } });
  if (kind === "presence") await db.presence.updateMany({ where: { gameId: g.id }, data: { lastSeenAt: new Date(0) } });
  await expect(run("apply", opts)).rejects.toThrow();
  expect(await db.gameSession.count()).toBe(1); expect(await db.gameRetirement.count()).toBe(0);
});

it("refuses real competing sessions without terminating them", async () => {
  const { g } = await fixture(); const opts = options(g.id); await run("plan", opts);
  await db.$queryRaw`SELECT 1`;
  await expect(execute("apply", opts)).rejects.toThrow();
  expect(await db.$queryRaw`SELECT 1`).toHaveLength(1);
  expect(await db.gameRetirement.count()).toBe(0);
});

it.each(["other-private", "global-budget"])("refuses same-count retained-state drift: %s", async kind => {
  const selected = await fixture(); const other = await fixture();
  const bucket = await db.rateLimitBucket.create({ data: { key: secret, windowStart: new Date(), count: 9 } });
  const opts = options(selected.g.id); await run("plan", opts);
  if (kind === "other-private") await db.playerSecret.update({ where: { playerId: other.p.id }, data: { abilityStateJson: { changed: secret } } });
  else await db.rateLimitBucket.update({ where: { id: bucket.id }, data: { count: 10 } });
  const before = await allRows(); const beforeDelete = vi.fn();
  await expect(run("apply", opts, { beforeDelete })).rejects.toThrow();
  expect(beforeDelete).not.toHaveBeenCalled(); expect(await allRows()).toBe(before); expect(await db.gameRetirement.count()).toBe(0);
});

it.each(["model", "column", "type"])("refuses an unreviewed source schema %s even for a fresh native CLI plan", async kind => {
  const { g } = await fixture(); const opts = options(g.id); const before = await allRows(); await disconnect();
  const file = path.join(process.cwd(), "prisma/schema.prisma"); const original = fs.readFileSync(file, "utf8");
  const changed = kind === "model" ? original + '\nmodel UnknownOwner {\n  id String @id\n}\n'
    : kind === "column" ? original.replace("model Player {", "model Player {\n  unknownPrivate String?")
    : original.replace("displayName        String", "displayName        Json");
  expect(changed).not.toBe(original);
  try {
    fs.writeFileSync(file, changed);
    expect(cli("plan", opts)).toMatchObject({ code: 1, report: { stage: "input", state: "not-deleted" } });
    expect(fs.existsSync(opts.plan)).toBe(false);
  } finally { fs.writeFileSync(file, original); }
  expect(await allRows()).toBe(before); expect(await db.gameRetirement.count()).toBe(0);
});

it("reconciles committed-but-unobserved deletion without selecting or deleting again", async () => {
  const { g } = await fixture(); const opts = options(g.id); await run("plan", opts);
  await expect(run("apply", opts, { afterCommit() { throw new Error(secret); } })).rejects.toThrow();
  expect(await db.gameSession.count()).toBe(0); expect(await db.gameRetirement.count()).toBe(1);
  expect(await run("reconcile", opts, { beforeDelete() { throw new Error("must not delete twice"); } })).toMatchObject({ outcome: "reconciled" });
  expect(await db.gameRetirement.count()).toBe(1);
  expect(fs.readFileSync(opts.receipt, "utf8")).not.toContain(secret);
  expect(readPrivate(opts.receipt)).toMatchObject({ firstFailure: { stage: "commit-observation", state: "uncertain" } });
});

it.each(["history-FK", "zero-residue", "before-commit"] as const)("rolls the actual complete transaction back after deletion starts: %s", async kind => {
  const { g } = await fixture(); await fixture();
  const opts = options(g.id); const before = await allRows(); await run("plan", opts);
  let deletedHistory = false;
  const hooks: Hooks = {
    async afterHistoryDelete(tx) {
      expect(await tx.domainEvent.count({ where: { gameId: g.id } })).toBe(0);
      deletedHistory = true;
      if (kind === "history-FK") await tx.checkpoint.create({ data: { gameId: g.id, gameVersion: 3, lastEventSequence: 1, snapshotJson: { secret }, checksum: secret } });
    },
    async afterRootDelete(tx) {
      if (kind === "zero-residue") await tx.presence.create({ data: { gameId: g.id, viewerId: secret } });
    },
    beforeCommit() { if (kind === "before-commit") throw new Error(secret); },
  };
  await expect(run("apply", opts, hooks)).rejects.toMatchObject({ report: { state: "rolled-back", stage: kind === "history-FK" ? "delete" : kind === "zero-residue" ? "zero-residue" : "anchor" } });
  expect(deletedHistory).toBe(true);
  expect(await allRows()).toBe(before); expect(await db.gameRetirement.count()).toBe(0);
  expect(fs.readFileSync(opts.journal + ".failure.json", "utf8")).not.toContain(secret);
  expect(await run("reconcile", opts)).toMatchObject({ outcome: "purged" });
  expect(await db.gameRetirement.count()).toBe(1);
  expect(readPrivate(opts.receipt)).toMatchObject({ firstFailure: { state: "rolled-back" } });
});

it.each(["apply", "reconcile"] as const)("%s cannot delete while readable pending intent contents cannot be synchronized", async mode => {
  const { g } = await fixture(); const opts = options(g.id); await run("plan", opts);
  const fsync = fs.fsyncSync;
  vi.spyOn(fs, "fsyncSync").mockImplementation(fd => {
    if (fs.fstatSync(fd).isFile()) throw new Error(secret);
    fsync(fd);
  });
  await expect(run("apply", opts)).rejects.toThrow();
  expect(readPrivate(opts.journal)).toMatchObject({ format: "game-retirement-intent/1", plan: { game: g.id } });
  expect(await db.gameSession.findUnique({ where: { id: g.id } })).not.toBeNull();
  let deletes = 0;
  await expect(run(mode, opts, { beforeDelete() { deletes++; } })).rejects.toThrow();
  expect(deletes).toBe(0);
  expect(await db.gameSession.findUnique({ where: { id: g.id } })).not.toBeNull();
  expect(await db.gameRetirement.count()).toBe(0);
  vi.restoreAllMocks();
  expect(await run(mode, opts)).toMatchObject({ outcome: "purged" });
  expect(await db.gameSession.findUnique({ where: { id: g.id } })).toBeNull();
  expect(readPrivate(opts.receipt)).toMatchObject({ firstFailure: { stage: "pending" } });
});

it.each(["pending-file", "pending-directory", "final-file", "final-rename", "final-directory"] as const)("injects a real filesystem failure at %s and reconciles exact committed evidence only", async fault => {
  const { g } = await fixture(); const opts = options(g.id); await run("plan", opts);
  let injected = false;
  await expect(run("apply", opts, { fileStage(stage) {
    if (stage !== fault) return;
    injected = true;
    const fail = () => { throw new Error(secret); };
    if (stage === "pending-file" || stage === "final-file") vi.spyOn(fs, "writeFileSync").mockImplementationOnce(fail);
    else if (stage === "final-rename") vi.spyOn(fs, "renameSync").mockImplementationOnce(fail);
    else vi.spyOn(fs, "fsyncSync").mockImplementationOnce(fail);
  } })).rejects.toThrow();
  vi.restoreAllMocks(); expect(injected).toBe(true);
  const committed = fault.startsWith("final");
  expect(await db.gameSession.count()).toBe(committed ? 0 : 1);
  expect(await db.gameRetirement.count()).toBe(committed ? 1 : 0);
  if (fault === "pending-file") {
    // A partial/truncated journal is not evidence. Never silently overwrite it.
    await expect(run("reconcile", opts)).rejects.toThrow();
  } else {
    let deletes = 0;
    expect(await run("reconcile", opts, { beforeDelete() { deletes++; } })).toMatchObject({ outcome: committed ? "reconciled" : "purged" });
    expect(deletes).toBe(committed ? 0 : 1);
    expect(readPrivate(opts.receipt)).toMatchObject({ firstFailure: { stage: committed ? "finalize" : "pending" } });
    expect(await db.gameRetirement.count()).toBe(1);
    for (const file of [opts.plan,opts.journal,opts.receipt,opts.journal + ".failure.json"]) expect(fs.readFileSync(file, "utf8")).not.toContain(secret);
  }
});

function replacePrivate(file: string, mutate: (value: Record<string, unknown>) => void) {
  const data = readPrivate(file) as Record<string, unknown>; mutate(data);
  fs.writeFileSync(file, JSON.stringify(data));
}
it.each(["source", "tool", "policy", "sourceSchema", "schema", "data", "other", "createdAt", "game", "cluster", "oid", "database", "unknown"])("rejects edited interpreted plan binding %s before the first DELETE", async field => {
  const { g } = await fixture(); const opts = options(g.id); const before = await allRows(); await run("plan", opts);
  replacePrivate(opts.plan, value => {
    if (["cluster","oid","database"].includes(field)) (value.target as Record<string, unknown>)[field] = field === "database" ? "different_test" : "1";
    else value[field] = field === "createdAt" ? new Date(0).toISOString() : field === "game" ? randomUUID() : "0".repeat(64);
  });
  const beforeDelete = vi.fn();
  await expect(run("apply", opts, { beforeDelete })).rejects.toThrow();
  expect(beforeDelete).not.toHaveBeenCalled(); expect(await allRows()).toBe(before); expect(await db.gameRetirement.count()).toBe(0);
});

it.each(["table", "column", "FK", "migration", "CHECK", "index"])("refuses actual unclassified schema/migration drift: %s", async drift => {
  const { g } = await fixture(); const opts = options(g.id); const before = await allRows(); await run("plan", opts);
  try {
    if (drift === "table") await db.$executeRaw`CREATE TABLE public.unclassified_game_history ("gameId" text)`;
    if (drift === "column") await db.$executeRaw`ALTER TABLE public.presence ADD COLUMN unclassified text`;
    if (drift === "FK") await db.$executeRaw`ALTER TABLE public.presence ADD CONSTRAINT unexpected_owner FOREIGN KEY ("gameId") REFERENCES public.game_sessions(id)`;
    if (drift === "CHECK") await db.$executeRaw`ALTER TABLE public.game_sessions DROP CONSTRAINT game_sessions_active_requires_phase`;
    if (drift === "index") await db.$executeRaw`DROP INDEX public."presence_gameId_lastSeenAt_idx"`;
    if (drift === "migration") await db.$executeRaw`UPDATE public._prisma_migrations SET checksum=repeat('0',64) WHERE migration_name='20261113120000_game_retirement'`;
    const beforeDelete = vi.fn(); await expect(run("apply", opts, { beforeDelete })).rejects.toThrow(); expect(beforeDelete).not.toHaveBeenCalled();
    if (drift !== "migration") await expect(run("plan", options(g.id))).rejects.toThrow();
  } finally {
    if (drift === "table") await db.$executeRaw`DROP TABLE public.unclassified_game_history`;
    if (drift === "column") await db.$executeRaw`ALTER TABLE public.presence DROP COLUMN unclassified`;
    if (drift === "FK") await db.$executeRaw`ALTER TABLE public.presence DROP CONSTRAINT unexpected_owner`;
    if (drift === "CHECK") await db.$executeRaw`ALTER TABLE public.game_sessions ADD CONSTRAINT game_sessions_active_requires_phase CHECK ("status" <> 'ACTIVE' OR "phase" IS NOT NULL)`;
    if (drift === "index") await db.$executeRaw`CREATE INDEX "presence_gameId_lastSeenAt_idx" ON public.presence ("gameId", "lastSeenAt")`;
    if (drift === "migration") {
      const { bytesDigest } = await import("../scripts/game-data-policy.mjs");
      const checksum = bytesDigest(fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20261113120000_game_retirement/migration.sql")));
      await db.$executeRaw`UPDATE public._prisma_migrations SET checksum=${checksum} WHERE migration_name='20261113120000_game_retirement'`;
    }
  }
  expect(await allRows()).toBe(before); expect(await db.gameRetirement.count()).toBe(0);
});

it.each(["rows", "bytes"])("refuses an oversized %s graph before exporting rows or deleting", async kind => {
  const { g } = await fixture(); const opts = options(g.id); await run("plan", opts);
  if (kind === "rows") await db.$executeRaw`INSERT INTO public.presence (id, "gameId", "viewerId", "lastSeenAt") SELECT 'oversize-' || n, ${g.id}, 'viewer-' || n, now() FROM generate_series(1,100001) n`;
  else await db.playerSecret.updateMany({ data: { abilityStateJson: { secret: "x".repeat(16 * 1024 * 1024) } } });
  const before = await allRows(); const beforeDelete = vi.fn();
  await expect(run("apply", opts, { beforeDelete })).rejects.toMatchObject({ report: { stage: "selection", state: "not-deleted" } });
  expect(beforeDelete).not.toHaveBeenCalled();
  await expect(run("plan", options(g.id))).rejects.toThrow();
  expect(await allRows()).toBe(before); expect(await db.gameRetirement.count()).toBe(0);
});

it.each(["vote", "effect"])("refuses corrupt cross-game scalar binding: %s", async kind => {
  const a = await fixture(); const b = await fixture();
  if (kind === "vote") await db.vote.updateMany({ where: { nominationId: a.nomination.id }, data: { playerId: b.p.id } });
  if (kind === "effect") await db.effect.updateMany({ where: { gameId: a.g.id }, data: { targetPlayerId: b.p.id } });
  const before = await allRows(); await expect(run("plan", options(a.g.id))).rejects.toThrow(); expect(await allRows()).toBe(before);
});

it("the existing real XOR constraint refuses a contradictory BrowserSession before it can become a purge fixture", async () => {
  const a = await fixture(); const b = await fixture(); const before = await allRows();
  await expect(db.browserSession.updateMany({ where: { playerId: a.p.id }, data: { storytellerGameId: b.g.id } })).rejects.toThrow();
  expect(await allRows()).toBe(before);
});

it.each(["live", "unarchived"])("does not plan ineligible %s roots", async kind => {
  const { g } = await fixture(); await db.gameSession.update({ where: { id: g.id }, data: kind === "live" ? { status: "ACTIVE", phase: "OPERATIONAL" } : { archivedAt: null } });
  const before = await allRows(); await expect(run("plan", options(g.id))).rejects.toThrow(); expect(await allRows()).toBe(before);
});

it.each(["missing-journal", "corrupt-journal", "conflicting-anchor", "wrong-selection", "absent-anchor"])("does not guess success from %s", async kind => {
  const { g } = await fixture(); const opts = options(g.id); await run("plan", opts);
  await expect(run("apply", opts, { afterCommit() { throw new Error(secret); } })).rejects.toThrow();
  if (kind === "missing-journal") fs.unlinkSync(opts.journal);
  if (kind === "corrupt-journal") replacePrivate(opts.journal, v => { v.planDigest = "0".repeat(64); });
  if (kind === "conflicting-anchor") await db.gameRetirement.update({ where: { gameId: g.id }, data: { intentDigest: "0".repeat(64) } });
  if (kind === "wrong-selection") opts.game = randomUUID();
  if (kind === "absent-anchor") await db.gameRetirement.deleteMany();
  await expect(run("reconcile", opts)).rejects.toMatchObject({ report: { state: kind === "absent-anchor" ? "uncertain" : "not-deleted" } });
  expect(fs.existsSync(opts.receipt)).toBe(false); expect(await db.gameSession.count()).toBe(0);
});

it.each(["receipt-collision", "journal-collision", "symlink"])("refuses private evidence %s without overwriting or deletion", async kind => {
  const { g } = await fixture(); const opts = options(g.id); const before = await allRows(); await run("plan", opts);
  const file = kind === "journal-collision" ? opts.journal : opts.receipt;
  if (kind === "symlink") fs.symlinkSync(opts.plan, file);
  else fs.writeFileSync(file, "unrelated", { mode: 0o600 });
  const original = fs.readFileSync(kind === "symlink" ? opts.plan : file, "utf8");
  await expect(run("apply", opts)).rejects.toThrow(); expect(await allRows()).toBe(before); expect(await db.gameRetirement.count()).toBe(0);
  expect(fs.readFileSync(kind === "symlink" ? opts.plan : file, "utf8")).toBe(original);
});

it("refuses held locks/sessions and leaves the owning transaction alive", async () => {
  const { g } = await fixture(); const opts = options(g.id); await run("plan", opts);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM public.game_sessions WHERE id=${g.id} FOR UPDATE`;
    await expect(execute("apply", opts)).rejects.toMatchObject({ report: { stage: "preflight" } });
    expect(await tx.gameSession.count()).toBe(1);
  });
  expect(await db.gameRetirement.count()).toBe(0);
});

it("requires actual PostgreSQL session visibility, not just a stopped-app assertion", async () => {
  const { g } = await fixture(); const opts = options(g.id); const before = await allRows();
  await db.$executeRaw`CREATE ROLE u3_visibility_operator LOGIN`;
  try {
    const restricted = new URL(opts.database); restricted.username = "u3_visibility_operator";
    await expect(run("plan", { ...opts, database: restricted.href })).rejects.toMatchObject({ report: { stage: "preflight", state: "not-deleted" } });
  } finally { await db.$executeRaw`DROP ROLE u3_visibility_operator`; }
  expect(await allRows()).toBe(before); expect(await db.gameRetirement.count()).toBe(0);
});

function gate() { let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; }); return { wait, release }; }
it.each(["claim-retry", "recovery", "heartbeat"])("drains an actually admitted %s before native offline apply, then its fresh root/session recheck refuses", async kind => {
  const { g, p } = await fixture();
  const session = await db.browserSession.findFirstOrThrow({ where: { storytellerGameId: g.id } });
  const token = "SYNTHETIC_ADMITTED_CLAIM"; const commandId = randomUUID();
  await db.browserSession.update({ where: { id: session.id }, data: { sessionTokenHash: hashToken(secret), expiresAt: new Date(Date.now() + 60000) } });
  cookieJar.set(COOKIE_STORYTELLER_SESSION, secret);
  if (kind === "claim-retry") await db.playerClaim.update({ where: { playerId: p.id }, data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60000), claimedAt: new Date(), commandId } });
  const opts = options(g.id); await run("plan", opts);
  vi.stubEnv("STORYTELLER_RECOVERY_SECRET", secret); vi.stubEnv("RATE_LIMIT_DISABLED", "1");
  const admitted = gate(), resume = gate();
  const original = applicationDb.$transaction;
  const spy = vi.spyOn(applicationDb, "$transaction").mockImplementationOnce(async (...args) => {
    admitted.release(); await resume.wait;
    return Reflect.apply(original, applicationDb, args);
  });
  const writer = (async () => {
    if (kind === "claim-retry") return games.claimPlayer({ token, commandId });
    const origin = process.env.APP_ORIGIN ?? "http://localhost:3000";
    if (kind === "heartbeat") return heartbeatPost(new Request(`${origin}/api`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}" }), { params: Promise.resolve({ gameId: g.id }) });
    return recoverPost(new Request(`${origin}/api`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ gameId: g.id, recoverySecret: secret }) }));
  })().then(value => ({ value }), error => ({ error }));
  try {
    await admitted.wait;
    // Admission really used a database session. The offline CLI must reject it.
    await expect(execute("apply", opts)).rejects.toMatchObject({ report: { stage: "preflight" } });
    // This is not concurrent SQL success: drain all owned application sessions.
    await disconnect();
    expect(cli("apply", opts)).toMatchObject({ code: 0, report: { outcome: "purged" } });
  } finally { spy.mockRestore(); resume.release(); }
  const result = await writer;
  if (kind !== "claim-retry") expect(result).toMatchObject({ value: { status: kind === "recovery" ? 401 : 404 } });
  else expect(result).toMatchObject({ error: { code: "GAME_NOT_FOUND" } });
  expect(await db.gameRetirement.count()).toBe(1);
  for (const table of ["game_sessions","players","player_claims","browser_sessions","domain_events","command_receipts","checkpoints","presence"]) {
    const [row] = await db.$queryRaw<{ n: bigint }[]>(Prisma.sql`SELECT count(*) AS n FROM ${Prisma.raw('public."' + table + '"')}`);
    expect(Number(row.n)).toBe(0);
  }
});
