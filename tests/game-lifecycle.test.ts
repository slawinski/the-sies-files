import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { runCommand, runGameTransaction } from "@/lib/command";
import { archivedCommandPolicy, commandContracts, parseCommandResult, type CommandOperation } from "@/lib/command-contracts";
import * as games from "@/modules/game-session/game-session.service";
import { createGameWithPlayers, resetDb } from "./helpers/db";
import { createCheckpoint, getCommandStatus, heartbeat, resetPlayerAccess, runConsistencyChecks, verifyReplay } from "@/modules/recovery/recovery.service";
import { hashToken } from "@/lib/auth/tokens";
import { revokeSessionByHash, withGameAdmission } from "@/modules/auth/session";
import type { Viewer } from "@/lib/auth/http";
import type { Prisma } from "@prisma/client";
import { POST as archivePost } from "@/app/api/v1/games/[gameId]/archive/route";
import { POST as recoverPost } from "@/app/api/v1/storyteller/recover/route";
import { POST as heartbeatPost } from "@/app/api/v1/games/[gameId]/presence/heartbeat/route";
import { PATCH as renamePatch } from "@/app/api/v1/games/[gameId]/route";
import { POST as issuePost } from "@/app/api/v1/games/[gameId]/players/[playerId]/claim-token/route";
import { COOKIE_PLAYER_SESSION, COOKIE_STORYTELLER_SESSION } from "@/lib/auth/cookies";
import { acknowledgeRole } from "@/modules/setup/setup.service";
import { POST as acknowledgePost } from "@/app/api/v1/games/[gameId]/role-reveal/ack/route";
import { GET as playerStatusGet } from "@/app/api/v1/games/[gameId]/me/commands/[commandId]/route";

const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (name: string) => cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined,
  set: (name: string, value: string) => cookieJar.set(name, value),
  delete: (name: string) => cookieJar.delete(name),
}) }));

const params = (gameId: string) => ({ params: Promise.resolve({ gameId }) });
const request = (body: unknown, origin = process.env.APP_ORIGIN ?? "http://localhost:3000") => new Request(`${origin}/api`, {
  method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body),
});

async function retireIn(tx: Prisma.TransactionClient, gameId: string) {
  await tx.domainEvent.deleteMany({ where: { gameId } });
  await tx.commandReceipt.deleteMany({ where: { gameId } });
  await tx.player.deleteMany({ where: { gameId } });
  await tx.gameSession.delete({ where: { id: gameId } });
  await tx.presence.deleteMany({ where: { gameId } });
}

// A coordinated synthetic retirement seam, not the later U3 purge CLI.
async function retireRoot(gameId: string) {
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM game_sessions WHERE id = ${gameId} FOR UPDATE`;
    await retireIn(tx, gameId);
  });
}

function gate() {
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  return { wait, release };
}

beforeEach(async () => { vi.unstubAllEnvs(); cookieJar.clear(); await resetDb(); });

async function storyteller(gameId: string): Promise<Viewer> {
  const session = await prisma.browserSession.findFirstOrThrow({ where: { storytellerGameId: gameId } });
  return { kind: "storyteller", sessionId: session.id };
}

// Wait for an actual writer blocked on the root lock, then change its admitted
// identity/target inside the owner transaction before releasing it.
async function afterWaiting<T>(gameId: string, writer: () => Promise<T>, mutate: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  const locked = gate();
  const release = gate();
  const owner = prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM game_sessions WHERE id = ${gameId} FOR UPDATE`;
    locked.release();
    await release.wait;
    await mutate(tx);
  }, { timeout: 15_000 });
  await locked.wait;
  const pending = writer().then(value => ({ value }), error => ({ error }));
  try {
    await vi.waitFor(async () => {
      const waiting = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%game_sessions%'`;
      expect(Number(waiting[0].count)).toBeGreaterThan(0);
    });
  } finally { release.release(); await owner; }
  return pending;
}

