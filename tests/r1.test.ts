import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb, createGameWithPlayers, defaultActionTargets } from "./helpers/db";
import { prisma } from "@/lib/db";
import { generateSetup, commitSetup } from "@/modules/setup/setup.service";
import { startOperational, submitAction, resolveAction, completeOperational } from "@/modules/operational/operational.service";
import { loadStorytellerData } from "@/modules/projections/load";
import {
  createCheckpoint,
  verifyReplay,
  classifyPresence,
  classifyEventCategory,
  categoryEventTypes,
  AUDIT_CATEGORIES,
} from "@/modules/recovery/recovery.service";
import { EVENTS } from "@/modules/events/event-types";
import { alignmentOf, type CharacterId } from "@/modules/trouble-brewing/characters";
import type { SetupCandidate } from "@/modules/setup/types";

beforeEach(resetDb);

const ROLES: CharacterId[] = [
  "MONK", "SOLDIER", "EMPATH", "CHEF", "FORTUNE_TELLER", "WASHERWOMAN",
  "INVESTIGATOR", "MAYOR", "RAVENKEEPER", "POISONER", "BARON", "SPY", "IMP",
];

async function setupCustom() {
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

async function runCycle(gameId: string, version: number, playerIds: string[], impTarget?: string): Promise<number> {
  let v = (await startOperational({ gameId, commandId: randomUUID(), expectedVersion: version })).version;
  for (let g = 0; g < 200; g += 1) {
    const st = await loadStorytellerData(gameId);
    const active = (st.operational?.actions ?? []).find((a) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER");
    if (!active) break;
    if (active.status === "WAITING_FOR_PLAYER") {
      const targets = impTarget && active.kind === "IMP_CHOOSE" ? [impTarget] : defaultActionTargets(active.kind, active.actorPlayerId!, playerIds);
      v = (await submitAction({ gameId, playerId: active.actorPlayerId!, actionId: active.id, commandId: randomUUID(), expectedVersion: v, targetPlayerIds: targets })).version;
    } else {
      v = (await resolveAction({ gameId, actionId: active.id, commandId: randomUUID(), expectedVersion: v })).version;
    }
  }
  return (await completeOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;
}

describe("R1 — realtime, checkpoints, replay, presence, audit", () => {
  it("creates automatic checkpoints at setup-commit and operational-completion boundaries", async () => {
    const { gameId, playerIds, version } = await createGameWithPlayers(13);
    let v = (await generateSetup({ gameId, commandId: randomUUID(), expectedVersion: version })).version;
    v = (await commitSetup({ gameId, commandId: randomUUID(), expectedVersion: v })).version;

    const setupCkpt = await prisma.checkpoint.findFirst({ where: { gameId, reason: "SETUP_COMMITTED" } });
    expect(setupCkpt).not.toBeNull();
    expect(setupCkpt!.boundaryKey).toBe(`SETUP_COMMITTED:${setupCkpt!.gameVersion}`);

    await runCycle(gameId, v, playerIds);
    const operationalCkpt = await prisma.checkpoint.findFirst({ where: { gameId, reason: "OPERATIONAL_COMPLETED" } });
    expect(operationalCkpt).not.toBeNull();

    const validation = await prisma.checkpoint.findFirst({ where: { id: operationalCkpt!.id } });
    expect(validation!.checksum.length).toBe(64);
  });

  it("replay verifier detects divergence after a death", async () => {
    const { gameId, playerIds, version } = await setupCustom();

    const { checkpointId } = await createCheckpoint({ gameId, commandId: randomUUID(), expectedVersion: version, reason: "MANUAL" });
    const v = version + 1;

    // Cycle 1 (no kill) then cycle 2, where the Imp kills the Chef.
    const afterCycle1 = await runCycle(gameId, v, playerIds);
    await runCycle(gameId, afterCycle1, playerIds, playerIds[ROLES.indexOf("CHEF")]);

    const before = await verifyReplay(gameId, checkpointId);
    expect(before.ok).toBe(true);

    // Corrupt the authoritative state.
    const victim = playerIds[ROLES.indexOf("CHEF")];
    await prisma.player.update({ where: { id: victim }, data: { alive: true } });
    const after = await verifyReplay(gameId, checkpointId);
    expect(after.ok).toBe(false);
    expect(after.divergences.some((d) => d.path === `players.${victim}.alive`)).toBe(true);
  });

  it("classifies presence with deterministic thresholds", () => {
    const now = new Date("2026-08-21T20:00:00Z");
    expect(classifyPresence(new Date(now.getTime() - 5_000), now)).toBe("ONLINE");
    expect(classifyPresence(new Date(now.getTime() - 60_000), now)).toBe("STALE");
    expect(classifyPresence(new Date(now.getTime() - 600_000), now)).toBe("OFFLINE");
  });

  it("every current event type has an audit category", () => {
    for (const type of Object.values(EVENTS)) {
      expect(AUDIT_CATEGORIES).toContain(classifyEventCategory(type));
    }
    expect(categoryEventTypes(["OPERATIONAL"])).toContain("PLAYER_ACTION_SUBMITTED");
    expect(categoryEventTypes(["OPERATIONAL"])).not.toContain("VOTE_LOCKED");
  });
});
