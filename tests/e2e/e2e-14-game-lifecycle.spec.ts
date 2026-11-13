import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createStorytellerGame, generateAndCommitSetup, claimPlayer } from './fixtures';
import { prisma } from '../../src/lib/db';
import { characterDisplayName } from '../../src/modules/trouble-brewing/characters';

test.afterAll(async () => { await prisma.$disconnect(); });
async function completed(st: APIRequestContext, readers: APIRequestContext[] = []) {
  const game = await createStorytellerGame(st, 'Retained synthetic history', 13);
  await generateAndCommitSetup(st, game.gameId, game.version);
  let version = (await prisma.gameSession.findUniqueOrThrow({ where: { id: game.gameId } })).version;
  for (const [index, reader] of readers.entries()) {
    version = (await claimPlayer(st, reader, game.gameId, game.playerIds[index], version)).version;
  }
  // UI seed, not a claim of real gameplay completion. Archive itself uses the real API.
  await prisma.gameSession.update({ where: { id: game.gameId }, data: { status: 'ENDED', winner: 'GOOD', winReason: 'DEMON_DEAD', phase: 'INVESTIGATION' } });
  await prisma.scenarioState.create({ data: { gameId: game.gameId, scenarioId: 'THE_SIES_FILES_MILLIONAIRE', scenarioVersion: 1, stageId: 'ARRIVAL', mapVersionId: 'MAP_BASE' } });
  await prisma.scenarioDiscovery.createMany({ data: [0, 1].map(index => ({
    gameId: game.gameId, playerId: game.playerIds[index], objectId: `u2-private-${index}`, objectType: 'CLUE',
    visibilityScope: 'DISCOVERER_ONLY', contentJson: { title: `Private history ${index}`, body: `Synthetic evidence ${index}` },
  })) });
  return game;
}

