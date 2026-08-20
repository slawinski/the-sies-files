import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb, createGameWithPlayers } from "./helpers/db";
import { prisma } from "@/lib/db";
import {
  createCheckpoint,
  validateCheckpoint,
  runConsistencyChecks,
  resetPlayerAccess,
  recoveryOverride,
  getCommandStatus,
} from "@/modules/recovery/recovery.service";
import { alignmentOf, type CharacterId } from "@/modules/trouble-brewing/characters";
import type { SetupCandidate } from "@/modules/setup/types";

beforeEach(resetDb);

const ROLES: CharacterId[] = [
  "MONK", "SOLDIER", "EMPATH", "CHEF", "FORTUNE_TELLER", "WASHERWOMAN",
  "INVESTIGATOR", "MAYOR", "RAVENKEEPER", "POISONER", "BARON", "SPY", "IMP",
];

async function setup() {
  const { gameId, playerIds } = await createGameWithPlayers(13);
  const assignments = playerIds.map((playerId, i) => ({
    playerId, virtualSeat: i, participantKind: "NORMAL" as const,
    trueCharacterId: ROLES[i], perceivedCharacterId: ROLES[i], trueAlignment: alignmentOf(ROLES[i]),
  }));
  const candidate: SetupCandidate = {
    generatorVersion: 1, participantCount: 13, normalCount: 13,
    assignments, fortuneTellerRedHerringPlayerId: null, demonBluffs: [],
  };
  await prisma.setupDraft.create({
    data: { gameId, generatorVersion: 1, seed: "t", candidateJson: candidate as never, regenerationIndex: 0, committedAt: new Date(), setupHash: "t" },
  });
  for (const a of assignments) {
    await prisma.playerSecret.create({
      data: { playerId: a.playerId, trueCharacterId: a.trueCharacterId, perceivedCharacterId: a.perceivedCharacterId, trueAlignment: a.trueAlignment, abilityStateJson: {} },
    });
  }
  await prisma.gameSession.update({ where: { id: gameId }, data: { status: "ROLE_REVEAL", scriptId: "TROUBLE_BREWING", scriptVersion: 1 } });
  const game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
  return { gameId, playerIds, version: game.version };
}

describe("Slice 6 — control plane + recovery", () => {
  it("creates and validates a checkpoint", async () => {
    const { gameId, version } = await setup();
    const { checkpointId } = await createCheckpoint({ gameId, commandId: randomUUID(), expectedVersion: version, reason: "test" });
    const validation = await validateCheckpoint(gameId, checkpointId);
    expect(validation.valid).toBe(true);
  });

  it("reports a healthy game: core consistency checks pass", async () => {
    const { gameId } = await setup();
    const issues = await runConsistencyChecks(gameId);
    expect(issues.find((i) => i.check === "VIRTUAL_CIRCLE_CONTIGUOUS")?.ok).toBe(true);
    expect(issues.find((i) => i.check === "VERSION_MATCHES_EVENTS")?.ok).toBe(true);
    expect(issues.find((i) => i.check === "ONE_LIVING_DEMON")?.ok).toBe(true);
  });

  it("applies a CORRECT_ALIVE override with an audited reason", async () => {
    const { gameId, playerIds, version } = await setup();
    const p = playerIds[0];
    await recoveryOverride({
      gameId,
      commandId: randomUUID(),
      expectedVersion: version,
      payload: { kind: "CORRECT_ALIVE", playerId: p, alive: false },
      reason: "operator mistake correction",
    });
    const player = await prisma.player.findUniqueOrThrow({ where: { id: p } });
    expect(player.alive).toBe(false);
    const event = await prisma.domainEvent.findFirst({ where: { gameId, eventType: "RECOVERY_OVERRIDE_APPLIED" } });
    expect(event).not.toBeNull();
    expect((event!.payload as { reason: string }).reason).toBe("operator mistake correction");
  });

  it("resets player access: old session revoked, fresh claim token issued", async () => {
    const { gameId, playerIds, version } = await setup();
    const p = playerIds[0];
    await prisma.browserSession.create({
      data: { playerId: p, sessionTokenHash: "old-session-hash", expiresAt: new Date(Date.now() + 100000) },
    });
    const { claimToken } = await resetPlayerAccess({ gameId, playerId: p, commandId: randomUUID(), expectedVersion: version });
    expect(claimToken).toBeTruthy();
    const oldSession = await prisma.browserSession.findFirst({ where: { playerId: p, sessionTokenHash: "old-session-hash" } });
    expect(oldSession!.revokedAt).not.toBeNull();
    const claim = await prisma.playerClaim.findUniqueOrThrow({ where: { playerId: p } });
    expect(claim.tokenHash).not.toBe(claimToken); // only the hash is stored
  });

  it("looks up a command receipt by id", async () => {
    const { gameId, version } = await setup();
    const commandId = randomUUID();
    await createCheckpoint({ gameId, commandId, expectedVersion: version, reason: "t" });
    const status = await getCommandStatus(gameId, commandId);
    expect(status.status).toBe("APPLIED");
    expect(status.resultingGameVersion).toBe(version + 1);
  });
});
