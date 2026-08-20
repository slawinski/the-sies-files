// Scenario engine — versioned content model + the TSF_Millionaire content pack
// (docs/08 §3–§13). Content is data, not code; the engine is not hardcoded to
// final prose. These are development fixtures, clearly non-production.

export type VisibilityScope =
  | "PUBLIC"
  | "DISCOVERER_ONLY"
  | "SPECIFIC_PLAYERS"
  | "CHARACTER_FILTERED"
  | "ALIGNMENT_FILTERED"
  | "STORYTELLER_ONLY";

export type QrRepeatPolicy = "REPEATABLE_PER_PLAYER" | "ONCE_PER_PLAYER" | "ONCE_PER_GAME";

export interface MapVersionDefinition {
  id: string;
  locations: string[];
}

export interface ClueDefinition {
  id: string;
  title: string;
  body: string;
  visibilityScope: VisibilityScope;
  characterId?: string; // for CHARACTER_FILTERED
}

export interface TaskDefinition {
  id: string;
  title: string;
  description: string;
}

export type ScenarioAction =
  | { type: "SET_STAGE"; stageId: string }
  | { type: "SET_MAP_VERSION"; mapVersionId: string }
  | { type: "REVEAL_CLUE"; clueId: string }
  | { type: "ISSUE_TASK"; taskId: string }
  | { type: "APPLY_CONDITION"; conditionId: string }
  | { type: "CLEAR_CONDITION"; conditionId: string };

export interface QrTokenDefinition {
  id: string;
  token: string; // opaque high-entropy string printed in the QR
  repeatPolicy: QrRepeatPolicy;
  actions: ScenarioAction[];
}

export interface ScenarioTransitionDefinition {
  id: string;
  when: { allOf?: string[]; anyOf?: string[] };
  actions: ScenarioAction[];
}

export interface ScenarioDefinition {
  id: string;
  version: number;
  initialStageId: string;
  initialMapVersionId: string;
  mapVersions: MapVersionDefinition[];
  qrTokens: QrTokenDefinition[];
  clues: ClueDefinition[];
  tasks: TaskDefinition[];
  transitions: ScenarioTransitionDefinition[];
}

export const TSF_MILLIONAIRE: ScenarioDefinition = {
  id: "THE_SIES_FILES_MILLIONAIRE",
  version: 1,
  initialStageId: "stage-start",
  initialMapVersionId: "MAP_BASE",
  mapVersions: [
    {
      id: "MAP_BASE",
      locations: ["HOUSE", "OUTBUILDING", "TERRACE", "FIELD", "FIREPIT", "HAMMOCK_APPLES", "PARKING", "GATE", "WICKET", "TRASH"],
    },
    {
      id: "MAP_EXTENDED",
      locations: ["HOUSE", "OUTBUILDING", "TERRACE", "FIELD", "FIREPIT", "HAMMOCK_APPLES", "PARKING", "GATE", "WICKET", "TRASH", "WEST_PATH", "STREAM", "WOODS", "HERMITAGE"],
    },
  ],
  qrTokens: [
    {
      id: "qr-letter",
      token: "tsf-qr-letter-001",
      repeatPolicy: "ONCE_PER_PLAYER",
      actions: [
        { type: "REVEAL_CLUE", clueId: "clue-letter" },
        { type: "ISSUE_TASK", taskId: "task-examine-letter" },
      ],
    },
    {
      id: "qr-trap",
      token: "tsf-qr-trap-001",
      repeatPolicy: "ONCE_PER_PLAYER",
      actions: [{ type: "APPLY_CONDITION", conditionId: "INJURED" }],
    },
    {
      id: "qr-first-aid",
      token: "tsf-qr-first-aid-001",
      repeatPolicy: "ONCE_PER_PLAYER",
      actions: [{ type: "CLEAR_CONDITION", conditionId: "INJURED" }],
    },
    {
      id: "qr-annex",
      token: "tsf-qr-annex-001",
      repeatPolicy: "ONCE_PER_GAME",
      actions: [{ type: "REVEAL_CLUE", clueId: "clue-map" }],
    },
  ],
  clues: [
    {
      id: "clue-letter",
      title: "List milionera",
      body: "Ktoś chciał jego pieniędzy. On to wiedział.",
      visibilityScope: "PUBLIC",
    },
    {
      id: "clue-map",
      title: "Aneks do mapy",
      body: "Na zachód od domu prowadzi ścieżka nad strumień, do pustelni.",
      visibilityScope: "PUBLIC",
    },
    {
      id: "clue-finale",
      title: "Zniknięcie",
      body: "Zniknięcie było inscenizacją — obroną przed prawdziwym zamachem.",
      visibilityScope: "DISCOVERER_ONLY",
    },
  ],
  tasks: [
    {
      id: "task-examine-letter",
      title: "Zbadaj list",
      description: "Przeanalizujcie list milionera i ustalcie, kto zagrażał jego pieniądzom.",
    },
  ],
  transitions: [
    {
      id: "unlock-extended-map",
      when: { allOf: ["clue-map"] },
      actions: [{ type: "SET_MAP_VERSION", mapVersionId: "MAP_EXTENDED" }],
    },
    {
      id: "advance-stage",
      when: { allOf: ["clue-map"] },
      actions: [{ type: "SET_STAGE", stageId: "stage-finale" }],
    },
  ],
};

export function getScenarioDefinition(id: string, version: number): ScenarioDefinition {
  if (id === TSF_MILLIONAIRE.id && version === TSF_MILLIONAIRE.version) return TSF_MILLIONAIRE;
  throw new Error(`Unknown scenario ${id}@${version}`);
}
