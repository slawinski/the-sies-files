import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { boundaryGame, memberReads } from './security-fixtures';
import { prisma } from '../../src/lib/db';
import { createStorytellerGame, claimPlayer, generateAndCommitSetup } from './fixtures';
import { readProtectedLayerAsset } from '../../src/modules/map/assets';

test.beforeEach(async () => { await prisma.rateLimitBucket.deleteMany(); });
test.afterAll(async () => { await prisma.$disconnect(); });

test('E2E-12 membership: two-game read and mutation denials are anti-oracle and non-mutating', async ({ playwright }) => {
  const contexts = await Promise.all(Array.from({ length: 5 }, () => playwright.request.newContext({ baseURL: 'http://localhost:3100' })));
  const [stA, playerA, stB, playerB, anonymous] = contexts;
  try {
    const a = await boundaryGame(stA, playerA, 'Boundary A');
    const b = await boundaryGame(stB, playerB, 'Boundary B');
    expect((await playerA.get(`/api/v1/games/${a.gameId}/public`)).status()).toBe(200);
    expect((await playerB.get(`/api/v1/games/${b.gameId}/me`)).status()).toBe(200);
    for (const actor of [stA, playerA]) {
      const known = memberReads(b.gameId);
      const unknown = memberReads(randomUUID());
      for (let i = 0; i < known.length; i++) {
        const denied = await actor.get(known[i]);
        const absent = await actor.get(unknown[i]);
        expect(denied.status()).toBe(absent.status());
        expect([401, 404]).toContain(denied.status());
        expect(await denied.json()).toEqual(await absent.json());
        expect(denied.headers()['cache-control']).toContain('no-store');
        expect((await anonymous.get(known[i])).status()).toBe(401);
      }
    }
    const before = await (await stB.get(`/api/v1/games/${b.gameId}/storyteller`)).json();
    const history = await prisma.domainEvent.count({ where: { gameId: b.gameId } });
    for (const actor of [stA, playerA]) {
      const denied = await actor.post(`/api/v1/games/${b.gameId}/players`, { data: {
        commandId: randomUUID(), expectedVersion: b.version, payload: { displayName: 'Forbidden' },
      } });
      expect([401, 404]).toContain(denied.status());
      for (const suffix of [`operational/actions/${randomUUID()}/submit`, `players/${b.playerIds[0]}/access/reset`, 'storyteller/recovery/override']) {
        expect([401, 404]).toContain((await actor.post(`/api/v1/games/${b.gameId}/${suffix}`, { data: { commandId: randomUUID(), expectedVersion: b.version, payload: {} } })).status());
      }
    }
    expect(await (await stB.get(`/api/v1/games/${b.gameId}/storyteller`)).json()).toEqual(before);
    expect(await prisma.domainEvent.count({ where: { gameId: b.gameId } })).toBe(history);
  } finally { await Promise.all(contexts.map(context => context.dispose())); }
});

