import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./helpers/db";
import { createGame, addPlayer } from "@/modules/game-session/game-session.service";
import { prisma } from "@/lib/db";
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