async function completed() {
  const fixture = await createGameWithPlayers(1);
  await prisma.gameSession.update({ where: { id: fixture.gameId }, data: { status: "ENDED", winner: "GOOD" } });
  return fixture;
}

it("archives an ended winner once, preserving the exact typed duplicate and old outcomes", async () => {
  const { gameId } = await games.createGame("History");
  const addId = randomUUID();
  const added = await games.addPlayer({ gameId, commandId: addId, expectedVersion: 1, displayName: "Ada" });
  await prisma.gameSession.update({ where: { id: gameId }, data: { status: "ENDED", winner: "GOOD" } });
  const commandId = randomUUID();
  const first = await games.archiveGame({ gameId, commandId, expectedVersion: 2 });
  expect(first).toMatchObject({ version: 3, duplicate: false, archivedAt: expect.any(String) });
  const root = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
  expect(root.archivedAt?.toISOString()).toBe(first.archivedAt);
  expect(root.eventSequence).toBe(3);
  expect(await games.archiveGame({ gameId, commandId, expectedVersion: 2 })).toEqual({ ...first, duplicate: true });
  await expect(games.archiveGame({ gameId, commandId: randomUUID(), expectedVersion: 3 })).rejects.toMatchObject({ code: "GAME_ARCHIVED" });
  expect(await games.addPlayer({ gameId, commandId: addId, expectedVersion: 1, displayName: "Ada" })).toEqual(added);
  expect(await getCommandStatus(gameId, addId, { kind: "storyteller" })).toMatchObject({ status: "APPLIED", result: { playerId: added.playerId } });
  await expect(games.addPlayer({ gameId, commandId: randomUUID(), expectedVersion: 3, displayName: "Bob" })).rejects.toMatchObject({ code: "GAME_ARCHIVED" });
  expect(await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } })).toEqual(root);
  expect(await prisma.domainEvent.count({ where: { gameId, eventType: "GAME_ARCHIVED" } })).toBe(1);
  expect(await prisma.commandReceipt.count({ where: { gameId } })).toBe(2);
  expect(await runConsistencyChecks(gameId)).toEqual(expect.arrayContaining([expect.objectContaining({ check: "VERSION_MATCHES_EVENTS", ok: true })]));
});

it.each(["LOBBY", "SETUP", "ROLE_REVEAL", "ACTIVE"] as const)("refuses archive in %s without effects", async status => {
  const { gameId } = await games.createGame("Live");
  const before = await prisma.gameSession.update({ where: { id: gameId }, data: { status, phase: status === "ACTIVE" ? "INVESTIGATION" : null } });
  await expect(games.archiveGame({ gameId, commandId: randomUUID(), expectedVersion: 1 })).rejects.toMatchObject({ code: "INVALID_SESSION_STATE" });
  expect(await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } })).toEqual(before);
  expect(await prisma.commandReceipt.count({ where: { gameId } })).toBe(0);
});

it("rejects every fresh non-access operation before its handler in both transaction paths", async () => {
  const { gameId, version } = await completed();
  await prisma.gameSession.update({ where: { id: gameId }, data: { archivedAt: new Date() } });
  const before = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
  const eventCount = await prisma.domainEvent.count({ where: { gameId } });
  const handler = vi.fn(async () => ({}));
  for (const operation of Object.keys(commandContracts) as CommandOperation[]) {
    if (["issueClaimToken", "resetPlayerAccess"].includes(operation)) continue;
    await expect(runCommand({ gameId, commandId: randomUUID(), expectedVersion: version, actor: "storyteller", operation, input: {}, handler })).rejects.toMatchObject({ code: "GAME_ARCHIVED" });
  }
  await expect(runGameTransaction({ gameId, handler })).rejects.toMatchObject({ code: "GAME_ARCHIVED" });
  expect(handler).not.toHaveBeenCalled();
  expect(await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } })).toEqual(before);
  expect(await prisma.domainEvent.count({ where: { gameId } })).toBe(eventCount);
  expect(Object.keys(commandContracts)).toHaveLength(37);
  expect(Object.keys(archivedCommandPolicy).sort()).toEqual(Object.keys(commandContracts).sort());
  expect(Object.entries(archivedCommandPolicy).filter(([, policy]) => policy === "read-access").map(([op]) => op).sort()).toEqual(["issueClaimToken", "resetPlayerAccess"]);
});