test('E2E-12 disclosure: paired discoverer-only clues, protected assets and inactive credentials', async ({ playwright }) => {
  const contexts = await Promise.all(Array.from({ length: 4 }, () => playwright.request.newContext({ baseURL: 'http://localhost:3100' })));
  const [st, a, b, anonymous] = contexts;
  try {
    const game = await createStorytellerGame(st, 'Paired observations', 2);
    let version = (await claimPlayer(st, a, game.gameId, game.playerIds[0], game.version)).version;
    version = (await claimPlayer(st, b, game.gameId, game.playerIds[1], version)).version;
    expect(version).toBeGreaterThan(game.version);
    await prisma.scenarioState.create({ data: { gameId: game.gameId, scenarioId: 'THE_SIES_FILES_MILLIONAIRE', scenarioVersion: 1, mapVersionId: 'MAP_BASE' } });
    const markerA = randomUUID(), markerB = randomUUID();
    const discovery = await prisma.scenarioDiscovery.create({ data: { gameId: game.gameId, playerId: game.playerIds[1], objectId: 'private-clue', objectType: 'CLUE', visibilityScope: 'DISCOVERER_ONLY', contentJson: { title: 'Private clue', body: markerA } } });
    const observe = async () => {
      const denied = await anonymous.get(`/api/v1/games/${game.gameId}/storyteller`);
      return { public: await (await a.get(`/api/v1/games/${game.gameId}/public`)).json(), own: await (await a.get('/api/v1/me')).json(),
        denied: { status: denied.status(), body: await denied.json(), cacheControl: denied.headers()['cache-control'] } };
    };
    const before = await observe();
    expect(JSON.stringify(before).includes(markerA)).toBe(false);
    expect(JSON.stringify(await (await b.get('/api/v1/me')).json()).includes(markerA)).toBe(true);
    await prisma.scenarioDiscovery.update({ where: { id: discovery.id }, data: { contentJson: { title: 'Private clue', body: markerB } } });
    expect(await observe()).toEqual(before); // identical IDs/time/version; no normalization
    expect(JSON.stringify(await (await b.get('/api/v1/me')).json()).includes(markerB)).toBe(true);
    expect(JSON.stringify(await (await st.get(`/api/v1/games/${game.gameId}/storyteller`)).json()).includes(markerB)).toBe(true);
    await prisma.scenarioDiscovery.update({ where: { id: discovery.id }, data: { visibilityScope: 'PUBLIC' } });
    expect(JSON.stringify(await (await a.get('/api/v1/me')).json()).includes(markerB)).toBe(true);
    for (const [layer, status] of [['WEST_AREA', 403], ['UNLISTED', 404]] as const) {
      const response = await a.get(`/api/v1/games/${game.gameId}/map/layers/${layer}`);
      expect(response.status()).toBe(status);
      expect(response.headers()['cache-control']).toContain('no-store');
      expect(response.headers()['content-type']).toContain('application/json');
    }
    await prisma.scenarioState.update({ where: { gameId: game.gameId }, data: { mapVersionId: 'MAP_EXTENDED' } });
    const asset = await a.get(`/api/v1/games/${game.gameId}/map/layers/WEST_AREA`);
    expect(asset.status()).toBe(200);
    expect(asset.headers()['content-type']).toMatch(/^image\//);
    expect(asset.headers()['cache-control']).toContain('no-store');
    const expectedAsset = await readProtectedLayerAsset('WEST_AREA');
    expect(expectedAsset !== null && (await asset.body()).equals(expectedAsset.data)).toBe(true);
    await prisma.browserSession.updateMany({ where: { playerId: game.playerIds[0] }, data: { expiresAt: new Date(Date.now() - 1) } });
    expect((await a.get('/api/v1/me')).status()).toBe(401);
    expect((await a.get(`/api/v1/games/${game.gameId}/me`)).status()).toBe(404);
    await prisma.browserSession.updateMany({ where: { storytellerGameId: game.gameId }, data: { revokedAt: new Date() } });
    expect((await st.get(`/api/v1/games/${game.gameId}/storyteller`)).status()).toBe(404);
  } finally { await Promise.all(contexts.map(c => c.dispose())); }
});

test('E2E-12 enabled limits: sixteen joins, role reveal, reset/reclaim, recovery and logout remain usable', async ({ playwright }) => {
  const st = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
  const players = await Promise.all(Array.from({ length: 16 }, () => playwright.request.newContext({ baseURL: 'http://localhost:3100' })));
  try {
    const game = await createStorytellerGame(st, 'Legitimate gathering', 16);
    let version = game.version;
    for (let i = 0; i < 16; i++) version = (await claimPlayer(st, players[i], game.gameId, game.playerIds[i], version)).version;
    const traveller = await st.post(`/api/v1/games/${game.gameId}/players/${game.playerIds[15]}/kind`, { data: {
      commandId: randomUUID(), expectedVersion: version, payload: { participantKind: 'TRAVELLER' },
    } });
    expect(traveller.status()).toBe(200);
    version = (await traveller.json()).version;
    version = (await generateAndCommitSetup(st, game.gameId, version)).version;
    for (const player of players) {
      const projection = await (await player.get('/api/v1/me')).json();
      expect(projection.myRole !== null).toBe(true);
      const ack = await player.post(`/api/v1/games/${game.gameId}/role-reveal/ack`, { data: { commandId: randomUUID(), expectedVersion: version } });
      expect(ack.status()).toBe(200);
      version = (await ack.json()).version;
    }
    const reset = await st.post(`/api/v1/games/${game.gameId}/players/${game.playerIds[0]}/access/reset`, { data: { commandId: randomUUID(), expectedVersion: version } });
    expect(reset.status()).toBe(200);
    const resetBody = await reset.json();
    expect((await players[0].get('/api/v1/me')).status()).toBe(401);
    expect((await players[0].post('/api/v1/player-claims/claim', { data: { token: resetBody.claimToken, commandId: randomUUID() } })).status()).toBe(200);
    const recovered = await st.post('/api/v1/storyteller/recover', { data: { gameId: game.gameId, recoverySecret: process.env.STORYTELLER_RECOVERY_SECRET } });
    expect(recovered.status()).toBe(200);
    expect((await st.post('/api/v1/session/logout')).status()).toBe(200);
  } finally { await st.dispose(); await Promise.all(players.map(p => p.dispose())); }
});

test('E2E-12 enabled limits: forged addresses exhaust the real claim budget', async ({ request }) => {
  for (let i = 0; i < 31; i++) {
    const response = await request.post('/api/v1/player-claims/claim', { data: { token: `unknown-${randomUUID()}`, commandId: randomUUID() }, headers: {
      'x-forwarded-for': `192.0.2.${i}`, 'x-real-ip': `198.51.100.${i}`, forwarded: `for=203.0.113.${i}`,
    } });
    expect(response.status()).toBe(i < 30 ? 401 : 429);
    if (i === 30) expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0);
  }
});

