// Typed domain errors. UI maps `code` to localized copy; HTTP layer maps `code`
// to a status code. Full code set per docs/03 §9 (only a subset is used in
// Slice 1; the rest are reserved for later slices).

export const DOMAIN_ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "GAME_NOT_FOUND",
  "INVALID_SESSION_STATE",
  "INVALID_PHASE",
  "VERSION_CONFLICT",
  "DUPLICATE_COMMAND",
  "ROSTER_SIZE_INVALID",
  "VIRTUAL_CIRCLE_LOCKED",
  "SETUP_NOT_COMMITTED",
  "ACTION_NOT_ACTIVE",
  "INVALID_TARGET",
  "ABILITY_SPENT",
  "PLAYER_DEAD",
  "PLAYER_ALREADY_NOMINATED_TODAY",
  "VOTE_LOCKED",
  "GHOST_VOTE_ALREADY_USED",
  "BUTLER_MASTER_NOT_VOTING",
  "TERRAIN_UNAVAILABLE",
  "QR_UNKNOWN",
  "QR_NOT_ACTIVE",
  "QR_ALREADY_CONSUMED",
  "RECOVERY_CHECK_FAILED",
  "INVALID_DISPLAY_NAME",
  "DISPLAY_NAME_TAKEN",
  "PLAYER_NOT_FOUND",
  "CLAIM_ALREADY_USED",
  "ROSTER_FULL",
  "RATE_LIMITED",
  "COMMAND_RECEIPT_INVALID",
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: unknown;

  constructor(code: DomainErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.details = details;
  }
}

export function httpStatusFor(code: DomainErrorCode): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "GAME_NOT_FOUND":
    case "PLAYER_NOT_FOUND":
      return 404;
    case "VERSION_CONFLICT":
    case "DUPLICATE_COMMAND":
      return 409;
    case "RATE_LIMITED":
      return 429;
    case "COMMAND_RECEIPT_INVALID":
      return 500;
    default:
      return 400;
  }
}
