// Player presentation-mode selector (UX Implementation Spec v1 §2/§6.2).
// Pure function of the server projection: the first matching rule wins, so the
// single most important state always becomes the primary stage of the Akta
// view. Unit tested in player-mode.test.ts.

import type { PlayerGameProjection, PlayerNominationDto } from "@/lib/client-api";
import type { PlayerPresentationMode } from "./types";

/** Target-selection actions are the only WAITING_FOR_PLAYER kinds (Slice 2). */
export const TARGET_ACTIONS = new Set([
  "POISONER_CHOOSE",
  "FORTUNE_TELLER_CHOOSE",
  "BUTLER_CHOOSE",
  "BUREAUCRAT_CHOOSE",
]);

/** How many targets a target-selection action needs, or null for non-picker kinds. */
export function requiredTargetCount(kind: string): number | null {
  if (!TARGET_ACTIONS.has(kind)) return null;
  return kind === "FORTUNE_TELLER_CHOOSE" ? 2 : 1;
}

/** The running (or ready) voting nomination the player should be shown. */
export function selectActiveVotingNomination(
  game: PlayerGameProjection,
): PlayerNominationDto | null {
  const voting = game.nominations.filter((n) => n.status === "VOTING");
  const running = voting.find((n) => n.passStatus === "RUNNING");
  if (running) return running;
  return voting[0] ?? null;
}

/**
 * Resolve exactly one presentation mode for the player's primary stage.
 *
 * Priority (audit 18 §5.3 / spec 19 §6.2):
 *  1. game over
 *  2. private role reveal pending
 *  3. operational action with target choice
 *  4. operational action waiting for the Storyteller
 *  5. formal voting
 *  6. formal nomination (terrain actions suppressed)
 *  7. investigation summary
 *  8. pre-game waiting
 */
export function selectPlayerPresentation(game: PlayerGameProjection): PlayerPresentationMode {
  if (game.result !== null) return "GAME_ENDED";
  if (game.myRole !== null && !game.roleAcknowledged) return "ROLE_REVEAL";

  const action = game.activeAction;
  if (action !== null) {
    return requiredTargetCount(action.kind) !== null
      ? "OPERATIONAL_REQUIRED"
      : "OPERATIONAL_WAITING";
  }

  if (game.phase === "INVESTIGATION") {
    if (game.nominations.some((n) => n.status === "VOTING")) return "FORMAL_VOTING";
    if (game.investigation?.nominationState === "OPEN") return "FORMAL_NOMINATION";
    return "INVESTIGATION";
  }

  return "WAITING";
}
