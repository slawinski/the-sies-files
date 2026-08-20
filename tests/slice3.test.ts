import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb, createGameWithPlayers } from "./helpers/db";
import { prisma } from "@/lib/db";
import {
  startOperational,
  submitAction,
  resolveAction,
  completeOperational,
} from "@/modules/operational/operational.service";
import { loadStorytellerData } from "@/modules/projections/load";
import { alignmentOf, type CharacterId } from "@/modules/trouble-brewing/characters";
import type { SetupCandidate } from "@/modules/setup/types";

beforeEach(resetDb);

async function setupCustomRoles(roles: CharacterId[]) {
  const { gameId, playerIds } = await createGameWithPlayers(roles.length);
  const assignments = playerIds.map((playerId, i) => ({
    playerId,
    virtualSeat: i,
    participantKind: "NORMAL" as const,
    trueCharacterId: roles[i],
    perceivedCharacterId: roles[i],
    trueAlignment: alignmentOf(roles[i]),
  }));
  const candidate: SetupCandidate = {
    generatorVersion: 1,
    participantCount: roles.length,
    normalCount: roles.length,
    assignments,
    fortuneTellerRedHerringPlayerId: null,
    demonBluffs: [],
  };
  await prisma.setupDraft.create({
    data: {
      gameId,
      generatorVersion: 1,
      seed: "test",
      candidateJson: candidate as never,
      regenerationIndex: 0,
      committedAt: new Date(),
      setupHash: "test",
    },
  });
  for (const a of assignments) {
    await prisma.playerSecret.create({
      data: {
        playerId: a.playerId,
        trueCharacterId: a.trueCharacterId,
        perceivedCharacterId: a.perceivedCharacterId,
        trueAlignment: a.trueAlignment,
        abilityStateJson: {},
      },
    });
  }
  await prisma.gameSession.update({
    where: { id: gameId },
    data: { status: "ROLE_REVEAL", scriptId: "TROUBLE_BREWING", scriptVersion: 1 },
  });
  const game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
  return { gameId, playerIds, version: game.version };
}

// Resolve the current Operational phase in order, completing it at the end.
async function driveCycle(gameId: string, version: number, kindTargets: Record<string, string[]> = {}): Promise<number> {
  let v = version;
  for (let guard = 0; guard < 200; guard += 1) {
    const st = await loadStorytellerData(gameId);
    const actions = st.operational?.actions ?? [];
    const active = actions.find(
      (a) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER",
    );
    if (!active) break;

    if (active.status === "WAITING_FOR_PLAYER") {
      const targets = kindTargets[active.kind] ?? ["other-player-placeholder"];
      v = (await submitAction({
        gameId,
        playerId: active.actorPlayerId!,
        actionId: active.id,
        commandId: randomUUID(),
        expectedVersion: v,
        targetPlayerIds: targets,
      })).version;
    } else {
      v = (await resolveAction({ gameId, actionId: active.id, commandId: randomUUID(), expectedVersion: v })).version;
    }
  }
  return (await completeOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;
}

async function runFirstCycle(gameId: string, version: number): Promise<number> {
  const v = (await startOperational({ gameId, commandId: randomUUID(), expectedVersion: version })).version;
  return driveCycle(gameId, v);
}

const ROLES13: CharacterId[] = [
  "MONK",
  "SOLDIER",
  "EMPATH",
  "CHEF",
  "FORTUNE_TELLER",
  "WASHERWOMAN",
  "INVESTIGATOR",
  "MAYOR",
  "RAVENKEEPER",
  "POISONER",
  "SCARLET_WOMAN",
  "SPY",
  "IMP",
];

describe("Slice 3 — recurring Operational engine", () => {
  it("second cycle applies a Demon kill but Monk protection saves the target", async () => {
    const { gameId, playerIds, version } = await setupCustomRoles(ROLES13);
    let v = await runFirstCycle(gameId, version);

    let game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.phase).toBe("INVESTIGATION");
    expect(game.cycleNumber).toBe(1);

    // Start cycle 2.
    v = (await startOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;
    game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.cycleNumber).toBe(2);

    const soldier = playerIds[ROLES13.indexOf("SOLDIER")];
    const empath = playerIds[ROLES13.indexOf("EMPATH")];

    // Poison the Soldier; Monk protects the Empath; Imp kills the Empath.
    await driveCycle(gameId, v, {
      POISONER_CHOOSE: [soldier],
      MONK_CHOOSE: [empath],
      IMP_CHOOSE: [empath],
    });

    const empathRow = await prisma.player.findUniqueOrThrow({ where: { id: empath } });
    expect(empathRow.alive).toBe(true); // Monk-protected
    const soldierEffect = await prisma.effect.findFirst({
      where: { effectType: "POISONED", targetPlayerId: soldier, active: true },
    });
    expect(soldierEffect).not.toBeNull();
  });

  it("kills an unprotected target", async () => {
    const { gameId, playerIds, version } = await setupCustomRoles(ROLES13);
    let v = await runFirstCycle(gameId, version);
    v = (await startOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;

    const chef = playerIds[ROLES13.indexOf("CHEF")];
    await driveCycle(gameId, v, { IMP_CHOOSE: [chef] });

    const chefRow = await prisma.player.findUniqueOrThrow({ where: { id: chef } });
    expect(chefRow.alive).toBe(false);
  });

  it("Imp self-kill triggers star-pass to the Scarlet Woman", async () => {
    const { gameId, playerIds, version } = await setupCustomRoles(ROLES13);
    let v = await runFirstCycle(gameId, version);
    v = (await startOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;

    const imp = playerIds[ROLES13.indexOf("IMP")];
    const scarlet = playerIds[ROLES13.indexOf("SCARLET_WOMAN")];

    await driveCycle(gameId, v, { IMP_CHOOSE: [imp] });

    const impRow = await prisma.player.findUniqueOrThrow({ where: { id: imp } });
    expect(impRow.alive).toBe(false);
    const scarletSecret = await prisma.playerSecret.findUniqueOrThrow({ where: { playerId: scarlet } });
    expect(scarletSecret.trueCharacterId).toBe("IMP");
  });
});
