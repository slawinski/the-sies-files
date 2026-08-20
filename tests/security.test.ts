import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb } from "./helpers/db";
import {
  createGame,
  addPlayer,
  issueClaimToken,
  claimPlayer,
  newClaimToken,
} from "@/modules/game-session/game-session.service";
import { prisma } from "@/lib/db";
import { hashToken } from "@/lib/auth/tokens";
import {
  findPlayerSessionByHash,
  findPlayerSessionByHashOnly,
} from "@/modules/auth/session";

beforeEach(resetDb);

describe("security: membership scoping + session expiry", () => {
  it("a player session resolves only for its own game (cross-game IDOR blocked)", async () => {
    const { gameId: game1 } = await createGame("One");
    const { gameId: game2 } = await createGame("Two");

    const r = await addPlayer({
      gameId: game1,
      commandId: randomUUID(),
      expectedVersion: 1,
      displayName: "Ada",
    });
    const { token, tokenHash, expiresAt } = newClaimToken();
    await issueClaimToken({
      gameId: game1,
      playerId: r.playerId,
      commandId: randomUUID(),
      expectedVersion: r.version,
      tokenHash,
      expiresAt,
    });
    const claim = await claimPlayer({ token, commandId: randomUUID() });
    const sessionHash = hashToken(claim.sessionToken);

    const forGame1 = await findPlayerSessionByHash(sessionHash, game1);
    expect(forGame1).not.toBeNull();
    const forGame2 = await findPlayerSessionByHash(sessionHash, game2);
    expect(forGame2).toBeNull();
  });

  it("an expired session is rejected", async () => {
    const { gameId } = await createGame("Test");
    const r = await addPlayer({
      gameId,
      commandId: randomUUID(),
      expectedVersion: 1,
      displayName: "Ada",
    });
    await prisma.browserSession.create({
      data: {
        playerId: r.playerId,
        sessionTokenHash: hashToken("expired-token"),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const session = await findPlayerSessionByHashOnly(hashToken("expired-token"));
    expect(session).toBeNull();
  });
});
