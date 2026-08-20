import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./helpers/db";
import { createGame, addPlayer } from "@/modules/game-session/game-session.service";
import { runCommand } from "@/lib/command";
import { prisma } from "@/lib/db";

beforeEach(resetDb);

describe("runCommand (idempotency / versioning)", () => {
  it("is idempotent for a duplicate commandId", async () => {
    const { gameId } = await createGame("Test");
    const commandId = randomUUID();
    const first = await addPlayer({
      gameId,
      commandId,
      expectedVersion: 1,
      displayName: "Ada",
    });

    const dup = await addPlayer({
      gameId,
      commandId,
      expectedVersion: 1,
      displayName: "Ada",
    });

    expect(dup.playerId).toBe(first.playerId);
    expect(await prisma.player.count({ where: { gameId } })).toBe(1);
    const added = await prisma.domainEvent.findMany({
      where: { gameId, eventType: "PLAYER_ADDED" },
    });
    expect(added).toHaveLength(1);
    const game = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    expect(game.version).toBe(2); // duplicate did not bump version again
  });

  it("rejects a stale expectedVersion", async () => {
    const { gameId } = await createGame("Test");
    await addPlayer({
      gameId,
      commandId: randomUUID(),
      expectedVersion: 1,
      displayName: "Ada",
    });
    await expect(
      addPlayer({
        gameId,
        commandId: randomUUID(),
        expectedVersion: 1, // stale — game is now at version 2
        displayName: "Bob",
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("rejects a command that appends no events (audit invariant)", async () => {
    const { gameId } = await createGame("Test");
    await expect(
      runCommand({
        gameId,
        commandId: randomUUID(),
        expectedVersion: 1,
        handler: async () => ({}),
      }),
    ).rejects.toThrow(/no domain events/);
  });
});
