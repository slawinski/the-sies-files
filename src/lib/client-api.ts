// Client-side fetch helper for the /api/v1 JSON contract.
//
// This module is safe to import from "use client" components: it has no
// server-only dependencies and never touches Prisma, cookies, or Node APIs.
// Server responses already carry `Cache-Control: no-store` (docs/03 §17/§19);
// the extra `cache: "no-store"` is belt-and-suspenders for the browser.

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

/** JSON fetch against the app API. Throws `ApiClientError` on any failure. */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      cache: "no-store",
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiClientError(0, "NETWORK", "Nie mogę połączyć się z serwerem. Sprawdź połączenie.");
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const body = data as ErrorBody | null;
    throw new ApiClientError(
      res.status,
      body?.error?.code ?? "UNKNOWN",
      body?.error?.message ?? "Coś poszło nie tak.",
    );
  }

  return data as T;
}

/**
 * Map a domain error code to friendly, non-leaky copy. Callers can override
 * the fallback to keep copy context-specific (e.g. the claim page).
 */
export function friendlyMessage(code: string, fallback: string): string {
  switch (code) {
    case "UNAUTHORIZED":
      return "Nie masz dostępu do tych akt sprawy.";
    case "FORBIDDEN":
      return "Nie masz uprawnień, aby to zrobić.";
    case "GAME_NOT_FOUND":
    case "PLAYER_NOT_FOUND":
      return "Te akta sprawy już nie istnieją.";
    case "VERSION_CONFLICT":
      return "Ta sprawa zmieniła się w innej karcie — widok został odświeżony. Spróbuj ponownie.";
    case "INVALID_DISPLAY_NAME":
      return "Imię jest wymagane.";
    case "DISPLAY_NAME_TAKEN":
      return "To imię jest już w kręgu.";
    case "ROSTER_FULL":
      return "Lista osiągnęła już maksimum 16 uczestników.";
    case "ROSTER_SIZE_INVALID":
      return "Sprawa wymaga od 13 do 16 uczestników.";
    case "CLAIM_ALREADY_USED":
      return "Ten link do odbioru został już użyty lub wygasł.";
    case "NETWORK":
      return "Nie mogę połączyć się z serwerem. Sprawdź połączenie i spróbuj ponownie.";
    default:
      return fallback;
  }
}

// Client-side mirrors of the projection DTOs. These deliberately re-declare
// the shapes from `src/modules/projections/projections.ts` (which imports
// server-only Prisma types and must not be pulled into client bundles).
export interface PublicPlayerDto {
  id: string;
  displayName: string;
  virtualSeat: number;
  alive: boolean;
  participantKind: "NORMAL" | "TRAVELLER";
}

export interface StorytellerPlayerDto extends PublicPlayerDto {
  claimed: boolean;
  hasClaimToken: boolean;
  claimIssuedAt: string | null;
}

// ---- Slice 2: setup / operational / role-reveal DTOs -----------------------

export interface SetupAssignmentDto {
  playerId: string;
  virtualSeat: number;
  participantKind: "NORMAL" | "TRAVELLER";
  trueCharacterId: string;
  perceivedCharacterId: string;
  trueAlignment: "GOOD" | "EVIL";
}

export interface SetupCandidateDto {
  generatorVersion: number;
  participantCount: number;
  normalCount: number;
  assignments: SetupAssignmentDto[];
  fortuneTellerRedHerringPlayerId: string | null;
  demonBluffs: string[];
}

export interface StorytellerSetupDto {
  regenerationIndex: number;
  committed: boolean;
  candidate: SetupCandidateDto | null;
}

export interface StorytellerActionDto {
  id: string;
  orderIndex: number;
  kind: string;
  actorPlayerId: string | null;
  actorDisplayName: string | null;
  status: string;
  secretJson: unknown;
  resolutionJson: unknown;
}

export interface StorytellerOperationalDto {
  phaseId: string;
  cycleNumber: number;
  status: string;
  actions: StorytellerActionDto[];
}

export interface TeamKnowledgeDto {
  demonId: string;
  minionIds: string[];
}

export interface RoleRevealDto {
  characterId: string;
  alignment: "GOOD" | "EVIL";
  publicCharacter: boolean;
  teamKnowledge?: TeamKnowledgeDto;
  bluffs?: string[];
}

export interface ActiveActionDto {
  id: string;
  kind: string;
}

export interface DeliveredInfoDto {
  actionId: string;
  kind: string;
  result: unknown;
}

export interface StorytellerGameProjection {
  gameId: string;
  name: string;
  status: string;
  phase: string | null;
  cycleNumber: number;
  version: number;
  participantCount: number;
  isReady: boolean;
  players: StorytellerPlayerDto[];
  setup: StorytellerSetupDto | null;
  operational: StorytellerOperationalDto | null;
}

export interface PlayerGameProjection {
  gameId: string;
  name: string;
  status: string;
  phase: string | null;
  cycleNumber: number;
  version: number;
  participantCount: number;
  isReady: boolean;
  players: PublicPlayerDto[];
  me: {
    playerId: string;
    displayName: string;
    virtualSeat: number;
    alive: boolean;
    ghostVoteAvailable: boolean;
  };
  myRole: RoleRevealDto | null;
  roleAcknowledged: boolean;
  activeAction: ActiveActionDto | null;
  deliveredInfo: DeliveredInfoDto[];
}

// Mirror of the server-side `InfoResult` union (operational/info-resolver).
export interface InfoCharacterCandidatesDto {
  kind: "CHARACTER_CANDIDATES";
  characterId: string;
  candidatePlayerIds: string[];
}
export interface InfoNumberDto {
  kind: "NUMBER";
  value: number;
}
export interface InfoNoOutsidersDto {
  kind: "NO_OUTSIDERS";
}
export interface InfoDemonYesNoDto {
  kind: "DEMON_YES_NO";
  value: boolean;
}
export interface InfoGrimoireDto {
  kind: "GRIMOIRE";
  assignments: SetupAssignmentDto[];
}
export type InfoResultDto =
  | InfoCharacterCandidatesDto
  | InfoNumberDto
  | InfoNoOutsidersDto
  | InfoDemonYesNoDto
  | InfoGrimoireDto;
