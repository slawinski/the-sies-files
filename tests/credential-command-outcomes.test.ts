import { beforeEach, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./helpers/db";
import { addPlayer, claimPlayer, createGame, issueClaimToken, newClaimToken } from "@/modules/game-session/game-session.service";
import { getCommandStatus, resetPlayerAccess } from "@/modules/recovery/recovery.service";
import { prisma } from "@/lib/db";

beforeEach(resetDb);
it("duplicate reset acknowledges the original commit without a fabricated token or revoking reclaimed access", async () => {
  const { gameId } = await createGame("Credentials");
  const added = await addPlayer({ gameId, commandId: randomUUID(), expectedVersion: 1, displayName: "Ada" });
  const commandId = randomUUID();
  const first = await resetPlayerAccess({ gameId, playerId: added.playerId, commandId, expectedVersion: added.version });
  expect(first.claimToken).toBeTruthy();
  if (!first.credentialAvailable) throw new Error("Fresh reset must issue a token");
  const reclaimed = await claimPlayer({ token: first.claimToken, commandId: randomUUID() });
  const claim = await prisma.playerClaim.findUniqueOrThrow({ where: { playerId: added.playerId } });
  const sessions = await prisma.browserSession.findMany({ where: { playerId: added.playerId } });
  const duplicate = await resetPlayerAccess({ gameId, playerId: added.playerId, commandId, expectedVersion: 0 });
  expect(duplicate).toEqual({ version: first.version, duplicate: true, credentialAvailable: false });
  expect(await prisma.playerClaim.findUniqueOrThrow({ where: { playerId: added.playerId } })).toEqual(claim);
  expect(await prisma.browserSession.findMany({ where: { playerId: added.playerId } })).toEqual(sessions);
  expect(reclaimed.sessionToken).toBeTruthy();
  const status = await getCommandStatus(gameId, commandId, { kind: "storyteller" });
  expect(status).toMatchObject({ status: "APPLIED", resultingGameVersion: first.version, result: {}, credentialAvailable: false });
  const durable = JSON.stringify([status, await prisma.commandReceipt.findMany({ where: { gameId } }), await prisma.domainEvent.findMany({ where: { gameId } })]);
  expect(durable).not.toContain(first.claimToken);
  expect(durable).not.toContain(claim.tokenHash);
});

it("issue duplicates bind the target but exclude regenerated token hash and expiry", async () => {
  const { gameId } = await createGame("Credentials");
  const a = await addPlayer({ gameId, commandId: randomUUID(), expectedVersion: 1, displayName: "Ada" });
  const b = await addPlayer({ gameId, commandId: randomUUID(), expectedVersion: a.version, displayName: "Bob" });
  const commandId = randomUUID();
  const first = await issueClaimToken({ gameId, playerId: a.playerId, commandId, expectedVersion: b.version, ...newClaimToken() });
  const claim = await prisma.playerClaim.findUniqueOrThrow({ where: { playerId: a.playerId } });
  const duplicate = await issueClaimToken({ gameId, playerId: a.playerId, commandId, expectedVersion: 0, ...newClaimToken() });
  expect(duplicate).toEqual({ ...first, duplicate: true });
  expect(await prisma.playerClaim.findUniqueOrThrow({ where: { playerId: a.playerId } })).toEqual(claim);
  await expect(issueClaimToken({ gameId, playerId: b.playerId, commandId, expectedVersion: 0, ...newClaimToken() })).rejects.toMatchObject({ code: "DUPLICATE_COMMAND" });
  await expect(resetPlayerAccess({ gameId, playerId: b.playerId, commandId, expectedVersion: 0 })).rejects.toMatchObject({ code: "DUPLICATE_COMMAND" });
});
