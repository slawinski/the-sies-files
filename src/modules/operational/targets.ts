// Declarative Operational target contracts (audit spec 18 §8). The validator is
// the only place that may accept a target ID; the UI is never trusted.

import { DomainError } from "@/lib/errors";
import type { StepKind } from "@/modules/trouble-brewing/script";

export interface TargetRule {
  min: number;
  max: number;
  self: "ALLOW" | "FORBID";
  alive: "REQUIRED" | "ANY";
}

export const TARGET_RULES: Partial<Record<StepKind, TargetRule>> = {
  BUTLER_CHOOSE: { min: 1, max: 1, self: "FORBID", alive: "ANY" },
  BUREAUCRAT_CHOOSE: { min: 1, max: 1, self: "FORBID", alive: "REQUIRED" },
  POISONER_CHOOSE: { min: 1, max: 1, self: "ALLOW", alive: "ANY" },
  MONK_CHOOSE: { min: 1, max: 1, self: "FORBID", alive: "REQUIRED" },
  IMP_CHOOSE: { min: 1, max: 1, self: "ALLOW", alive: "ANY" },
  FORTUNE_TELLER_CHOOSE: { min: 2, max: 2, self: "ALLOW", alive: "REQUIRED" },
};

export interface TargetValidationInput {
  kind: StepKind;
  actorPlayerId: string;
  targetPlayerIds: string[];
  targets: Array<{ playerId: string; alive: boolean }>; // same-game lookups only
}

export function validateTargets(input: TargetValidationInput): void {
  const rule = TARGET_RULES[input.kind];
  if (!rule) {
    // Unknown kinds are the caller's bug — do not invent a permissive default.
    throw new DomainError("INVALID_TARGET", `No target contract for action kind ${input.kind}`);
  }

  if (input.targetPlayerIds.length < rule.min || input.targetPlayerIds.length > rule.max) {
    throw new DomainError(
      "INVALID_TARGET",
      `Action ${input.kind} requires ${rule.min === rule.max ? rule.min : `${rule.min}–${rule.max}`} target(s)`,
    );
  }

  const ids = new Set(input.targetPlayerIds);
  if (ids.size !== input.targetPlayerIds.length) {
    throw new DomainError("INVALID_TARGET", "Duplicate targets are not allowed");
  }

  for (const id of input.targetPlayerIds) {
    if (rule.self === "FORBID" && id === input.actorPlayerId) {
      throw new DomainError("INVALID_TARGET", "You cannot target yourself with this action");
    }
    const target = input.targets.find((t) => t.playerId === id);
    if (!target) {
      throw new DomainError("INVALID_TARGET", "Target is not in this game");
    }
    if (rule.alive === "REQUIRED" && !target.alive) {
      throw new DomainError("INVALID_TARGET", "Target must be alive");
    }
  }
}