it("treats archive as flag-neutral lifecycle metadata without rewriting checkpoints", async () => {
  const { gameId, version } = await completed();
  const cp = await createCheckpoint({ gameId, expectedVersion: version, commandId: randomUUID() });
  const before = await prisma.checkpoint.findUniqueOrThrow({ where: { id: cp.checkpointId } });
  await games.archiveGame({ gameId, expectedVersion: cp.version, commandId: randomUUID() });
  expect(await verifyReplay(gameId, cp.checkpointId)).toMatchObject({ ok: true, coverage: { complete: true } });
  expect(await prisma.checkpoint.findUniqueOrThrow({ where: { id: cp.checkpointId } })).toEqual(before);
});

it("refuses an admitted same-command claim retry after coordinated root retirement", async () => {
  const { gameId, playerIds, version } = await createGameWithPlayers(1);
  const token = "synthetic-claim";
  const commandId = randomUUID();
  await games.issueClaimToken({ gameId, playerId: playerIds[0], commandId: randomUUID(), expectedVersion: version, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) });
  await games.claimPlayer({ token, commandId });
  const result = await afterWaiting(gameId, () => games.claimPlayer({ token, commandId }), tx => retireIn(tx, gameId));
  expect(result).toMatchObject({ error: { code: "GAME_NOT_FOUND" } });
  expect(await prisma.browserSession.count()).toBe(0);
  expect(await prisma.domainEvent.count()).toBe(0);
});

it("refuses presence after root retirement even for a previously admitted reader", async () => {
  const { gameId } = await games.createGame("Presence");
  const session = await prisma.browserSession.findFirstOrThrow({ where: { storytellerGameId: gameId } });
  await retireRoot(gameId);
  await expect(heartbeat(gameId, `storyteller:${session.id}`)).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
  expect(await prisma.presence.count()).toBe(0);
});

it.each(["missing", "wrong-game", "player", "revoked", "expired"])("archive HTTP refuses %s authority without effects", async kind => {
  const game = await games.createGame("Target");
  await prisma.gameSession.update({ where: { id: game.gameId }, data: { status: "ENDED", winner: "EVIL" } });
  if (kind === "wrong-game") cookieJar.set(COOKIE_STORYTELLER_SESSION, (await games.createGame("Other")).storytellerSessionToken);
  if (kind === "player") {
    const player = await prisma.player.create({ data: { gameId: game.gameId, displayName: "Reader", virtualSeat: 0 } });
    await prisma.browserSession.create({ data: { playerId: player.id, sessionTokenHash: hashToken("reader"), expiresAt: new Date(Date.now() + 60_000) } });
    cookieJar.set(COOKIE_PLAYER_SESSION, "reader");
  }
  if (kind === "revoked" || kind === "expired") {
    cookieJar.set(COOKIE_STORYTELLER_SESSION, game.storytellerSessionToken);
    await prisma.browserSession.updateMany({ where: { storytellerGameId: game.gameId }, data: kind === "revoked" ? { revokedAt: new Date() } : { expiresAt: new Date(0) } });
  }
  const before = await prisma.gameSession.findUniqueOrThrow({ where: { id: game.gameId } });
  const response = await archivePost(request({ commandId: randomUUID(), expectedVersion: 1 }), params(game.gameId));
  expect(response.status).toBe(kind === "missing" || kind === "player" ? 401 : 404);
  expect(await prisma.gameSession.findUniqueOrThrow({ where: { id: game.gameId } })).toEqual(before);
  expect(await prisma.commandReceipt.count({ where: { gameId: game.gameId } })).toBe(0);
  expect(await prisma.domainEvent.count({ where: { gameId: game.gameId } })).toBe(1);
});

