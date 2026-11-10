import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./helpers/db";
import { createGame, addPlayer } from "@/modules/game-session/game-session.service";
import { runCommand } from "@/lib/command";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { scanQr } from "@/modules/scenario/scenario.service";

beforeEach(resetDb);

describe("runCommand (idempotency / versioning)", () => {
  it("refuses an orphan scan without inventing an outcome, event or replacement receipt", async () => {
    const { gameId } = await createGame("Inconsistent scan fixture");
    const { playerId } = await addPlayer({ gameId, commandId: randomUUID(), expectedVersion: 1, displayName: "Ada" });
    await prisma.gameSession.update({ where: { id: gameId }, data: { status: "ACTIVE", phase: "INVESTIGATION" } });
    const commandId = randomUUID();
    const scan = await prisma.qrScan.create({ data: { gameId, playerId, commandId, qrTokenId: "synthetic-orphan", outcome: "CONSUMED" } });
    const events = await prisma.domainEvent.count({ where: { gameId } });
    await expect(scanQr({ gameId, playerId, commandId, expectedVersion: 2, token: "tsf-qr-letter-001" }))
      .rejects.toMatchObject({ code: "COMMAND_RECEIPT_INVALID" });
    expect(await prisma.qrScan.findUnique({ where: { id: scan.id } })).toEqual(scan);
    expect(await prisma.domainEvent.count({ where: { gameId } })).toBe(events);
    expect(await prisma.commandReceipt.count({ where: { gameId, commandId } })).toBe(0);
    expect((await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } })).version).toBe(2);
  });
  it.each([undefined, null, { playerId: 42 }, { playerId: "valid", claimToken: "must-not-persist" }, { playerId: new Date("2026-01-01T00:00:00.000Z") }])(
    "invalid meaningful output rolls back authoritative player writes: %j", async result => {
      const { gameId } = await createGame("Rollback");
      const commandId = randomUUID();
      await expect(runCommand({ gameId, commandId, expectedVersion: 1, actor: "storyteller", operation: "addPlayer", input: { displayName: "Ada" },
        handler: async ({ tx, appendEvent }) => {
          const player = await tx.player.create({ data: { gameId, displayName: "Ada", virtualSeat: 0 } });
          await appendEvent("PLAYER_ADDED", { playerId: player.id, displayName: "Ada", virtualSeat: 0 });
          return result;
        },
      })).rejects.toMatchObject({ code: "COMMAND_RESULT_INVALID" });
      expect(await prisma.player.count({ where: { gameId } })).toBe(0);
      expect(await prisma.domainEvent.count({ where: { gameId, commandId } })).toBe(0);
      expect(await prisma.commandReceipt.count({ where: { gameId } })).toBe(0);
      expect((await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } })).version).toBe(1);
    });
  it("serializes identical commands and normalizes existing name semantics", async () => {
    const { gameId } = await createGame("Test");
    const commandId = randomUUID();
    const results = await Promise.all(["Ada", " Ada "].map(displayName => addPlayer({ gameId, commandId, expectedVersion: 1, displayName })));
    expect(results[0]).toEqual(results[1]);
    expect(await prisma.player.count({ where: { gameId } })).toBe(1);
    expect(await prisma.domainEvent.count({ where: { gameId, commandId } })).toBe(1);
    expect(await prisma.commandReceipt.count({ where: { gameId } })).toBe(1);
  });

  it("rejects changed actor and operation without entering a handler", async () => {
    const { gameId } = await createGame("Test");
    const commandId = randomUUID();
    await addPlayer({ gameId, commandId, expectedVersion: 1, displayName: "Ada" });
    for (const actor of ["player:other", "storyteller"] as const) {
      let entered = false;
      await expect(runCommand({ gameId, commandId, expectedVersion: 0, actor,
        operation: "renameGame", input: { name: "Test" },
        handler: async () => { entered = true; return {}; },
      })).rejects.toMatchObject({ code: actor === "storyteller" ? "DUPLICATE_COMMAND" : "FORBIDDEN" });
      expect(entered).toBe(false);
    }
  });

  it("canonicalizes object keys while preserving array order, false, null and absence", async () => {
    const { gameId } = await createGame("Test");
    const commandId = randomUUID();
    const execute = (input: unknown) => runCommand({ gameId, commandId, expectedVersion: 1, actor: "storyteller", operation: "renameGame", input,
      handler: async ({ appendEvent }) => { await appendEvent("GAME_RENAMED", {}); return {}; },
    });
    await execute({ b: false, a: ["a", "b"], c: null });
    expect((await execute({ c: null, a: ["a", "b"], b: false })).duplicate).toBe(true);
    for (const input of [{ b: false, a: ["b", "a"], c: null }, { b: false, a: ["a", "b"] }, { b: null, a: ["a", "b"], c: null }])
      await expect(execute(input)).rejects.toMatchObject({ code: "DUPLICATE_COMMAND" });
  });

  it.each([
    { operation: null }, { actor: null }, { requestHash: null }, { resultVersion: null },
    { operation: "unsupported" }, { resultVersion: 2 }, { resultingVersion: 0 },
    { resultJson: Prisma.JsonNull }, { resultJson: Prisma.DbNull },
    { operation: null, actor: null, requestHash: null, resultVersion: null },
  ])("refuses unsupported stored metadata or null without erasing the receipt: %j", async data => {
    const { gameId } = await createGame("Test");
    const commandId = randomUUID();
    await addPlayer({ gameId, commandId, expectedVersion: 1, displayName: "Ada" });
    const receipt = await prisma.commandReceipt.update({ where: { gameId_commandId: { gameId, commandId } }, data });
    await expect(addPlayer({ gameId, commandId, expectedVersion: 0, displayName: "Ada" })).rejects.toMatchObject({ code: "COMMAND_RECEIPT_INVALID" });
    expect(await prisma.commandReceipt.findUnique({ where: { gameId_commandId: { gameId, commandId } } })).toEqual(receipt);
    expect(await prisma.player.count({ where: { gameId } })).toBe(1);
  });

  it("rolls back row, event, version and receipt for an invalid fresh result", async () => {
    const { gameId } = await createGame("Test");
    const commandId = randomUUID();
    const before = await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } });
    await expect(runCommand({
      gameId, commandId, expectedVersion: 1, actor: "storyteller",
      operation: "renameGame", input: { name: "Changed" },
      handler: async ({ tx, appendEvent }) => {
        await tx.gameSession.update({ where: { id: gameId }, data: { name: "Changed" } });
        await appendEvent("GAME_RENAMED", { before: "Test", after: "Changed" });
        return { privateMarker: "must-not-persist" };
      },
    })).rejects.toMatchObject({ code: "COMMAND_RESULT_INVALID" });
    expect(await prisma.gameSession.findUniqueOrThrow({ where: { id: gameId } })).toEqual(before);
    expect(await prisma.commandReceipt.count({ where: { gameId } })).toBe(0);
    expect(await prisma.domainEvent.count({ where: { gameId, commandId } })).toBe(0);
  });

  it("refuses corrupt stored results before staleness without replacing the receipt", async () => {
    const { gameId } = await createGame("Test");
    const commandId = randomUUID();
    await addPlayer({ gameId, commandId, expectedVersion: 1, displayName: "Ada" });
    const receipt = await prisma.commandReceipt.update({
      where: { gameId_commandId: { gameId, commandId } }, data: { resultJson: { playerId: 42 } },
    });
    await expect(addPlayer({ gameId, commandId, expectedVersion: 0, displayName: "Ada" }))
      .rejects.toMatchObject({ code: "COMMAND_RECEIPT_INVALID" });
    expect(await prisma.commandReceipt.findUnique({ where: { gameId_commandId: { gameId, commandId } } })).toEqual(receipt);
    expect(await prisma.player.count({ where: { gameId } })).toBe(1);
  });

  it("refuses a changed semantic request without disclosing the original result", async () => {
    const { gameId } = await createGame("Test");
    const commandId = randomUUID();
    await addPlayer({ gameId, commandId, expectedVersion: 1, displayName: "Ada" });
    await expect(addPlayer({ gameId, commandId, expectedVersion: 1, displayName: "Bob" }))
      .rejects.toMatchObject({ code: "DUPLICATE_COMMAND" });
    expect(await prisma.player.count({ where: { gameId } })).toBe(1);
  });

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
        actor: "storyteller",
        operation: "renameGame",
        input: { name: "Test" },
        handler: async () => ({}),
      }),
    ).rejects.toThrow(/no domain events/);
  });
});
