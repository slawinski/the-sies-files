// Trouble Brewing character catalog (docs/01 §6, §8).
//
// Character IDs are stable strings — never magic strings elsewhere in domain
// code. Role behavior is versioned data + resolvers, not UI switch statements.

export type CharacterCategory =
  | "TOWNSFOLK"
  | "OUTSIDER"
  | "MINION"
  | "DEMON"
  | "TRAVELLER";

export type Alignment = "GOOD" | "EVIL";

export const CHARACTER_IDS = [
  // Townsfolk
  "WASHERWOMAN",
  "LIBRARIAN",
  "INVESTIGATOR",
  "CHEF",
  "EMPATH",
  "FORTUNE_TELLER",
  "UNDERTAKER",
  "MONK",
  "RAVENKEEPER",
  "VIRGIN",
  "SLAYER",
  "SOLDIER",
  "MAYOR",
  // Outsiders
  "BUTLER",
  "DRUNK",
  "RECLUSE",
  "SAINT",
  // Minions
  "POISONER",
  "SPY",
  "SCARLET_WOMAN",
  "BARON",
  // Demon
  "IMP",
  // Traveller (participant 16)
  "BUREAUCRAT",
] as const;

export type CharacterId = (typeof CHARACTER_IDS)[number];

export const TOWNSFOLK: CharacterId[] = [
  "WASHERWOMAN",
  "LIBRARIAN",
  "INVESTIGATOR",
  "CHEF",
  "EMPATH",
  "FORTUNE_TELLER",
  "UNDERTAKER",
  "MONK",
  "RAVENKEEPER",
  "VIRGIN",
  "SLAYER",
  "SOLDIER",
  "MAYOR",
];

export const OUTSIDERS: CharacterId[] = ["BUTLER", "DRUNK", "RECLUSE", "SAINT"];

export const MINIONS: CharacterId[] = ["POISONER", "SPY", "SCARLET_WOMAN", "BARON"];

export const DEMONS: CharacterId[] = ["IMP"];

export interface CharacterDefinition {
  id: CharacterId;
  category: CharacterCategory;
  /** null for Traveller, whose alignment is assigned secretly at setup. */
  defaultAlignment: Alignment | null;
  /** True when the character is public knowledge (Bureaucrat only in MVP). */
  publicCharacter: boolean;
}

export const CHARACTER_DEFINITIONS: Record<CharacterId, CharacterDefinition> = {
  WASHERWOMAN: { id: "WASHERWOMAN", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false },
  LIBRARIAN: { id: "LIBRARIAN", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false },
  INVESTIGATOR: { id: "INVESTIGATOR", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false },
  CHEF: { id: "CHEF", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false },
  EMPATH: { id: "EMPATH", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false },
  FORTUNE_TELLER: { id: "FORTUNE_TELLER", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false },
  UNDERTAKER: { id: "UNDERTAKER", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false },
  MONK: { id: "MONK", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false },
  RAVENKEEPER: { id: "RAVENKEEPER", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false },
  VIRGIN: { id: "VIRGIN", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false },
  SLAYER: { id: "SLAYER", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false },
  SOLDIER: { id: "SOLDIER", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false },
  MAYOR: { id: "MAYOR", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false },
  BUTLER: { id: "BUTLER", category: "OUTSIDER", defaultAlignment: "GOOD", publicCharacter: false },
  DRUNK: { id: "DRUNK", category: "OUTSIDER", defaultAlignment: "GOOD", publicCharacter: false },
  RECLUSE: { id: "RECLUSE", category: "OUTSIDER", defaultAlignment: "GOOD", publicCharacter: false },
  SAINT: { id: "SAINT", category: "OUTSIDER", defaultAlignment: "GOOD", publicCharacter: false },
  POISONER: { id: "POISONER", category: "MINION", defaultAlignment: "EVIL", publicCharacter: false },
  SPY: { id: "SPY", category: "MINION", defaultAlignment: "EVIL", publicCharacter: false },
  SCARLET_WOMAN: { id: "SCARLET_WOMAN", category: "MINION", defaultAlignment: "EVIL", publicCharacter: false },
  BARON: { id: "BARON", category: "MINION", defaultAlignment: "EVIL", publicCharacter: false },
  IMP: { id: "IMP", category: "DEMON", defaultAlignment: "EVIL", publicCharacter: false },
  BUREAUCRAT: { id: "BUREAUCRAT", category: "TRAVELLER", defaultAlignment: null, publicCharacter: true },
};

export function alignmentOf(id: CharacterId): Alignment {
  const def = CHARACTER_DEFINITIONS[id];
  if (def.defaultAlignment == null) {
    throw new Error(`Alignment for ${id} is not statically determined`);
  }
  return def.defaultAlignment;
}
