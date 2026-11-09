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
  findStorytellerSessionByHash,
  recheckViewerSession,
} from "@/modules/auth/session";

beforeEach(resetDb);

describe("security: membership scoping + session expiry", () => {
  it("revoked player sessions cannot cross either actor boundary", async () => {
    const a = await createGame("A");
    const b = await createGame("B");
    const p = await addPlayer({ gameId: a.gameId, commandId: randomUUID(), expectedVersion: 1, displayName: "A" });
    const row = await prisma.browserSession.create({ data: {
      playerId: p.playerId, sessionTokenHash: hashToken("boundary-player"), expiresAt: new Date(Date.now() + 60_000),
    } });
    expect(await findPlayerSessionByHash(row.sessionTokenHash, a.gameId)).not.toBeNull();
    expect(await findPlayerSessionByHash(row.sessionTokenHash, b.gameId)).toBeNull();
    const viewer = { kind: "player" as const, playerId: p.playerId, sessionId: row.id };
    expect(await recheckViewerSession(viewer, a.gameId)).not.toBeNull();
    expect(await recheckViewerSession(viewer, b.gameId)).toBeNull();
    expect(await recheckViewerSession({ ...viewer, playerId: randomUUID() }, a.gameId)).toBeNull();
    expect(await recheckViewerSession({ kind: "storyteller", sessionId: row.id }, a.gameId)).toBeNull();
    expect(await findStorytellerSessionByHash(row.sessionTokenHash, a.gameId)).toBeNull();
    await prisma.browserSession.update({ where: { id: row.id }, data: { storytellerGameId: null, revokedAt: new Date() } });
    expect(await findPlayerSessionByHashOnly(row.sessionTokenHash)).toBeNull();
    expect(await recheckViewerSession(viewer, a.gameId)).toBeNull();
  });
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
