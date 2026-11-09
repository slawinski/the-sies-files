import { ApiClientError } from "./client-api";

/** Resource-level 403/404 is not evidence that membership ended. */
export function isAccessDenial(error: unknown, authoritative = false): boolean {
  if (!(error instanceof ApiClientError)) return false;
  return error.status === 401 ||
    (authoritative && error.status === 403) ||
    (error.status === 404 && error.code === "GAME_NOT_FOUND" &&
      (authoritative || error.message === "Game not found"));
}

/** Shared synchronous publication fence, including same-game reauthorization. */
export class AccessLifetime {
  generation = 0;
  active = true;
  capture() { return this.generation; }
  owns(ticket: number) { return this.active && ticket === this.generation; }
  lose() {
    if (!this.active) return;
    this.active = false;
    ++this.generation;
  }
  authorize() {
    if (this.active) return;
    ++this.generation;
    this.active = true;
  }
}
