// Deterministic E2E fixture helpers (audit spec 24 §5). API-driven setup keeps
// specs independent of random assignment luck: roles are discovered from
// Storyteller projections, never assumed.

import type { APIRequestContext, APIResponse } from "@playwright/test";
import { expect } from "@playwright/test";
import type { SetupCandidate } from '../../src/modules/setup/types';

export const BASELINE_SEED = 'regression-baseline-v1';
export function hasSuccessionPrerequisites(candidate: { assignments: Array<{ trueCharacterId: string }> }) {
  const roles = candidate.assignments.map(a => a.trueCharacterId);
  return roles.includes('IMP') && ['POISONER', 'SPY', 'SCARLET_WOMAN', 'BARON'].some(r => roles.includes(r)) && ['CHEF', 'MONK'].some(r => roles.includes(r));
}
export async function requireOk(response: APIResponse, context: string) {
  if (!response.ok()) throw new Error(`${context}: HTTP ${response.status()} ${response.url()}: ${await response.text()}`);
  return response;
}
export async function commandVersion(response: APIResponse, expectedVersion: number) {
  const body = await (await requireOk(response, `command expectedVersion=${expectedVersion}`)).json();
  expect(Number.isInteger(body.version), 'command returned version').toBe(true);
  return body.version as number;
}
export function scenarioSpecimen(seed: string, candidate: SetupCandidate) {
  return { seed, generatorVersion: candidate.generatorVersion,
    script: ['TROUBLE_BREWING', 1], scenario: ['THE_SIES_FILES_MILLIONAIRE', 1],
    roles: candidate.assignments.map(({ virtualSeat, participantKind, trueCharacterId, perceivedCharacterId, trueAlignment }) =>
      ({ virtualSeat, participantKind, trueCharacterId, perceivedCharacterId, trueAlignment })) };
}
function recordCandidate(seed: string, candidate: SetupCandidate) {
  console.log('BASELINE_SCENARIO', JSON.stringify(scenarioSpecimen(seed, candidate)));
}

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
  await requireOk(created, 'create game');
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
    await requireOk(res, `add player ${i} expectedVersion=${version}`);
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
    data: { commandId: crypto.randomUUID(), expectedVersion: version, payload: { seed: BASELINE_SEED } },
  });
  await requireOk(generated, `generate setup expectedVersion=${version}`);
  const committed = await st.post(`/api/v1/games/${gameId}/setup/commit`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: (await generated.json()).version },
  });
  await requireOk(committed, 'commit setup');

  const projection = await st.get(`/api/v1/games/${gameId}/storyteller`);
  const stProjection = await projection.json();
  recordCandidate(BASELINE_SEED, stProjection.setup.candidate);
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
  prerequisites: (candidate: SetupCandidate) => boolean = () => true,
): Promise<{ version: number; candidate: unknown }> {
  let v = version;
  for (let i = 0; i < maxAttempts; i += 1) {
    const generated = await st.post(`/api/v1/games/${gameId}/setup/generate`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { seed: `e2e-seed-${i}` } },
    });
    await requireOk(generated, `generate seed ${i} expectedVersion=${v}`);
    v = (await generated.json()).version;

    const projection = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
    const candidate = projection.setup.candidate as SetupCandidate;
    if (candidate.assignments.some((a) => a.trueCharacterId === role) && prerequisites(candidate)) {
      const committed = await st.post(`/api/v1/games/${gameId}/setup/commit`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v },
      });
      const committedVersion = await commandVersion(committed, v);
      recordCandidate(`e2e-seed-${i}`, candidate);
      return { version: committedVersion, candidate };
    }
  }
  throw new Error(`Fixture prerequisites not met: role ${role} within ${maxAttempts} fixed seeds`);
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
    v = await commandVersion(await st.post(`/api/v1/games/${gameId}/investigation/nominations/open`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v },
    }), v);

    const nominator = sessions.find((s) => s.playerId !== currentImp)!;
    const nomination = await nominator.request.post(`/api/v1/games/${gameId}/nominations`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { nomineeId: currentImp } },
    });
    if (!nomination.ok()) {
      console.log(`nominate failed (attempt ${attempt}, imp=${currentImp}):`, nomination.status(), await nomination.text());
    }
    await requireOk(nomination, `nominate demon expectedVersion=${v}`);
    const nominationBody = await nomination.json();
    v = nominationBody.version;

    v = await commandVersion(await st.post(`/api/v1/games/${gameId}/nominations/${nominationBody.nominationId}/voting/start`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v },
    }), v);

    const stProjection = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
    for (const p of stProjection.players as Array<{ id: string }>) {
      const session = sessions.find((s) => s.playerId === p.id);
      if (!session) continue;
      const res = await session.request.post(
        `/api/v1/games/${gameId}/nominations/${nominationBody.nominationId}/votes/intent`,
        { data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { intent: true } } },
      );
      v = await commandVersion(res, v);
    }

    v = await commandVersion(await st.post(`/api/v1/games/${gameId}/nominations/${nominationBody.nominationId}/votes/lock`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v },
    }), v);

    const executed = await st.post(`/api/v1/games/${gameId}/investigation/resolve-execution`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v },
    });
    await requireOk(executed, `resolve execution expectedVersion=${v}`);
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

      v = await commandVersion(await st.post(`/api/v1/games/${gameId}/investigation/nominations/close`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v },
      }), v);
      const closed = await st.post(`/api/v1/games/${gameId}/investigation/close`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v },
      });
      await requireOk(closed, `close investigation expectedVersion=${v}`);
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
  await requireOk(started, `start operational expectedVersion=${version}`);
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
      console.log('BASELINE_ACTION', JSON.stringify({ kind: active.kind,
        actorSeat: projection.players.findIndex((p: { id: string }) => p.id === active.actorPlayerId),
        targetSeats: chosen.map((id: string) => projection.players.findIndex((p: { id: string }) => p.id === id)) }));
      const res = await session!.request.post(`/api/v1/games/${gameId}/operational/actions/${active.id}/submit`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { targetPlayerIds: chosen } },
      });
      await requireOk(res, `submit ${active.kind} targets=${JSON.stringify(chosen)} expectedVersion=${v}`);
      v = (await res.json()).version;
    } else {
      const res = await st.post(`/api/v1/games/${gameId}/storyteller/actions/${active.id}/resolve`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: {} },
      });
      await requireOk(res, `resolve ${active.kind} expectedVersion=${v}`);
      v = (await res.json()).version;
    }
  }

  const complete = await st.post(`/api/v1/games/${gameId}/operational/complete`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v },
  });
  await requireOk(complete, `complete operational expectedVersion=${v}`);
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
  await requireOk(claimRes, `issue claim token expectedVersion=${version}`);
  const claimBody = await claimRes.json();
  const claim = await playerRequest.post("/api/v1/player-claims/claim", {
    data: { token: claimBody.claimToken, commandId: crypto.randomUUID() },
  });
  await requireOk(claim, 'claim player');
  return { player: playerRequest, version: (await claim.json()).version };
}

