// Pure Trouble Brewing setup composition (docs/01 §5, docs/05 §4).
// No I/O, fully unit-testable.

import { DomainError } from "@/lib/errors";

export interface RoleCounts {
  townsfolk: number;
  outsiders: number;
  minions: number;
  demons: number;
}

export function baseCounts(normalCount: number): RoleCounts {
  switch (normalCount) {
    case 13:
      return { townsfolk: 9, outsiders: 0, minions: 3, demons: 1 };
    case 14:
      return { townsfolk: 9, outsiders: 1, minions: 3, demons: 1 };
    case 15:
      return { townsfolk: 9, outsiders: 2, minions: 3, demons: 1 };
    default:
      throw new DomainError(
        "ROSTER_SIZE_INVALID",
        `Unsupported normal player count ${normalCount} (expected 13–15)`,
      );
  }
}

/** Baron: +2 Outsiders, −2 Townsfolk. Total normal players unchanged. */
export function applyBaron(counts: RoleCounts, baronInPlay: boolean): RoleCounts {
  if (!baronInPlay) return counts;
  return {
    townsfolk: counts.townsfolk - 2,
    outsiders: counts.outsiders + 2,
    minions: counts.minions,
    demons: counts.demons,
  };
}
