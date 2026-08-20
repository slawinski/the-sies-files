import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./helpers/db";
import {
  createGame,
  addPlayer,
  removePlayer,
  reorderPlayers,
  updatePlayer,
} from "@/modules/game-session/game-session.service";
import { prisma } from "@/lib/db";

beforeEach(resetDb);

describe("createGame", () => {
  it("persists at version 1 with a GAME_CREATED event", async () => {
    const { gameId } = await createGame("Test");
    const game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.version).toBe(1);
    expect(game.eventSequence).toBe(1);
    const events = await prisma.domainEvent.findMany({ where: { gameId } });
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("GAME_CREATED");
  });
});

describe("addPlayer", () => {
  it("assigns contiguous seats", async () => {
    const { gameId } = await createGame("Test");
    let v = 1;
    for (let i = 0; i < 3; i += 1) {
      const r = await addPlayer({
        gameId,
        commandId: randomUUID(),
        expectedVersion: v,
        displayName: `P${i}`,
      });
      v = r.version;
    }
    const players = await prisma.player.findMany({
      where: { gameId },
      orderBy: { virtualSeat: "asc" },
    });
    expect(players.map((p) => p.virtualSeat)).toEqual([0, 1, 2]);
  });

  it("rejects duplicate display name", async () => {
    const { gameId } = await createGame("Test");
    await addPlayer({
      gameId,
      commandId: randomUUID(),
      expectedVersion: 1,
      displayName: "Ada",
    });
    await expect(
      addPlayer({ gameId, commandId: randomUUID(), expectedVersion: 2, displayName: "Ada" }),
    ).rejects.toMatchObject({ code: "DISPLAY_NAME_TAKEN" });
  });

  it("throws ROSTER_FULL at 16", async () => {
    const { gameId } = await createGame("Test");
    let v = 1;
    for (let i = 0; i < 16; i += 1) {
      const r = await addPlayer({
        gameId,
        commandId: randomUUID(),
        expectedVersion: v,
        displayName: `P${i}`,
      });
      v = r.version;
    }
    await expect(
      addPlayer({ gameId, commandId: randomUUID(), expectedVersion: v, displayName: "Extra" }),
    ).rejects.toMatchObject({ code: "ROSTER_FULL" });
  });
});

describe("updatePlayer", () => {
  it("renames and rejects a colliding name", async () => {
    const { gameId } = await createGame("Test");
    let v = 1;
    const a = await addPlayer({
      gameId,
      commandId: randomUUID(),
      expectedVersion: v,
      displayName: "Ada",
    });
    v = a.version;
    const b = await addPlayer({
      gameId,
      commandId: randomUUID(),
      expectedVersion: v,
      displayName: "Bob",
    });
    v = b.version;
    await updatePlayer({
      gameId,
      playerId: a.playerId,
      commandId: randomUUID(),
      expectedVersion: v,
      displayName: "Adele",
    });
    await expect(
      updatePlayer({
        gameId,
        playerId: a.playerId,
        commandId: randomUUID(),
        expectedVersion: v + 1,
        displayName: "Bob",
      }),
    ).rejects.toMatchObject({ code: "DISPLAY_NAME_TAKEN" });
  });
});

describe("removePlayer", () => {
  it("renumbers seats to stay contiguous", async () => {
    const { gameId } = await createGame("Test");
    let v = 1;
    const ids: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const r = await addPlayer({
        gameId,
        commandId: randomUUID(),
        expectedVersion: v,
        displayName: `P${i}`,
      });
      v = r.version;
      ids.push(r.playerId);
    }
    await removePlayer({
      gameId,
      playerId: ids[1],
      commandId: randomUUID(),
      expectedVersion: v,
    });
    const players = await prisma.player.findMany({
      where: { gameId },
      orderBy: { virtualSeat: "asc" },
    });
    expect(players.map((p) => p.virtualSeat)).toEqual([0, 1, 2]);
    expect(players.map((p) => p.id)).toEqual([ids[0], ids[2], ids[3]]);
  });
});

describe("reorderPlayers", () => {
  async function setup(count = 3) {
    const { gameId } = await createGame("Test");
    let v = 1;
    const ids: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const r = await addPlayer({
        gameId,
        commandId: randomUUID(),
        expectedVersion: v,
        displayName: `P${i}`,
      });
      v = r.version;
      ids.push(r.playerId);
    }
    return { gameId, ids, version: v };
  }

  it("rejects a non-permutation", async () => {
    const { gameId, ids, version } = await setup();
    await expect(
      reorderPlayers({
        gameId,
        commandId: randomUUID(),
        expectedVersion: version,
        orderedPlayerIds: [ids[0], ids[1]],
      }),
    ).rejects.toMatchObject({ code: "INVALID_TARGET" });
  });

  it("applies a valid order", async () => {
    const { gameId, ids, version } = await setup();
    const order = [ids[2], ids[0], ids[1]];
    await reorderPlayers({
      gameId,
      commandId: randomUUID(),
      expectedVersion: version,
      orderedPlayerIds: order,
    });
    const players = await prisma.player.findMany({
      where: { gameId },
      orderBy: { virtualSeat: "asc" },
    });
    expect(players.map((p) => p.id)).toEqual(order);
  });
});
