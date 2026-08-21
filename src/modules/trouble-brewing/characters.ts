// Trouble Brewing character catalog (docs/01 §6, §8).
//
// Character IDs are stable strings — never magic strings elsewhere in domain
// code. Role behavior is versioned data + resolvers, not UI switch statements.
// Polish display names are reviewed metadata (audit spec 23 §5); UI must never
// derive them from IDs.

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
  /** Reviewed Polish display names (audit spec 23 §5). "Pełnomocnik" is canonical. */
  displayName: { pl: string };
}

export const CHARACTER_DEFINITIONS: Record<CharacterId, CharacterDefinition> = {
  WASHERWOMAN: { id: "WASHERWOMAN", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Praczka" } },
  LIBRARIAN: { id: "LIBRARIAN", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Bibliotekarka" } },
  INVESTIGATOR: { id: "INVESTIGATOR", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Śledczy" } },
  CHEF: { id: "CHEF", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Kucharz" } },
  EMPATH: { id: "EMPATH", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Empata" } },
  FORTUNE_TELLER: { id: "FORTUNE_TELLER", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Wróżbitka" } },
  UNDERTAKER: { id: "UNDERTAKER", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Grabarz" } },
  MONK: { id: "MONK", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Mnich" } },
  RAVENKEEPER: { id: "RAVENKEEPER", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Strażnik Kruka" } },
  VIRGIN: { id: "VIRGIN", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Dziewica" } },
  SLAYER: { id: "SLAYER", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Pogromca" } },
  SOLDIER: { id: "SOLDIER", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Żołnierz" } },
  MAYOR: { id: "MAYOR", category: "TOWNSFOLK", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Burmistrz" } },
  BUTLER: { id: "BUTLER", category: "OUTSIDER", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Lokaj" } },
  DRUNK: { id: "DRUNK", category: "OUTSIDER", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Pijak" } },
  RECLUSE: { id: "RECLUSE", category: "OUTSIDER", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Samotnik" } },
  SAINT: { id: "SAINT", category: "OUTSIDER", defaultAlignment: "GOOD", publicCharacter: false, displayName: { pl: "Święty" } },
  POISONER: { id: "POISONER", category: "MINION", defaultAlignment: "EVIL", publicCharacter: false, displayName: { pl: "Truciciel" } },
  SPY: { id: "SPY", category: "MINION", defaultAlignment: "EVIL", publicCharacter: false, displayName: { pl: "Szpieg" } },
  SCARLET_WOMAN: { id: "SCARLET_WOMAN", category: "MINION", defaultAlignment: "EVIL", publicCharacter: false, displayName: { pl: "Szkarłatna Kobieta" } },
  BARON: { id: "BARON", category: "MINION", defaultAlignment: "EVIL", publicCharacter: false, displayName: { pl: "Baron" } },
  IMP: { id: "IMP", category: "DEMON", defaultAlignment: "EVIL", publicCharacter: false, displayName: { pl: "Diabełek" } },
  BUREAUCRAT: { id: "BUREAUCRAT", category: "TRAVELLER", defaultAlignment: null, publicCharacter: true, displayName: { pl: "Pełnomocnik" } },
};

/** Reviewed Polish display name for a character (never a derived string). */
export function characterDisplayName(id: string): string {
  const def = CHARACTER_DEFINITIONS[id as CharacterId];
  return def?.displayName.pl ?? id;
}

export function alignmentOf(id: CharacterId): Alignment {
  const def = CHARACTER_DEFINITIONS[id];
  if (def.defaultAlignment == null) {
    throw new Error(`Alignment for ${id} is not statically determined`);
  }
  return def.defaultAlignment;
}
