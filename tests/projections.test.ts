import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./helpers/db";
import { createGame, addPlayer } from "@/modules/game-session/game-session.service";
import { prisma } from "@/lib/db";
import type { SetupCandidate } from "@/modules/setup/types";
import {
  buildPublicProjection,
  buildPlayerProjection,
  buildStorytellerProjection,
} from "@/modules/projections/projections";

beforeEach(resetDb);

const FORBIDDEN_KEYS = [
  "trueCharacterId",
  "perceivedCharacterId",
  "trueAlignment",
  "role",
  "alignment",
  "secret",
  "abilityState",
];

describe("projections (server-side allow-lists)", () => {
  it("paired other-player secrets leave the complete public and own-player projections equal", async () => {
    const { gameId } = await createGame("Paired");
    const a = await addPlayer({ gameId, commandId: randomUUID(), expectedVersion: 1, displayName: "Ada" });
    const b = await addPlayer({ gameId, commandId: randomUUID(), expectedVersion: a.version, displayName: "Bob" });
    const game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    const players = await prisma.player.findMany({ where: { gameId } });
    const secret = await prisma.playerSecret.create({ data: { playerId: b.playerId, trueCharacterId: "MONK", perceivedCharacterId: "MONK", trueAlignment: "GOOD", abilityStateJson: {} } });
    const ownSecret = await prisma.playerSecret.create({ data: { playerId: a.playerId, trueCharacterId: "SOLDIER", perceivedCharacterId: "SOLDIER", trueAlignment: "GOOD", abilityStateJson: {} } });
    const candidate: SetupCandidate = { generatorVersion: 1, participantCount: 2, normalCount: 2,
      assignments: [{ playerId: a.playerId, virtualSeat: 0, participantKind: "NORMAL", trueCharacterId: "SOLDIER", perceivedCharacterId: "SOLDIER", trueAlignment: "GOOD" }, { playerId: b.playerId, virtualSeat: 1, participantKind: "NORMAL", trueCharacterId: "MONK", perceivedCharacterId: "MONK", trueAlignment: "GOOD" }],
      fortuneTellerRedHerringPlayerId: null, demonBluffs: [] };
    const before = { public: buildPublicProjection(game, players), own: buildPlayerProjection(game, players, a.playerId, { secret: ownSecret, candidate }) };
    expect(before.own.myRole).not.toBeNull();
    const positive = buildPlayerProjection(game, players, b.playerId, { secret, candidate });
    const changed = await prisma.playerSecret.update({ where: { playerId: b.playerId }, data: { trueCharacterId: "IMP", perceivedCharacterId: "IMP", trueAlignment: "EVIL" } });
    const changedCandidate: SetupCandidate = { ...candidate, assignments: candidate.assignments.map(row => row.playerId === b.playerId ? { ...row, trueCharacterId: "IMP", perceivedCharacterId: "IMP", trueAlignment: "EVIL" } : row) };
    expect({ public: buildPublicProjection(game, players), own: buildPlayerProjection(game, players, a.playerId, { secret: ownSecret, candidate: changedCandidate }) }).toEqual(before);
    expect(buildPlayerProjection(game, players, b.playerId, { secret: changed, candidate: changedCandidate }).myRole).not.toEqual(positive.myRole);
    // Same IDs, timestamps and version: no field is normalized or removed.
  });
  it("public projection contains no secret fields", async () => {
    const { gameId } = await createGame("Test");
    await addPlayer({
      gameId,
      commandId: randomUUID(),
      expectedVersion: 1,
      displayName: "Ada",
    });
    const game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    const players = await prisma.player.findMany({ where: { gameId } });
    const pub = buildPublicProjection(game, players);

    for (const key of FORBIDDEN_KEYS) {
      expect(pub.players[0]).not.toHaveProperty(key);
    }
    expect(pub.players[0]).toHaveProperty("displayName");
    expect(pub.players[0]).toHaveProperty("virtualSeat");
    expect(pub.players[0]).toHaveProperty("alive");
  });

  it("player projection exposes only the viewer's own `me`", async () => {
    const { gameId } = await createGame("Test");
    let v = 1;
    const a = await addPlayer({
      gameId,
      commandId: randomUUID(),
      expectedVersion: v,
      displayName: "Ada",
    });
    v = a.version;
    await addPlayer({
      gameId,
      commandId: randomUUID(),
      expectedVersion: v,
      displayName: "Bob",
    });

    const game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    const players = await prisma.player.findMany({ where: { gameId } });
    const projection = buildPlayerProjection(game, players, a.playerId);

    expect(projection.me.playerId).toBe(a.playerId);
    // Bob appears in the public roster, but there is no `me` leak of Bob.
    expect(projection.players.map((p) => p.id)).toContain(a.playerId);
    expect(projection.me).not.toHaveProperty("trueAlignment");
  });

  it("storyteller projection exposes claim status but no secrets", async () => {
    const { gameId } = await createGame("Test");
    await addPlayer({
      gameId,
      commandId: randomUUID(),
      expectedVersion: 1,
      displayName: "Ada",
    });
    const game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    const players = await prisma.player.findMany({ where: { gameId } });
    const claims = await prisma.playerClaim.findMany({ where: { player: { gameId } } });
    const st = buildStorytellerProjection(game, players, claims);

    expect(st.players[0]).toHaveProperty("claimed");
    expect(st.players[0]).toHaveProperty("hasClaimToken");
    for (const key of FORBIDDEN_KEYS) {
      expect(st.players[0]).not.toHaveProperty(key);
    }
  });
});
