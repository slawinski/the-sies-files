import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { createStorytellerGame, claimPlayer } from './fixtures';
import { prisma } from '../../src/lib/db';
import { randomUUID } from 'node:crypto';

test.afterAll(async () => { await prisma.$disconnect(); });
async function specimen(st: APIRequestContext, player: APIRequestContext, page: Page, count = 1) {
  const game = await createStorytellerGame(st, 'Durable QR', count);
  const claimed = await claimPlayer(st, player, game.gameId, game.playerIds[0], game.version);
  await prisma.gameSession.update({ where: { id: game.gameId }, data: { status: 'ACTIVE', phase: 'INVESTIGATION', cycleNumber: 1 } });
  await prisma.scenarioState.create({ data: { gameId: game.gameId, scenarioId: 'THE_SIES_FILES_MILLIONAIRE', scenarioVersion: 1, stageId: 'ARRIVAL', mapVersionId: 'MAP_BASE' } });
  await page.goto('/player?view=map');
  await expect(page.getByRole('button', { name: 'Skanuj kod QR', exact: true })).toBeEnabled();
  return { ...game, version: claimed.version };
}
async function scan(page: Page) {
  await page.getByRole('button', { name: 'Skanuj kod QR', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('tsf:qr-simulate', { detail: 'tsf-qr-letter-001' })));
}

test('E2E-13 real committed QR response loss survives reload without another POST', async ({ page, playwright }, testInfo) => {
  const st = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
  try {
    const game = await specimen(st, page.request, page);
    let posts = 0, commandId = '';
    await page.route('**/scenario/qr/scan', async route => {
      posts++; commandId = route.request().postDataJSON().commandId;
      expect(JSON.parse((await page.evaluate(() => sessionStorage.getItem('tsf:pending-qr')))!)).toEqual({
        format: 1, operation: 'scanQr', gameId: game.gameId, playerId: game.playerIds[0], commandId,
      });
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      await route.abort('failed');
    });
    await scan(page);
    await expect(page.getByText('Wynik skanu jest nieustalony.', { exact: false }).first()).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('tsf:pending-qr'))).not.toContain('tsf-qr-letter');
    await page.reload();
    await expect(page.getByText(/Nowe dowody:|Otrzymano nowy dowód/).first()).toBeVisible();
    expect(posts).toBe(1);
    expect(await prisma.qrScan.count({ where: { gameId: game.gameId, commandId } })).toBe(1);
    expect(await prisma.domainEvent.count({ where: { gameId: game.gameId, commandId, eventType: 'QR_SCANNED' } })).toBe(1);
    expect(await prisma.commandReceipt.count({ where: { gameId: game.gameId, commandId } })).toBe(1);
    expect((await prisma.gameSession.findUniqueOrThrow({ where: { id: game.gameId } })).version).toBe(game.version + 1);
    for (const width of [393, 1280]) {
      await page.setViewportSize({ width, height: 850 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`recovered-qr-${width}.png`), fullPage: true });
    }
  } finally { await st.dispose(); }
});