test('E2E-12 enabled limits: token-specific five-attempt budget remains independent', async ({ request }) => {
  const token = randomUUID();
  for (let i = 0; i < 6; i++) {
    const response = await request.post('/api/v1/player-claims/claim', { data: { token, commandId: randomUUID() }, headers: { 'x-forwarded-for': `192.0.2.${i}` } });
    expect(response.status()).toBe(i < 5 ? 401 : 429);
    if (i === 5) expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0);
  }
  const keys = await prisma.rateLimitBucket.findMany({ select: { key: true } });
  expect(JSON.stringify(keys).includes(token)).toBe(false);
});

test('E2E-12 origin: rejected creation/logout do not change rows or cookies', async ({ request }) => {
  const created = await request.post('/api/v1/games', { data: { name: 'Origin control' } });
  expect(created.status()).toBe(201);
  const before = await request.storageState();
  const games = await prisma.gameSession.count();
  const active = await prisma.browserSession.count({ where: { revokedAt: null } });
  for (const origin of ['https://attacker.example', 'null', 'garbage', 'http://', 'http://localhost:3100/', 'http://localhost:3100/path', 'http://localhost:3100?query=1', 'http://u@localhost:3100', 'http://localhost:3100, http://other', 'https://localhost:3100', 'http://localhost:3000']) {
    const headers = { origin, host: 'attacker.example', 'x-forwarded-host': 'attacker.example' };
    for (const path of ['/api/v1/games', '/api/v1/session/logout']) {
      const denied = await request.post(path, { headers, data: { name: 'Forbidden' } });
      expect(denied.status()).toBe(403);
      expect(denied.headers()['set-cookie'] === undefined).toBe(true);
    }
  }
  expect((await request.post('/api/v1/session/logout', { headers: { 'sec-fetch-site': 'cross-site' } })).status()).toBe(403);
  expect(await prisma.gameSession.count()).toBe(games);
  expect(await prisma.browserSession.count({ where: { revokedAt: null } })).toBe(active);
  expect((await request.storageState()).cookies.every(c => before.cookies.some(b => b.name === c.name && b.value === c.value))).toBe(true);
});

