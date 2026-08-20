// Server-side projections (docs/01 §16, docs/03 §11). Explicit allow-lists:
// a viewer sees only what they are legally entitled to. Secret fields (other
// players' roles/alignments) never appear. Slice 2 adds the role reveal (player)
// and setup/operational state (Storyteller).

import type {
  GameSession,
  InvestigationState,
  Nomination,
  OperationalAction,
  OperationalPhase,
  Player,
  PlayerClaim,
  PlayerSecret,
  SetupDraft,
  Vote,
} from "@prisma/client";
import { DomainError } from "@/lib/errors";
import { isRosterReady } from "@/modules/game-session/roster.rules";
import { buildRoleReveal, type RoleReveal } from "@/modules/setup/reveal";
import type { SetupCandidate } from "@/modules/setup/types";

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

export interface ActiveActionDto {
  id: string;
  kind: string;
}

export interface DeliveredInfoDto {
  actionId: string;
  kind: string;
  result: unknown;
}

export interface PlayerGameProjection extends PublicGameProjection {
  me: {
    playerId: string;
    displayName: string;
    virtualSeat: number;
    alive: boolean;
    ghostVoteAvailable: boolean;
  };
  myRole: RoleReveal | null;
  roleAcknowledged: boolean;
  activeAction: ActiveActionDto | null;
  deliveredInfo: DeliveredInfoDto[];
  investigation: InvestigationDto | null;
  nominations: PlayerNominationDto[];
}

export interface StorytellerPlayerDto extends PlayerPublicDto {
  claimed: boolean;
  hasClaimToken: boolean;
  claimIssuedAt: string | null;
}

export interface StorytellerActionDto {
  id: string;
  orderIndex: number;
  kind: string;
  actorPlayerId: string | null;
  actorDisplayName: string | null;
  status: string;
  secretJson: unknown;
  resolutionJson: unknown;
}

export interface InvestigationDto {
  cycleNumber: number;
  nominationState: string;
  currentExecutionCandidatePlayerId: string | null;
  currentHighEffectiveVotes: number | null;
  executionOccurred: boolean;
}

export interface VoteDto {
  playerId: string;
  playerName: string | null;
  rawIntent: boolean;
  valid: boolean | null;
  effectiveWeight: number;
  ghostVoteConsumed: boolean;
}

export interface NominationDto {
  id: string;
  sequence: number;
  nominatorId: string;
  nominatorName: string | null;
  nomineeId: string;
  nomineeName: string | null;
  status: string;
  rawTotal: number;
  effectiveTotal: number;
  qualified: boolean;
  votes: VoteDto[];
}

export interface PlayerNominationDto {
  id: string;
  sequence: number;
  nominatorName: string | null;
  nomineeName: string | null;
  status: string;
  rawTotal: number;
  effectiveTotal: number;
  qualified: boolean;
  myVoteIntent: boolean | null;
}

