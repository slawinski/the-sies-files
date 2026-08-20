// Session persistence. Only hashes are stored; raw session tokens exist only in
// the HttpOnly cookie. Lookups enforce the strict cookie→column boundary
// (docs/01 §18): a storyteller session row has storytellerGameId set and
// playerId null; a player session has playerId set and storytellerGameId null.

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type Db = Prisma.TransactionClient | typeof prisma;

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
  await prisma.browserSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

export async function revokeSessionByHash(sessionTokenHash: string): Promise<void> {
  await prisma.browserSession.updateMany({
    where: { sessionTokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
