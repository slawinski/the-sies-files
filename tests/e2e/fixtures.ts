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

/**
 * Generate (pre-commit) with successive fixed seeds until the candidate
 * contains `role`, then commit — deterministic role setups for E2E.
 */
export async function generateSetupUntilRole(
  st: APIRequestContext,
  gameId: string,
  version: number,
  role: string,
  maxAttempts = 80,
): Promise<{ version: number; candidate: unknown }> {
  let v = version;
  for (let i = 0; i < maxAttempts; i += 1) {
    const generated = await st.post(`/api/v1/games/${gameId}/setup/generate`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { seed: `e2e-seed-${i}` } },
    });
    expect(generated.ok(), `generate seed ${i}`).toBeTruthy();
    v = (await generated.json()).version;

    const projection = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
    const candidate = projection.setup.candidate as {
      assignments: Array<{ trueCharacterId: string }>;
    };
    if (candidate.assignments.some((a) => a.trueCharacterId === role)) {
      const committed = await st.post(`/api/v1/games/${gameId}/setup/commit`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v },
      });
      expect(committed.ok(), "commit setup").toBeTruthy();
      return { version: projection.version, candidate };
    }
  }
  throw new Error(`No seed found with role ${role} within ${maxAttempts} attempts`);
}

/**
 * Nominate, vote and execute `nomineeId`, handling Scarlet Woman succession:
 * loops (closing the day + driving the next cycle, discovering the new Demon
 * from IMP_CHOOSE) until the game ends. Returns the final projection.
 */
export async function executeDemonToEnd(
  st: APIRequestContext,
  sessions: Array<{ playerId: string; request: APIRequestContext }>,
  gameId: string,
  version: number,
  initialImp: string,
): Promise<{ version: number; projection: { status: string; result: { winner: string } | null } }> {
  let v = version;
  let currentImp = initialImp;
  let winner: string | null = null;

  for (let attempt = 0; attempt < 4 && !winner; attempt += 1) {
    v = (await (await st.post(`/api/v1/games/${gameId}/investigation/nominations/open`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v },
    })).json()).version;

    const nominator = sessions.find((s) => s.playerId !== currentImp)!;
    const nomination = await nominator.request.post(`/api/v1/games/${gameId}/nominations`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { nomineeId: currentImp } },
    });
    if (!nomination.ok()) {
      console.log(`nominate failed (attempt ${attempt}, imp=${currentImp}):`, nomination.status(), await nomination.text());
    }
    expect(nomination.ok(), "nominate demon").toBeTruthy();
    const nominationBody = await nomination.json();
    v = nominationBody.version;

    v = (await (await st.post(`/api/v1/games/${gameId}/nominations/${nominationBody.nominationId}/voting/start`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v },
    })).json()).version;

    const stProjection = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
    for (const p of stProjection.players as Array<{ id: string }>) {
      const session = sessions.find((s) => s.playerId === p.id);
      if (!session) continue;
      const res = await session.request.post(
        `/api/v1/games/${gameId}/nominations/${nominationBody.nominationId}/votes/intent`,
        { data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { intent: true } } },
      );
      if (res.ok()) v = (await res.json()).version;
    }

    v = (await (await st.post(`/api/v1/games/${gameId}/nominations/${nominationBody.nominationId}/votes/lock`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v },
    })).json()).version;

    const executed = await st.post(`/api/v1/games/${gameId}/investigation/resolve-execution`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v },
    });
    expect(executed.ok(), "resolve execution").toBeTruthy();
    const body = await executed.json();
    v = body.version;
    winner = body.winner;

    if (!winner) {
      // Discover the successor (if any) from the audit; the queue is gone once
      // the phase completes, so it cannot be read from the projection. Both
      // succession paths (star-pass, Scarlet Woman) change a player to the Imp.
      const audit = await (await st.get(`/api/v1/games/${gameId}/storyteller/audit`)).json();
      const change = (audit.events as Array<{ eventType: string; payload?: { to?: string; playerId?: string } }>).find(
        (e) => e.eventType === "CHARACTER_CHANGED" && e.payload?.to === "IMP",
      );
      if (change?.payload?.playerId) currentImp = change.payload.playerId;

      v = (await (await st.post(`/api/v1/games/${gameId}/investigation/nominations/close`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v },
      })).json()).version;
      const closed = await st.post(`/api/v1/games/${gameId}/investigation/close`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v },
      });
      expect(closed.ok(), "close investigation").toBeTruthy();
      v = (await closed.json()).version;
      v = await driveOperationalCycle(st, sessions, gameId, v);
    }
  }

  const finalProjection = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
  return { version: v, projection: finalProjection };
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
