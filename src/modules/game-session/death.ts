// Shared death transition (audit spec 18 §3). Every ordinary NORMAL-player
// death routes through here so ghost-vote entitlement is granted exactly once,
// atomically, and never re-granted after a consumed vote.

import type { Prisma } from "@prisma/client";
import { DomainError } from "@/lib/errors";
import { EVENTS } from "@/modules/events/event-types";

export type DeathSource = "DEMON" | "EXECUTION" | "VIRGIN" | "SLAYER" | "STORYTELLER_OVERRIDE" | "OTHER";

export async function markPlayerDead(
  tx: Prisma.TransactionClient,
  args: {
    gameId: string;
    playerId: string;
    source: DeathSource;
    cycleNumber: number;
    phase: "INVESTIGATION" | "OPERATIONAL";
    executed: boolean;
    causedByPlayerId?: string;
    appendEvent: (type: string, payload?: unknown) => Promise<void>;
  },
): Promise<{ died: boolean }> {
  const player = await tx.player.findFirst({ where: { id: args.playerId, gameId: args.gameId } });
  if (!player) throw new DomainError("PLAYER_NOT_FOUND", "Player not found");
  if (player.participantKind === "TRAVELLER") {
    throw new DomainError("INVALID_TARGET", "Traveller removal uses exile, not death");
  }
  if (!player.alive) {
    // Idempotent: a consumed ghost vote stays consumed; no second death.
    return { died: false };
  }

  await tx.player.update({
    where: { id: args.playerId },
    data: { alive: false, ghostVoteAvailable: true },
  });
  await tx.deathRecord.create({
    data: {
      gameId: args.gameId,
      playerId: args.playerId,
      cycleNumber: args.cycleNumber,
      source: args.source,
      phase: args.phase,
      executed: args.executed,
      causedByPlayerId: args.causedByPlayerId,
    },
  });
  await args.appendEvent(EVENTS.PLAYER_DIED, {
    playerId: args.playerId,
    source: args.source,
    cycleNumber: args.cycleNumber,
  });
  await args.appendEvent(EVENTS.GHOST_VOTE_GRANTED, { playerId: args.playerId });
  return { died: true };
}
