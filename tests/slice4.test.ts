import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb, createGameWithPlayers } from "./helpers/db";
import { prisma } from "@/lib/db";
import { tallyVotes, type VoterState } from "@/modules/investigation/voting";
import { checkGenericVictory, checkMayorVictory } from "@/modules/investigation/victory";
import {
  openNominations,
  nominate,
  voteIntent,
  lockVote,
  resolveExecution,
} from "@/modules/investigation/investigation.service";
import { startOperational, submitAction, resolveAction, completeOperational } from "@/modules/operational/operational.service";
import { loadStorytellerData } from "@/modules/projections/load";
import { alignmentOf, type CharacterId } from "@/modules/trouble-brewing/characters";
import type { SetupCandidate } from "@/modules/setup/types";

beforeEach(resetDb);

function voter(partial: Partial<VoterState> & { playerId: string }): VoterState {
  return {
    rawIntent: false,
    alive: true,
    participantKind: "NORMAL",
    ghostVoteAvailable: false,
    isButler: false,
    isBureaucratTarget: false,
    ...partial,
  };
}

describe("voting tally (pure)", () => {
  it("counts raw + effective votes with Bureaucrat x3 and ghost votes", () => {
    const voters = [
      voter({ playerId: "A", rawIntent: true }),
      voter({ playerId: "B", rawIntent: true, isButler: true }),
      voter({ playerId: "C", rawIntent: true }),
      voter({ playerId: "D", rawIntent: true, alive: false, ghostVoteAvailable: true }),
      voter({ playerId: "E", rawIntent: true, isBureaucratTarget: true }),
    ];
    const tally = tallyVotes(voters, "C");
    expect(tally.rawVotes).toBe(5);
    expect(tally.effectiveTotal).toBe(1 + 1 + 1 + 1 + 3);
    expect(tally.consumedGhostVotes).toEqual(["D"]);
  });

  it("invalidates a Butler vote when the master is not voting", () => {
    const voters = [
      voter({ playerId: "B", rawIntent: true, isButler: true }),
      voter({ playerId: "C", rawIntent: false }),
    ];
    const tally = tallyVotes(voters, "C");
    expect(tally.effectiveTotal).toBe(0);
    expect(tally.invalidVotes).toHaveLength(1);
  });

  it("rejects a dead Traveller (no ghost vote)", () => {
    const voters = [voter({ playerId: "T", rawIntent: true, alive: false, participantKind: "TRAVELLER", ghostVoteAvailable: false })];
    const tally = tallyVotes(voters, null);
    expect(tally.effectiveTotal).toBe(0);
  });
});

describe("victory (pure)", () => {
  it("good wins when the Demon is dead", () => {
    expect(checkGenericVictory({ livingNormalCount: 5, demonAlive: false })).toEqual({ winner: "GOOD", reason: "DEMON_DEAD" });
  });
  it("evil wins at 2 alive with a living Demon", () => {
    expect(checkGenericVictory({ livingNormalCount: 2, demonAlive: true })).toEqual({ winner: "EVIL", reason: "EVIL_TERMINAL" });
  });
  it("no winner otherwise", () => {
    expect(checkGenericVictory({ livingNormalCount: 4, demonAlive: true }).winner).toBeNull();
  });
  it("Mayor wins with exactly 3 alive and no execution", () => {
    expect(checkMayorVictory({ livingNormalCount: 3, mayorAlive: true, executionOccurred: false })).toEqual({ winner: "GOOD", reason: "MAYOR" });
    expect(checkMayorVictory({ livingNormalCount: 3, mayorAlive: true, executionOccurred: true }).winner).toBeNull();
  });
});

const ROLES13: CharacterId[] = [
  "MONK", "SOLDIER", "EMPATH", "CHEF", "FORTUNE_TELLER", "WASHERWOMAN",
  "INVESTIGATOR", "MAYOR", "RAVENKEEPER", "POISONER", "BARON", "SPY", "IMP",
];

describe("Slice 4 — execution and victory (integration)", () => {
  it("executing the Demon ends the game with a GOOD win", async () => {
    // Custom committed setup.
    const { gameId, playerIds } = await createGameWithPlayers(13);
    const assignments = playerIds.map((playerId, i) => ({
      playerId, virtualSeat: i, participantKind: "NORMAL" as const,
      trueCharacterId: ROLES13[i], perceivedCharacterId: ROLES13[i],
      trueAlignment: alignmentOf(ROLES13[i]),
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
    let game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    let v = game.version;

    // First Operational cycle.
    v = (await startOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;
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
    v = (await completeOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;

    // Nominate + execute the Imp.
    const imp = playerIds[ROLES13.indexOf("IMP")];
    const nominator = playerIds[0];
    v = (await openNominations({ gameId, commandId: randomUUID(), expectedVersion: v })).version;
    const n = await nominate({ gameId, nominatorId: nominator, nomineeId: imp, commandId: randomUUID(), expectedVersion: v });
    v = n.version;

    const players = await prisma.player.findMany({ where: { gameId, alive: true } });
    for (const p of players) {
      v = (await voteIntent({ gameId, nominationId: n.nominationId, playerId: p.id, intent: true, commandId: randomUUID(), expectedVersion: v })).version;
    }
    v = (await lockVote({ gameId, nominationId: n.nominationId, commandId: randomUUID(), expectedVersion: v })).version;
    const ex = await resolveExecution({ gameId, commandId: randomUUID(), expectedVersion: v });

    expect(ex.winner).toBe("GOOD");
    game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.status).toBe("ENDED");
    expect(game.winner).toBe("GOOD");
  });
});
