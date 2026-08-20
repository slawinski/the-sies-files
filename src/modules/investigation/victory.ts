// Victory resolver (docs/01 §11, docs/07 §13–§15). Pure + idempotent.
// Scarlet-Woman succession must be resolved BEFORE calling the generic check.

export type Winner = "GOOD" | "EVIL";

export interface GenericVictoryInput {
  livingNormalCount: number;
  demonAlive: boolean;
}

export function checkGenericVictory(
  input: GenericVictoryInput,
): { winner: Winner | null; reason?: string } {
  if (!input.demonAlive) return { winner: "GOOD", reason: "DEMON_DEAD" };
  if (input.livingNormalCount <= 2) return { winner: "EVIL", reason: "EVIL_TERMINAL" };
  return { winner: null };
}

export function checkMayorVictory(input: {
  livingNormalCount: number;
  mayorAlive: boolean;
  executionOccurred: boolean;
}): { winner: Winner | null; reason?: string } {
  if (!input.executionOccurred && input.mayorAlive && input.livingNormalCount === 3) {
    return { winner: "GOOD", reason: "MAYOR" };
  }
  return { winner: null };
}