for (const initialFailure of ['revoked session', 'transient 503'] as const) {
  test(`E2E-13 reload with ${initialFailure} handles retained uncertain identity before hydration`, async ({ page, playwright }) => {
    const st = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    try {
      const game = await specimen(st, page.request, page);
      let posts = 0, reads = 0, commandId = '';
      page.on('request', request => {
        if (request.method() === 'POST' && request.url().endsWith('/scenario/qr/scan')) posts++;
        if (request.method() === 'GET' && request.url().includes('/me/commands/')) reads++;
      });
      await page.route('**/scenario/qr/scan', async route => {
        commandId = route.request().postDataJSON().commandId;
        expect((await route.fetch()).status()).toBe(200);
        await route.abort('failed');
      });
      await scan(page);
      await expect(page.getByRole('button', { name: 'Sprawdź wynik skanu' })).toBeVisible();
      const retained = await page.evaluate(() => sessionStorage.getItem('tsf:pending-qr'));
      expect(JSON.parse(retained!)).toEqual({
        format: 1, operation: 'scanQr', gameId: game.gameId, playerId: game.playerIds[0], commandId,
      });
      expect(await prisma.qrScan.count({ where: { gameId: game.gameId, commandId } })).toBe(1);
      expect(await prisma.commandReceipt.count({ where: { gameId: game.gameId, commandId } })).toBe(1);
      if (initialFailure === 'revoked session') {
        const revoked = await prisma.browserSession.updateMany({
          where: { playerId: game.playerIds[0] }, data: { revokedAt: new Date('2026-01-01T00:00:00Z') },
        });
        expect(revoked.count).toBe(1);
      }
      let started!: () => void;
      const requested = new Promise<void>(resolve => { started = resolve; });
      await page.route('**/api/v1/me', async route => {
        started(); await held;
        if (initialFailure === 'transient 503') await route.fulfill({ status: 503, json: { error: { code: 'UNKNOWN' } } });
        else await route.continue();
      });
      const response = page.waitForResponse(response => response.url().endsWith('/api/v1/me'));
      await page.reload();
      await requested;
      // Loading alone must not discard identity; the null-scope inner view has mounted.
      expect(await page.evaluate(() => sessionStorage.getItem('tsf:pending-qr'))).toBe(retained);
      release();
      expect((await response).status()).toBe(initialFailure === 'revoked session' ? 401 : 503);
      if (initialFailure === 'revoked session') {
        await expect(page.getByText(/Nie odebrano jeszcze twojej tożsamości/)).toBeVisible();
      } else {
        await expect(page.getByRole('button', { name: 'Spróbuj ponownie' })).toBeVisible();
      }
      await expect(page.getByRole('button', { name: 'Skanuj kod QR', exact: true })).toHaveCount(0);
      await expect(page.getByText(/Nowe dowody:|Otrzymano nowy dowód/)).toHaveCount(0);
      expect(posts).toBe(1);
      expect(reads).toBe(0);
      if (initialFailure === 'revoked session') {
        await expect.poll(() => page.evaluate(() => sessionStorage.getItem('tsf:pending-qr'))).toBeNull();
      } else {
        expect(await page.evaluate(() => sessionStorage.getItem('tsf:pending-qr'))).toBe(retained);
      }
    } finally { release(); await st.dispose(); }
  });
}

test('E2E-13 same-game player change invalidates an older held outcome callback', async ({ page, playwright }) => {
  const st = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  try {
    const game = await specimen(st, page.request, page, 2);
    await page.route('**/scenario/qr/scan', async route => { await route.fetch(); await route.abort('failed'); });
    await scan(page);
    let reads = 0;
    await page.route('**/me/commands/*', async route => {
      reads++; const response = await route.fetch(); await held; await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Sprawdź wynik skanu' }).click();
    await expect.poll(() => reads).toBe(1);
    const version = (await prisma.gameSession.findUniqueOrThrow({ where: { id: game.gameId } })).version;
    await claimPlayer(st, page.request, game.gameId, game.playerIds[1], version);
    const nextProjection = page.waitForResponse(async response => response.url().endsWith('/api/v1/me') && response.status() === 200 && (await response.json()).me.playerId === game.playerIds[1]);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await nextProjection;
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('tsf:pending-qr'))).toBeNull();
    await expect(page.getByRole('dialog', { name: 'Skaner kodów QR' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Skanuj kod QR', exact: true })).toBeEnabled();
    release();
    await expect(page.getByText(/Nowe dowody:|Otrzymano nowy dowód/)).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('tsf:pending-qr'))).toBeNull();
    expect(reads).toBe(1);
  } finally { release(); await st.dispose(); }
});

test('E2E-13 committed scan behind 5xx recovers by GET despite projection refresh failure', async ({ page, playwright }) => {
  const st = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
  try {
    const game = await specimen(st, page.request, page);
    let posts = 0, commandId = '', failRefresh = true;
    await page.route('**/scenario/qr/scan', async route => {
      posts++; commandId = route.request().postDataJSON().commandId;
      expect((await route.fetch()).status()).toBe(200);
      await route.fulfill({ status: 503, json: { error: { code: 'UNKNOWN' } } });
    });
    await scan(page);
    await page.route('**/api/v1/me', route => failRefresh ? route.fulfill({ status: 503, json: { error: { code: 'UNKNOWN' } } }) : route.continue());
    await page.getByRole('button', { name: 'Sprawdź wynik skanu' }).click();
    await expect(page.getByText(/Nowe dowody:|Otrzymano nowy dowód/).first()).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('tsf:pending-qr'))).toBeNull();
    await page.getByRole('button', { name: 'Zamknij okno' }).click();
    await expect(page.getByRole('button', { name: 'Skanuj kod QR', exact: true })).toBeDisabled();
    failRefresh = false;
    await page.getByRole('button', { name: 'Spróbuj ponownie' }).click();
    await expect(page.getByRole('button', { name: 'Skanuj kod QR', exact: true })).toBeEnabled();
    expect(posts).toBe(1);
    expect(await prisma.qrScan.count({ where: { gameId: game.gameId, commandId } })).toBe(1);
  } finally { await st.dispose(); }
});