it("archive HTTP enforces origin and strict input, then returns a serialized timestamp", async () => {
  const game = await games.createGame("HTTP");
  cookieJar.set(COOKIE_STORYTELLER_SESSION, game.storytellerSessionToken);
  await prisma.gameSession.update({ where: { id: game.gameId }, data: { status: "ENDED", winner: "GOOD" } });
  const input = { commandId: randomUUID(), expectedVersion: 1 };
  expect((await archivePost(request(input, "http://attacker.invalid"), params(game.gameId))).status).toBe(403);
  expect((await archivePost(request({ ...input, actor: "storyteller" }), params(game.gameId))).status).toBe(400);
  const response = await archivePost(request(input), params(game.gameId));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const result = await response.json();
  expect(result).toMatchObject({ archivedAt: expect.any(String), version: 2, duplicate: false });
  const receipt = await prisma.commandReceipt.findFirstOrThrow({ where: { gameId: game.gameId, commandId: input.commandId } });
  expect(receipt).toMatchObject({ operation: "archiveGame", actor: "storyteller", resultVersion: 1, resultJson: { archivedAt: result.archivedAt } });
  expect((await archivePost(request(input), params(game.gameId))).status).toBe(200);
  expect((await getCommandStatus(game.gameId, input.commandId, { kind: "storyteller" }))).toMatchObject({ status: "APPLIED", operation: "archiveGame", result: { archivedAt: result.archivedAt } });
  expect(await getCommandStatus(game.gameId, input.commandId, { kind: "player", playerId: "other" })).toEqual({ status: "UNKNOWN" });
});

it("binds archive identity and validates its durable result before the fresh archive guard", async () => {
  const { gameId, version } = await completed();
  const commandId = randomUUID();
  await games.archiveGame({ gameId, commandId, expectedVersion: version });
  const handler = vi.fn();
  await expect(runCommand({ gameId, commandId, expectedVersion: 0, actor: "storyteller", operation: "archiveGame", input: { altered: true }, handler })).rejects.toMatchObject({ code: "DUPLICATE_COMMAND" });
  await expect(runCommand({ gameId, commandId, expectedVersion: 0, actor: "player:other", operation: "archiveGame", input: {}, handler })).rejects.toMatchObject({ code: "FORBIDDEN" });
  await prisma.commandReceipt.update({ where: { gameId_commandId: { gameId, commandId } }, data: { resultJson: { archivedAt: "not-iso" } } });
  await expect(games.archiveGame({ gameId, commandId, expectedVersion: 0 })).rejects.toMatchObject({ code: "COMMAND_RECEIPT_INVALID" });
  expect(handler).not.toHaveBeenCalled();
  for (const bad of [{ archivedAt: new Date() }, { archivedAt: "invalid" }, { archivedAt: "2026-11-12T00:00:00.000Z", token: "no" }]) {
    expect(() => parseCommandResult("archiveGame", bad, true)).toThrowError(expect.objectContaining({ code: "COMMAND_RESULT_INVALID" }));
  }
});

it("serializes competing archive commands and rejects stale eligibility without effects", async () => {
  const { gameId, version } = await completed();
  await expect(games.archiveGame({ gameId, expectedVersion: version - 1, commandId: randomUUID() })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  const results = await Promise.allSettled([1, 2].map(() => games.archiveGame({ gameId, expectedVersion: version, commandId: randomUUID() })));
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(r => r.status === "rejected")).toEqual([expect.objectContaining({ reason: expect.objectContaining({ code: "GAME_ARCHIVED" }) })]);
  expect(await prisma.domainEvent.count({ where: { gameId, eventType: "GAME_ARCHIVED" } })).toBe(1);
});

