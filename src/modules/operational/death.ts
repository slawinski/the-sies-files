// Central death-outcome computation (docs/01 §9.4, docs/06 §10–§15).
// Pure — unit-testable. The Storyteller redirect (Mayor) is handled by the
// caller as an explicit choice; this function returns the deterministic part.

export type DeathSource = "DEMON" | "EXECUTION" | "SLAYER" | "VIRGIN" | "STORYTELLER_OVERRIDE";

export function demonDeathOutcome(args: {
  targetCharacterId: string;
  targetFunctioning: boolean;
  monkProtected: boolean;
}): { dies: boolean; reason?: "SOLDIER" | "MONK" } {
  if (args.targetCharacterId === "SOLDIER" && args.targetFunctioning) {
    return { dies: false, reason: "SOLDIER" };
  }
  if (args.monkProtected) {
    return { dies: false, reason: "MONK" };
  }
  return { dies: true };
}