test('E2E-13 UNKNOWN remains unresolved while original delivery can still commit', async ({ page, playwright }) => {
  const st = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let committed!: () => void;
  const done = new Promise<void>(resolve => { committed = resolve; });
  try {
    const game = await specimen(st, page.request, page);
    let posts = 0;
    await page.route('**/scenario/qr/scan', async route => {
      posts++;
      const data = route.request().postDataJSON();
      await route.abort('failed');
      await held;
      const response = await page.request.post(`/api/v1/games/${game.gameId}/scenario/qr/scan`, { data });
      expect(response.status()).toBe(200); committed();
    });
    await scan(page);
    await expect(page.getByRole('button', { name: 'Sprawdź wynik skanu' })).toBeVisible();
    await page.getByRole('button', { name: 'Sprawdź wynik skanu' }).click();
    await expect(page.getByText(/Wynik skanu jest nieustalony/)).toBeVisible();
    await page.getByRole('button', { name: 'Zamknij okno' }).click();
    await expect(page.getByRole('button', { name: 'Skanuj kod QR', exact: true })).toBeDisabled();
    expect(posts).toBe(1);
    release(); await done;
    await page.getByRole('button', { name: 'Sprawdź wynik skanu' }).click();
    await expect(page.getByText(/Nowe dowody:|Otrzymano nowy dowód/).first()).toBeVisible();
    expect(posts).toBe(1);
  } finally { release(); await st.dispose(); }
});

test('E2E-13 malformed successful POST and malformed status never falsely acknowledge', async ({ page, playwright }) => {
  const st = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
  try {
    await specimen(st, page.request, page);
    let posts = 0, malformed = true;
    await page.route('**/scenario/qr/scan', async route => {
      posts++; const response = await route.fetch(); expect(response.status()).toBe(200);
      await route.fulfill({ status: 200, json: null });
    });
    await page.route('**/me/commands/*', route => malformed ? route.fulfill({ status: 200, json: { status: 'APPLIED', resultingGameVersion: 999999 } }) : route.continue());
    await scan(page);
    await page.getByRole('button', { name: 'Sprawdź wynik skanu' }).click();
    await expect(page.getByText(/Wynik skanu jest nieustalony/)).toBeVisible();
    await expect(page.getByText('Skan przyjęty.', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('tsf:pending-qr'))).not.toBeNull();
    malformed = false;
    await page.getByRole('button', { name: 'Sprawdź wynik skanu' }).click();
    await expect(page.getByText(/Nowe dowody:|Otrzymano nowy dowód/).first()).toBeVisible();
    expect(posts).toBe(1);
  } finally { await st.dispose(); }
});

test('E2E-13 held status cannot restore private outcome or storage after access loss', async ({ page, playwright }) => {
  const st = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  try {
    const game = await specimen(st, page.request, page);
    await page.route('**/scenario/qr/scan', async route => { await route.fetch(); await route.abort('failed'); });
    await scan(page);
    let reads = 0;
    await page.route('**/me/commands/*', async route => {
      reads++; const response = await route.fetch(); await held; await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Sprawdź wynik skanu' }).click();
    await expect.poll(() => reads).toBe(1);
    await prisma.browserSession.updateMany({ where: { playerId: game.playerIds[0] }, data: { revokedAt: new Date() } });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText(/Nie odebrano jeszcze twojej tożsamości/)).toBeVisible();
    release();
    await expect(page.getByText(/Nowe dowody:|Otrzymano nowy dowód/)).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('tsf:pending-qr'))).toBeNull();
    expect(reads).toBe(1);
  } finally { release(); await st.dispose(); }
});

