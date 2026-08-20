// Central ability-functioning resolver (docs/06 §6). Poison/Drunk semantics are
// centralized here so character modules never re-implement malfunction logic.

import type { Effect, PlayerSecret } from "@prisma/client";
import { effectActiveNow } from "./effects";

export type AbilityFunctionState = "FUNCTIONING" | "MALFUNCTIONING";

export function getAbilityFunctionState(
  secret: PlayerSecret,
  effects: Effect[],
  phase: "OPERATIONAL" | "INVESTIGATION",
  cycle: number,
): AbilityFunctionState {
  if (secret.trueCharacterId === "DRUNK") return "MALFUNCTIONING";

  const poisoned = effects.some(
    (e) =>
      e.effectType === "POISONED" &&
      e.targetPlayerId === secret.playerId &&
      e.active &&
      effectActiveNow(e, phase, cycle),
  );
  if (poisoned) return "MALFUNCTIONING";

  return "FUNCTIONING";
}
