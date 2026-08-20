// Versioned Trouble Brewing script definition (docs/01 §6, docs/03 §6).
//
// The exact first-Operational order lives here (not in UI code) and is
// snapshot-tested. Slice 2 uses a narrow first-cycle runner; Slice 3 generalizes
// occurrence (`FIRST_CYCLE_ONLY` / `EACH_CYCLE` / `NOT_FIRST_CYCLE`).

import type { CharacterId } from "./characters";

export type FirstCycleStepKind =
  | "POISONER_CHOOSE"
  | "WASHERWOMAN_INFO"
  | "LIBRARIAN_INFO"
  | "INVESTIGATOR_INFO"
  | "CHEF_INFO"
  | "EMPATH_INFO"
  | "FORTUNE_TELLER_CHOOSE"
  | "FORTUNE_TELLER_INFO"
  | "SPY_GRIMOIRE"
  | "BUTLER_CHOOSE"
  | "BUREAUCRAT_CHOOSE";

export type StepActor = "PLAYER" | "STORYTELLER";

export const STEP_CHARACTER: Record<FirstCycleStepKind, CharacterId> = {
  POISONER_CHOOSE: "POISONER",
  WASHERWOMAN_INFO: "WASHERWOMAN",
  LIBRARIAN_INFO: "LIBRARIAN",
  INVESTIGATOR_INFO: "INVESTIGATOR",
  CHEF_INFO: "CHEF",
  EMPATH_INFO: "EMPATH",
  FORTUNE_TELLER_CHOOSE: "FORTUNE_TELLER",
  FORTUNE_TELLER_INFO: "FORTUNE_TELLER",
  SPY_GRIMOIRE: "SPY",
  BUTLER_CHOOSE: "BUTLER",
  BUREAUCRAT_CHOOSE: "BUREAUCRAT",
};

export const STEP_ACTOR: Record<FirstCycleStepKind, StepActor> = {
  POISONER_CHOOSE: "PLAYER",
  WASHERWOMAN_INFO: "STORYTELLER",
  LIBRARIAN_INFO: "STORYTELLER",
  INVESTIGATOR_INFO: "STORYTELLER",
  CHEF_INFO: "STORYTELLER",
  EMPATH_INFO: "STORYTELLER",
  FORTUNE_TELLER_CHOOSE: "PLAYER",
  FORTUNE_TELLER_INFO: "STORYTELLER",
  SPY_GRIMOIRE: "STORYTELLER",
  BUTLER_CHOOSE: "PLAYER",
  BUREAUCRAT_CHOOSE: "PLAYER",
};

export interface ScriptDefinition {
  id: "TROUBLE_BREWING";
  version: number;
  firstOperationalOrder: FirstCycleStepKind[];
}

export const TROUBLE_BREWING_SCRIPT_ID = "TROUBLE_BREWING";
export const TROUBLE_BREWING_SCRIPT_VERSION = 1;

export const TROUBLE_BREWING: ScriptDefinition = {
  id: TROUBLE_BREWING_SCRIPT_ID,
  version: TROUBLE_BREWING_SCRIPT_VERSION,
  firstOperationalOrder: [
    "POISONER_CHOOSE",
    "WASHERWOMAN_INFO",
    "LIBRARIAN_INFO",
    "INVESTIGATOR_INFO",
    "CHEF_INFO",
    "EMPATH_INFO",
    "FORTUNE_TELLER_CHOOSE",
    "FORTUNE_TELLER_INFO",
    "SPY_GRIMOIRE",
    "BUTLER_CHOOSE",
    "BUREAUCRAT_CHOOSE",
  ],
};

/** Resolve the active script definition (single script in MVP). */
export function getScriptDefinition(id: string, version: number): ScriptDefinition {
  if (id === TROUBLE_BREWING.id && version === TROUBLE_BREWING.version) {
    return TROUBLE_BREWING;
  }
  throw new Error(`Unknown script ${id}@${version}`);
}
