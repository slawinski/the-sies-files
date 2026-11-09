import { beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./helpers/db";
import { createGame, addPlayer } from "@/modules/game-session/game-session.service";
import { createCheckpoint, getCommandStatus } from "@/modules/recovery/recovery.service";
import { prisma } from "@/lib/db";
import { readCommandReceipt, legacyPlayerOwns } from "@/lib/command-contracts";

beforeEach(resetDb);
const storyteller = { kind: "storyteller" as const };
describe("actor-scoped command status", () => {
  it.each([
    ["scanQr", { outcome: { discoveries: ["private-clue"], tasks: [], conditions: [], mapVersionId: null } }],
    ["nominate", { nominationId: "nomination" }], ["voteIntent", {}], ["acknowledgeRole", {}], ["submitAction", {}],
    ["slayer", { winner: null, decisionRequired: true }],
  ] as const)("validates own %s status and hides corruption from another actor", async (operation, result) => {
    const { gameId } = await createGame("Status");
    const commandId = randomUUID();
    await prisma.commandReceipt.create({ data: {
      gameId, commandId, actor: "player:owner", operation, resultVersion: 1, requestHash: "a".repeat(64),
      resultingVersion: 2, resultJson: JSON.parse(JSON.stringify(result)),
    } });
    const owner = { kind: "player" as const, playerId: "owner" };
    expect(await getCommandStatus(gameId, commandId, owner)).toMatchObject({ status: "APPLIED", operation, result });
    await prisma.commandReceipt.update({ where: { gameId_commandId: { gameId, commandId } }, data: { resultJson: { privateMarker: "secret" } } });
    await expect(getCommandStatus(gameId, commandId, owner)).rejects.toMatchObject({ code: "COMMAND_RECEIPT_INVALID", message: "Committed command outcome is unreadable" });
    expect(await getCommandStatus(gameId, commandId, { kind: "player", playerId: "other" })).toEqual({ status: "UNKNOWN" });
  });

  it("reads synthetic legacy add/checkpoint evidence but still refuses a duplicate POST", async () => {
    const { gameId } = await createGame("Legacy reader fixtures, not actual A producer proof");
    const addId = randomUUID(), checkpointId = randomUUID();
    const added = await addPlayer({ gameId, commandId: addId, expectedVersion: 1, displayName: "Ada" });
    const checkpoint = await createCheckpoint({ gameId, commandId: checkpointId, expectedVersion: 2 });
    await prisma.commandReceipt.updateMany({ where: { gameId }, data: { operation: null, actor: null, resultVersion: null, requestHash: null } });
    expect(await getCommandStatus(gameId, addId, storyteller)).toMatchObject({ status: "APPLIED", result: { playerId: added.playerId }, resultVersion: 0 });
    expect(await getCommandStatus(gameId, checkpointId, storyteller)).toMatchObject({ status: "APPLIED", result: { checkpointId: checkpoint.checkpointId } });
    await expect(addPlayer({ gameId, commandId: addId, expectedVersion: 0, displayName: "Ada" })).rejects.toMatchObject({ code: "COMMAND_RECEIPT_INVALID" });
    expect(await prisma.player.count({ where: { gameId } })).toBe(1);
  });
  it("preserves Storyteller fields but refuses corrupt results", async () => {
    const { gameId } = await createGame("Status");
    const commandId = randomUUID();
    const added = await addPlayer({ gameId, commandId, expectedVersion: 1, displayName: "Ada" });
    expect(await getCommandStatus(gameId, commandId, storyteller)).toMatchObject({
      status: "APPLIED", commandId, resultingGameVersion: added.version, result: { playerId: added.playerId },
    });
    await prisma.commandReceipt.update({ where: { gameId_commandId: { gameId, commandId } }, data: { resultJson: { privateMarker: "never disclose" } } });
    await expect(getCommandStatus(gameId, commandId, storyteller)).rejects.toMatchObject({ code: "COMMAND_RECEIPT_INVALID" });
  });

  it("makes absent, other-actor and Storyteller receipts identical to a player", async () => {
    const { gameId } = await createGame("Status");
    const commandId = randomUUID();
    const { playerId } = await addPlayer({ gameId, commandId, expectedVersion: 1, displayName: "Ada" });
    const viewer = { kind: "player" as const, playerId };
    expect(await getCommandStatus(gameId, commandId, viewer)).toEqual({ status: "UNKNOWN" });
    expect(await getCommandStatus(gameId, randomUUID(), viewer)).toEqual({ status: "UNKNOWN" });
    await prisma.commandReceipt.update({ where: { gameId_commandId: { gameId, commandId } }, data: { actor: "player:other", resultJson: { privateMarker: "never disclose" } } });
    expect(await getCommandStatus(gameId, commandId, viewer)).toEqual({ status: "UNKNOWN" });
  });
});

describe("bounded legacy reader fixtures (not source-attributed producer proof)", () => {
  const result = { outcome: { discoveries: ["clue"], tasks: ["task"], conditions: [], mapVersionId: null } };
  const receipt = { operation: null, actor: null, resultVersion: null, requestHash: null, status: "APPLIED", resultingVersion: 2, resultJson: result };
  const primary = { actor: "player:owner", gameVersion: 2, eventType: "QR_SCANNED", payload: { playerId: "owner", qrTokenId: "qr" } };
  it("reads a full meaningful scan without consulting live scenario definitions", () => {
    expect(legacyPlayerOwns([primary], "owner")).toBe(true);
    expect(readCommandReceipt(receipt, [primary])).toMatchObject({ operation: "scanQr", result });
  });
  it("requires unambiguous actor/version/primary evidence", () => {
    for (const events of [[], [primary, primary], [{ ...primary, actor: null }], [primary, { ...primary, actor: "player:other" }],
      [{ ...primary, gameVersion: 1 }], [primary, { ...primary, eventType: "PLAYER_ADDED" }],
      [{ ...primary, payload: { qrTokenId: "qr", playerId: "other" } }]]) {
      expect(() => readCommandReceipt(receipt, events)).toThrowError(expect.objectContaining({ code: "COMMAND_RECEIPT_INVALID" }));
    }
    expect(legacyPlayerOwns([{ ...primary, actor: "player:other" }], "owner")).toBe(false);
    expect(legacyPlayerOwns([{ ...primary, payload: { playerId: "other" } }], "owner")).toBe(false);
  });
  it.each([null, { outcome: { duplicate: true } }, { outcome: { discoveries: [] } }])("refuses unsupported historical scan results %j", resultJson => {
    expect(() => readCommandReceipt({ ...receipt, resultJson }, [primary])).toThrowError(expect.objectContaining({ code: "COMMAND_RECEIPT_INVALID" }));
  });
});
