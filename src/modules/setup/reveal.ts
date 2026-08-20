// Role reveal logic (docs/05 §7): what a single player may privately see after
// setup commit — perceived character, own alignment, evil team knowledge, and
// the Demon's bluffs. The Drunk sees only their perceived Townsfolk (docs/05 §15).

import { DomainError } from "@/lib/errors";
import { CHARACTER_DEFINITIONS } from "@/modules/trouble-brewing/characters";
import type { SetupCandidate } from "./types";

export interface TeamKnowledge {
  demonId: string;
  minionIds: string[];
}

export interface RoleReveal {
  characterId: string;
  alignment: "GOOD" | "EVIL";
  publicCharacter: boolean;
  teamKnowledge?: TeamKnowledge;
  bluffs?: string[];
}

export function buildRoleReveal(candidate: SetupCandidate, playerId: string): RoleReveal {
  const assignment = candidate.assignments.find((a) => a.playerId === playerId);
  if (!assignment) {
    throw new DomainError("PLAYER_NOT_FOUND", "Player not found in setup");
  }

  const def = CHARACTER_DEFINITIONS[assignment.trueCharacterId];
  const reveal: RoleReveal = {
    characterId: assignment.perceivedCharacterId,
    alignment: assignment.trueAlignment,
    publicCharacter: def.publicCharacter,
  };

  const minionIds = candidate.assignments
    .filter(
      (a) =>
        a.participantKind === "NORMAL" &&
        a.trueAlignment === "EVIL" &&
        a.trueCharacterId !== "IMP",
    )
    .map((a) => a.playerId);

  if (assignment.trueCharacterId === "IMP") {
    reveal.teamKnowledge = { demonId: assignment.playerId, minionIds };
    reveal.bluffs = candidate.demonBluffs;
  } else if (def.category === "MINION") {
    const demon = candidate.assignments.find((a) => a.trueCharacterId === "IMP");
    reveal.teamKnowledge = { demonId: demon!.playerId, minionIds };
  }

  return reveal;
}
