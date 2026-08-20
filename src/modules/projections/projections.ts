// Server-side projections (docs/01 §16, docs/03 §11). These are explicit
// allow-lists: they contain only what the viewer is legally allowed to see.
// Secret fields (roles, alignments, seeds) never appear here; tests assert
// their absence. Slice 1 is role-free by definition.

import type { GameSession, Player, PlayerClaim } from "@prisma/client";
import { DomainError } from "@/lib/errors";
import { isRosterReady } from "@/modules/game-session/roster.rules";

export interface PlayerPublicDto {
  id: string;
  displayName: string;
  virtualSeat: number;
  alive: boolean;
  participantKind: "NORMAL" | "TRAVELLER";
}

export interface PublicGameProjection {
  gameId: string;
  name: string;
  status: string;
  phase: string | null;
  cycleNumber: number;
  version: number;
  participantCount: number;
  isReady: boolean;
  players: PlayerPublicDto[];
}

export interface PlayerGameProjection extends PublicGameProjection {
  me: {
    playerId: string;
    displayName: string;
    virtualSeat: number;
    alive: boolean;
    ghostVoteAvailable: boolean;
  };
}

export interface StorytellerPlayerDto extends PlayerPublicDto {
  claimed: boolean;
  hasClaimToken: boolean;
  claimIssuedAt: string | null;
}

export interface StorytellerGameProjection extends PublicGameProjection {
  players: StorytellerPlayerDto[];
}

function sortBySeat(players: Player[]): Player[] {
  return [...players].sort((a, b) => a.virtualSeat - b.virtualSeat);
}

function toPlayerPublicDto(p: Player): PlayerPublicDto {
  return {
    id: p.id,
    displayName: p.displayName,
    virtualSeat: p.virtualSeat,
    alive: p.alive,
    participantKind: p.participantKind,
  };
}

export function buildPublicProjection(
  game: GameSession,
  players: Player[],
): PublicGameProjection {
  const sorted = sortBySeat(players);
  return {
    gameId: game.id,
    name: game.name,
    status: game.status,
    phase: game.phase,
    cycleNumber: game.cycleNumber,
    version: game.version,
    participantCount: sorted.length,
    isReady: isRosterReady(sorted.length),
    players: sorted.map(toPlayerPublicDto),
  };
}

export function buildPlayerProjection(
  game: GameSession,
  players: Player[],
  viewerPlayerId: string,
): PlayerGameProjection {
  const base = buildPublicProjection(game, players);
  const me = players.find((p) => p.id === viewerPlayerId);
  if (!me) {
    throw new DomainError("PLAYER_NOT_FOUND", "Player not found in this game");
  }
  return {
    ...base,
    me: {
      playerId: me.id,
      displayName: me.displayName,
      virtualSeat: me.virtualSeat,
      alive: me.alive,
      ghostVoteAvailable: me.ghostVoteAvailable,
    },
  };
}

export function buildStorytellerProjection(
  game: GameSession,
  players: Player[],
  claims: PlayerClaim[],
): StorytellerGameProjection {
  const base = buildPublicProjection(game, players);
  const claimByPlayer = new Map(claims.map((c) => [c.playerId, c]));
  return {
    ...base,
    players: sortBySeat(players).map((p) => {
      const claim = claimByPlayer.get(p.id);
      return {
        ...toPlayerPublicDto(p),
        claimed: claim?.claimedAt != null,
        hasClaimToken: claim != null && claim.claimedAt == null && claim.revokedAt == null,
        claimIssuedAt: claim ? claim.createdAt.toISOString() : null,
      };
    }),
  };
}