/**
 * Claim every player into its own isolated browser context (each with its own
 * cookie jar) so E2E can drive per-player vote/nomination endpoints — and,
 * when needed, open real pages (`contexts[i]`) for UI assertions.
 */
export async function claimAllPlayers(
  st: APIRequestContext,
  browser: import("@playwright/test").Browser,
  gameId: string,
  playerIds: string[],
  version: number,
): Promise<{
  sessions: Array<{ playerId: string; request: APIRequestContext }>;
  contexts: Array<import("@playwright/test").BrowserContext>;
  version: number;
}> {
  let v = version;
  const sessions: Array<{ playerId: string; request: APIRequestContext }> = [];
  const contexts: Array<import("@playwright/test").BrowserContext> = [];
  for (const playerId of playerIds) {
    const context = await browser.newContext({ baseURL: E2E_BASE_URL });
    const res = await st.post(`/api/v1/games/${gameId}/players/${playerId}/claim-token`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v },
    });
    await requireOk(res, `issue claim token expectedVersion=${v}`);
    const body = await res.json();
    v = body.version;
    const claim = await context.request.post("/api/v1/player-claims/claim", {
      data: { token: body.claimToken, commandId: crypto.randomUUID() },
    });
    await requireOk(claim, `claim player after version=${v}`);
    // The claim itself bumps the game version (PLAYER_CLAIMED).
    v = (await claim.json()).version;
    sessions.push({ playerId, request: context.request });
    contexts.push(context);
  }
  return { sessions, contexts, version: v };
}