for (const trigger of ['player-reset', 'player-expiry', 'storyteller-logout'] as const) {
  test(`E2E-12 live stream: ${trigger} closes idle admitted identity within measured bound`, async ({ playwright }) => {
    const st = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
    const player = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
    const abort = new AbortController();
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const game = await boundaryGame(st, player, 'Idle stream control');
      const actor = trigger === 'storyteller-logout' ? st : player;
      const cookies = (await actor.storageState()).cookies.map(c => `${c.name}=${c.value}`).join('; ');
      const response = await fetch(`http://localhost:3100/api/v1/games/${game.gameId}/events/stream`, { headers: { cookie: cookies }, signal: abort.signal });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toContain('no-store');
      const reader = response.body!.getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value).includes('event: hello')).toBe(true);
      const started = Date.now();
      if (trigger === 'player-reset') {
        expect((await st.post(`/api/v1/games/${game.gameId}/players/${game.playerIds[0]}/access/reset`, { data: { commandId: randomUUID(), expectedVersion: game.version } })).status()).toBe(200);
      } else if (trigger === 'player-expiry') {
        await prisma.browserSession.updateMany({ where: { playerId: game.playerIds[0] }, data: { expiresAt: new Date(Date.now() - 1) } });
      } else expect((await st.post('/api/v1/session/logout')).status()).toBe(200);
      const outcome = await Promise.race([
        (async () => { let content = ''; for (;;) { const next = await reader.read(); if (next.done) return content; content += new TextDecoder().decode(next.value); } })(),
        new Promise<never>((_, reject) => { deadline = setTimeout(() => { abort.abort(); reject(new Error('Stream exceeded declared bound')); }, 16_500); }),
      ]);
      const elapsedMs = Date.now() - started;
      expect(outcome.includes('event: invalidate')).toBe(false);
      expect(outcome.includes('event: access-lost\ndata: {}')).toBe(true);
      expect(elapsedMs).toBeLessThanOrEqual(16_500);
      console.log('SECURITY_TIMING', JSON.stringify({ trigger, elapsedMs, nominalMs: 15_000, schedulingAllowanceMs: 1_500 }));
    } finally { clearTimeout(deadline); abort.abort(); await st.dispose(); await player.dispose(); }
  });
}

