// Setup candidate types (docs/03 §5 `SetupDraft.candidateJson`).
// The candidate holds the full secret assignment — Storyteller-only.

import type { Alignment, CharacterId } from "@/modules/trouble-brewing/characters";

export interface SetupAssignment {
  playerId: string;
  virtualSeat: number;
  participantKind: "NORMAL" | "TRAVELLER";
  trueCharacterId: CharacterId;
  perceivedCharacterId: CharacterId;
  trueAlignment: Alignment;
}

export interface SetupCandidate {
  generatorVersion: number;
  participantCount: number;
  normalCount: number;
  assignments: SetupAssignment[];
  /** Fortune Teller red herring (secret), null when FT is not in play. */
  fortuneTellerRedHerringPlayerId: string | null;
  /** Demon's three not-in-play bluff characters. */
  demonBluffs: CharacterId[];
}
