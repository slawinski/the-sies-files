// Request-scoped auth resolution + CSRF origin check.
//
// Resolution semantics (avoids a game-existence oracle, per security review):
//   - no session cookie at all          → 401 UNAUTHORIZED
//   - valid session, but not a member   → 404 GAME_NOT_FOUND (uniform with
//     of this game (or game absent)       "game does not exist")
//
// State-changing requests additionally pass `assertSameOrigin` to defeat
// cross-site CSRF (login CSRF on the claim endpoint, storyteller/player
// mutations).

import { cookies } from "next/headers";
import { DomainError } from "@/lib/errors";
import { hashToken } from "./tokens";
import {
  COOKIE_PLAYER_SESSION,
  COOKIE_STORYTELLER_SESSION,
  PLAYER_SESSION_COOKIE_OPTIONS,
  STORYTELLER_SESSION_COOKIE_OPTIONS,
} from "./cookies";
import {
  findPlayerSessionByHash,
  findStorytellerSessionByHash,
} from "@/modules/auth/session";

export async function setPlayerSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_PLAYER_SESSION, token, PLAYER_SESSION_COOKIE_OPTIONS);
}

export async function setStorytellerSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_STORYTELLER_SESSION, token, STORYTELLER_SESSION_COOKIE_OPTIONS);
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_PLAYER_SESSION);
  store.delete(COOKIE_STORYTELLER_SESSION);
}

export type Viewer =
  | { kind: "storyteller"; sessionId: string }
  | { kind: "player"; playerId: string; sessionId: string };

async function readToken(name: string): Promise<string | undefined> {
  const store = await cookies();
  return store.get(name)?.value;
}

export async function resolveStoryteller(
  gameId: string,
): Promise<{ sessionId: string }> {
  const token = await readToken(COOKIE_STORYTELLER_SESSION);
  if (!token) throw new DomainError("UNAUTHORIZED", "Not authenticated");
  const session = await findStorytellerSessionByHash(hashToken(token), gameId);
  if (!session) throw new DomainError("GAME_NOT_FOUND", "Game not found");
  return { sessionId: session.id };
}

export async function resolvePlayer(
  gameId: string,
): Promise<{ playerId: string; sessionId: string }> {
  const token = await readToken(COOKIE_PLAYER_SESSION);
  if (!token) throw new DomainError("UNAUTHORIZED", "Not authenticated");
  const session = await findPlayerSessionByHash(hashToken(token), gameId);
  if (!session || !session.playerId) {
    throw new DomainError("GAME_NOT_FOUND", "Game not found");
  }
  return { playerId: session.playerId, sessionId: session.id };
}

/** Resolve either a storyteller or a player session bound to `gameId`. */
export async function resolveViewer(gameId: string): Promise<Viewer> {
  const stToken = await readToken(COOKIE_STORYTELLER_SESSION);
  const pToken = await readToken(COOKIE_PLAYER_SESSION);

  if (stToken) {
    const session = await findStorytellerSessionByHash(hashToken(stToken), gameId);
    if (session) return { kind: "storyteller", sessionId: session.id };
  }
  if (pToken) {
    const session = await findPlayerSessionByHash(hashToken(pToken), gameId);
    if (session && session.playerId) {
      return { kind: "player", playerId: session.playerId, sessionId: session.id };
    }
  }

  if (!stToken && !pToken) {
    throw new DomainError("UNAUTHORIZED", "Not authenticated");
  }
  throw new DomainError("GAME_NOT_FOUND", "Game not found");
}

/**
 * Reject cross-site state-changing requests. Called at the top of every
 * POST/PATCH/DELETE handler. `Origin`/`Sec-Fetch-Site` are set by browsers and
 * cannot be spoofed by a cross-site attacker's page.
 */
export function assertSameOrigin(req: Request): void {
  if (req.headers.get("sec-fetch-site") === "cross-site") {
    throw new DomainError("FORBIDDEN", "Cross-site request rejected");
  }
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser client — allow
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (host && new URL(origin).host !== host) {
      throw new DomainError("FORBIDDEN", "Cross-site request rejected");
    }
  } catch {
    throw new DomainError("FORBIDDEN", "Invalid Origin header");
  }
}
