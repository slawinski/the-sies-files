import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./helpers/db";
import { createGame, addPlayer } from "@/modules/game-session/game-session.service";
import {
  issueClaimToken,
  claimPlayer,
  newClaimToken,
} from "@/modules/game-session/game-session.service";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/auth/tokens";

beforeEach(resetDb);

async function setupPlayer() {
  const { gameId } = await createGame("Test");
  const r = await addPlayer({
    gameId,
    commandId: randomUUID(),
    expectedVersion: 1,
    displayName: "Ada",
  });
  return { gameId, playerId: r.playerId, version: r.version };
}

describe("claim token issuance + consumption", () => {
  it("stores only a hash — raw token never persisted (events or receipts)", async () => {
    const { gameId, playerId, version } = await setupPlayer();
    const { token, tokenHash, expiresAt } = newClaimToken();
    await issueClaimToken({
      gameId,
      playerId,
      commandId: randomUUID(),
      expectedVersion: version,
      tokenHash,
      expiresAt,
    });

    const claim = await prisma.playerClaim.findUniqueOrThrow({ where: { playerId } });
    expect(claim.tokenHash).toBe(tokenHash);
    expect(claim.tokenHash).not.toBe(token);

    const events = await prisma.domainEvent.findMany({ where: { gameId } });
    const receipts = await prisma.commandReceipt.findMany({ where: { gameId } });
    const blob = JSON.stringify([
      ...events.map((e) => e.payload),
      ...receipts.map((r) => r.resultJson),
    ]);
    expect(blob).not.toContain(token);
  });

  it("consumes the token once (replay with different commandId fails)", async () => {
    const { gameId, playerId, version } = await setupPlayer();
    const { token, tokenHash, expiresAt } = newClaimToken();
    await issueClaimToken({
      gameId,
      playerId,
      commandId: randomUUID(),
      expectedVersion: version,
      tokenHash,
      expiresAt,
    });

    const first = await claimPlayer({ token, commandId: randomUUID() });
    expect(first.playerId).toBe(playerId);

    await expect(
      claimPlayer({ token, commandId: randomUUID() }),
    ).rejects.toMatchObject({ code: "CLAIM_ALREADY_USED" });
  });

  it("idempotent retry with the same commandId succeeds", async () => {
    const { gameId, playerId, version } = await setupPlayer();
    const { token, tokenHash, expiresAt } = newClaimToken();
    await issueClaimToken({
      gameId,
      playerId,
      commandId: randomUUID(),
      expectedVersion: version,
      tokenHash,
      expiresAt,
    });

    const commandId = randomUUID();
    await claimPlayer({ token, commandId });
    const retry = await claimPlayer({ token, commandId });
    expect(retry.playerId).toBe(playerId);
    expect(retry.sessionToken).toBeTruthy();
  });

  it("rejects an unknown token", async () => {
    await expect(
      claimPlayer({ token: "does-not-exist", commandId: randomUUID() }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("session token is stored hashed, not raw", async () => {
    const { gameId, playerId, version } = await setupPlayer();
    const { token, tokenHash, expiresAt } = newClaimToken();
    await issueClaimToken({
      gameId,
      playerId,
      commandId: randomUUID(),
      expectedVersion: version,
      tokenHash,
      expiresAt,
    });
    const claim = await claimPlayer({ token, commandId: randomUUID() });

    const session = await prisma.browserSession.findFirst({
      where: { playerId },
    });
    expect(session).not.toBeNull();
    expect(session!.sessionTokenHash).toBe(hashToken(claim.sessionToken));
    expect(session!.sessionTokenHash).not.toBe(claim.sessionToken);
  });
});