it("allows only existing-player read credentials under fresh persisted archived-game Storyteller authority", async () => {
  const { gameId, playerIds, version } = await completed();
  const secret = await prisma.playerSecret.create({ data: { playerId: playerIds[0], trueCharacterId: "IMP", perceivedCharacterId: "IMP", trueAlignment: "EVIL" } });
  const archived = await games.archiveGame({ gameId, expectedVersion: version, commandId: randomUUID() });
  const viewer = await storyteller(gameId);
  const players = await prisma.player.findMany({ where: { gameId } });
  const checkpointCount = await prisma.checkpoint.count({ where: { gameId } });
  const token = "archived-player";
  const issued = await withGameAdmission(gameId, viewer, () => games.issueClaimToken({ gameId, playerId: playerIds[0], commandId: randomUUID(), expectedVersion: archived.version, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) }));
  const claimId = randomUUID();
  const claimed = await games.claimPlayer({ token, commandId: claimId });
  const retried = await games.claimPlayer({ token, commandId: claimId });
  expect(retried.version).toBe(claimed.version);
  expect(retried.sessionToken).not.toBe(claimed.sessionToken);
  const resetId = randomUUID();
  const reset = await withGameAdmission(gameId, viewer, () => resetPlayerAccess({ gameId, playerId: playerIds[0], commandId: resetId, expectedVersion: claimed.version }));
  expect(reset.credentialAvailable).toBe(true);
  expect(await withGameAdmission(gameId, viewer, () => resetPlayerAccess({ gameId, playerId: playerIds[0], commandId: resetId, expectedVersion: 0 }))).toEqual({ version: reset.version, duplicate: true, credentialAvailable: false });
  expect(await prisma.player.findMany({ where: { gameId } })).toEqual(players);
  expect(await prisma.playerSecret.findUniqueOrThrow({ where: { playerId: playerIds[0] } })).toEqual(secret);
  expect(await prisma.checkpoint.count({ where: { gameId } })).toBe(checkpointCount);
  expect(await prisma.effect.count({ where: { gameId } })).toBe(0);
  expect(issued.version).toBe(archived.version + 1);
  const root = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
  expect(root).toMatchObject({ status: "ENDED", winner: "GOOD", archivedAt: new Date(archived.archivedAt) });
  await expect(withGameAdmission(gameId, viewer, () => games.issueClaimToken({ gameId, playerId: randomUUID(), commandId: randomUUID(), expectedVersion: reset.version, ...games.newClaimToken() }))).rejects.toMatchObject({ code: "PLAYER_NOT_FOUND" });
  const durable = JSON.stringify([await prisma.commandReceipt.findMany({ where: { gameId } }), await prisma.domainEvent.findMany({ where: { gameId } })]);
  expect(durable).not.toContain(token);
  expect(durable).not.toContain(claimed.sessionToken);
  if (reset.credentialAvailable) expect(durable).not.toContain(reset.claimToken);
});

it.each(["missing", "wrong-game", "player", "revoked", "replaced"])("refuses archived access management with %s admission", async kind => {
  const { gameId, playerIds, version } = await completed();
  const archive = await games.archiveGame({ gameId, expectedVersion: version, commandId: randomUUID() });
  let viewer = await storyteller(gameId);
  if (kind === "wrong-game") viewer = await storyteller((await games.createGame("Other")).gameId);
  if (kind === "player") {
    const session = await prisma.browserSession.create({ data: { playerId: playerIds[0], sessionTokenHash: hashToken("player"), expiresAt: new Date(Date.now() + 60_000) } });
    viewer = { kind: "player", sessionId: session.id, playerId: playerIds[0] };
  }
  if (kind === "revoked") await prisma.browserSession.update({ where: { id: viewer.sessionId }, data: { revokedAt: new Date() } });
  if (kind === "replaced") {
    await prisma.browserSession.delete({ where: { id: viewer.sessionId } });
    await prisma.browserSession.create({ data: { storytellerGameId: gameId, sessionTokenHash: hashToken("replacement"), expiresAt: new Date(Date.now() + 60_000) } });
  }
  const before = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
  const attempts: Array<() => Promise<unknown>> = [
    () => games.issueClaimToken({ gameId, playerId: playerIds[0], commandId: randomUUID(), expectedVersion: archive.version, ...games.newClaimToken() }),
    () => resetPlayerAccess({ gameId, playerId: playerIds[0], commandId: randomUUID(), expectedVersion: archive.version }),
  ];
  for (const work of attempts) await expect(kind === "missing" ? work() : withGameAdmission(gameId, viewer, work)).rejects.toMatchObject({ code: kind === "missing" ? "UNAUTHORIZED" : "GAME_NOT_FOUND" });
  expect(await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } })).toEqual(before);
  expect(await prisma.playerClaim.count({ where: { player: { gameId } } })).toBe(0);
});

