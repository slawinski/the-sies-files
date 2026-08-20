// Pure roster / Virtual Circle rules (docs/04 §5). No I/O, fully unit-testable.

import { DomainError } from "@/lib/errors";

export const MIN_READY_PLAYERS = 13;
export const MAX_PLAYERS = 16;

/** Setup can proceed only with exactly 13–16 participants. */
export function isRosterReady(count: number): boolean {
  return count >= MIN_READY_PLAYERS && count <= MAX_PLAYERS;
}

export function validateRosterSizeForAdd(currentCount: number): void {
  if (currentCount >= MAX_PLAYERS) {
    throw new DomainError(
      "ROSTER_FULL",
      `Roster already has ${MAX_PLAYERS} participants`,
    );
  }
}

/** Display names must be non-empty after trim. */
export function normalizeDisplayName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new DomainError("INVALID_DISPLAY_NAME", "Display name is required");
  }
  return trimmed;
}

/** Virtual Circle seats must be contiguous 0..N-1. */
export function isContiguousSeats(seats: number[]): boolean {
  const sorted = [...seats].sort((a, b) => a - b);
  return sorted.every((seat, i) => seat === i);
}

export function hasDuplicates(ids: string[]): boolean {
  return new Set(ids).size !== ids.length;
}

/**
 * Returns true when `candidate` is a permutation of `current` (same set, no
 * duplicates), i.e. a legal Virtual Circle reorder input.
 */
export function isPermutation(candidate: string[], current: string[]): boolean {
  if (candidate.length !== current.length) return false;
  if (hasDuplicates(candidate)) return false;
  const currentSet = new Set(current);
  return candidate.every((id) => currentSet.has(id));
}
