import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb, createGameWithPlayers } from "./helpers/db";
import { prisma } from "@/lib/db";
import {
  generateSetup,
  commitSetup,
  acknowledgeRole,
} from "@/modules/setup/setup.service";
import {
  startOperational,
  submitAction,
  resolveAction,
  completeOperational,
} from "@/modules/operational/operational.service";
import { loadStorytellerData, loadPlayerData } from "@/modules/projections/load";
import { buildPlayerProjection } from "@/modules/projections/projections";
import { addPlayer } from "@/modules/game-session/game-session.service";
import { computeAdjacentEvilPairs } from "@/modules/operational/info-resolver";
import type { SetupCandidate } from "@/modules/setup/types";

beforeEach(resetDb);

async function setupCommittedGame(count: number) {
  const { gameId, playerIds, version } = await createGameWithPlayers(count);
  const g = await generateSetup({ gameId, commandId: randomUUID(), expectedVersion: version });
  const c = await commitSetup({ gameId, commandId: randomUUID(), expectedVersion: g.version });
  return { gameId, playerIds, version: c.version };
}

function candidateOf(gameId: string): Promise<SetupCandidate> {
  return prisma.setupDraft
    .findUniqueOrThrow({ where: { gameId } })
    .then((d) => d.candidateJson as unknown as SetupCandidate);
}

describe("Slice 2 — setup + first Operational", () => {
  it("full golden path: generate → commit → reveal → Operational → Investigation", async () => {
    const { gameId, playerIds, version } = await setupCommittedGame(15);
    let v = version;

    const gameAfterCommit = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    expect(gameAfterCommit.status).toBe("ROLE_REVEAL");
    expect(gameAfterCommit.scriptId).toBe("TROUBLE_BREWING");

    const secretCount = await prisma.playerSecret.count({ where: { player: { gameId } } });
    expect(secretCount).toBe(15);

    // Roster is locked after commit.
    await expect(
      addPlayer({ gameId, commandId: randomUUID(), expectedVersion: v, displayName: "Latecomer" }),
    ).rejects.toMatchObject({ code: "VIRTUAL_CIRCLE_LOCKED" });

    // Reveal: player 0 sees only their own role.
    const candidate = await candidateOf(gameId);
    const { game, players, secret, myActions } = await loadPlayerData(gameId, playerIds[0]);
    const projection = buildPlayerProjection(game, players, playerIds[0], {
      secret,
      candidate,
      myActions,
    });
    expect(projection.myRole).not.toBeNull();
    expect(projection.myRole!.alignment).toBeDefined();

    v = (
      await acknowledgeRole({ gameId, playerId: playerIds[0], commandId: randomUUID(), expectedVersion: v })
    ).version;

    // Start first Operational.
    const started = await startOperational({ gameId, commandId: randomUUID(), expectedVersion: v });
    v = started.version;
    expect(started.actionCount).toBeGreaterThan(0);

    // Resolve the whole queue (player choices + storyteller info).
    for (let guard = 0; guard < 100; guard += 1) {
      const st = await loadStorytellerData(gameId);
      const actions = st.operational?.actions ?? [];
      const active = actions.find(
        (a) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER",
      );
      if (!active) break;

      if (active.status === "WAITING_FOR_PLAYER") {
        const others = playerIds.filter((id) => id !== active.actorPlayerId);
        const targets = active.kind === "FORTUNE_TELLER_CHOOSE" ? others.slice(0, 2) : [others[0]];
        const r = await submitAction({
          gameId,
          playerId: active.actorPlayerId!,
          actionId: active.id,
          commandId: randomUUID(),
          expectedVersion: v,
          targetPlayerIds: targets,
        });
        v = r.version;
      } else {
        const r = await resolveAction({
          gameId,
          actionId: active.id,
          commandId: randomUUID(),
          expectedVersion: v,
        });
        v = r.version;
      }
    }

    // Chef info must match the deterministic adjacent-evil-pairs computation.
    const chefAction = (await prisma.operationalAction.findMany({ where: { kind: "CHEF_INFO" } }))[0];
    if (chefAction) {
      expect((chefAction.resolutionJson as { value: number }).value).toBe(
        computeAdjacentEvilPairs(await candidateOf(gameId)),
      );
    }

    // Complete → Investigation.
    v = (await completeOperational({ gameId, commandId: randomUUID(), expectedVersion: v })).version;
    const gameAfter = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    expect(gameAfter.status).toBe("ACTIVE");
    expect(gameAfter.phase).toBe("INVESTIGATION");
    expect(gameAfter.cycleNumber).toBe(1);
  });

  it("16 participants produce a Bureaucrat + 15 normal roles", async () => {
    const { gameId, version } = await createGameWithPlayers(15);
    const b = await addPlayer({
      gameId,
      commandId: randomUUID(),
      expectedVersion: version,
      displayName: "Traveller",
    });
    await prisma.player.update({
      where: { id: b.playerId },
      data: { participantKind: "TRAVELLER" },
    });

    let v = b.version;
    const g = await generateSetup({ gameId, commandId: randomUUID(), expectedVersion: v });
    v = g.version;
    await commitSetup({ gameId, commandId: randomUUID(), expectedVersion: v });

    const secret = await prisma.playerSecret.findUniqueOrThrow({ where: { playerId: b.playerId } });
    expect(secret.trueCharacterId).toBe("BUREAUCRAT");
    expect(secret.perceivedCharacterId).toBe("BUREAUCRAT");
    expect(["GOOD", "EVIL"]).toContain(secret.trueAlignment);
  });

  it("Drunk sees a Townsfolk, never the truth", async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await resetDb();
      const { gameId } = await setupCommittedGame(15);
      const candidate = await candidateOf(gameId);
      const drunk = candidate.assignments.find((a) => a.trueCharacterId === "DRUNK");
      if (!drunk) continue;

      const { game, players, secret, myActions } = await loadPlayerData(gameId, drunk.playerId);
      const projection = buildPlayerProjection(game, players, drunk.playerId, {
        secret,
        candidate,
        myActions,
      });
      expect(projection.myRole!.characterId).toBe(drunk.perceivedCharacterId);
      expect(projection.myRole!.characterId).not.toBe("DRUNK");
      return;
    }
    throw new Error("Drunk never appeared in 30 setup attempts");
  });

  it("player projection never exposes another player's role", async () => {
    const { gameId, playerIds } = await setupCommittedGame(15);
    const candidate = await candidateOf(gameId);

    const { game, players, secret, myActions } = await loadPlayerData(gameId, playerIds[0]);
    const projection = buildPlayerProjection(game, players, playerIds[0], {
      secret,
      candidate,
      myActions,
    });

    const json = JSON.stringify(projection);
    expect(json).toContain(projection.myRole!.characterId);
    for (const p of players) {
      if (p.id === playerIds[0]) continue;
      const otherRole = candidate.assignments.find((a) => a.playerId === p.id)!.trueCharacterId;
      expect(json).not.toContain(`"${otherRole}"`);
    }
  });
});