export interface StorytellerGameProjection extends PublicGameProjection {
  players: StorytellerPlayerDto[];
  setup: {
    regenerationIndex: number;
    committed: boolean;
    candidate: SetupCandidate | null;
  } | null;
  operational: {
    phaseId: string;
    cycleNumber: number;
    status: string;
    actions: StorytellerActionDto[];
  } | null;
  investigation: InvestigationDto | null;
  nominations: NominationDto[];
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

export interface PlayerProjectionExtras {
  secret?: PlayerSecret | null;
  candidate?: SetupCandidate | null;
  myActions?: OperationalAction[];
  investigation?: InvestigationState | null;
  nominations?: (Nomination & { votes: Vote[] })[];
}

export function buildPlayerProjection(
  game: GameSession,
  players: Player[],
  viewerPlayerId: string,
  extras: PlayerProjectionExtras = {},
): PlayerGameProjection {
  const base = buildPublicProjection(game, players);
  const me = players.find((p) => p.id === viewerPlayerId);
  if (!me) {
    throw new DomainError("PLAYER_NOT_FOUND", "Player not found in this game");
  }

  let myRole: RoleReveal | null = null;
  let roleAcknowledged = false;
  if (extras.secret && extras.candidate) {
    myRole = buildRoleReveal(extras.candidate, viewerPlayerId);
    roleAcknowledged = extras.secret.roleAcknowledgedAt != null;
  }

  const actions = extras.myActions ?? [];
  const active = actions.find((a) => a.status === "WAITING_FOR_PLAYER") ?? null;
  const deliveredInfo: DeliveredInfoDto[] = actions
    .filter((a) => a.status === "RESOLVED" && a.resolutionJson != null)
    .map((a) => ({ actionId: a.id, kind: a.kind, result: a.resolutionJson }));

  const nameById = new Map(players.map((p) => [p.id, p.displayName]));
  const investigation = extras.investigation
    ? {
        cycleNumber: extras.investigation.cycleNumber,
        nominationState: extras.investigation.nominationState,
        currentExecutionCandidatePlayerId: extras.investigation.currentExecutionCandidatePlayerId,
        currentHighEffectiveVotes: extras.investigation.currentHighEffectiveVotes,
        executionOccurred: extras.investigation.executionOccurred,
      }
    : null;
  const nominations: PlayerNominationDto[] = (extras.nominations ?? []).map((n) => ({
    id: n.id,
    sequence: n.sequence,
    nominatorName: nameById.get(n.nominatorId) ?? null,
    nomineeName: nameById.get(n.nomineeId) ?? null,
    status: n.status,
    rawTotal: n.rawTotal,
    effectiveTotal: n.effectiveTotal,
    qualified: n.qualified,
    myVoteIntent: n.votes.find((v) => v.playerId === viewerPlayerId)?.rawIntent ?? null,
  }));

  return {
    ...base,
    me: {
      playerId: me.id,
      displayName: me.displayName,
      virtualSeat: me.virtualSeat,
      alive: me.alive,
      ghostVoteAvailable: me.ghostVoteAvailable,
    },
    myRole,
    roleAcknowledged,
    activeAction: active ? { id: active.id, kind: active.kind } : null,
    deliveredInfo,
    investigation,
    nominations,
  };
}

export interface StorytellerProjectionExtras {
  draft?: SetupDraft | null;
  operational?: (OperationalPhase & { actions: OperationalAction[] }) | null;
  investigation?: InvestigationState | null;
  nominations?: (Nomination & { votes: Vote[] })[];
}

export function buildStorytellerProjection(
  game: GameSession,
  players: Player[],
  claims: PlayerClaim[],
  extras: StorytellerProjectionExtras = {},
): StorytellerGameProjection {
  const base = buildPublicProjection(game, players);
  const claimByPlayer = new Map(claims.map((c) => [c.playerId, c]));
  const nameById = new Map(players.map((p) => [p.id, p.displayName]));

  const setup = extras.draft
    ? {
        regenerationIndex: extras.draft.regenerationIndex,
        committed: extras.draft.committedAt != null,
        candidate: extras.draft.candidateJson as unknown as SetupCandidate,
      }
    : null;

  const operational = extras.operational
    ? {
        phaseId: extras.operational.id,
        cycleNumber: extras.operational.cycleNumber,
        status: extras.operational.status,
        actions: extras.operational.actions.map((a) => ({
          id: a.id,
          orderIndex: a.orderIndex,
          kind: a.kind,
          actorPlayerId: a.actorPlayerId,
          actorDisplayName: a.actorPlayerId ? (nameById.get(a.actorPlayerId) ?? null) : null,
          status: a.status,
          secretJson: a.secretJson,
          resolutionJson: a.resolutionJson,
        })),
      }
    : null;

  const investigation = extras.investigation
    ? {
        cycleNumber: extras.investigation.cycleNumber,
        nominationState: extras.investigation.nominationState,
        currentExecutionCandidatePlayerId: extras.investigation.currentExecutionCandidatePlayerId,
        currentHighEffectiveVotes: extras.investigation.currentHighEffectiveVotes,
        executionOccurred: extras.investigation.executionOccurred,
      }
    : null;

  const nominations: NominationDto[] = (extras.nominations ?? []).map((n) => ({
    id: n.id,
    sequence: n.sequence,
    nominatorId: n.nominatorId,
    nominatorName: nameById.get(n.nominatorId) ?? null,
    nomineeId: n.nomineeId,
    nomineeName: nameById.get(n.nomineeId) ?? null,
    status: n.status,
    rawTotal: n.rawTotal,
    effectiveTotal: n.effectiveTotal,
    qualified: n.qualified,
    votes: n.votes.map((v) => ({
      playerId: v.playerId,
      playerName: nameById.get(v.playerId) ?? null,
      rawIntent: v.rawIntent,
      valid: v.valid,
      effectiveWeight: v.effectiveWeight,
      ghostVoteConsumed: v.ghostVoteConsumed,
    })),
  }));

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
    setup,
    operational,
    investigation,
    nominations,
  };
}
