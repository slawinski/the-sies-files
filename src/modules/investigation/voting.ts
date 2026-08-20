// Pure vote tallying (docs/07 §9, ADR-001 §2.3). Server-authoritative; never
// client-calculated. Deterministic and unit-testable.

export interface VoterState {
  playerId: string;
  rawIntent: boolean;
  alive: boolean;
  participantKind: "NORMAL" | "TRAVELLER";
  ghostVoteAvailable: boolean;
  isButler: boolean;
  isBureaucratTarget: boolean;
}

export interface TallyResult {
  rawVotes: number;
  effectiveTotal: number;
  consumedGhostVotes: string[];
  invalidVotes: Array<{ playerId: string; reason: string }>;
}

export function tallyVotes(
  voters: VoterState[],
  butlerMasterId: string | null,
): TallyResult {
  const masterVoting = butlerMasterId
    ? (voters.find((v) => v.playerId === butlerMasterId)?.rawIntent ?? false)
    : true;

  let rawVotes = 0;
  let effectiveTotal = 0;
  const consumedGhostVotes: string[] = [];
  const invalidVotes: Array<{ playerId: string; reason: string }> = [];

  for (const v of voters) {
    if (!v.rawIntent) continue;
    rawVotes += 1;

    if (v.isButler && !masterVoting) {
      invalidVotes.push({ playerId: v.playerId, reason: "BUTLER_MASTER_NOT_VOTING" });
      continue;
    }
    if (!v.alive) {
      if (v.participantKind === "NORMAL" && v.ghostVoteAvailable) {
        consumedGhostVotes.push(v.playerId);
      } else {
        invalidVotes.push({ playerId: v.playerId, reason: "GHOST_VOTE_ALREADY_USED" });
        continue;
      }
    }
    effectiveTotal += v.isBureaucratTarget ? 3 : 1;
  }

  return { rawVotes, effectiveTotal, consumedGhostVotes, invalidVotes };
}

export function executionThreshold(livingNormalCount: number): number {
  return Math.floor(livingNormalCount / 2) + 1;
}

export function qualifies(effectiveTotal: number, livingNormalCount: number): boolean {
  return effectiveTotal >= executionThreshold(livingNormalCount);
}
