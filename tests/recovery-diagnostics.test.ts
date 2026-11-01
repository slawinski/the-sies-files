import { beforeEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { createGameWithPlayers, resetDb } from "./helpers/db";
import { computeCheckpointChecksum, createCheckpoint, recoveryOverride, verifyReplay } from "@/modules/recovery/recovery.service";

beforeEach(resetDb);

async function specimen() {
  const game = await createGameWithPlayers(2);
  const checkpoint = await createCheckpoint({ ...game, expectedVersion: game.version, commandId: randomUUID() });
  return { ...game, ...checkpoint };
}

it("rejects a checksum mismatch even when player flags match", async () => {
  const { gameId, checkpointId } = await specimen();
  await prisma.checkpoint.update({ where: { id: checkpointId }, data: { checksum: "tampered" } });
  const report = await verifyReplay(gameId, checkpointId);
  expect(report.ok).toBe(false);
  expect(report.coverage.unverifiedReasons).toContainEqual({ code: "CHECKSUM_MISMATCH" });
});

it("replays a newly audited player correction with identity and before/after values", async () => {
  const { gameId, playerIds, checkpointId, version } = await specimen();
  await recoveryOverride({ gameId, expectedVersion: version, commandId: randomUUID(), reason: "synthetic correction", payload: { kind: "CORRECT_ALIVE", playerId: playerIds[0], alive: false } });
  const event = await prisma.domainEvent.findFirstOrThrow({ where: { gameId, eventType: "RECOVERY_OVERRIDE_APPLIED" } });
  expect(event.payload).toMatchObject({ playerId: playerIds[0], before: { alive: true }, after: { alive: false } });
  expect((await verifyReplay(gameId, checkpointId)).ok).toBe(true);
});

it("never accepts a deleted tail event", async () => {
  const { gameId, checkpointId } = await specimen();
  const tail = await prisma.domainEvent.findFirstOrThrow({ where: { gameId }, orderBy: { sequence: "desc" } });
  await prisma.domainEvent.delete({ where: { id: tail.id } });
  expect((await verifyReplay(gameId, checkpointId)).ok).toBe(false);
});

it("reports legacy identity-less overrides as unverified, not matching flags", async () => {
  const { gameId, playerIds, checkpointId, version } = await specimen();
  await recoveryOverride({ gameId, expectedVersion: version, commandId: randomUUID(), reason: "synthetic legacy", payload: { kind: "RESTORE_GHOST_VOTE", playerId: playerIds[0] } });
  await prisma.domainEvent.updateMany({ where: { gameId, eventType: "RECOVERY_OVERRIDE_APPLIED" }, data: { payload: { kind: "RESTORE_GHOST_VOTE", before: { ghostVoteAvailable: true }, after: { ghostVoteAvailable: true } } } });
  expect((await verifyReplay(gameId, checkpointId)).ok).toBe(false);
});

it.each(["malformed", "duplicate", "wrong-game", "missing-member"])("rejects a checksum-valid %s snapshot", async (kind) => {
  const { gameId, checkpointId } = await specimen();
  const checkpoint = await prisma.checkpoint.findUniqueOrThrow({ where: { id: checkpointId } });
  const snapshot = JSON.parse(JSON.stringify(checkpoint.snapshotJson));
  if (kind === "malformed") snapshot.players[0].alive = "true";
  if (kind === "duplicate") snapshot.players.push(snapshot.players[0]);
  if (kind === "wrong-game") snapshot.game.id = randomUUID();
  if (kind === "missing-member") snapshot.players.pop();
  await prisma.checkpoint.update({ where: { id: checkpointId }, data: { snapshotJson: snapshot, checksum: computeCheckpointChecksum(snapshot) } });
  expect((await verifyReplay(gameId, checkpointId)).ok).toBe(false);
});

it("accepts an untouched manual checkpoint with exact target counters", async () => {
  const { gameId, checkpointId, version } = await specimen();
  const game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
  expect(await verifyReplay(gameId, checkpointId)).toMatchObject({ ok: true, scope: "PLAYER_FLAGS", replayVersion: 2,
    targetGameVersion: version, throughSequence: game.eventSequence, targetEventSequence: game.eventSequence, coverage: { complete: true, unverifiedReasons: [] } });
});

it.each(["unknown", "unknown-player", "bad-before", "bad-payload", "decreasing-version", "future-version", "gap", "target-version"])("fails closed for %s", async (kind) => {
  const { gameId, playerIds, checkpointId, version } = await specimen();
  await recoveryOverride({ gameId, expectedVersion: version, commandId: randomUUID(), reason: "synthetic", payload: { kind: "CORRECT_ALIVE", playerId: playerIds[0], alive: true } });
  const event = await prisma.domainEvent.findFirstOrThrow({ where: { gameId, eventType: "RECOVERY_OVERRIDE_APPLIED" } });
  if (kind === "unknown") await prisma.domainEvent.update({ where: { id: event.id }, data: { eventType: "FUTURE_EVENT" } });
  if (kind === "unknown-player") await prisma.domainEvent.update({ where: { id: event.id }, data: { eventType: "PLAYER_DIED", payload: { playerId: randomUUID() } } });
  if (kind === "bad-payload") await prisma.domainEvent.update({ where: { id: event.id }, data: { eventType: "PLAYER_DIED", payload: { playerId: 3 } } });
  if (kind === "bad-before") await prisma.domainEvent.update({ where: { id: event.id }, data: { payload: { kind: "CORRECT_ALIVE", playerId: playerIds[0], before: { alive: false }, after: { alive: true } } } });
  if (kind === "decreasing-version") await prisma.domainEvent.update({ where: { id: event.id }, data: { gameVersion: 0 } });
  if (kind === "future-version") await prisma.domainEvent.update({ where: { id: event.id }, data: { gameVersion: version + 2 } });
  if (kind === "gap") await prisma.domainEvent.deleteMany({ where: { gameId, eventType: "CHECKPOINT_CREATED" } });
  if (kind === "target-version") await prisma.gameSession.update({ where: { id: gameId }, data: { version: version + 2 } });
  const result = await verifyReplay(gameId, checkpointId);
  expect(result.ok).toBe(false);
  expect(result.coverage.complete).toBe(false);
});

it("rejects future checkpoint bounds and extra current membership", async () => {
  const { gameId, checkpointId } = await specimen();
  await prisma.checkpoint.update({ where: { id: checkpointId }, data: { lastEventSequence: 10000 } });
  expect((await verifyReplay(gameId, checkpointId)).ok).toBe(false);
  await prisma.player.create({ data: { gameId, displayName: "unexpected", virtualSeat: 2 } });
  expect((await verifyReplay(gameId, checkpointId)).coverage.unverifiedReasons).toContainEqual({ code: "PLAYER_MEMBERSHIP_MISMATCH" });
});

it("replays a ghost vote override using its prior value", async () => {
  const { gameId, checkpointId, playerIds, version } = await specimen();
  await recoveryOverride({ gameId, expectedVersion: version, commandId: randomUUID(), reason: "synthetic", payload: { kind: "RESTORE_GHOST_VOTE", playerId: playerIds[0] } });
  expect((await verifyReplay(gameId, checkpointId)).ok).toBe(true);
});