test('E2E-12 access loss: real Storyteller logout and scoped 404 dispose the mounted private view', async ({ context }, testInfo) => {
  try {
    const created = await context.request.post('/api/v1/games', { data: { name: 'Mounted boundary private view' } });
    expect(created.status()).toBe(201);
    const { gameId } = await created.json();
    const page = await context.newPage();
    expect(page.viewportSize()).toEqual(testInfo.project.use.viewport);
    await page.goto(`/storyteller/${gameId}`);
    await expect(page.getByText('Mounted boundary private view', { exact: true }).first()).toBeVisible();
    const admitted = await context.cookies();
    expect((await context.request.post('/api/v1/session/logout')).status()).toBe(200);
    await context.addCookies(admitted);
    // Keep the admitted cookie in the browser to exercise the generic scoped
    // denial, not merely absent-cookie 401. Logout revoked the persisted row.
    // Captured before logout because the logout response clears this jar.
    const denied = page.waitForResponse(r => r.url().endsWith(`/games/${gameId}/storyteller`) && r.status() === 404);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await denied;
    await expect(page.getByText('Mounted boundary private view', { exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});

for (const held of ['main', 'auxiliary', 'audit', 'token-command'] as const) {
  test(`E2E-12 held completion: ${held} cannot restore a lost or reauthorized same-game private view`, async ({ context }) => {
    let release!: () => void;
    const released = new Promise<void>(resolve => { release = resolve; });
    let fetched!: () => void;
    const captured = new Promise<void>(resolve => { fetched = resolve; });
    let completed!: () => void;
    const delivered = new Promise<void>(resolve => { completed = resolve; });
    try {
      const game = await createStorytellerGame(context.request, 'Held lifetime control', 1);
      const page = await context.newPage();
      await page.goto(`/storyteller/${game.gameId}?view=players`);
      await expect(page.getByRole('button', { name: 'Akcje dla: Player 0' })).toBeEnabled();
      const suffix = held === 'main' ? 'storyteller' : held === 'auxiliary' ? 'storyteller/control' : held === 'audit' ? 'storyteller/audit' : `players/${game.playerIds[0]}/claim-token`;
      let first = true;
      await page.route(`**/api/v1/games/${game.gameId}/${suffix}`, async route => {
        if (!first) { await route.continue(); return; }
        first = false;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        fetched();
        await released;
        try { await route.fulfill({ response }); } finally { completed(); }
      });
      if (held === 'token-command') {
        await page.getByRole('button', { name: 'Akcje dla: Player 0' }).click();
        await page.getByRole('button', { name: 'Link do odbioru', exact: true }).click();
      } else await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await captured;
      const admitted = await context.cookies();
      expect((await context.request.post('/api/v1/session/logout')).status()).toBe(200);
      await context.addCookies(admitted);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByText('Held lifetime control', { exact: true })).toHaveCount(0);
      expect((await context.request.post('/api/v1/storyteller/recover', { data: { gameId: game.gameId, recoverySecret: process.env.STORYTELLER_RECOVERY_SECRET } })).status()).toBe(200);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByText('Held lifetime control', { exact: true }).first()).toBeVisible();
      release();
      await delivered;
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByLabel('Link do odbioru', { exact: true })).toHaveCount(0);
    } finally { release(); await context.close(); }
  });
}

test('E2E-12 private dialog: completed claim token is disposed on loss and does not return after recovery', async ({ context }) => {
  try {
    const game = await createStorytellerGame(context.request, 'Private dialog control', 1);
    const page = await context.newPage();
    await page.goto(`/storyteller/${game.gameId}?view=players`);
    await page.getByRole('button', { name: 'Akcje dla: Player 0' }).click();
    await page.getByRole('button', { name: 'Link do odbioru', exact: true }).click();
    await expect(page.getByLabel('Link do odbioru', { exact: true })).toBeVisible();
    const admitted = await context.cookies();
    expect((await context.request.post('/api/v1/session/logout')).status()).toBe(200);
    await context.addCookies(admitted);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('Link do odbioru', { exact: true })).toHaveCount(0);
    expect((await context.request.post('/api/v1/storyteller/recover', { data: { gameId: game.gameId, recoverySecret: process.env.STORYTELLER_RECOVERY_SECRET } })).status()).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('button', { name: 'Akcje dla: Player 0' })).toBeEnabled();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByLabel('Link do odbioru', { exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});

test('E2E-12 command denial: real inactive membership clears before the next projection poll', async ({ context }) => {
  try {
    const game = await createStorytellerGame(context.request, 'Command denial control', 0);
    const page = await context.newPage();
    await page.goto(`/storyteller/${game.gameId}?view=system`);
    const command = page.getByRole('button', { name: 'Utwórz punkt kontrolny', exact: true });
    await expect(command).toBeEnabled();
    const admitted = await context.cookies();
    expect((await context.request.post('/api/v1/session/logout')).status()).toBe(200);
    await context.addCookies(admitted);
    const denied = page.waitForResponse(r => r.url().endsWith('/checkpoints') && r.status() === 404);
    await command.click();
    await denied;
    await expect(page.getByText('Command denial control', { exact: true })).toHaveCount(0);
    await expect(command).toHaveCount(0);
  } finally { await context.close(); }
});

for (const trigger of ['reset', 'expiry'] as const) {
  test(`E2E-12 mounted player: persisted ${trigger} clears revealed role and reclaim starts covered`, async ({ browser, context: player }) => {
    const st = await browser.newContext({ baseURL: 'http://localhost:3100' });
    try {
      const game = await createStorytellerGame(st.request, 'Mounted role boundary', 13);
      const setup = await generateAndCommitSetup(st.request, game.gameId, game.version);
      let version = (await claimPlayer(st.request, player.request, game.gameId, game.playerIds[0], setup.version)).version;
      const page = await player.newPage();
      await page.goto('/player?view=map');
      await page.getByRole('button', { name: 'Pokaż moją rolę' }).click();
      await expect(page.locator('.role-reveal')).toBeVisible();
      expect(await page.evaluate(async id => (await fetch(`/api/v1/games/${id}/map/layers/WEST_AREA`)).status, game.gameId)).toBe(403);
      await expect(page.locator('.role-reveal')).toBeVisible();
      let token: string | undefined;
      if (trigger === 'expiry') {
        await prisma.browserSession.updateMany({ where: { playerId: game.playerIds[0] }, data: { expiresAt: new Date(Date.now() - 1) } });
      } else {
        const reset = await st.request.post(`/api/v1/games/${game.gameId}/players/${game.playerIds[0]}/access/reset`, { data: { commandId: randomUUID(), expectedVersion: version } });
        expect(reset.status()).toBe(200);
        const body = await reset.json(); token = body.claimToken; version = body.version;
      }
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.locator('.role-reveal')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Pokaż moją rolę' })).toHaveCount(0);
      if (!token) {
        const reset = await st.request.post(`/api/v1/games/${game.gameId}/players/${game.playerIds[0]}/access/reset`, { data: { commandId: randomUUID(), expectedVersion: version } });
        expect(reset.status()).toBe(200); token = (await reset.json()).claimToken;
      }
      expect((await player.request.post('/api/v1/player-claims/claim', { data: { token, commandId: randomUUID() } })).status()).toBe(200);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(page.getByRole('button', { name: 'Pokaż moją rolę' })).toBeVisible();
      await expect(page.locator('.role-reveal')).toHaveCount(0);
    } finally { await st.close(); await player.close(); }
  });
}
