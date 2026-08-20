// First-night information resolver (docs/01 §8, docs/05 §8).
//
// Pure functions that compute the "true" answer for each first-cycle info role
// from the committed candidate. Registration ambiguity (Recluse/Spy) and
// poison/Drunk malfunction are Slice 3; here the Storyteller may still override
// any answer via the resolve action.

import { CHARACTER_DEFINITIONS } from "@/modules/trouble-brewing/characters";
import type { SetupCandidate } from "@/modules/setup/types";

export type InfoResult =
  | { kind: "CHARACTER_CANDIDATES"; characterId: string; candidatePlayerIds: string[] }
  | { kind: "CHARACTER"; characterId: string; playerId: string }
  | { kind: "NUMBER"; value: number }
  | { kind: "NO_OUTSIDERS" }
  | { kind: "DEMON_YES_NO"; value: boolean }
  | { kind: "GRIMOIRE"; assignments: SetupCandidate["assignments"] };

function seats(candidate: SetupCandidate) {
  return [...candidate.assignments].sort((a, b) => a.virtualSeat - b.virtualSeat);
}

/** "This character + two candidates, one of whom is that character." */
export function computeCharacterCandidates(
  candidate: SetupCandidate,
  category: "TOWNSFOLK" | "OUTSIDER" | "MINION",
): InfoResult | null {
  const ordered = seats(candidate);
  const target = ordered.find(
    (a) =>
      a.participantKind === "NORMAL" &&
      CHARACTER_DEFINITIONS[a.trueCharacterId].category === category,
  );
  if (!target) return null;
  const idx = ordered.indexOf(target);
  const other = ordered[(idx + 1) % ordered.length];
  return {
    kind: "CHARACTER_CANDIDATES",
    characterId: target.trueCharacterId,
    candidatePlayerIds: [target.playerId, other.playerId],
  };
}

export function computeAdjacentEvilPairs(candidate: SetupCandidate): number {
  const ordered = seats(candidate);
  const n = ordered.length;
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    if (ordered[i].trueAlignment === "EVIL" && ordered[(i + 1) % n].trueAlignment === "EVIL") {
      count += 1;
    }
  }
  return count;
}

export function computeEmpathCount(candidate: SetupCandidate, actorPlayerId: string): number {
  const ordered = seats(candidate);
  const idx = ordered.findIndex((a) => a.playerId === actorPlayerId);
  if (idx < 0) return 0;
  const n = ordered.length;
  const left = ordered[(idx - 1 + n) % n];
  const right = ordered[(idx + 1) % n];
  return (left.trueAlignment === "EVIL" ? 1 : 0) + (right.trueAlignment === "EVIL" ? 1 : 0);
}

export function computeFortuneTellerResult(
  candidate: SetupCandidate,
  targetPlayerIds: string[],
): boolean {
  const demonId = candidate.assignments.find((a) => a.trueCharacterId === "IMP")?.playerId;
  const redHerring = candidate.fortuneTellerRedHerringPlayerId;
  return targetPlayerIds.some((id) => id === demonId || id === redHerring);
}

/** Ravenkeeper: the true character of the chosen player. */
export function computeCharacterOf(
  candidate: SetupCandidate,
  targetPlayerId: string,
): InfoResult {
  const target = candidate.assignments.find((a) => a.playerId === targetPlayerId);
  return { kind: "CHARACTER", characterId: target!.trueCharacterId, playerId: targetPlayerId };
}
