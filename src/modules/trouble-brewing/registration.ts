// Registration resolver (audit spec 18 §5). Separates true identity from the
// legal "registrations" an observer/ability may treat a player as for one
// ruling. Recluse/Spy flexibility produces a bounded set of options; ambiguous
// outcomes become an explicit Storyteller decision, never free-form JSON.

import {
  CHARACTER_DEFINITIONS,
  type Alignment,
  type CharacterCategory,
  type CharacterId,
} from "./characters";

export type RegistrationPredicate =
  | { kind: "CATEGORY"; category: CharacterCategory }
  | { kind: "ALIGNMENT"; alignment: Alignment }
  | { kind: "CHARACTER"; characterId: CharacterId };

export interface RegistrationOption {
  optionId: string;
  description: string;
  satisfies: boolean;
}

export interface RegistrationSubject {
  playerId: string;
  trueCharacterId: CharacterId;
  trueAlignment: Alignment;
}

function predicateMatches(
  characterId: CharacterId,
  alignment: Alignment,
  predicate: RegistrationPredicate,
): boolean {
  switch (predicate.kind) {
    case "CATEGORY":
      return CHARACTER_DEFINITIONS[characterId].category === predicate.category;
    case "ALIGNMENT":
      return alignment === predicate.alignment;
    case "CHARACTER":
      return characterId === predicate.characterId;
  }
}

const DESCRIPTIONS: Record<string, string> = {
  TRUE: "true registration",
  AS_EVIL: "register as evil",
  AS_GOOD: "register as good",
  AS_MINION: "register as a Minion",
  AS_DEMON: "register as the Demon",
  AS_TOWNSFOLK: "register as a Townsfolk",
  AS_OUTSIDER: "register as an Outsider",
};

/**
 * Legal registrations for `subject` against `predicate`. `subjectFunctioning`
 * must be computed with the central functioning resolver (poison/Drunk).
 */
export function getRegistrationOptions(
  subject: RegistrationSubject,
  predicate: RegistrationPredicate,
  subjectFunctioning: boolean,
): RegistrationOption[] {
  const trueOption: RegistrationOption = {
    optionId: "TRUE",
    description: DESCRIPTIONS.TRUE,
    satisfies: predicateMatches(subject.trueCharacterId, subject.trueAlignment, predicate),
  };

  const flexible =
    subjectFunctioning && (subject.trueCharacterId === "RECLUSE" || subject.trueCharacterId === "SPY");
  if (!flexible) return [trueOption];

  const extra: RegistrationOption[] = [];
  const add = (optionId: string) => {
    if (!extra.some((o) => o.optionId === optionId)) {
      extra.push({ optionId, description: DESCRIPTIONS[optionId] ?? optionId, satisfies: true });
    }
  };

  if (subject.trueCharacterId === "RECLUSE") {
    if (predicate.kind === "ALIGNMENT" && predicate.alignment === "EVIL") add("AS_EVIL");
    if (predicate.kind === "CATEGORY" && predicate.category === "MINION") add("AS_MINION");
    if (predicate.kind === "CATEGORY" && predicate.category === "DEMON") add("AS_DEMON");
    if (predicate.kind === "CHARACTER" && predicate.characterId === "IMP") add("AS_DEMON");
  } else {
    // SPY
    if (predicate.kind === "ALIGNMENT" && predicate.alignment === "GOOD") add("AS_GOOD");
    if (predicate.kind === "CATEGORY" && predicate.category === "TOWNSFOLK") add("AS_TOWNSFOLK");
    if (predicate.kind === "CATEGORY" && predicate.category === "OUTSIDER") add("AS_OUTSIDER");
  }

  return [trueOption, ...extra];
}

export interface RegistrationResolution {
  /** Auto-resolved when every legal option agrees on the outcome. */
  kind: "AUTO";
  satisfies: boolean;
}

export interface RegistrationDecisionRequired {
  kind: "DECISION_REQUIRED";
  options: RegistrationOption[];
}

export function resolveRegistrationOptions(
  options: RegistrationOption[],
): RegistrationResolution | RegistrationDecisionRequired {
  const outcomes = new Set(options.map((o) => o.satisfies));
  if (outcomes.size === 1) {
    return { kind: "AUTO", satisfies: [...outcomes][0] };
  }
  return { kind: "DECISION_REQUIRED", options };
}