test('E2E-14 archive retains actor-specific reads, role inspection, reentry and new-game chooser', async ({ page, browser }, testInfo) => {
  const mobile = { viewport: { width: 393, height: 850 }, isMobile: true, hasTouch: true };
  const p1 = await browser.newContext(mobile), p2 = await browser.newContext(mobile);
  try {
    const game = await completed(page.request, [p1.request, p2.request]);
    const ownBefore = await Promise.all([p1, p2].map(async context => (await (await context.request.get('/api/v1/me')).json()).myRole));
    expect(ownBefore[0].characterId).not.toBe(ownBefore[1].characterId);
    const oldCommand = await prisma.commandReceipt.findFirstOrThrow({ where: { gameId: game.gameId, operation: 'commitSetup' } });
    const oldStatus = await (await page.request.get(`/api/v1/games/${game.gameId}/commands/${oldCommand.commandId}`)).json();
    expect(oldStatus.status).toBe('APPLIED');
    await page.goto(`/storyteller/${game.gameId}?view=system`);
    await page.getByRole('button', { name: 'Archiwizuj sprawę', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archiwizuj', exact: true }).click();
    await expect(page.getByText('Sprawa zarchiwizowana — tylko do odczytu.', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Utwórz punkt kontrolny' })).toBeDisabled();
    const root = await prisma.gameSession.findUniqueOrThrow({ where: { id: game.gameId } });
    expect(root.archivedAt).not.toBeNull();
    const events = await prisma.domainEvent.count({ where: { gameId: game.gameId } });
    expect(await (await page.request.get(`/api/v1/games/${game.gameId}/commands/${oldCommand.commandId}`)).json()).toEqual(oldStatus);
    const oldDuplicate = await page.request.post(`/api/v1/games/${game.gameId}/setup/commit`, {
      data: { commandId: oldCommand.commandId, expectedVersion: oldCommand.resultingVersion - 1 },
    });
    expect(oldDuplicate.status()).toBe(200);
    expect((await oldDuplicate.json()).version).toBe(oldCommand.resultingVersion);
    for (const [index, context] of [p1, p2].entries()) {
      const player = await context.newPage();
      let writes = 0;
      player.on('request', r => { if (r.method() === 'POST' && !r.url().endsWith('/presence/heartbeat')) writes++; });
      await player.goto('/player');
      await expect(player.getByText('Sprawa zarchiwizowana — tylko do odczytu.', { exact: false })).toBeVisible();
      const own = await (await context.request.get('/api/v1/me')).json();
      expect(own.myRole).not.toBeNull();
      expect(own.myRole).toEqual(ownBefore[index]);
      expect(own.scenario.clues).toEqual([{ id: `u2-private-${index}`, title: `Private history ${index}`, body: `Synthetic evidence ${index}` }]);
      expect(own).not.toHaveProperty('setup');
      expect(own.players.every((p: object) => !('trueCharacterId' in p))).toBe(true);
      await player.getByRole('button', { name: 'Pokaż rolę', exact: true }).click();
      await expect(player.getByRole('dialog', { name: 'Twoja rola' })).toBeVisible();
      await expect(player.getByRole('dialog').getByRole('heading', { name: characterDisplayName(ownBefore[index].characterId), exact: true })).toBeVisible();
      await expect(player.getByRole('dialog').getByText(characterDisplayName(ownBefore[1 - index].characterId), { exact: true })).toHaveCount(0);
      await player.getByRole('button', { name: 'Zamknij okno' }).click();
      await player.goto('/player?view=journal');
      await player.getByRole('button', { name: 'szczegóły', exact: true }).click();
      await expect(player.getByText(`Private history ${index}`, { exact: true })).toBeVisible();
      await expect(player.getByText(`Private history ${1 - index}`, { exact: true })).toHaveCount(0);
      await expect(player.getByRole('button', { name: 'Potwierdź rolę', exact: false })).toHaveCount(0);
      await player.goto('/player?view=map');
      await expect(player.getByRole('button', { name: 'Skanuj kod QR', exact: true })).toBeDisabled();
      await player.reload();
      await expect(player.getByText('Sprawa zarchiwizowana — tylko do odczytu.', { exact: false })).toBeVisible();
      for (const width of [393, 1280]) {
        await player.setViewportSize({ width, height: 850 });
        expect(await player.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      expect(writes).toBe(0);
    }
    const rejected = await page.request.post(`/api/v1/games/${game.gameId}/storyteller/checkpoints`, { data: { commandId: randomUUID(), expectedVersion: root.version, payload: {} } });
    expect((await rejected.json()).error.code).toBe('GAME_ARCHIVED');
    expect(await prisma.domainEvent.count({ where: { gameId: game.gameId } })).toBe(events);
    const storyteller = await (await page.request.get(`/api/v1/games/${game.gameId}/storyteller`)).json();
    expect(storyteller.scenario.clues.map((c: { id: string }) => c.id).sort()).toEqual(['u2-private-0', 'u2-private-1']);
    expect(storyteller.setup.candidate.assignments).toHaveLength(13);
    await page.goto(`/storyteller/${game.gameId}?view=grimoire`);
    await expect(page.getByText(characterDisplayName(ownBefore[0].characterId), { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Zasłoń', exact: true }).click();
    await expect(page.getByText(characterDisplayName(ownBefore[0].characterId), { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Odkryj', exact: true }).click();
    await page.goto(`/storyteller/${game.gameId}?view=system`);
    await page.reload();
    await expect(page.getByText('LIVE', { exact: true }).first()).toBeVisible();
    for (const width of [393, 1280]) {
      await page.setViewportSize({ width, height: 850 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`archive-${width}.png`), fullPage: true });
    }
    await page.goto(`/storyteller/${game.gameId}?view=players`);
    await expect(page.getByRole('button', { name: 'Ułóż krąg', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Akcje dla: Player 12', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Usuń z kręgu', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Link do odbioru', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Link do odbioru', exact: true })).toBeVisible();
    await page.goto('/storyteller');
    await expect(page.getByRole('link', { name: 'Otwórz archiwum bieżącej sprawy' })).toHaveAttribute('href', `/storyteller/${game.gameId}`);
    await page.getByRole('textbox', { name: 'Nazwa sprawy', exact: true }).fill('Next synthetic case');
    await page.getByRole('button', { name: 'Otwórz sprawę', exact: true }).click();
    await expect(page).not.toHaveURL(new RegExp(game.gameId));
    await expect(page.getByText('Next synthetic case', { exact: true }).first()).toBeVisible();
    // The replacement cookie is not a global history authority.
    expect((await page.request.get(`/api/v1/games/${game.gameId}/storyteller`)).status()).toBe(404);
    await page.goto('/storyteller');
    // An active current game still redirects as before.
    await expect(page).not.toHaveURL(/\/storyteller$/);
  } finally { await p1.close(); await p2.close(); }
});

test('E2E-14 committed archive response loss checks original identity without another POST', async ({ page }) => {
  const game = await completed(page.request);
  let posts = 0, id = '';
  const reads: string[] = [];
  page.on('request', r => { if (r.method() === 'GET' && r.url().includes('/commands/')) reads.push(r.url()); });
  await page.route('**/archive', async route => {
    posts++; id = route.request().postDataJSON().commandId;
    expect((await route.fetch()).status()).toBe(200);
    await route.abort('failed');
  });
  await page.goto(`/storyteller/${game.gameId}?view=system`);
  await page.getByRole('button', { name: 'Archiwizuj sprawę', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archiwizuj', exact: true }).click();
  await expect(page.getByText('Archiwizacja potwierdzona.', { exact: true })).toBeVisible();
  expect(posts).toBe(1);
  expect(reads.some(url => url.endsWith(`/commands/${id}`))).toBe(true);
  expect(await prisma.commandReceipt.count({ where: { gameId: game.gameId, commandId: id } })).toBe(1);
  expect(await prisma.domainEvent.count({ where: { gameId: game.gameId, commandId: id, eventType: 'GAME_ARCHIVED' } })).toBe(1);
  const root = await prisma.gameSession.findUniqueOrThrow({ where: { id: game.gameId } });
  expect(root.version).toBe(17);
  const duplicate = await page.request.post(`/api/v1/games/${game.gameId}/archive`, { data: { commandId: id, expectedVersion: 16 } });
  expect(duplicate.status()).toBe(200);
  expect((await duplicate.json()).duplicate).toBe(true);
  expect((await prisma.gameSession.findUniqueOrThrow({ where: { id: game.gameId } })).version).toBe(root.version);
});

test('E2E-14 archive confirmation invalidates on a newer version and detected access loss', async ({ page }) => {
  const game = await completed(page.request);
  let posts = 0;
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/archive')) posts++; });
  await page.goto(`/storyteller/${game.gameId}?view=system`);
  await page.getByRole('button', { name: 'Archiwizuj sprawę', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const checkpoint = await page.request.post(`/api/v1/games/${game.gameId}/storyteller/checkpoints`, {
    data: { commandId: randomUUID(), expectedVersion: 16, payload: {} },
  });
  expect(checkpoint.status()).toBe(201);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Archiwizuj sprawę', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await prisma.browserSession.updateMany({ where: { storytellerGameId: game.gameId }, data: { expiresAt: new Date('2020-01-01T00:00:00Z') } });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Retained synthetic history', { exact: true })).toHaveCount(0);
  expect(posts).toBe(0);
  expect((await prisma.gameSession.findUniqueOrThrow({ where: { id: game.gameId } })).archivedAt).toBeNull();
});

test('E2E-14 configured recovery retains archive access but expired player credentials do not', async ({ page, browser }) => {
  const reader = await browser.newContext();
  const recovered = await browser.newContext();
  try {
    const game = await completed(page.request, [reader.request]);
    const version = (await prisma.gameSession.findUniqueOrThrow({ where: { id: game.gameId } })).version;
    expect((await page.request.post(`/api/v1/games/${game.gameId}/archive`, { data: { commandId: randomUUID(), expectedVersion: version } })).status()).toBe(200);
    await prisma.browserSession.updateMany({ where: { playerId: game.playerIds[0] }, data: { expiresAt: new Date('2020-01-01T00:00:00Z') } });
    const denied = await reader.request.get('/api/v1/me');
    expect(denied.status()).toBe(401);
    expect(denied.headers()['cache-control']).toContain('no-store');
    const recoveryPage = await recovered.newPage();
    await recoveryPage.goto('http://localhost:3100/storyteller');
    await recoveryPage.getByRole('button', { name: 'Odzyskaj dostęp prowadzącego' }).click();
    await recoveryPage.getByRole('textbox', { name: 'Identyfikator sprawy' }).fill(game.gameId);
    await recoveryPage.getByLabel('Sekret odzyskiwania', { exact: true }).fill('invalid-synthetic-secret');
    await recoveryPage.getByRole('button', { name: 'Odzyskaj', exact: true }).click();
    await expect(recoveryPage.getByText('Nie udało się odzyskać dostępu.', { exact: true })).toBeVisible();
    await recoveryPage.getByLabel('Sekret odzyskiwania', { exact: true }).fill(process.env.STORYTELLER_RECOVERY_SECRET!);
    await recoveryPage.getByRole('button', { name: 'Odzyskaj', exact: true }).click();
    await expect(recoveryPage.getByText('Sprawa zarchiwizowana — tylko do odczytu.', { exact: false })).toBeVisible();
  } finally { await reader.close(); await recovered.close(); }
});

test('E2E-14 live game archive button is disabled', async ({ page }) => {
  const game = await createStorytellerGame(page.request, 'Not completed', 1);
  await page.goto(`/storyteller/${game.gameId}?view=system`);
  await expect(page.getByRole('button', { name: 'Archiwizuj sprawę', exact: true })).toBeDisabled();
});

test('E2E-14 UNKNOWN is unresolved even when the archived projection arrives', async ({ page }) => {
  const game = await completed(page.request);
  let posts = 0, id = '', reads = 0;
  await page.route('**/archive', async route => {
    posts++; id = route.request().postDataJSON().commandId;
    expect((await route.fetch()).status()).toBe(200);
    await route.abort('failed');
  });
  await page.route('**/commands/*', async route => {
    reads++;
    expect(route.request().url()).toContain(id);
    // An intentionally uncertain observation, not a supplied success.
    await route.fulfill({ json: { status: 'UNKNOWN' } });
  });
  await page.goto(`/storyteller/${game.gameId}?view=system`);
  await page.getByRole('button', { name: 'Archiwizuj sprawę', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archiwizuj', exact: true }).click();
  await expect(page.getByText('Wynik archiwizacji jest nieustalony.', { exact: false })).toBeVisible();
  await expect(page.getByText('Sprawa zarchiwizowana — tylko do odczytu.', { exact: false })).toBeVisible();
  await expect(page.getByText('Archiwizacja potwierdzona.', { exact: true })).toHaveCount(0);
  await page.unroute('**/commands/*');
  await page.getByRole('button', { name: 'Sprawdź wynik archiwizacji' }).click();
  await expect(page.getByText('Archiwizacja potwierdzona.', { exact: true })).toBeVisible();
  expect(posts).toBe(1); expect(reads).toBe(1);
});

for (const change of ['access loss', 'game scope change'] as const) test(`E2E-14 held archive status cannot revive private state after ${change}`, async ({ page }) => {
  const game = await completed(page.request);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let reads = 0, posts = 0;
  try {
    await page.route('**/archive', async route => { posts++; expect((await route.fetch()).status()).toBe(200); await route.abort('failed'); });
    await page.route('**/commands/*', async route => {
      const response = await route.fetch();
      expect((await response.json()).status).toBe('APPLIED');
      reads++; await held;
      await route.fulfill({ response });
    });
    await page.goto(`/storyteller/${game.gameId}?view=system`);
    await page.getByRole('button', { name: 'Archiwizuj sprawę', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archiwizuj', exact: true }).click();
    await expect.poll(() => reads).toBe(1);
    if (change === 'access loss') {
      await prisma.browserSession.updateMany({ where: { storytellerGameId: game.gameId }, data: { revokedAt: new Date() } });
      const denial = page.waitForResponse(r => r.url().endsWith(`/games/${game.gameId}/storyteller`) && r.status() === 404);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await denial;
    } else {
      const replacement = await createStorytellerGame(page.request, 'Replacement scope', 0);
      await page.goto(`/storyteller/${replacement.gameId}?view=system`);
      await expect(page.getByText('Replacement scope', { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText('Retained synthetic history', { exact: true })).toHaveCount(0);
    release();
    await expect(page.getByText('Archiwizacja potwierdzona.', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(posts).toBe(1);
  } finally { release(); }
});

test('E2E-14 pending QR stays GET-recoverable after archive with no new scan or role ack', async ({ page, playwright }) => {
  const st = await playwright.request.newContext({ baseURL: 'http://localhost:3100' });
  try {
    const game = await createStorytellerGame(st, 'Pending QR archive', 1);
    const claimed = await claimPlayer(st, page.request, game.gameId, game.playerIds[0], game.version);
    await prisma.gameSession.update({ where: { id: game.gameId }, data: { status: 'ACTIVE', phase: 'INVESTIGATION', cycleNumber: 1 } });
    await prisma.scenarioState.create({ data: { gameId: game.gameId, scenarioId: 'THE_SIES_FILES_MILLIONAIRE', scenarioVersion: 1, stageId: 'ARRIVAL', mapVersionId: 'MAP_BASE' } });
    let posts = 0, id = '';
    await page.route('**/scenario/qr/scan', async route => {
      posts++; id = route.request().postDataJSON().commandId;
      expect((await route.fetch()).status()).toBe(200); await route.abort('failed');
    });
    await page.goto('/player?view=map');
    await page.getByRole('button', { name: 'Skanuj kod QR', exact: true }).click();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tsf:qr-simulate', { detail: 'tsf-qr-letter-001' })));
    await expect(page.getByRole('button', { name: 'Sprawdź wynik skanu' })).toBeVisible();
    await prisma.gameSession.update({ where: { id: game.gameId }, data: { status: 'ENDED', winner: 'GOOD', winReason: 'DEMON_DEAD' } });
    const archive = await st.post(`/api/v1/games/${game.gameId}/archive`, { data: { commandId: randomUUID(), expectedVersion: claimed.version + 1 } });
    expect(archive.status()).toBe(200);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByText('Sprawa zarchiwizowana — tylko do odczytu.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Sprawdź wynik skanu' }).click();
    await expect(page.getByText(/Nowe dowody:|Otrzymano nowy dowód/).first()).toBeVisible();
    expect(posts).toBe(1);
    expect(await prisma.qrScan.count({ where: { gameId: game.gameId, commandId: id } })).toBe(1);
    expect(await page.evaluate(() => sessionStorage.getItem('tsf:pending-qr'))).toBeNull();
    await expect(page.getByRole('button', { name: 'Skanuj kod QR', exact: true })).toBeDisabled();
  } finally { await st.dispose(); }
});
