// Game-session application commands (Slice 1). Each mutation flows through the
// command runner so it is locked, version-checked, idempotent, and event-audited.
//
// The raw claim token is generated OUTSIDE these commands and only its hash is
// persisted; the raw token is returned once in the HTTP response and is never
// written to a receipt or event payload.

import { prisma } from "@/lib/db";
import { runCommand, runGameTransaction } from "@/lib/command";
import { DomainError } from "@/lib/errors";
import { systemClock } from "@/lib/clock";
import { cryptoSecureRng } from "@/lib/rng";
import { generateToken, hashToken, CLAIM_TOKEN_TTL_SECONDS } from "@/lib/auth/tokens";
import { SESSION_TTL_SECONDS } from "@/lib/auth/cookies";
import type { SessionStatus } from "@prisma/client";
import { EVENTS } from "@/modules/events/event-types";
import {
  normalizeDisplayName,
  validateRosterSizeForAdd,
  isPermutation,
} from "./roster.rules";
import { publish } from "@/modules/realtime/broker";

function publishInvalidation(gameId: string, version: number, sequence: number): void {
  publish(gameId, { type: "invalidate", version, sequence });
}

function assertRosterEditable(status: SessionStatus): void {
  if (status !== "LOBBY" && status !== "SETUP") {
    throw new DomainError(
      "VIRTUAL_CIRCLE_LOCKED",
      `Roster is locked in status ${status}`,
    );
  }
}

export interface CreateGameResult {
  gameId: string;
  storytellerSessionToken: string;
}

export async function createGame(name: string): Promise<CreateGameResult> {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new DomainError("INVALID_DISPLAY_NAME", "Game name is required");
  }

  const storytellerSessionToken = generateToken(cryptoSecureRng);
  const storytellerSessionHash = hashToken(storytellerSessionToken);
  const expiresAt = new Date(systemClock.now().getTime() + SESSION_TTL_SECONDS * 1000);

  const gameId = await prisma.$transaction(async (tx) => {
    const game = await tx.gameSession.create({ data: { name: trimmed } });
    await tx.domainEvent.create({
      data: {
        gameId: game.id,
        sequence: 1,
        gameVersion: 1,
        eventType: EVENTS.GAME_CREATED,
        actor: "storyteller",
        payload: { name: trimmed },
      },
    });
    await tx.gameSession.update({
      where: { id: game.id },
      data: { version: 1, eventSequence: 1 },
    });
    await tx.browserSession.create({
      data: {
        storytellerGameId: game.id,
        sessionTokenHash: storytellerSessionHash,
        expiresAt,
      },
    });
    return game.id;
  });

  return { gameId, storytellerSessionToken };
}

interface BaseCommand {
  gameId: string;
  commandId: string;
  expectedVersion: number;
}

export async function addPlayer({
  gameId,
  commandId,
  expectedVersion,
  displayName,
}: BaseCommand & { displayName: string }): Promise<{ playerId: string; version: number }> {
  const { result, version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, game, appendEvent }) => {
      assertRosterEditable(game.status);
      const count = await tx.player.count({ where: { gameId } });
      validateRosterSizeForAdd(count);
      const name = normalizeDisplayName(displayName);
      const dup = await tx.player.findFirst({ where: { gameId, displayName: name } });
      if (dup) {
        throw new DomainError("DISPLAY_NAME_TAKEN", `Display name "${name}" is already taken`);
      }
      const player = await tx.player.create({
        data: { gameId, displayName: name, virtualSeat: count },
      });
      await appendEvent(EVENTS.PLAYER_ADDED, {
        playerId: player.id,
        displayName: name,
        virtualSeat: player.virtualSeat,
      });
      return { playerId: player.id };
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { playerId: result.playerId, version };
}