test('E2E-13 blocked storage retains in-memory recovery with explicit reload limitation', async ({ page, playwright }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } }));
  const st = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
  try {
    await specimen(st, page.request, page);
    await page.route('**/scenario/qr/scan', async route => { await route.fetch(); await route.abort('failed'); });
    await scan(page);
    await expect(page.getByText(/odzyskanie po przeładowaniu nie będzie dostępne/)).toBeVisible();
    await page.getByRole('button', { name: 'Sprawdź wynik skanu' }).click();
    await expect(page.getByText(/Nowe dowody:|Otrzymano nowy dowód/).first()).toBeVisible();
  } finally { await st.dispose(); }
});

test('E2E-13 reload under a different authorized scope discards identity before querying', async ({ page, playwright }) => {
  const st = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
  try {
    await specimen(st, page.request, page);
    await page.route('**/scenario/qr/scan', async route => { await route.fetch(); await route.abort('failed'); });
    await scan(page);
    await expect(page.getByRole('button', { name: 'Sprawdź wynik skanu' })).toBeVisible();
    const oldIdentity = await page.evaluate(() => sessionStorage.getItem('tsf:pending-qr'));
    expect(oldIdentity).not.toBeNull();
    const next = await createStorytellerGame(st, 'Other scope', 1);
    await claimPlayer(st, page.request, next.gameId, next.playerIds[0], next.version);
    let queries = 0;
    page.on('request', request => { if (request.url().includes('/me/commands/')) queries++; });
    const projection = page.waitForResponse(response => response.url().endsWith('/api/v1/me') && response.status() === 200);
    await page.reload();
    expect((await (await projection).json()).gameId).toBe(next.gameId);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('tsf:pending-qr'))).toBeNull();
    expect(queries).toBe(0);
  } finally { await st.dispose(); }
});

for (const operation of ['reset', 'claim-token'] as const) {
  test(`E2E-13 duplicate ${operation} modal acknowledges acceptance without a credential field`, async ({ page }) => {
    const game = await createStorytellerGame(page.request, 'Duplicate credential acknowledgement', 1);
    const commandId = randomUUID();
    const endpoint = `/api/v1/games/${game.gameId}/players/${game.playerIds[0]}/${operation === 'reset' ? 'access/reset' : 'claim-token'}`;
    expect((await page.request.post(endpoint, { data: { commandId, expectedVersion: game.version } })).status()).toBe(200);
    const events = await prisma.domainEvent.count({ where: { gameId: game.gameId } });
    await page.route(`**${endpoint}`, async route => {
      const response = await route.fetch({ postData: JSON.stringify({ ...route.request().postDataJSON(), commandId }) });
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.duplicate).toBe(true);
      expect(body.credentialAvailable).toBe(false);
      expect(body.claimToken).toBeUndefined();
      await route.fulfill({ response });
    });
    await page.goto(`/storyteller/${game.gameId}?view=players`);
    await page.getByRole('button', { name: 'Akcje dla: Player 0', exact: true }).click();
    await page.getByRole('button', { name: operation === 'reset' ? 'Reset dostępu' : 'Link do odbioru', exact: true }).click();
    if (operation === 'reset') await page.getByRole('button', { name: 'Resetuj dostęp', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: operation === 'reset' ? 'Reset dostępu: Player 0' : 'Link do odbioru: Player 0', exact: true });
    await expect(dialog.getByText(operation === 'reset' ? /Reset przyjęto wcześniej/ : /Polecenie przyjęto wcześniej/)).toBeVisible();
    await expect(dialog.locator('input')).toHaveCount(0);
    expect(await prisma.domainEvent.count({ where: { gameId: game.gameId } })).toBe(events);
  });
}
