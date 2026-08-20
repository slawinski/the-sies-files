// Effect model + lifecycle (docs/06 §7). Effects declare an expiry boundary so
// the phase transition can expire them deterministically before building the
// next queue.

export type EffectType =
  | "POISONED"
  | "MONK_PROTECTED_FROM_DEMON"
  | "BUREAUCRAT_VOTE_WEIGHT_TARGET"
  | "BUTLER_MASTER";

export type ExpiryBoundary = "END_OF_OPERATIONAL" | "END_OF_INVESTIGATION";

export const EFFECT_BOUNDARY: Record<EffectType, ExpiryBoundary> = {
  POISONED: "END_OF_INVESTIGATION",
  MONK_PROTECTED_FROM_DEMON: "END_OF_OPERATIONAL",
  BUREAUCRAT_VOTE_WEIGHT_TARGET: "END_OF_INVESTIGATION",
  BUTLER_MASTER: "END_OF_INVESTIGATION",
};

/**
 * Is an effect currently active in the given phase/cycle? Effects span a single
 * cycle number; `END_OF_OPERATIONAL` effects are active only during Operational,
 * `END_OF_INVESTIGATION` effects span Operational + Investigation.
 */
export function effectActiveNow(
  effect: { cycleNumber: number; expiryBoundary: string },
  phase: "OPERATIONAL" | "INVESTIGATION",
  cycle: number,
): boolean {
  if (effect.cycleNumber !== cycle) return false;
  if (effect.expiryBoundary === "END_OF_OPERATIONAL") return phase === "OPERATIONAL";
  return true;
}