it.each(["command", "transaction", "heartbeat"])("rechecks the exact admitted session after the root lock for %s", async kind => {
  const { gameId } = await games.createGame("Revocation");
  const viewer = await storyteller(gameId);
  const handler = vi.fn(async () => ({}));
  const result = await afterWaiting(gameId, () => withGameAdmission<unknown>(gameId, viewer, () => {
    if (kind === "heartbeat") return heartbeat(gameId, `storyteller:${viewer.sessionId}`, viewer);
    if (kind === "transaction") return runGameTransaction({ gameId, actor: "storyteller", handler });
    return runCommand({ gameId, actor: "storyteller", expectedVersion: 1, commandId: randomUUID(), operation: "renameGame", input: {}, handler });
  }), tx => tx.browserSession.update({ where: { id: viewer.sessionId }, data: { revokedAt: new Date() } }));
  expect(result).toMatchObject({ error: { code: "GAME_NOT_FOUND" } });
  expect(handler).not.toHaveBeenCalled();
  expect(await prisma.presence.count({ where: { gameId } })).toBe(0);
});

it.each(["claim-retry", "recovery", "heartbeat"])("holds real %s admission at the root lock, retires the root, and leaves no sessions/audits/Presence", async kind => {
  const game = await games.createGame("Held writer");
  cookieJar.set(COOKIE_STORYTELLER_SESSION, game.storytellerSessionToken);
  vi.stubEnv("STORYTELLER_RECOVERY_SECRET", "synthetic-secret");
  vi.stubEnv("RATE_LIMIT_DISABLED", "1");
  let claimCommand = "";
  let claimToken = "";
  if (kind === "claim-retry") {
    const added = await games.addPlayer({ gameId: game.gameId, displayName: "Reader", expectedVersion: 1, commandId: randomUUID() });
    claimToken = "held-claim";
    claimCommand = randomUUID();
    await games.issueClaimToken({ gameId: game.gameId, playerId: added.playerId, expectedVersion: added.version, commandId: randomUUID(), tokenHash: hashToken(claimToken), expiresAt: new Date(Date.now() + 60_000) });
    await games.claimPlayer({ token: claimToken, commandId: claimCommand });
  }
  const result = await afterWaiting(game.gameId, async () => {
    if (kind === "claim-retry") return games.claimPlayer({ token: claimToken, commandId: claimCommand });
    if (kind === "recovery") return recoverPost(request({ gameId: game.gameId, recoverySecret: "synthetic-secret" }));
    return heartbeatPost(request({}), params(game.gameId));
  }, tx => retireIn(tx, game.gameId));
  if (kind === "claim-retry") expect(result).toMatchObject({ error: { code: "GAME_NOT_FOUND" } });
  else {
    expect(result).toHaveProperty("value");
    if (!("value" in result) || !(result.value instanceof Response)) throw new Error("Expected route response");
    expect(result.value.status).toBe(kind === "recovery" ? 401 : 404);
  }
  expect(await prisma.browserSession.count()).toBe(0);
  expect(await prisma.domainEvent.count()).toBe(0);
  expect(await prisma.presence.count()).toBe(0);
});

