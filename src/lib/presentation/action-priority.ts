// Action severity matrix (UX Implementation Spec v1 §9 / Visual Design System v2 §12).
// Red/danger must never become the generic "primary button" color. This module
// is the single authority for which semantic variant + confirmation gate a
// given game action gets. Unit tested in action-priority.test.ts.

export type ActionVariant = "primary" | "secondary" | "quiet" | "formal" | "danger";
export type ConfirmationLevel = "none" | "confirm" | "strong";

export interface ActionSeverity {
  variant: ActionVariant;
  confirmation: ConfirmationLevel;
  /** The action deserves a single dominant full-width control. */
  fullWidth: boolean;
}

/** Semantic action ids used by the UI (never engine enums). */
export type ActionId =
  | "scan"
  | "submit-target"
  | "nominate"
  | "vote"
  | "lock-vote"
  | "start-voting"
  | "advance-voting"
  | "advance-phase"
  | "commit-grimoire"
  | "regenerate-grimoire"
  | "start-operational"
  | "remove-player"
  | "recovery-override"
  | "reveal-role"
  | "hide-role"
  | "open-map"
  | "open-journal"
  | "reveal-clue"
  | "complete-task"
  | "set-stage"
  | "set-map"
  | "set-condition"
  | "create-checkpoint"
  | "issue-claim"
  | "reset-access"
  | "exile-traveller"
  | "rename"
  | "arrange-circle";

const MATRIX: Record<ActionId, ActionSeverity> = {
  scan: { variant: "primary", confirmation: "none", fullWidth: true },
  "submit-target": { variant: "primary", confirmation: "none", fullWidth: true },
  nominate: { variant: "formal", confirmation: "confirm", fullWidth: true },
  vote: { variant: "formal", confirmation: "confirm", fullWidth: false },
  "lock-vote": { variant: "formal", confirmation: "none", fullWidth: false },
  "start-voting": { variant: "formal", confirmation: "none", fullWidth: false },
  "advance-voting": { variant: "secondary", confirmation: "none", fullWidth: false },
  "advance-phase": { variant: "formal", confirmation: "confirm", fullWidth: false },
  "commit-grimoire": { variant: "formal", confirmation: "strong", fullWidth: false },
  "regenerate-grimoire": { variant: "secondary", confirmation: "none", fullWidth: false },
  "start-operational": { variant: "primary", confirmation: "none", fullWidth: true },
  "remove-player": { variant: "danger", confirmation: "strong", fullWidth: false },
  "recovery-override": { variant: "danger", confirmation: "strong", fullWidth: false },
  "reveal-role": { variant: "primary", confirmation: "none", fullWidth: true },
  "hide-role": { variant: "secondary", confirmation: "none", fullWidth: true },
  "open-map": { variant: "secondary", confirmation: "none", fullWidth: false },
  "open-journal": { variant: "secondary", confirmation: "none", fullWidth: false },
  "reveal-clue": { variant: "secondary", confirmation: "none", fullWidth: false },
  "complete-task": { variant: "secondary", confirmation: "none", fullWidth: false },
  "set-stage": { variant: "secondary", confirmation: "none", fullWidth: false },
  "set-map": { variant: "secondary", confirmation: "none", fullWidth: false },
  "set-condition": { variant: "secondary", confirmation: "none", fullWidth: false },
  "create-checkpoint": { variant: "secondary", confirmation: "none", fullWidth: false },
  "issue-claim": { variant: "secondary", confirmation: "none", fullWidth: false },
  "reset-access": { variant: "danger", confirmation: "strong", fullWidth: false },
  "exile-traveller": { variant: "danger", confirmation: "confirm", fullWidth: false },
  rename: { variant: "quiet", confirmation: "none", fullWidth: false },
  "arrange-circle": { variant: "secondary", confirmation: "none", fullWidth: false },
};

export function actionSeverity(id: ActionId): ActionSeverity {
  return MATRIX[id];
}
