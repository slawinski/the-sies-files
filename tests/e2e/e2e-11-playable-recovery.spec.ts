import { test, expect, type APIRequestContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { createStorytellerGame, generateAndCommitSetup, claimAllPlayers, driveOperationalCycle, commandVersion } from './fixtures';
import { lifecycle, durableRows, equalRows, equalPrivate, assertContinuation } from './recovery-fixtures';

test('E2E-11: physical mid-vote restore preserves sessions and continues exactly once', async ({ page, browser }) => {
  const source = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const target = new PrismaClient({ datasourceUrl: process.env.SIES_RECOVERY_TARGET_URL });
  const contexts: import('@playwright/test').BrowserContext[] = [];
  try {
    const first = await lifecycle('start-source');
    const st = page.request;
    const { gameId, playerIds, version } = await createStorytellerGame(st, 'Recovery specimen', 13);
    const setup = await generateAndCommitSetup(st, gameId, version);
    const candidate = setup.candidate as { assignments: { playerId: string; trueCharacterId: string }[] };
    const claimed = await claimAllPlayers(st, browser, gameId, playerIds, setup.version);
    contexts.push(...claimed.contexts);
    const { sessions } = claimed;
    let v = claimed.version;
    // Persist role acknowledgement before the pause; restored pages must not
    // silently issue a new setup/role command and invalidate the row oracle.
    for (const session of sessions) v = await commandVersion(await session.request.post(`/api/v1/games/${gameId}/role-reveal/ack`, { data: { commandId: crypto.randomUUID(), expectedVersion: v } }), v);
    v = await driveOperationalCycle(st, sessions, gameId, v);
    v = await commandVersion(await sessions[0].request.post(`/api/v1/games/${gameId}/scenario/qr/scan`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { token: 'tsf-qr-letter-001' } },
    }), v);
    v = await commandVersion(await st.post(`/api/v1/games/${gameId}/investigation/nominations/open`, { data: { commandId: crypto.randomUUID(), expectedVersion: v } }), v);
    const nominee = candidate.assignments.find(a => a.playerId !== playerIds[0] && a.trueCharacterId !== 'VIRGIN');
    expect(!!nominee, 'fixture has a nomination without a day trigger').toBe(true);
    const nominated = await sessions[0].request.post(`/api/v1/games/${gameId}/nominations`, { data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { nomineeId: nominee!.playerId } } });
    expect(nominated.ok()).toBe(true);
    const nomination = await nominated.json(); v = nomination.version;
    const nominationId = nomination.nominationId;
    v = await commandVersion(await st.post(`/api/v1/games/${gameId}/nominations/${nominationId}/voting/start`, { data: { commandId: crypto.randomUUID(), expectedVersion: v } }), v);
    const voteURL = `/api/v1/games/${gameId}/nominations/${nominationId}/votes/intent`;
    const original = { commandId: crypto.randomUUID(), expectedVersion: v, payload: { intent: true } };
    const response = await sessions[0].request.post(voteURL, { data: original });
    expect(response.ok()).toBe(true);
    const originalOutcome = await response.json(); v = originalOutcome.version;
    const json = async (request: APIRequestContext, url: string) => {
      const res = await request.get(url); if (!res.ok()) throw new Error(`Projection HTTP ${res.status()}`); return res.json();
    };
    const projections = async () => ({
      public: await json(st, `/api/v1/games/${gameId}/public`),
      storyteller: await json(st, `/api/v1/games/${gameId}/storyteller`),
      players: await Promise.all(sessions.map(s => json(s.request, '/api/v1/me'))),
      map: await json(sessions[0].request, `/api/v1/games/${gameId}/map`),
      asset: (await (await sessions[0].request.get(`/api/v1/games/${gameId}/map/layers/BASE`)).body()).toString('base64'),
      denied: (await sessions[0].request.get(`/api/v1/games/${gameId}/map/layers/WEST_AREA`)).status(),
    });
    const views = await projections();
    expect(views.denied).toBe(403);
    expect(views.map.layers.map((l: { id: string }) => l.id)).toEqual(['BASE']);
    expect(views.storyteller.nominations[0].currentVirtualSeat).toBe(1);
    expect(views.players[0].scenario.clues.length).toBeGreaterThan(0);
    for (const p of views.public.players) expect(Object.keys(p).sort()).toEqual(['alive', 'displayName', 'id', 'participantKind', 'virtualSeat']);
    for (const p of views.players) {
      expect(p.myRole !== null).toBe(true);
      for (const other of p.players) expect(Object.keys(other).sort()).toEqual(['alive', 'displayName', 'id', 'participantKind', 'virtualSeat']);
    }
    const before = await durableRows(source, gameId);
    expect(before.browser_sessions.length).toBe(14);
    expect(before.qr_scans.length).toBeGreaterThan(0);
    await source.$disconnect();
    await lifecycle('restore-target');
    equalRows(await durableRows(target, gameId), before); // No target requests yet.
    const second = await lifecycle('start-target');
    expect(second.pid).not.toBe(first.pid);
    expect(new URL(process.env.DATABASE_URL!).pathname).not.toBe(new URL(process.env.SIES_RECOVERY_TARGET_URL!).pathname);
    equalPrivate(await projections(), views, 'all authorized runtime projections and map responses');
    const duplicate = await sessions[0].request.post(voteURL, { data: original });
    expect(duplicate.ok()).toBe(true);
    equalPrivate(await duplicate.json(), originalOutcome, 'original outcome');
    equalRows(await durableRows(target, gameId), before);
    // Wrong seat and a stale new command are still rejected without effects.
    for (const [seat, expectedVersion] of [[2, v], [1, v - 1]]) {
      expect((await sessions[seat].request.post(voteURL, { data: { commandId: crypto.randomUUID(), expectedVersion, payload: { intent: false } } })).ok()).toBe(false);
      equalRows(await durableRows(target, gameId), before);
    }
    const player0 = await contexts[0].newPage(); await player0.goto('/player');
    const player1 = await contexts[1].newPage(); await player1.goto('/player');
    await page.goto(`/storyteller/${gameId}`);
    await expect(player0.getByText('głos oddany', { exact: true })).toBeVisible();
    await expect(player1.getByRole('button', { name: 'NIE', exact: true })).toBeEnabled();
    for (const p of [player0, player1, page]) await expect(p.getByRole('status').filter({ hasText: 'LIVE' }).first()).toBeVisible({ timeout: 30_000 });
    // Stop polling before the exact durable-delta comparison.
    await Promise.all([player0.close(), player1.close(), page.goto('about:blank')]);
    equalRows(await durableRows(target, gameId), before);
    const nextCommand = crypto.randomUUID();
    const next = await sessions[1].request.post(voteURL, { data: { commandId: nextCommand, expectedVersion: v, payload: { intent: false } } });
    expect(next.ok()).toBe(true);
    expect((await next.json()).version).toBe(v + 1);
    assertContinuation(before, await durableRows(target, gameId), playerIds[1], nominationId, nextCommand);
    await lifecycle('complete', { claims: { archiveRestoration: true, durableRows: true, runtimeProjections: true, persistedSessions: true, duplicateEffectFree: true, legalContinuation: true }, browser: browser.version() });
  } finally {
    await Promise.all(contexts.map(c => c.close()));
    await source.$disconnect(); await target.$disconnect();
  }
});