it.each(["revoked", "retargeted", "reissued"])("freshly rechecks an admitted claimed token when %s while waiting", async kind => {
  const { gameId, playerIds, version } = await createGameWithPlayers(1);
  const token = "fresh-claim";
  const commandId = randomUUID();
  await games.issueClaimToken({ gameId, playerId: playerIds[0], commandId: randomUUID(), expectedVersion: version, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) });
  await games.claimPlayer({ token, commandId });
  const other = await prisma.player.create({ data: { gameId, displayName: "Other", virtualSeat: 1 } });
  const beforeCount = await prisma.browserSession.count();
  const result = await afterWaiting(gameId, () => games.claimPlayer({ token, commandId }), tx => tx.playerClaim.update({
    where: { playerId: playerIds[0] }, data: kind === "revoked" ? { revokedAt: new Date() } : kind === "retargeted" ? { playerId: other.id } : { tokenHash: hashToken("reissued") },
  }));
  expect(result).toMatchObject({ error: { code: "UNAUTHORIZED" } });
  expect(await prisma.browserSession.count()).toBe(beforeCount);
});

it("configured recovery and reader presence remain metadata-only on archived roots", async () => {
  const game = await games.createGame("Read recovery");
  cookieJar.set(COOKIE_STORYTELLER_SESSION, game.storytellerSessionToken);
  await prisma.gameSession.update({ where: { id: game.gameId }, data: { status: "ENDED", winner: "GOOD" } });
  await games.archiveGame({ gameId: game.gameId, expectedVersion: 1, commandId: randomUUID() });
  const before = await prisma.gameSession.findUniqueOrThrow({ where: { id: game.gameId } });
  vi.stubEnv("STORYTELLER_RECOVERY_SECRET", "synthetic-secret");
  vi.stubEnv("RATE_LIMIT_DISABLED", "1");
  expect((await recoverPost(request({ gameId: game.gameId, recoverySecret: "wrong" }))).status).toBe(401);
  expect((await recoverPost(request({ gameId: game.gameId, recoverySecret: "synthetic-secret" }))).status).toBe(200);
  expect((await heartbeatPost(request({}), params(game.gameId))).status).toBe(200);
  const after = await prisma.gameSession.findUniqueOrThrow({ where: { id: game.gameId } });
  expect(after).toMatchObject({ version: before.version, eventSequence: before.eventSequence + 1, archivedAt: before.archivedAt });
  expect(await prisma.domainEvent.findFirstOrThrow({ where: { gameId: game.gameId, eventType: "STORYTELLER_ACCESS_RECOVERED" } })).toMatchObject({ gameVersion: before.version, sequence: before.eventSequence + 1 });
  expect(await prisma.player.count({ where: { gameId: game.gameId } })).toBe(0);
});

it("HTTP writers propagate their captured exact persisted admission, not JSON actor fields", async () => {
  const game = await games.createGame("Route admission");
  cookieJar.set(COOKIE_STORYTELLER_SESSION, game.storytellerSessionToken);
  const viewer = await storyteller(game.gameId);
  const result = await afterWaiting(game.gameId, () => renamePatch(request({ commandId: randomUUID(), expectedVersion: 1, payload: { name: "Must not write" }, actor: "storyteller" }), params(game.gameId)),
    tx => tx.browserSession.update({ where: { id: viewer.sessionId }, data: { revokedAt: new Date() } }));
  expect(result).toHaveProperty("value");
  if (!("value" in result)) throw new Error("Expected response");
  expect(result.value.status).toBe(404);
  expect((await prisma.gameSession.findUniqueOrThrow({ where: { id: game.gameId } })).name).toBe("Route admission");
});

