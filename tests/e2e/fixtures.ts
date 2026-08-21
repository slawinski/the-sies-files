// Deterministic E2E fixture helpers (audit spec 24 §5). API-driven setup keeps
// specs independent of random assignment luck: roles are discovered from
// Storyteller projections, never assumed.

import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

/** Test server base URL (matches the Playwright config webServer). */
export const E2E_BASE_URL = "http://localhost:3100";

export interface StorytellerGame {
  gameId: string;
  playerIds: string[];
  version: number;
}

export async function createStorytellerGame(
  st: APIRequestContext,
  name: string,
  count: number,
): Promise<StorytellerGame> {
  const created = await st.post("/api/v1/games", { data: { name } });
  expect(created.ok(), "create game").toBeTruthy();
  const game = await created.json();

  let version = game.version;
  const playerIds: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const res = await st.post(`/api/v1/games/${game.gameId}/players`, {
      data: {
        commandId: crypto.randomUUID(),
        expectedVersion: version,
        payload: { displayName: `Player ${i}` },
      },
    });
    expect(res.ok(), `add player ${i}`).toBeTruthy();
    const body = await res.json();
    version = body.version;
    playerIds.push(body.playerId);
  }
  return { gameId: game.gameId, playerIds, version };
}

export async function generateAndCommitSetup(
  st: APIRequestContext,
  gameId: string,
  version: number,
): Promise<{ version: number; candidate: unknown }> {
  const generated = await st.post(`/api/v1/games/${gameId}/setup/generate`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: version },
  });
  expect(generated.ok(), "generate setup").toBeTruthy();
  const committed = await st.post(`/api/v1/games/${gameId}/setup/commit`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: (await generated.json()).version },
  });
  expect(committed.ok(), "commit setup").toBeTruthy();

  const projection = await st.get(`/api/v1/games/${gameId}/storyteller`);
  const stProjection = await projection.json();
  return { version: stProjection.version, candidate: stProjection.setup.candidate };
}

export async function driveOperationalCycle(
  st: APIRequestContext,
  sessions: Array<{ playerId: string; request: APIRequestContext }>,
  gameId: string,
  version: number,
  targets: Record<string, string[]> = {},
): Promise<number> {
  const started = await st.post(`/api/v1/games/${gameId}/operational/start`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: version },
  });
  expect(started.ok(), "start operational").toBeTruthy();
  let v = (await started.json()).version;

  for (let guard = 0; guard < 100; guard += 1) {
    const projection = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
    const active = (projection.operational?.actions ?? []).find(
      (a: { status: string }) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER",
    );
    if (!active) break;

    if (active.status === "WAITING_FOR_PLAYER") {
      const session = sessions.find((s) => s.playerId === active.actorPlayerId);
      expect(session, `session for ${active.actorPlayerId}`).toBeDefined();
      const others = projection.players
        .filter((p: { id: string; alive: boolean }) => p.alive && p.id !== active.actorPlayerId)
        .map((p: { id: string }) => p.id);
      const chosen =
        targets[active.kind] ??
        (active.kind === "FORTUNE_TELLER_CHOOSE" ? others.slice(0, 2) : others.slice(0, 1));
      const res = await session!.request.post(`/api/v1/games/${gameId}/operational/actions/${active.id}/submit`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { targetPlayerIds: chosen } },
      });
      expect(res.ok(), `submit ${active.kind}`).toBeTruthy();
      v = (await res.json()).version;
    } else {
      const res = await st.post(`/api/v1/games/${gameId}/storyteller/actions/${active.id}/resolve`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: {} },
      });
      expect(res.ok(), `resolve ${active.kind}`).toBeTruthy();
      v = (await res.json()).version;
    }
  }

  const complete = await st.post(`/api/v1/games/${gameId}/operational/complete`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v },
  });
  expect(complete.ok(), "complete operational").toBeTruthy();
  return (await complete.json()).version;
}

export async function claimPlayer(
  st: APIRequestContext,
  playerRequest: APIRequestContext,
  gameId: string,
  playerId: string,
  version: number,
): Promise<{ player: APIRequestContext; version: number }> {
  const claimRes = await st.post(`/api/v1/games/${gameId}/players/${playerId}/claim-token`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: version },
  });
  expect(claimRes.ok(), "issue claim token").toBeTruthy();
  const claimBody = await claimRes.json();
  const claim = await playerRequest.post("/api/v1/player-claims/claim", {
    data: { token: claimBody.claimToken, commandId: crypto.randomUUID() },
  });
  expect(claim.ok(), "claim player").toBeTruthy();
  return { player: playerRequest, version: (await claim.json()).version };
}

/**
 * Claim every player into its own isolated browser context (each with its own
 * cookie jar) so E2E can drive per-player vote/nomination endpoints.
 */
export async function claimAllPlayers(
  st: APIRequestContext,
  browser: import("@playwright/test").Browser,
  gameId: string,
  playerIds: string[],
  version: number,
): Promise<{ sessions: Array<{ playerId: string; request: APIRequestContext }>; version: number }> {
  let v = version;
  const sessions: Array<{ playerId: string; request: APIRequestContext }> = [];
  for (const playerId of playerIds) {
    const context = await browser.newContext({ baseURL: E2E_BASE_URL });
    const res = await st.post(`/api/v1/games/${gameId}/players/${playerId}/claim-token`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    v = body.version;
    const claim = await context.request.post("/api/v1/player-claims/claim", {
      data: { token: body.claimToken, commandId: crypto.randomUUID() },
    });
    expect(claim.ok()).toBeTruthy();
    // The claim itself bumps the game version (PLAYER_CLAIMED).
    v = (await claim.json()).version;
    sessions.push({ playerId, request: context.request });
  }
  return { sessions, version: v };
}
