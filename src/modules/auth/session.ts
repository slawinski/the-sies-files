// Session persistence. Only hashes are stored; raw session tokens exist only in
// the HttpOnly cookie. Lookups enforce the strict cookie→column boundary
// (docs/01 §18): a storyteller session row has storytellerGameId set and
// playerId null; a player session has playerId set and storytellerGameId null.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Viewer } from "@/lib/auth/http";
import { AsyncLocalStorage } from "node:async_hooks";
import { DomainError } from "@/lib/errors";
import { runGameAccessTransaction } from "@/lib/command";

type Db = Prisma.TransactionClient | typeof prisma;

const writerAdmission = new AsyncLocalStorage<{ gameId: string; viewer: Viewer }>();

/** Only HTTP-resolved identity goes here, never request JSON. Scoped across awaits. */
export function withGameAdmission<T>(gameId: string, viewer: Viewer, work: () => Promise<T>): Promise<T> {
  return writerAdmission.run({ gameId, viewer }, work);
}

/** Called after acquiring the root lock. Trusted internal callers have no browser admission. */
export async function recheckWriterAdmission(db: Db, gameId: string, actor?: string, requireStoryteller = false) {
  const admission = writerAdmission.getStore();
  if (!admission) {
    if (requireStoryteller) throw new DomainError("UNAUTHORIZED", "Not authenticated");
    return;
  }
  const { viewer } = admission;
  const identity = viewer.kind === "storyteller" ? "storyteller" : `player:${viewer.playerId}`;
  if (admission.gameId !== gameId || (actor && actor !== identity) || (requireStoryteller && viewer.kind !== "storyteller") ||
      !await recheckViewerSession(viewer, gameId, new Date(), db)) {
    throw new DomainError("GAME_NOT_FOUND", "Game not found");
  }
}

/** Revalidate the exact admitted row; later request cookies cannot replace it. */
export async function recheckViewerSession(viewer: Viewer, gameId: string, now = new Date(), db: Db = prisma) {
  return db.browserSession.findFirst({
    where: { id: viewer.sessionId, revokedAt: null, expiresAt: { gt: now },
      ...(viewer.kind === "storyteller"
        ? { storytellerGameId: gameId, playerId: null }
        : { playerId: viewer.playerId, storytellerGameId: null, player: { gameId } }),
    },
    select: { expiresAt: true },
  });
}

export interface CreateSessionArgs {
  sessionTokenHash: string;
  expiresAt: Date;
}

export async function createStorytellerSession(
  db: Db,
  gameId: string,
  { sessionTokenHash, expiresAt }: CreateSessionArgs,
) {
  return db.browserSession.create({
    data: { storytellerGameId: gameId, sessionTokenHash, expiresAt },
  });
}

export async function createPlayerSession(
  db: Db,
  playerId: string,
  { sessionTokenHash, expiresAt }: CreateSessionArgs,
) {
  return db.browserSession.create({
    data: { playerId, sessionTokenHash, expiresAt },
  });
}

export async function findStorytellerSessionByHash(
  sessionTokenHash: string,
  gameId: string,
  now: Date = new Date(),
) {
  return prisma.browserSession.findFirst({
    where: {
      sessionTokenHash,
      storytellerGameId: gameId,
      playerId: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
  });
}

/** Find the active storyteller session regardless of game (used by the storyteller home). */
export async function findStorytellerSessionByHashOnly(
  sessionTokenHash: string,
  now: Date = new Date(),
) {
  return prisma.browserSession.findFirst({
    where: {
      sessionTokenHash,
      playerId: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
  });
}

export async function findPlayerSessionByHash(
  sessionTokenHash: string,
  gameId: string,
  now: Date = new Date(),
) {
  return prisma.browserSession.findFirst({
    where: {
      sessionTokenHash,
      player: { gameId },
      storytellerGameId: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    include: { player: true },
  });
}

/** Find the active player session regardless of game (used by /api/v1/me). */
export async function findPlayerSessionByHashOnly(
  sessionTokenHash: string,
  now: Date = new Date(),
) {
  return prisma.browserSession.findFirst({
    where: {
      sessionTokenHash,
      storytellerGameId: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    include: { player: { include: { game: true } } },
  });
}

export async function revokeSession(sessionId: string): Promise<void> {
  const admitted = await prisma.browserSession.findUnique({ where: { id: sessionId }, include: { player: true } });
  const gameId = admitted?.storytellerGameId ?? admitted?.player?.gameId;
  if (!admitted || !gameId) return;
  try {
    await runGameAccessTransaction({ gameId, operation: "revokeSession", handler: async ({ tx }) => {
      await tx.browserSession.updateMany({
        where: { id: admitted.id, sessionTokenHash: admitted.sessionTokenHash, playerId: admitted.playerId, storytellerGameId: admitted.storytellerGameId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } });
  } catch (error) {
    // An already-retired credential is already logged out. Never recreate it.
    if (!(error instanceof DomainError && error.code === "GAME_NOT_FOUND")) throw error;
  }
}

export async function revokeSessionByHash(sessionTokenHash: string): Promise<void> {
  const session = await prisma.browserSession.findUnique({ where: { sessionTokenHash } });
  if (session) await revokeSession(session.id);
}
