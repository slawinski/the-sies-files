import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb, createGameWithPlayers } from "./helpers/db";
import { prisma } from "@/lib/db";
import { scanQr } from "@/modules/scenario/scenario.service";
import { startOperational, submitAction, resolveAction, completeOperational } from "@/modules/operational/operational.service";
import { loadStorytellerData } from "@/modules/projections/load";
import { alignmentOf, type CharacterId } from "@/modules/trouble-brewing/characters";
import type { SetupCandidate } from "@/modules/setup/types";

beforeEach(resetDb);

const ROLES13: CharacterId[] = [
  "MONK", "SOLDIER", "EMPATH", "CHEF", "FORTUNE_TELLER", "WASHERWOMAN",
  "INVESTIGATOR", "MAYOR", "RAVENKEEPER", "POISONER", "BARON", "SPY", "IMP",
];

async function commitCustomSetup() {
  const { gameId, playerIds } = await createGameWithPlayers(13);
  const assignments = playerIds.map((playerId, i) => ({
    playerId, virtualSeat: i, participantKind: "NORMAL" as const,
    trueCharacterId: ROLES13[i], perceivedCharacterId: ROLES13[i], trueAlignment: alignmentOf(ROLES13[i]),
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

async function runFirstCycle(gameId: string, version: number): Promise<number> {
  let v = (await startOperational({ gameId, commandId: randomUUID(), expectedVersion: version })).version;
  for (let g = 0; g < 200; g += 1) {
    const st = await loadStorytellerData(gameId);
    const active = (st.operational?.actions ?? []).find((a) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER");
    if (!active) break;
    if (active.status === "WAITING_FOR_PLAYER") {
      v = (await submitAction({ gameId, playerId: active.actorPlayerId!, actionId: active.id, commandId: randomUUID(), expectedVersion: v, targetPlayerIds: ["x"] })).version;
    } else {
      v = (await resolveAction({ gameId, actionId: active.id, commandId: randomUUID(), expectedVersion: v })).version;
    }
  }
  return (await completeOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;
}

describe("Slice 5 — scenario engine", () => {
  it("terrain is unavailable during Operational", async () => {
    const { gameId, playerIds, version } = await commitCustomSetup();
    const v = (await startOperational({ gameId, commandId: randomUUID(), expectedVersion: version })).version;
    await expect(
      scanQr({ gameId, playerId: playerIds[0], token: "tsf-qr-letter-001", commandId: randomUUID(), expectedVersion: v }),
    ).rejects.toMatchObject({ code: "TERRAIN_UNAVAILABLE" });
  });

  it("scan reveals a clue, issues a task, and is one-per-player", async () => {
    const { gameId, playerIds, version } = await commitCustomSetup();
    let v = await runFirstCycle(gameId, version);
    const p = playerIds[0];

    const commandId = randomUUID();
    const first = await scanQr({ gameId, playerId: p, token: "tsf-qr-letter-001", commandId, expectedVersion: v });
    v = first.version;
    const outcome = first.outcome as { discoveries: string[]; tasks: string[] };
    expect(outcome.discoveries).toContain("clue-letter");
    expect(outcome.tasks).toContain("task-examine-letter");

    // Idempotency: same commandId returns the original result, no duplicate scan row.
    await scanQr({ gameId, playerId: p, token: "tsf-qr-letter-001", commandId, expectedVersion: v });
    const scanRows = await prisma.qrScan.findMany({ where: { gameId, playerId: p, commandId } });
    expect(scanRows).toHaveLength(1);

    // Re-scan with a new commandId → already consumed (one-per-player).
    await expect(
      scanQr({ gameId, playerId: p, token: "tsf-qr-letter-001", commandId: randomUUID(), expectedVersion: v }),
    ).rejects.toMatchObject({ code: "QR_ALREADY_CONSUMED" });
  });

  it("annex QR unlocks the extended map and does not change core game state", async () => {
    const { gameId, playerIds, version } = await commitCustomSetup();
    const v = await runFirstCycle(gameId, version);
    const before = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });

    await scanQr({ gameId, playerId: playerIds[0], token: "tsf-qr-annex-001", commandId: randomUUID(), expectedVersion: v });

    const state = await prisma.scenarioState.findUniqueOrThrow({ where: { gameId } });
    expect(state.mapVersionId).toBe("MAP_EXTENDED");
    expect(state.stageId).toBe("stage-finale");

    const after = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    expect(after.phase).toBe(before.phase); // core game state untouched
    expect(after.status).toBe(before.status);
    expect(after.winner).toBe(before.winner);
  });

  it("trap QR applies INJURED, first-aid clears it", async () => {
    const { gameId, playerIds, version } = await commitCustomSetup();
    const v = await runFirstCycle(gameId, version);
    const p = playerIds[0];

    const afterTrap = (await scanQr({ gameId, playerId: p, token: "tsf-qr-trap-001", commandId: randomUUID(), expectedVersion: v })).version;
    let cond = await prisma.scenarioCondition.findFirst({ where: { gameId, conditionId: "INJURED", active: true } });
    expect(cond).not.toBeNull();

    await scanQr({ gameId, playerId: p, token: "tsf-qr-first-aid-001", commandId: randomUUID(), expectedVersion: afterTrap });
    cond = await prisma.scenarioCondition.findFirst({ where: { gameId, conditionId: "INJURED", active: true } });
    expect(cond).toBeNull();
  });
});
