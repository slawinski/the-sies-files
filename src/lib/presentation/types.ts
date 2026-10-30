// Shared presentation-mode types (UX Implementation Spec v1 §2).
// Pure UI-layer projections of server state — the domain model stays
// authoritative; these types only describe *how the screen behaves*.

export type PlayerPresentationMode =
  | "GAME_ENDED"
  | "ROLE_REVEAL"
  | "OPERATIONAL_REQUIRED"
  | "OPERATIONAL_WAITING"
  | "FORMAL_VOTING"
  | "FORMAL_NOMINATION"
  | "INVESTIGATION"
  | "WAITING";

export type StorytellerPresentationMode =
  | "SETUP"
  | "ROLE_REVEAL"
  | "OPERATIONAL_BLOCKED_BY_PLAYER"
  | "OPERATIONAL_BLOCKED_BY_ST"
  | "OPERATIONAL_READY_TO_ADVANCE"
  | "INVESTIGATION"
  | "VOTING"
  | "GAME_ENDED";

export type PlayerView = "case" | "people" | "journal" | "map";

export type StorytellerView = "control" | "players" | "grimoire" | "scenario" | "audit" | "system";

export const PLAYER_VIEWS: readonly PlayerView[] = ["case", "people", "journal", "map"];
export const STORYTELLER_VIEWS: readonly StorytellerView[] = [
  "control",
  "players",
  "grimoire",
  "scenario",
  "audit",
  "system",
];

export function isPlayerView(value: string | null | undefined): value is PlayerView {
  return value !== null && value !== undefined && (PLAYER_VIEWS as readonly string[]).includes(value);
}

export function isStorytellerView(value: string | null | undefined): value is StorytellerView {
  return (
    value !== null &&
    value !== undefined &&
    (STORYTELLER_VIEWS as readonly string[]).includes(value)
  );
}
