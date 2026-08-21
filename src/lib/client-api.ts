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
    case "VIRTUAL_CIRCLE_LOCKED":
      return "Skład i krąg są już zablokowane po zatwierdzeniu układu.";
    case "SETUP_NOT_COMMITTED":
      return "Układ nie został jeszcze zatwierdzony.";
    case "ACTION_NOT_ACTIVE":
      return "Ta akcja nie jest teraz dostępna.";
    case "INVALID_SESSION_STATE":
      return "Nie można tego teraz zrobić w tej fazie gry.";
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

// ---- Slice 4: investigation / nomination / vote DTOs -----------------------

export interface InvestigationDto {
  cycleNumber: number;
  nominationState: string;
  currentExecutionCandidatePlayerId: string | null;
  currentHighEffectiveVotes: number | null;
  executionOccurred: boolean;
}

export interface VoteDto {
  playerId: string;
  playerName: string | null;
  rawIntent: boolean;
  valid: boolean | null;
  effectiveWeight: number;
  ghostVoteConsumed: boolean;
}

export interface NominationDto {
  id: string;
  sequence: number;
  nominatorId: string;
  nominatorName: string | null;
  nomineeId: string;
  nomineeName: string | null;
  status: string;
  rawTotal: number;
  effectiveTotal: number;
  qualified: boolean;
  votes: VoteDto[];
}

export interface PlayerNominationDto {
  id: string;
  sequence: number;
  nominatorName: string | null;
  nomineeName: string | null;
  status: string;
  rawTotal: number;
  effectiveTotal: number;
  qualified: boolean;
  myVoteIntent: boolean | null;
}

// ---- Slice 5: scenario DTOs -------------------------------------------------

export interface ScenarioClueDto {
  id: string;
  title: string;
  body: string;
}

export interface ScenarioTaskDto {
  id: string;
  title: string;
  state: string;
}

export interface PlayerScenarioDto {
  stageId: string | null;
  mapVersionId: string | null;
  mapLocations: { id: string; x: number; y: number }[];
  clues: ScenarioClueDto[];
  tasks: ScenarioTaskDto[];
  conditions: string[];
}

export interface ScenarioScanDto {
  qrTokenId: string;
  playerId: string;
  playerName: string | null;
}

export interface StorytellerScenarioDto extends PlayerScenarioDto {
  scans: ScenarioScanDto[];
}

/** Successful `POST /scenario/qr/scan` outcome (duplicate = idempotent replay). */
export interface ScanOutcomeDto {
  discoveries: string[];
  tasks: string[];
  conditions: string[];
  mapVersionId: string | null;
}

export interface ScanResponseDto {
  version: number;
  outcome: ScanOutcomeDto | { duplicate: true };
}

// ---- Slice 6: control plane / recovery / audit DTOs -------------------------

export interface BlockingActionDto {
  id: string;
  kind: string;
  actorPlayerId: string | null;
  status: string;
}

export interface LastEventDto {
  eventType: string;
  sequence: number;
  gameVersion: number;
  createdAt: string;
}

export interface CheckpointDto {
  id: string;
  gameVersion: number;
  checksum: string;
  reason: string | null;
  createdAt: string;
}

export interface ConsistencyIssueDto {
  check: string;
  ok: boolean;
  message: string;
}

export interface StorytellerControlDto {
  gameId: string;
  name: string | null;
  status: string | null;
  phase: string | null;
  cycleNumber: number;
  version: number;
  eventSequence: number;
  participantCount: number;
  blockingAction: BlockingActionDto | null;
  lastEvent: LastEventDto | null;
  latestCheckpoint: CheckpointDto | null;
  consistencyIssues: ConsistencyIssueDto[];
}

export interface AuditEventDto {
  sequence: number;
  gameVersion: number;
  eventType: string;
  actor: string | null;
  commandId: string | null;
  payload: unknown;
  createdAt: string;
}

export interface StorytellerAuditDto {
  events: AuditEventDto[];
}

export interface CheckpointResponseDto {
  version: number;
  checkpointId: string;
  valid: boolean;
}

export interface AccessResetResponseDto {
  version: number;
  claimToken: string;
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
  result: { winner: string; reason: string } | null;
  setup: StorytellerSetupDto | null;
  operational: StorytellerOperationalDto | null;
  investigation: InvestigationDto | null;
  nominations: NominationDto[];
  scenario: StorytellerScenarioDto | null;
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
  result: { winner: string; reason: string } | null;
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
  investigation: InvestigationDto | null;
  nominations: PlayerNominationDto[];
  scenario: PlayerScenarioDto | null;
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