it("archived credential HTTP issuance captures Storyteller admission and cannot add a roster member", async () => {
  const game = await games.createGame("Archived route");
  const added = await games.addPlayer({ gameId: game.gameId, displayName: "Reader", expectedVersion: 1, commandId: randomUUID() });
  cookieJar.set(COOKIE_STORYTELLER_SESSION, game.storytellerSessionToken);
  await prisma.gameSession.update({ where: { id: game.gameId }, data: { status: "ENDED", winner: "GOOD" } });
  const archive = await games.archiveGame({ gameId: game.gameId, expectedVersion: added.version, commandId: randomUUID() });
  const response = await issuePost(request({ commandId: randomUUID(), expectedVersion: archive.version }), { params: Promise.resolve({ gameId: game.gameId, playerId: added.playerId }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ credentialAvailable: true, claimToken: expect.any(String) });
  expect(await prisma.player.count({ where: { gameId: game.gameId } })).toBe(1);
});

it("retains a player's committed own outcome and read authority after archive, but denies a fresh same-operation command", async () => {
  const { gameId, playerIds, version } = await createGameWithPlayers(1);
  const playerId = playerIds[0];
  await prisma.playerSecret.create({ data: { playerId, trueCharacterId: "IMP", perceivedCharacterId: "IMP" } });
  await prisma.gameSession.update({ where: { id: gameId }, data: { status: "ROLE_REVEAL" } });
  const token = "own-role-reader";
  const session = await prisma.browserSession.create({ data: { playerId, sessionTokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });
  const viewer: Viewer = { kind: "player", playerId, sessionId: session.id };
  const commandId = randomUUID();
  const first = await withGameAdmission(gameId, viewer, () => acknowledgeRole({ gameId, playerId, expectedVersion: version, commandId }));
  await prisma.gameSession.update({ where: { id: gameId }, data: { status: "ENDED", winner: "EVIL" } });
  const archive = await games.archiveGame({ gameId, commandId: randomUUID(), expectedVersion: first.version });
  const secret = await prisma.playerSecret.findUniqueOrThrow({ where: { playerId } });
  cookieJar.set(COOKIE_PLAYER_SESSION, token);
  const ownStatus = await playerStatusGet(new Request("http://localhost/api"), { params: Promise.resolve({ gameId, commandId }) });
  expect(ownStatus.status).toBe(200);
  expect(await ownStatus.json()).toMatchObject({ status: "APPLIED", operation: "acknowledgeRole", resultingGameVersion: first.version, result: {} });
  const duplicate = await acknowledgePost(request({ commandId, expectedVersion: version }), params(gameId));
  expect(duplicate.status).toBe(200);
  expect(await duplicate.json()).toEqual({ version: first.version });
  const fresh = await acknowledgePost(request({ commandId: randomUUID(), expectedVersion: archive.version }), params(gameId));
  expect(fresh.status).toBe(409);
  expect(await fresh.json()).toMatchObject({ error: { code: "GAME_ARCHIVED" } });
  expect(await prisma.playerSecret.findUniqueOrThrow({ where: { playerId } })).toEqual(secret);
  await revokeSessionByHash(hashToken(token));
  expect((await playerStatusGet(new Request("http://localhost/api"), { params: Promise.resolve({ gameId, commandId }) })).status).toBe(404);
});

it("scoped browser admission never leaks into a later trusted service call", async () => {
  const game = await games.createGame("Scope");
  const viewer = await storyteller(game.gameId);
  await prisma.browserSession.update({ where: { id: viewer.sessionId }, data: { revokedAt: new Date() } });
  await expect(withGameAdmission(game.gameId, viewer, () => games.renameGame({ gameId: game.gameId, expectedVersion: 1, commandId: randomUUID(), name: "Denied" }))).rejects.toMatchObject({ code: "GAME_NOT_FOUND" });
  expect(await games.renameGame({ gameId: game.gameId, expectedVersion: 1, commandId: randomUUID(), name: "Trusted" })).toEqual({ version: 2 });
});
