// Storyteller presentation-mode + primary-blocker selector
// (UX Implementation Spec v1 §7.2 / Updated Screen Specs v1 §9).
// Pure functions of the server projection — unit tested in storyteller-mode.test.ts.

import type { StorytellerGameProjection } from "@/lib/client-api";
import type { StorytellerPresentationMode, StorytellerView } from "./types";

export type StorytellerBlockerKind =
  | "ST_DECISION"
  | "DAY_TRIGGER_DECISION"
  | "PLAYER_WAITING"
  | "VOTING_ADVANCE"
  | "VOTING_START"
  | "VOTING_LOCK"
  | "PHASE_ADVANCE_OPERATIONAL"
  | "EXECUTION_RESOLVE"
  | "CLOSE_INVESTIGATION"
  | "NOMINATIONS_OPEN"
  | "ROSTER_INCOMPLETE"
  | "SETUP_COMMIT"
  | "START_OPERATIONAL"
  | "NONE";

export interface StorytellerBlocker {
  kind: StorytellerBlockerKind;
  /** Human label of what must happen ("Rozstrzygnij akcję Wróżki"). */
  title: string;
  /** What the Storyteller is waiting for / who acts next. */
  description: string;
  /** Actor display name when the blocker involves a player. */
  actorName?: string;
  /** View that hosts the fix for this blocker. */
  view: StorytellerView;
}

export function selectStorytellerPresentation(game: StorytellerGameProjection): StorytellerPresentationMode {
  if (game.result !== null || game.status === "ENDED") return "GAME_ENDED";

  const actions = game.operational?.actions ?? [];
  const active = actions.find(
    (a) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER",
  );

  if (active?.status === "WAITING_FOR_STORYTELLER") return "OPERATIONAL_BLOCKED_BY_ST";
  if (active?.status === "WAITING_FOR_PLAYER") return "OPERATIONAL_BLOCKED_BY_PLAYER";
  if (actions.length > 0 && actions.every((a) => a.status === "RESOLVED")) {
    return "OPERATIONAL_READY_TO_ADVANCE";
  }
  if (game.nominations.some((n) => n.status === "VOTING")) return "VOTING";
  if (game.status === "ROLE_REVEAL") return "ROLE_REVEAL";
  if (game.status === "LOBBY" || game.status === "SETUP") return "SETUP";
  return "INVESTIGATION";
}

/**
 * The single dominant next step for the Control Home (spec 19 §7.2 priority).
 * Human copy only — internal action ids never surface here.
 */
export function selectPrimaryStorytellerBlocker(game: StorytellerGameProjection): StorytellerBlocker {
  const actions = game.operational?.actions ?? [];
  const waitingForPlayer = actions.find((a) => a.status === "WAITING_FOR_PLAYER");
  const waitingForStoryteller = actions.find((a) => a.status === "WAITING_FOR_STORYTELLER");

  if (waitingForStoryteller) {
    return {
      kind: "ST_DECISION",
      title: "Wymagana decyzja",
      description: "Rozstrzygnij blokującą akcję operacyjną.",
      actorName: waitingForStoryteller.actorDisplayName ?? undefined,
      view: "control",
    };
  }
  const trigger = game.nominations.find((n) => n.status === "DAY_TRIGGER_RESOLUTION");
  if (trigger) {
    return {
      kind: "DAY_TRIGGER_DECISION",
      title: "Wymagana decyzja rejestracji",
      description: `Zdecyduj, jak zarejestruje się ${trigger.nominatorName ?? "nominujący"}.`,
      actorName: trigger.nominatorName ?? undefined,
      view: "control",
    };
  }

  if (waitingForPlayer) {
    return {
      kind: "PLAYER_WAITING",
      title: "Czekamy na gracza",
      description: "Gracz wybiera teraz cel swojej akcji.",
      actorName: waitingForPlayer.actorDisplayName ?? undefined,
      view: "control",
    };
  }

  const voting = game.nominations.filter((n) => n.status === "VOTING");
  const running = voting.find((n) => n.passStatus === "RUNNING");
  if (running) {
    return {
      kind: "VOTING_ADVANCE",
      title: "Głosowanie w toku",
      description: "Poprowadź kolejkę głosów dalej.",
      view: "control",
    };
  }
  const ready = voting.find((n) => n.passStatus === "READY");
  if (ready) {
    return {
      kind: "VOTING_START",
      title: "Rozpocznij głosowanie",
      description: `Nominacja: ${ready.nominatorName ?? "—"} → ${ready.nomineeName ?? "—"}.`,
      view: "control",
    };
  }
  const complete = voting.find((n) => n.passStatus === "COMPLETE");
  if (complete) {
    return {
      kind: "VOTING_LOCK",
      title: "Zablokuj głosowanie",
      description: `Głosowanie nad ${complete.nomineeName ?? "nominacją"} czeka na zamknięcie.`,
      view: "control",
    };
  }

  if (actions.length > 0 && actions.every((a) => a.status === "RESOLVED")) {
    return {
      kind: "PHASE_ADVANCE_OPERATIONAL",
      title: "Zakończ fazę operacyjną",
      description: "Wszystkie akcje rozstrzygnięte — przejdź do śledztwa.",
      view: "control",
    };
  }
  if (game.phase === "INVESTIGATION") {
    const investigation = game.investigation;
    if (
      investigation?.currentExecutionCandidatePlayerId != null &&
      investigation.executionOccurred === false
    ) {
      return {
        kind: "EXECUTION_RESOLVE",
        title: "Wykonaj egzekucję",
        description: "Kandydat z najwyższą liczbą głosów czeka na rozstrzygnięcie.",
        view: "control",
      };
    }
    if (investigation?.executionOccurred === true) {
      return {
        kind: "CLOSE_INVESTIGATION",
        title: "Zamknij śledztwo",
        description: "Egzekucja rozstrzygnięta — zakończ cykl.",
        view: "control",
      };
    }
    if (!investigation || investigation.nominationState === "CLOSED") {
      return {
        kind: "NOMINATIONS_OPEN",
        title: "Otwórz nominacje",
        description: "Gracze czekają na możliwość nominowania.",
        view: "control",
      };
    }
  }

  if (game.status === "ROLE_REVEAL") {
    return {
      kind: "START_OPERATIONAL",
      title: "Rozpocznij fazę operacyjną",
      description: "Role zostały wysłane — zbuduj kolejkę pierwszej nocy.",
      view: "control",
    };
  }
  if (game.status === "LOBBY" || game.status === "SETUP") {
    if (game.participantCount < 13) {
      return {
        kind: "ROSTER_INCOMPLETE",
        title: "Uzupełnij krąg",
        description: `Dodaj jeszcze ${13 - game.participantCount} uczestników, aby móc wygenerować układ ról.`,
        view: "players",
      };
    }
    if (!game.setup?.committed) {
      return {
        kind: "SETUP_COMMIT",
        title: "Zatwierdź grimoire",
        description: "Wygeneruj i zatwierdź tajny układ ról.",
        view: "grimoire",
      };
    }
  }

  return { kind: "NONE", title: "Brak aktywnego blokera", description: "", view: "control" };
}
