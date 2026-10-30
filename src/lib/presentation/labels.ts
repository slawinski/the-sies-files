// Shared UI label helpers (Polish). Centralized so views stay consistent —
// never raw engine enums or UUIDs in player-facing copy (spec 19 §10).

import type { StorytellerPlayerDto } from "@/lib/client-api";
import { characterDisplayName } from "@/modules/trouble-brewing/characters";

/** "2026-08-20T18:04:00Z" → "20.08, 18:04" (local). */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function phaseLabel(phase: string | null, status: string): string {
  if (phase === "OPERATIONAL") return "Faza operacyjna";
  if (phase === "INVESTIGATION") return "Dochodzenie";
  switch (status) {
    case "LOBBY":
      return "Poczekalnia";
    case "SETUP":
      return "Konfiguracja";
    case "ROLE_REVEAL":
      return "Odbiór ról";
    case "ACTIVE":
      return "Sprawa w toku";
    case "ENDED":
      return "Sprawa zakończona";
    default:
      return status;
  }
}

export function alignmentLabel(alignment: string): string {
  return alignment === "EVIL" ? "Zło" : "Dobro";
}

export function winnerLabel(winner: string | null): string {
  if (winner === "GOOD") return "Koniec gry — wygrywa dobro";
  if (winner === "EVIL") return "Koniec gry — wygrywa zło";
  return "";
}

export function nominationStatusLabel(status: string): string {
  switch (status) {
    case "VOTING":
      return "głosowanie";
    case "LOCKED":
      return "zablokowano";
    case "RESOLVED":
      return "rozstrzygnięto";
    case "CREATED":
      return "utworzono";
    case "DAY_TRIGGER_RESOLUTION":
      return "wymagana decyzja rejestracji";
    default:
      return status;
  }
}

export function mapVersionLabel(mapVersionId: string | null): string {
  if (mapVersionId === "MAP_EXTENDED") return "Mapa rozszerzona";
  if (mapVersionId === "MAP_BASE") return "Mapa główna";
  return "—";
}

export function taskStateLabel(state: string): string {
  return state === "COMPLETED" ? "ukończono" : "do zrobienia";
}

export function claimStatus(player: StorytellerPlayerDto): { label: string; tone: "success" | "brass" | "neutral" } {
  if (player.claimed) return { label: "odebrano", tone: "success" };
  if (player.hasClaimToken) return { label: "link wydany, nieodebrany", tone: "brass" };
  return { label: "brak linku", tone: "neutral" };
}

/** Map an operational action kind to its character (for picker titles). */
export function actionKindCharacter(kind: string): string | null {
  const suffix = "_CHOOSE";
  if (!kind.endsWith(suffix)) return null;
  return characterDisplayName(kind.slice(0, -suffix.length));
}