export async function updatePlayer({
  gameId,
  playerId,
  commandId,
  expectedVersion,
  displayName,
}: BaseCommand & { playerId: string; displayName: string }): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, game, appendEvent }) => {
      assertRosterEditable(game.status);
      const player = await tx.player.findFirst({ where: { id: playerId, gameId } });
      if (!player) throw new DomainError("PLAYER_NOT_FOUND", "Player not found");
      const name = normalizeDisplayName(displayName);
      if (name !== player.displayName) {
        const dup = await tx.player.findFirst({
          where: { gameId, displayName: name, NOT: { id: playerId } },
        });
        if (dup) {
          throw new DomainError("DISPLAY_NAME_TAKEN", `Display name "${name}" is already taken`);
        }
      }
      await tx.player.update({ where: { id: playerId }, data: { displayName: name } });
      await appendEvent(EVENTS.PLAYER_UPDATED, { playerId, displayName: name });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export async function removePlayer({
  gameId,
  playerId,
  commandId,
  expectedVersion,
}: BaseCommand & { playerId: string }): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, game, appendEvent }) => {
      assertRosterEditable(game.status);
      const player = await tx.player.findFirst({ where: { id: playerId, gameId } });
      if (!player) throw new DomainError("PLAYER_NOT_FOUND", "Player not found");
      await tx.player.delete({ where: { id: playerId } });
      // Keep Virtual Circle seats contiguous 0..N-1.
      const remaining = await tx.player.findMany({
        where: { gameId },
        orderBy: { virtualSeat: "asc" },
      });
      for (let i = 0; i < remaining.length; i += 1) {
        if (remaining[i].virtualSeat !== i) {
          await tx.player.update({ where: { id: remaining[i].id }, data: { virtualSeat: i } });
        }
      }
      await appendEvent(EVENTS.PLAYER_REMOVED, { playerId, displayName: player.displayName });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export async function reorderPlayers({
  gameId,
  commandId,
  expectedVersion,
  orderedPlayerIds,
}: BaseCommand & { orderedPlayerIds: string[] }): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, game, appendEvent }) => {
      assertRosterEditable(game.status);
      const players = await tx.player.findMany({ where: { gameId } });
      const currentIds = players.map((p) => p.id);
      if (!isPermutation(orderedPlayerIds, currentIds)) {
        throw new DomainError(
          "INVALID_TARGET",
          "Reorder must contain exactly the current set of players",
        );
      }
      const before = [...players]
        .sort((a, b) => a.virtualSeat - b.virtualSeat)
        .map((p) => p.id);
      // Phase 1: move everyone to a temporary offset so the (gameId, virtualSeat)
      // unique constraint is never violated mid-loop.
      const offset = orderedPlayerIds.length;
      for (let i = 0; i < orderedPlayerIds.length; i += 1) {
        await tx.player.update({
          where: { id: orderedPlayerIds[i] },
          data: { virtualSeat: offset + i },
        });
      }
      // Phase 2: assign final contiguous seats.
      for (let i = 0; i < orderedPlayerIds.length; i += 1) {
        await tx.player.update({
          where: { id: orderedPlayerIds[i] },
          data: { virtualSeat: i },
        });
      }
      await appendEvent(EVENTS.VIRTUAL_CIRCLE_REORDERED, { before, after: orderedPlayerIds });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export interface ClaimTokenResult {
  playerId: string;
  claimId: string;
  expiresAt: string;
  duplicate: boolean;
  version: number;
}

/**
 * Issue (or re-issue) a one-time claim token. Caller passes the pre-computed
 * hash + expiry; the raw token is returned by the route, never persisted here.
 */
export async function issueClaimToken({
  gameId,
  playerId,
  commandId,
  expectedVersion,
  tokenHash,
  expiresAt,
}: BaseCommand & {
  playerId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<ClaimTokenResult> {
  const { result, version, sequence, duplicate } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, game, appendEvent }) => {
      // Claim tokens are about player access (incl. re-issue), not roster edits —
      // so they remain issuable after setup commit / during the game.
      if (game.status === "ENDED") {
        throw new DomainError("INVALID_SESSION_STATE", "Cannot issue a claim token after the game has ended");
      }
      const player = await tx.player.findFirst({ where: { id: playerId, gameId } });
      if (!player) throw new DomainError("PLAYER_NOT_FOUND", "Player not found");
      const claim = await tx.playerClaim.upsert({
        where: { playerId },
        create: { playerId, tokenHash, expiresAt },
        update: { tokenHash, expiresAt, claimedAt: null, commandId: null, revokedAt: null },
      });
      await appendEvent(EVENTS.PLAYER_CLAIM_TOKEN_ISSUED, {
        playerId,
        claimId: claim.id,
        expiresAt: claim.expiresAt.toISOString(),
      });
      return { playerId, claimId: claim.id, expiresAt: claim.expiresAt.toISOString() };
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { ...result, duplicate, version };
}

export interface ClaimPlayerResult {
  playerId: string;
  gameId: string;
  sessionToken: string;
  version: number;
}

/**
 * Consume a one-time claim token and establish a player session. Idempotent by
 * `commandId`: a retry after a timeout returns a fresh session for the same
 * player rather than failing. Single-use is enforced atomically.
 */
export async function claimPlayer({
  token,
  commandId,
}: {
  token: string;
  commandId: string;
}): Promise<ClaimPlayerResult> {
  const tokenHash = hashToken(token);
  const now = systemClock.now();

  const claim = await prisma.playerClaim.findUnique({
    where: { tokenHash },
    include: { player: { include: { game: true } } },
  });
  if (!claim) {
    throw new DomainError("UNAUTHORIZED", "Unknown or invalid claim token");
  }
  if (claim.revokedAt != null || claim.expiresAt < now) {
    throw new DomainError("UNAUTHORIZED", "Unknown or invalid claim token");
  }
  const { playerId } = claim;
  const gameId = claim.player.gameId;

  const sessionToken = generateToken(cryptoSecureRng);
  const sessionHash = hashToken(sessionToken);
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

  if (claim.claimedAt != null) {
    // Idempotent retry: same player, same client. Issue a fresh session.
    if (commandId && claim.commandId === commandId) {
      await prisma.browserSession.create({
        data: { playerId, sessionTokenHash: sessionHash, expiresAt },
      });
      return { playerId, gameId, sessionToken, version: claim.player.game.version };
    }
    throw new DomainError("CLAIM_ALREADY_USED", "Claim token has already been used");
  }

  const { version } = await runGameTransaction({
    gameId,
    commandId,
    actor: `player:${playerId}`,
    handler: async ({ tx, appendEvent }) => {
      const consumed = await tx.playerClaim.updateMany({
        where: { tokenHash, claimedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { claimedAt: now, commandId },
      });
      if (consumed.count !== 1) {
        throw new DomainError("CLAIM_ALREADY_USED", "Claim token has already been used");
      }
      await tx.browserSession.create({
        data: { playerId, sessionTokenHash: sessionHash, expiresAt },
      });
      await appendEvent(EVENTS.PLAYER_CLAIMED, { playerId });
      return {};
    },
  });

  return { playerId, gameId, sessionToken, version };
}

/** A Storyteller helper: build a fresh claim token (raw + hash + expiry). */
export function newClaimToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = generateToken(cryptoSecureRng);
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(systemClock.now().getTime() + CLAIM_TOKEN_TTL_SECONDS * 1000),
  };
}
