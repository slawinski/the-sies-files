import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { chromium, expect } from '@playwright/test';
import { createStorytellerGame, generateAndCommitSetup, claimPlayer } from '../tests/e2e/fixtures.js';
import { assertPortFree } from './regression-baseline.mjs';
import { buildIdentity } from './playable-recovery.mjs';
import { digest, readGraph, selection } from './game-data-policy.mjs';
import type { Target } from './test-database.mjs';

/** Not an ordinary Playwright worker: this proof owns its app process, port
 * lease and database. No shared webServer or application control endpoint. */
export async function proveBrowserLifecycle(target: Target, db: PrismaClient, custody: string,
  build: ReturnType<typeof buildIdentity>, port: number, command: (exe: string, args: string[], env: NodeJS.ProcessEnv) => void) {
  const cwd = process.cwd(), origin = `http://localhost:${port}`;
  let app: ChildProcess | undefined;
  const secret = randomUUID();
  let checks = 0;
  const check = (actual: unknown, expected: unknown) => { expect(actual).toEqual(expected); checks++; };
  const start = async () => {
    await assertPortFree(port);
    check(buildIdentity(cwd, build.sourceId), build);
    app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--port', String(port)], {
      cwd, env: { ...target.env, NODE_ENV: 'production', APP_ORIGIN: origin, RATE_LIMIT_DISABLED: '1', STORYTELLER_RECOVERY_SECRET: secret, NEXT_TELEMETRY_DISABLED: '1' },
      detached: true, stdio: 'ignore',
    });
    app.on('error', () => { /* Readiness fails without serializing environment. */ });
    for (let i = 0; i < 300; i++) {
      if (!app.pid || app.exitCode !== null || app.signalCode !== null) throw new Error('Owned app exited before readiness');
      try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* bounded readiness */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Owned app readiness failed');
  };
  const stop = async () => {
    if (!app) return;
    const child = app;
    if (child.exitCode === null && child.signalCode === null) {
      const ended = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Owned app did not stop normally')), 10_000);
        child.once('close', () => { clearTimeout(timer); resolve(); });
      });
      process.kill(-child.pid!, 'SIGTERM');
      await ended;
    }
    await assertPortFree(port); app = undefined;
  };
  const browser = await chromium.launch();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  try {
    await start();
    const st = await browser.newContext({ baseURL: origin, viewport: { width: 393, height: 850 }, isMobile: true, hasTouch: true });
    const player = await browser.newContext({ baseURL: origin, viewport: { width: 393, height: 850 }, isMobile: true, hasTouch: true });
    const otherActor = await browser.newContext({ baseURL: origin });
    for (const context of [st, player]) await context.addInitScript(() => {
      const streams: { source: EventSource; hello?: string }[] = [];
      Object.assign(window, { __lifecycleStreams: streams });
      const NativeSource = window.EventSource;
      window.EventSource = class extends NativeSource {
        constructor(url: string | URL, options?: EventSourceInit) {
          super(url, options);
          const record: { source: EventSource; hello?: string } = { source: this };
          streams.push(record);
          this.addEventListener('hello', event => { record.hello = (event as MessageEvent).data; });
        }
      };
    });
    const other = await createStorytellerGame(otherActor.request, 'Synthetic retained browser game', 1);
    const otherDigest = selection(await db.$transaction(tx => readGraph(tx)), other.gameId).data;
    const game = await createStorytellerGame(st.request, 'Synthetic retired browser game', 13);
    const setup = await generateAndCommitSetup(st.request, game.gameId, game.version);
    await claimPlayer(st.request, player.request, game.gameId, game.playerIds[0], setup.version);
    // UI seed only. The separate physical proof uses the real completion handler.
    await db.gameSession.update({ where: { id: game.gameId }, data: { status: 'ENDED', phase: 'INVESTIGATION', winner: 'GOOD', winReason: 'DEMON_DEAD' } });
    await db.$disconnect();
    const stPage = await st.newPage(), playerPage = await player.newPage();
    let posts = 0, reads = 0;
    let delivered!: () => void;
    const delayedDelivered = new Promise<void>(resolve => { delivered = resolve; });
    await stPage.route('**/archive', async route => {
      posts++; check((await route.fetch()).status(), 200); await route.abort('failed');
    });
    await stPage.route('**/commands/*', async route => {
      const response = await route.fetch(); check((await response.json()).status, 'APPLIED');
      reads++; await held;
      try { await route.fulfill({ response }); } finally { delivered(); }
    });
    await playerPage.goto('/player');
    await playerPage.getByRole('button', { name: 'Pokaż rolę', exact: true }).click();
    await expect(playerPage.getByRole('dialog', { name: 'Twoja rola' })).toBeVisible(); checks++;
    await stPage.goto(`/storyteller/${game.gameId}?view=system`);
    await stPage.getByRole('button', { name: 'Archiwizuj sprawę', exact: true }).click();
    await stPage.getByRole('dialog').getByRole('button', { name: 'Archiwizuj', exact: true }).click();
    await expect.poll(() => reads).toBe(1); checks++;
    check(posts, 1);
    // Same pages/contexts survive the interruption and retain a private dialog
    // plus an actually committed, delayed archive-status response.
    await expect(playerPage.getByRole('dialog', { name: 'Twoja rola' })).toBeVisible(); checks++;
    // Model the browser's real network interruption before graceful shutdown;
    // idle SSE transports must drain, while pages/dialogs and the held response
    // remain in this same browser realm.
    await Promise.all([st, player, otherActor].map(context => context.setOffline(true)));
    for (const page of [stPage, playerPage]) {
      // Next's production SIGTERM waits for server.close(), including SSE.
      // Drain only this browser's native streams, not application/DB sessions.
      // Keep their real hello metadata to exercise a late callback after denial.
      check(await page.evaluate(() => {
        const streams = (window as unknown as { __lifecycleStreams: { source: EventSource; hello?: string }[] }).__lifecycleStreams;
        for (const { source } of streams) source.close();
        return streams.some(s => typeof s.hello === 'string');
      }), true);
    }
    await stop(); await db.$disconnect();
    const database = new URL(target.env.DATABASE_URL!); database.password = '';
    const args = ['--database', database.href, '--game', game.gameId, '--request', randomUUID(),
      '--plan', path.join(custody, 'browser-plan.json'), '--journal', path.join(custody, 'browser-intent.json'),
      '--receipt', path.join(custody, 'browser-receipt.json'), '--stopped-application'];
    // The real CLI performs its normal pg_stat_activity/quiescence check. No
    // session termination, application flag endpoint or test-only bypass.
    for (const mode of ['plan', 'apply']) command(path.join(cwd, 'node_modules/.bin/tsx'), ['scripts/game-data-lifecycle.mts', mode, ...args], target.env);
    check(await db.gameSession.findUnique({ where: { id: game.gameId } }), null);
    check(selection(await db.$transaction(tx => readGraph(tx)), other.gameId).data, otherDigest);
    await db.$disconnect();
    await start(); // same immutable build and leased port, fresh owned process
    await Promise.all([st, player, otherActor].map(context => context.setOffline(false)));
    check((await st.request.get(`/api/v1/games/${game.gameId}/storyteller`)).status(), 404);
    check((await player.request.get('/api/v1/me')).status(), 401);
    check((await st.request.post('/api/v1/storyteller/recover', { data: { gameId: game.gameId, recoverySecret: secret } })).status(), 401);
    const stDenial = stPage.waitForResponse(r => r.url().endsWith(`/games/${game.gameId}/storyteller`) && r.status() === 404);
    const playerDenial = playerPage.waitForResponse(r => r.url().endsWith('/api/v1/me') && r.status() === 401);
    await Promise.all([stPage, playerPage].map(p => p.evaluate(() => window.dispatchEvent(new Event('focus')))));
    await Promise.all([stDenial, playerDenial]);
    for (const page of [stPage, playerPage]) {
      await expect(page.getByRole('dialog')).toHaveCount(0); checks++;
      await expect(page.getByText('Synthetic retired browser game', { exact: true })).toHaveCount(0); checks++;
    }
    await expect(stPage.getByRole('button', { name: 'Sprawdź wynik archiwizacji' })).toHaveCount(0); checks++;
    check(await playerPage.evaluate(() => sessionStorage.getItem('tsf:pending-qr')), null);
    release(); await delayedDelivered;
    for (const page of [stPage, playerPage]) await page.evaluate(() => {
      for (const { source, hello } of (window as unknown as { __lifecycleStreams: { source: EventSource; hello?: string }[] }).__lifecycleStreams) {
        if (hello) source.dispatchEvent(new MessageEvent('hello', { data: hello }));
      }
    });
    // Flush browser tasks after delivery, not an assertion made while the old
    // callback was still held. Natural SSE/session handling is left enabled.
    await stPage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(stPage.getByText('Archiwizacja potwierdzona.', { exact: true })).toHaveCount(0); checks++;
    await expect(playerPage.getByRole('dialog')).toHaveCount(0); checks++;
    check(posts, 1); check(reads, 1);
    check(buildIdentity(cwd, build.sourceId), build);
    return { id: 'E2E-14 offline purge restart clears mounted private state and delayed archive outcome', status: 'passed', assertions: checks } as const;
  } catch (error) {
    fs.writeFileSync(path.join(custody, 'browser-failure.txt'), error instanceof Error ? error.stack ?? error.message : 'Browser proof failed', { mode: 0o600 });
    throw error;
  } finally {
    release(); await browser.close(); await stop(); await db.$disconnect();
    // Keep the directory private even when browser/native assertions fail.
    fs.chmodSync(custody, 0o700);
  }
}
