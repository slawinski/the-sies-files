import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb, createGameWithPlayers, defaultActionTargets } from "./helpers/db";
import { prisma } from "@/lib/db";
import { validateTargets } from "@/modules/operational/targets";
import { getRegistrationOptions, resolveRegistrationOptions } from "@/modules/trouble-brewing/registration";
import { markPlayerDead } from "@/modules/game-session/death";
import {
  startOperational,
  submitAction,
  resolveAction,
  completeOperational,
} from "@/modules/operational/operational.service";
import {
  openNominations,
  nominate,
  slayer,
  resolveSlayerDecision,
} from "@/modules/investigation/investigation.service";
import { loadStorytellerData } from "@/modules/projections/load";
import { alignmentOf, type CharacterId } from "@/modules/trouble-brewing/characters";
import type { SetupCandidate } from "@/modules/setup/types";

beforeEach(resetDb);

const ROLES: CharacterId[] = [
  "MONK", "SOLDIER", "EMPATH", "CHEF", "FORTUNE_TELLER", "WASHERWOMAN",
  "INVESTIGATOR", "VIRGIN", "RAVENKEEPER", "POISONER", "BARON", "SPY", "IMP",
];

async function setupCustom(roles: CharacterId[]) {
  const { gameId, playerIds } = await createGameWithPlayers(roles.length);
  const assignments = playerIds.map((playerId, i) => ({
    playerId, virtualSeat: i, participantKind: "NORMAL" as const,
    trueCharacterId: roles[i], perceivedCharacterId: roles[i], trueAlignment: alignmentOf(roles[i]),
  }));
  const candidate: SetupCandidate = {
    generatorVersion: 1, participantCount: roles.length, normalCount: roles.length,
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

describe("Remediation — target contracts (pure)", () => {
  it("rejects Bureaucrat self-target and dead targets", () => {
    expect(() =>
      validateTargets({ kind: "BUREAUCRAT_CHOOSE", actorPlayerId: "a", targetPlayerIds: ["a"], targets: [{ playerId: "a", alive: true }] }),
    ).toThrow();
    expect(() =>
      validateTargets({ kind: "BUREAUCRAT_CHOOSE", actorPlayerId: "a", targetPlayerIds: ["b"], targets: [{ playerId: "b", alive: false }] }),
    ).toThrow();
  });

  it("rejects Butler self-target", () => {
    expect(() =>
      validateTargets({ kind: "BUTLER_CHOOSE", actorPlayerId: "a", targetPlayerIds: ["a"], targets: [{ playerId: "a", alive: true }] }),
    ).toThrow();
  });

  it("rejects cross-game targets and wrong cardinality", () => {
    expect(() =>
      validateTargets({ kind: "MONK_CHOOSE", actorPlayerId: "a", targetPlayerIds: ["x"], targets: [] }),
    ).toThrow();
    expect(() =>
      validateTargets({ kind: "FORTUNE_TELLER_CHOOSE", actorPlayerId: "a", targetPlayerIds: ["b"], targets: [{ playerId: "b", alive: true }] }),
    ).toThrow(); // requires 2 targets
  });
});

describe("Remediation — registration resolver (pure)", () => {
  it("ordinary players have a single true option", () => {
    const options = getRegistrationOptions(
      { playerId: "p", trueCharacterId: "CHEF", trueAlignment: "GOOD" },
      { kind: "CHARACTER", characterId: "IMP" },
      true,
    );
    expect(options).toHaveLength(1);
    expect(resolveRegistrationOptions(options)).toEqual({ kind: "AUTO", satisfies: false });
  });

  it("functioning Recluse may register as the Demon (bounded decision)", () => {
    const options = getRegistrationOptions(
      { playerId: "p", trueCharacterId: "RECLUSE", trueAlignment: "GOOD" },
      { kind: "CHARACTER", characterId: "IMP" },
      true,
    );
    const resolution = resolveRegistrationOptions(options);
    expect(resolution.kind).toBe("DECISION_REQUIRED");
  });

  it("functioning Spy may register as Townsfolk", () => {
    const options = getRegistrationOptions(
      { playerId: "p", trueCharacterId: "SPY", trueAlignment: "EVIL" },
      { kind: "CATEGORY", category: "TOWNSFOLK" },
      true,
    );
    expect(options.some((o) => o.optionId === "AS_TOWNSFOLK")).toBe(true);
  });
});

describe("Remediation — death/ghost votes + Virgin (integration)", () => {
  it("grants a ghost vote exactly once and never re-grants it", async () => {
    const { gameId, playerIds, version } = await setupCustom(ROLES);
    let v = (await startOperational({ gameId, commandId: randomUUID(), expectedVersion: version })).version;
    for (let g = 0; g < 200; g += 1) {
      const st = await loadStorytellerData(gameId);
      const active = (st.operational?.actions ?? []).find((a) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER");
      if (!active) break;
      if (active.status === "WAITING_FOR_PLAYER") {
        v = (await submitAction({ gameId, playerId: active.actorPlayerId!, actionId: active.id, commandId: randomUUID(), expectedVersion: v, targetPlayerIds: defaultActionTargets(active.kind, active.actorPlayerId!, playerIds) })).version;
      } else {
        v = (await resolveAction({ gameId, actionId: active.id, commandId: randomUUID(), expectedVersion: v })).version;
      }
    }
    v = (await completeOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;

    // Cycle 2: Imp kills the Chef.
    v = (await startOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;
    const chef = playerIds[ROLES.indexOf("CHEF")];
    for (let g = 0; g < 200; g += 1) {
      const st = await loadStorytellerData(gameId);
      const active = (st.operational?.actions ?? []).find((a) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER");
      if (!active) break;
      if (active.status === "WAITING_FOR_PLAYER") {
        const targets = active.kind === "IMP_CHOOSE" ? [chef] : defaultActionTargets(active.kind, active.actorPlayerId!, playerIds);
        v = (await submitAction({ gameId, playerId: active.actorPlayerId!, actionId: active.id, commandId: randomUUID(), expectedVersion: v, targetPlayerIds: targets })).version;
      } else {
        v = (await resolveAction({ gameId, actionId: active.id, commandId: randomUUID(), expectedVersion: v })).version;
      }
    }

    const chefRow = await prisma.player.findUniqueOrThrow({ where: { id: chef } });
    expect(chefRow.alive).toBe(false);
    expect(chefRow.ghostVoteAvailable).toBe(true); // ghost vote granted

    // markPlayerDead is idempotent: a second call never resets a consumed vote.
    await prisma.player.update({ where: { id: chef }, data: { ghostVoteAvailable: false } });
    await prisma.$transaction(async (tx) => {
      await markPlayerDead(tx, {
        gameId, playerId: chef, source: "OTHER", cycleNumber: 2, phase: "OPERATIONAL", executed: false,
        appendEvent: async () => 0,
      });
    });
    const after = await prisma.player.findUniqueOrThrow({ where: { id: chef } });
    expect(after.ghostVoteAvailable).toBe(false); // consumed vote stays consumed
  });

  it("a functioning Virgin executes a Townsfolk nominator (VIRGIN source)", async () => {
    const { gameId, playerIds, version } = await setupCustom(ROLES);
    let v = (await startOperational({ gameId, commandId: randomUUID(), expectedVersion: version })).version;
    for (let g = 0; g < 200; g += 1) {
      const st = await loadStorytellerData(gameId);
      const active = (st.operational?.actions ?? []).find((a) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER");
      if (!active) break;
      if (active.status === "WAITING_FOR_PLAYER") {
        v = (await submitAction({ gameId, playerId: active.actorPlayerId!, actionId: active.id, commandId: randomUUID(), expectedVersion: v, targetPlayerIds: defaultActionTargets(active.kind, active.actorPlayerId!, playerIds) })).version;
      } else {
        v = (await resolveAction({ gameId, actionId: active.id, commandId: randomUUID(), expectedVersion: v })).version;
      }
    }
    v = (await completeOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;

    const virgin = playerIds[ROLES.indexOf("VIRGIN")];
    const nominator = playerIds[ROLES.indexOf("CHEF")]; // a Townsfolk
    v = (await openNominations({ gameId, commandId: randomUUID(), expectedVersion: v })).version;
    await nominate({ gameId, nominatorId: nominator, nomineeId: virgin, commandId: randomUUID(), expectedVersion: v });

    const nominatorRow = await prisma.player.findUniqueOrThrow({ where: { id: nominator } });
    expect(nominatorRow.alive).toBe(false); // executed by the Virgin
    const death = await prisma.deathRecord.findFirst({ where: { gameId, playerId: nominator, source: "VIRGIN" } });
    expect(death).not.toBeNull();
    const nomination = await prisma.nomination.findFirst({ where: { gameId, nomineeId: virgin } });
    expect(nomination!.status).toBe("RESOLVED"); // terminal — no vote opens
  });

  it("Slayer vs functioning Recluse produces a bounded Storyteller decision", async () => {
    const roles: CharacterId[] = [
      "MONK", "SOLDIER", "EMPATH", "CHEF", "FORTUNE_TELLER", "WASHERWOMAN",
      "INVESTIGATOR", "SLAYER", "RAVENKEEPER", "RECLUSE", "POISONER", "SPY", "IMP",
    ];
    const { gameId, playerIds, version } = await setupCustom(roles);
    let v = (await startOperational({ gameId, commandId: randomUUID(), expectedVersion: version })).version;
    for (let g = 0; g < 200; g += 1) {
      const st = await loadStorytellerData(gameId);
      const active = (st.operational?.actions ?? []).find((a) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER");
      if (!active) break;
      if (active.status === "WAITING_FOR_PLAYER") {
        v = (await submitAction({ gameId, playerId: active.actorPlayerId!, actionId: active.id, commandId: randomUUID(), expectedVersion: v, targetPlayerIds: defaultActionTargets(active.kind, active.actorPlayerId!, playerIds) })).version;
      } else {
        v = (await resolveAction({ gameId, actionId: active.id, commandId: randomUUID(), expectedVersion: v })).version;
      }
    }
    v = (await completeOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;

    const slayerId = playerIds[roles.indexOf("SLAYER")];
    const recluseId = playerIds[roles.indexOf("RECLUSE")];

    // The shot is ambiguous: no death, decision persisted.
    const shot = await slayer({ gameId, playerId: slayerId, targetPlayerId: recluseId, commandId: randomUUID(), expectedVersion: v });
    v = shot.version;
    expect(shot.winner).toBeNull();
    expect(shot.decisionRequired).toBe(true);

    const recluseRow = await prisma.player.findUniqueOrThrow({ where: { id: recluseId } });
    expect(recluseRow.alive).toBe(true); // no death until adjudicated

    // Storyteller chooses "register as Demon" → the Recluse dies by Slayer.
    await resolveSlayerDecision({ gameId, slayerPlayerId: slayerId, optionId: "AS_DEMON", commandId: randomUUID(), expectedVersion: v });
    const after = await prisma.player.findUniqueOrThrow({ where: { id: recluseId } });
    expect(after.alive).toBe(false);
    const death = await prisma.deathRecord.findFirst({ where: { gameId, playerId: recluseId, source: "SLAYER" } });
    expect(death).not.toBeNull();
  });
});
