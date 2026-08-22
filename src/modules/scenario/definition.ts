// Scenario engine — versioned content model + the TSF_Millionaire content pack
// (docs/08 §3–§13). Content is data, not code; the engine is not hardcoded to
// final prose. These are development fixtures, clearly non-production.

// Type-only import keeps the map layer module free of scenario dependencies.
import type { MapLayerId, MapPoiKind, MapPoiVisibility } from "@/modules/map/layers";

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
  unlockedLayerIds: MapLayerId[];
}

export interface MapPoiDefinition {
  id: string;
  label: string; // player-facing label (Polish UI, content-authored)
  x: number; // normalized 0..1 against the full canonical canvas
  y: number; // normalized 0..1 against the full canonical canvas
  layerId: MapLayerId;
  kind: MapPoiKind;
  visibleWhen: MapPoiVisibility;
  interactive: boolean;
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
  pois: MapPoiDefinition[];
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
    { id: "MAP_BASE", unlockedLayerIds: ["BASE"] },
    { id: "MAP_EXTENDED", unlockedLayerIds: ["BASE", "WEST_AREA"] },
  ],
  // POI coordinates derived from production assets via structural analysis;
  // final visual tuning is spec step 14.
  pois: [
    // BASE layer — always visible.
    { id: "HOUSE", label: "Dom", x: 0.68, y: 0.31, layerId: "BASE", kind: "LOCATION", visibleWhen: "ALWAYS", interactive: false },
    { id: "OUTBUILDING", label: "Zabudowania", x: 0.6, y: 0.33, layerId: "BASE", kind: "LOCATION", visibleWhen: "ALWAYS", interactive: false },
    { id: "TERRACE", label: "Taras", x: 0.58, y: 0.4, layerId: "BASE", kind: "LOCATION", visibleWhen: "ALWAYS", interactive: false },
    { id: "FIELD", label: "Boisko", x: 0.56, y: 0.2, layerId: "BASE", kind: "LOCATION", visibleWhen: "ALWAYS", interactive: false },
    { id: "FIREPIT", label: "Palenisko", x: 0.52, y: 0.55, layerId: "BASE", kind: "LOCATION", visibleWhen: "ALWAYS", interactive: false },
    { id: "HAMMOCK_APPLES", label: "Hamaki i jabłonie", x: 0.62, y: 0.6, layerId: "BASE", kind: "LOCATION", visibleWhen: "ALWAYS", interactive: false },
    { id: "PARKING", label: "Parking", x: 0.86, y: 0.42, layerId: "BASE", kind: "LOCATION", visibleWhen: "ALWAYS", interactive: false },
    { id: "GATE", label: "Brama", x: 0.93, y: 0.42, layerId: "BASE", kind: "LOCATION", visibleWhen: "ALWAYS", interactive: false },
    { id: "WICKET", label: "Furtka", x: 0.72, y: 0.58, layerId: "BASE", kind: "LOCATION", visibleWhen: "ALWAYS", interactive: false },
    { id: "TRASH", label: "Śmietnik", x: 0.88, y: 0.62, layerId: "BASE", kind: "LOCATION", visibleWhen: "ALWAYS", interactive: false },
    // WEST_AREA layer — hidden until the layer unlocks.
    { id: "WEST_PATH", label: "Ścieżka na zachód", x: 0.32, y: 0.47, layerId: "WEST_AREA", kind: "LOCATION", visibleWhen: "LAYER_UNLOCKED", interactive: false },
    { id: "STREAM", label: "Strumień", x: 0.13, y: 0.52, layerId: "WEST_AREA", kind: "LOCATION", visibleWhen: "LAYER_UNLOCKED", interactive: false },
    { id: "WOODS", label: "Las", x: 0.2, y: 0.36, layerId: "WEST_AREA", kind: "LOCATION", visibleWhen: "LAYER_UNLOCKED", interactive: false },
    { id: "HERMITAGE", label: "Pustelnia", x: 0.07, y: 0.56, layerId: "WEST_AREA", kind: "LOCATION", visibleWhen: "LAYER_UNLOCKED", interactive: false },
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
