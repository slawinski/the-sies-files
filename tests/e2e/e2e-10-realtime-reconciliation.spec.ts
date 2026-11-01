import { test, expect, type Page, type Browser, type APIRequestContext } from "@playwright/test";
import { claimPlayer, claimAllPlayers, driveOperationalCycle, commandVersion, createStorytellerGame, generateAndCommitSetup } from "./fixtures";

for (const sameGame of [false, true]) {
  test(`E2E-10 review #1: revealed identity switches covered (${sameGame ? "same game" : "different game"})`, async ({ page, browser }) => {
    const st = page.request;
    const first = await createStorytellerGame(st, "Review private A", 13);
    const setup = await generateAndCommitSetup(st, first.gameId, first.version);
    const context = await browser.newContext({ baseURL: "http://localhost:3100" });
    await claimPlayer(st, context.request, first.gameId, first.playerIds[0], setup.version);
    const target = await context.newPage();
    await controlledStream(target);
    await target.goto("/player");
    await target.getByRole("button", { name: "Pokaż moją rolę" }).click();
    // A same-identity version change must not reset the deliberate reveal.
    const checkpoint = await st.post(`/api/v1/games/${first.gameId}/storyteller/checkpoints`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: (await (await st.get(`/api/v1/games/${first.gameId}/storyteller`)).json()).version, payload: { reason: "Same identity" } },
    });
    expect(checkpoint.ok()).toBe(true);
    const checkpointVersion = (await checkpoint.json()).version;
    const refreshed = target.waitForResponse(async response => response.url().endsWith("/api/v1/me") && response.ok() && (await response.json()).version >= checkpointVersion);
    await target.evaluate(() => window.dispatchEvent(new Event("focus")));
    await refreshed;
    await expect(target.getByRole("button", { name: "Zapamiętałem — ukryj" })).toBeEnabled();
    const second = sameGame ? first : await createStorytellerGame(st, "Review private B", 13);
    if (!sameGame) await generateAndCommitSetup(st, second.gameId, second.version);
    const version = (await (await st.get(`/api/v1/games/${second.gameId}/storyteller`)).json()).version;
    const playerId = second.playerIds[sameGame ? 1 : 0];
    await claimPlayer(st, context.request, second.gameId, playerId, version);
    const accepted = target.waitForResponse(async response => response.url().endsWith("/api/v1/me") && response.ok() && (await response.json()).me.playerId === playerId);
    await target.evaluate(() => window.dispatchEvent(new Event("focus")));
    await accepted;
    await expect(target.getByRole("button", { name: "Pokaż moją rolę" })).toBeVisible();
    await expect(target.locator(".role-reveal")).toHaveCount(0);
    await target.getByRole("button", { name: "Pokaż moją rolę" }).click();
    await expect(target.getByRole("button", { name: "Zapamiętałem — ukryj" })).toBeEnabled();
    await context.close();
  });
}

for (const status of [401, 403]) {
  test(`E2E-10 review #2: command lock recovers after same-game ${status}`, async ({ page, browser }) => {
    const { target, context, endpoint } = await specimen("storyteller", page, browser);
    await target.clock.runFor(300);
    await target.getByRole("button", { name: "System", exact: true }).click();
    let fail = true;
    let commands = 0;
    target.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/checkpoints")) commands++; });
    await target.route(endpoint, route => fail ? route.fulfill({ status, json: { error: { code: "FORBIDDEN" } } }) : route.continue());
    await target.getByRole("button", { name: "Utwórz punkt kontrolny", exact: true }).click();
    await expect(target.getByRole("button", { name: "Spróbuj ponownie" })).toBeVisible();
    await expect(target.getByRole("button", { name: "Utwórz punkt kontrolny", exact: true })).toHaveCount(0);
    await expect(target.getByRole("button", { name: "System", exact: true })).toHaveCount(0);
    expect(commands).toBe(1);
    fail = false;
    await target.getByRole("button", { name: "Spróbuj ponownie" }).click();
    await target.clock.runFor(2100);
    await expect(target.getByRole("button", { name: "Utwórz punkt kontrolny", exact: true })).toBeEnabled();
    await target.getByRole("button", { name: "Utwórz punkt kontrolny", exact: true }).click();
    await expect.poll(() => commands).toBe(2);
    await expect(target.getByText("Punkt kontrolny utworzony — stan spójny.", { exact: true })).toBeVisible();
    await context.close();
  });
}

test("E2E-10 review #3: open camera rejects blocked delivery and accepts only acknowledged scan", async ({ page, browser }) => {
  const fixture = await createStorytellerGame(page.request, "Review camera", 13);
  const setup = await generateAndCommitSetup(page.request, fixture.gameId, fixture.version);
  const { contexts, sessions, version } = await claimAllPlayers(page.request, browser, fixture.gameId, fixture.playerIds, setup.version);
  const investigationVersion = await driveOperationalCycle(page.request, sessions, fixture.gameId, version);
  await commandVersion(await sessions[1].request.post(`/api/v1/games/${fixture.gameId}/scenario/qr/scan`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: investigationVersion, payload: { token: "tsf-qr-letter-001" } },
  }), investigationVersion);
  const target = await contexts[0].newPage();
  await controlledStream(target);
  await target.addInitScript(() => {
    window.BarcodeDetector = class {
      async detect() {
        const token = document.documentElement.dataset.scanToken;
        if (!token) return [];
        delete document.documentElement.dataset.scanToken;
        document.documentElement.dataset.decoded = String(Number(document.documentElement.dataset.decoded ?? 0) + 1);
        return [{ rawValue: token, format: "qr_code" }];
      }
    };
    navigator.mediaDevices.getUserMedia = async () => document.createElement("canvas").captureStream();
    HTMLMediaElement.prototype.play = async () => {};
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", { get: () => 4 });
  });
  await target.clock.install();
  await target.goto("/player?view=map");
  await target.getByRole("button", { name: "Pokaż moją rolę" }).click();
  await target.getByRole("button", { name: "Zapamiętałem — ukryj" }).click();
  await target.getByRole("button", { name: "Skanuj kod QR" }).click();
  const dialog = target.getByRole("dialog", { name: "Skaner kodów QR" });
  await dialog.getByRole("button", { name: "Skanuj kod QR" }).click();
  await expect(dialog.locator("video")).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  let commands = 0;
  await target.route("**/api/v1/me", async route => { reads++; const response = await route.fetch(); await held; await route.fulfill({ response }); });
  target.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/scenario/qr/scan")) commands++; });
  await target.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => reads).toBeGreaterThan(0);
  await target.evaluate(() => {
    document.documentElement.dataset.scanSuccessSeen = "false";
    new MutationObserver(() => {
      if (document.body.textContent?.includes("Skan przyjęty.")) document.documentElement.dataset.scanSuccessSeen = "true";
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await target.evaluate(() => { document.documentElement.dataset.scanToken = "tsf-qr-annex-001"; });
  await target.clock.runFor(100);
  await expect(target.locator("html")).toHaveAttribute("data-decoded", "1");
  expect(commands).toBe(0);
  await expect(target.locator("html")).toHaveAttribute("data-scan-success-seen", "false");
  await expect(dialog.getByText("Skan przyjęty.", { exact: true })).toHaveCount(0);
  release();
  await expect(dialog.getByRole("button", { name: "Skanuj kod QR" })).toBeVisible();
  // Retrying requires a new user gesture/token delivery, never automatic replay.
  await dialog.getByRole("button", { name: "Skanuj kod QR" }).click();
  let acknowledge!: () => void;
  const commandHeld = new Promise<void>(resolve => { acknowledge = resolve; });
  await target.route("**/scenario/qr/scan", async route => { const response = await route.fetch(); await commandHeld; await route.fulfill({ response }); });
  await target.evaluate(() => { document.documentElement.dataset.scanToken = "tsf-qr-annex-001"; });
  await target.clock.runFor(100);
  await expect.poll(() => commands).toBe(1);
  await expect(target.locator("html")).toHaveAttribute("data-scan-success-seen", "false");
  await expect(dialog.getByText("Skan przyjęty.", { exact: true })).toHaveCount(0);
  acknowledge();
  await expect(dialog.getByText("Skan przyjęty.", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Otrzymano nowy dowód/)).toBeVisible();
  expect(commands).toBe(1);
  for (const context of contexts) await context.close();
});

test("E2E-10 review #4: pending filtered head blocks the old visible cursor", async ({ page, browser }) => {
  const { target, context, fixture, st } = await specimen("storyteller", page, browser);
  await target.clock.runFor(300);
  await rename(st, fixture, "Reverse audit race");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let holdHead = false;
  let headFetched = false;
  let pages = 0;
  await target.route(`**/api/v1/games/${fixture.gameId}/storyteller/audit*`, async route => {
    const url = new URL(route.request().url());
    url.searchParams.set("limit", "2");
    if (url.searchParams.has("cursor")) pages++;
    const response = await route.fetch({ url: url.toString() });
    if (holdHead && !url.searchParams.has("cursor")) { headFetched = true; await held; }
    await route.fulfill({ response });
  });
  await target.getByRole("button", { name: "Audyt", exact: true }).click();
  await target.evaluate(() => window.dispatchEvent(new Event("focus")));
  const more = target.getByRole("button", { name: "Więcej", exact: true });
  await expect(more).toBeEnabled();
  holdHead = true;
  await target.getByRole("button", { name: "Scenariusz", exact: true }).last().click();
  await expect.poll(() => headFetched).toBe(true);
  await expect(more).toBeDisabled();
  // Attempt the still-visible old control; it must not send a cursor request.
  await more.evaluate(button => (button as HTMLButtonElement).click());
  expect(pages).toBe(0);
  release();
  await expect(target.getByText("0 zdarzeń", { exact: true })).toBeVisible();
  await expect(more).toHaveCount(0);
  expect(pages).toBe(0);
  await context.close();
});

test("E2E-10 review #5: same-document Storyteller disposal rejects held A completions in B", async ({ page }) => {
  const first = await createStorytellerGame(page.request, "Review document A", 1);
  await controlledStream(page);
  await page.goto("/");
  const sentinel = crypto.randomUUID();
  await page.evaluate(value => { Object.assign(window, { reviewDocument: value }); }, sentinel);
  await page.getByRole("link", { name: "Prowadzę grę" }).click();
  await expect(page.getByRole("heading", { name: "Review document A" })).toBeVisible();
  await page.getByRole("button", { name: "Gracze", exact: true }).click();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const fetched = new Set<string>();
  let released = 0;
  await page.route(`**/api/v1/games/${first.gameId}/**`, async route => {
    const url = route.request().url();
    if (url.includes("presence/") || url.includes("events/stream")) return route.continue();
    const response = await route.fetch();
    fetched.add(url.split("/").at(-1)!);
    await held;
    await route.fulfill({ response }).catch(() => {});
    released++;
  });
  await page.getByRole("button", { name: "Akcje dla: Player 0", exact: true }).click();
  await page.getByRole("button", { name: "Link do odbioru", exact: true }).click();
  await expect.poll(() => fetched.has("claim-token")).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => fetched.has("storyteller") && fetched.has("control") && fetched.has("audit")).toBe(true);
  const second = await createStorytellerGame(page.request, "Review document B", 1);
  await page.goBack();
  await expect(page.getByRole("link", { name: "Prowadzę grę" })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "reviewDocument"))).toBe(sentinel);
  const current = page.waitForResponse(response => response.url().endsWith("/api/v1/storyteller/current") && response.ok());
  await page.getByRole("link", { name: "Prowadzę grę" }).click();
  expect((await (await current).json()).gameId).toBe(second.gameId);
  await expect(page.getByRole("heading", { name: "Review document B" })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, "reviewDocument"))).toBe(sentinel);
  release();
  await expect.poll(() => released).toBeGreaterThanOrEqual(4);
  await expect(page.getByRole("heading", { name: "Review document B" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/Nie udało się wydać|Jednorazowy token/)).toHaveCount(0);
});

type Role = "player" | "storyteller";
async function specimen(role: Role, page: Page, browser: Browser) {
  const st = page.request;
  const fixture = await createStorytellerGame(st, `E2E-10 ${role}`, 1);
  const context = await browser.newContext({ baseURL: "http://localhost:3100" });
  if (role === "player") await claimPlayer(st, context.request, fixture.gameId, fixture.playerIds[0], fixture.version);
  const target = role === "player" ? await context.newPage() : page;
  await controlledStream(target);
  await target.clock.install();
  await target.goto(role === "player" ? "/player?view=people" : `/storyteller/${fixture.gameId}?view=players`);
  await expect(target.getByText("Player 0", { exact: true }).first()).toBeVisible();
  const endpoint = role === "player" ? "**/api/v1/me" : `**/api/v1/games/${fixture.gameId}/storyteller`;
  const current = await (await st.get(`/api/v1/games/${fixture.gameId}/storyteller`)).json();
  await emit(target, "open");
  await emit(target, "hello", { gameId: fixture.gameId, version: current.version });
  await expect(target.getByRole("status").filter({ hasText: "LIVE" }).first()).toBeVisible();
  return { target, context, st, fixture, endpoint };
}
async function rename(st: APIRequestContext, fixture: { gameId: string; playerIds: string[] }, displayName: string) {
  const before = await (await st.get(`/api/v1/games/${fixture.gameId}/storyteller`)).json();
  return commandVersion(await st.patch(`/api/v1/games/${fixture.gameId}/players/${fixture.playerIds[0]}`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: before.version, payload: { displayName } },
  }), before.version);
}
async function visibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate(state => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

async function controlledStream(page: Page) {
  await page.addInitScript(() => {
    class ControlledSource extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      readyState = 0;
      constructor(readonly url: string) {
        super();
        document.documentElement.dataset.activeStream = url;
        const receive = (event: Event) => {
          const { type, data } = (event as CustomEvent).detail;
          if (this.readyState === 2) return;
          if (type === "open") this.readyState = 1;
          if (type === "error") this.readyState = 0;
          this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
        };
        window.addEventListener("test:stream", receive);
        this.close = () => {
          this.readyState = 2;
          window.removeEventListener("test:stream", receive);
          document.documentElement.dataset.closedStreams = String(Number(document.documentElement.dataset.closedStreams ?? 0) + 1);
        };
      }
      close() { this.readyState = 2; }
    }
    Object.defineProperty(window, "EventSource", { value: ControlledSource });
  });
}
async function emit(page: Page, type: string, data?: unknown) {
  await page.evaluate(({ type, data }) => window.dispatchEvent(new CustomEvent("test:stream", { detail: { type, data } })), { type, data });
}

for (const role of ["player", "storyteller"] as const) {
  test(`E2E-10 ${role}: missed initial update requires applied post-open truth`, async ({ page, browser }) => {
    const st = page.request;
    const fixture = await createStorytellerGame(st, `E2E-10 ${role}`, 1);
    const playerContext = await browser.newContext({ baseURL: "http://localhost:3100" });
    let version = fixture.version;
    if (role === "player") version = (await claimPlayer(st, playerContext.request, fixture.gameId, fixture.playerIds[0], version)).version;
    const target = role === "player" ? await playerContext.newPage() : page;
    await controlledStream(target);
    await target.goto(role === "player" ? "/player?view=people" : `/storyteller/${fixture.gameId}?view=players`);
    await expect(target.getByText("Player 0", { exact: true }).first()).toBeVisible();
    version = await commandVersion(await st.patch(`/api/v1/games/${fixture.gameId}/players/${fixture.playerIds[0]}`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: version, payload: { displayName: "After missed update" } },
    }), version);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const endpoint = role === "player" ? "**/api/v1/me" : `**/api/v1/games/${fixture.gameId}/storyteller`;
    let requested = false;
    await target.route(endpoint, async route => { requested = true; const response = await route.fetch(); await held; await route.fulfill({ response }); });
    await emit(target, "open");
    await emit(target, "hello", { gameId: fixture.gameId, version });
    await expect(target.getByRole("status").filter({ hasText: "LIVE" })).toHaveCount(0);
    await expect.poll(() => requested).toBe(true);
    await expect(target.getByText("AKTUALIZACJA…", { exact: true }).first()).toBeVisible();
    if (role === "storyteller") {
      await target.getByPlaceholder("np. Ela").fill("Keep this draft");
      await expect(target.getByRole("button", { name: "Dodaj do kręgu" })).toBeDisabled();
    }
    release();
    await expect(target.getByText("After missed update", { exact: true }).first()).toBeVisible();
    await expect(target.getByRole("status").filter({ hasText: "LIVE" }).first()).toBeVisible();
    if (role === "storyteller") {
      await expect(target.getByPlaceholder("np. Ela")).toHaveValue("Keep this draft");
      await expect(target.getByRole("button", { name: "Dodaj do kręgu" })).toBeEnabled();
    }
    await playerContext.close();
  });

  test(`E2E-10 ${role}: reconnect failure, heartbeat, retry and HTTP-ready without SSE`, async ({ page, browser }) => {
    const { target, context, st, fixture, endpoint } = await specimen(role, page, browser);
    await emit(target, "error");
    const version = await rename(st, fixture, "Reconnect truth");
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let attempts = 0;
    await target.route(endpoint, async route => {
      attempts++;
      if (attempts === 1) {
        await held;
        await route.fulfill({ status: 503, json: { error: { code: "NETWORK", message: "Unavailable" } } });
      } else await route.continue();
    });
    await emit(target, "open");
    await emit(target, "hello", { gameId: fixture.gameId, version });
    await expect.poll(() => attempts).toBe(1);
    await target.evaluate(() => window.dispatchEvent(new Event("tsf:presence-heartbeat-ok")));
    await expect(target.getByRole("status").filter({ hasText: "LIVE" })).toHaveCount(0);
    if (role === "storyteller") {
      await target.getByPlaceholder("np. Ela").fill("Unsent draft");
      await expect(target.getByRole("button", { name: "Dodaj do kręgu" })).toBeDisabled();
    }
    release();
    await expect(target.getByRole("button", { name: "Spróbuj ponownie" }).first()).toBeVisible();
    await emit(target, "error");
    await target.getByRole("button", { name: "Spróbuj ponownie" }).first().click();
    await target.clock.runFor(2100);
    await expect(target.getByText("Reconnect truth", { exact: true }).first()).toBeVisible();
    await expect(target.getByRole("status").filter({ hasText: "ŁĄCZENIE…" }).first()).toBeVisible();
    if (role === "storyteller") await expect(target.getByRole("button", { name: "Dodaj do kręgu" })).toBeEnabled();
    expect(attempts).toBeGreaterThanOrEqual(2);
    await context.close();
  });

  test(`E2E-10 ${role}: lost invalidations converge, hidden fallback pauses, foreground catches up`, async ({ page, browser }) => {
    const { target, context, st, fixture, endpoint } = await specimen(role, page, browser);
    let reads = 0;
    await target.route(endpoint, route => { reads++; return route.continue(); });
    // Let any open/hello coalesced follow-up complete before measuring periodic work.
    await target.clock.runFor(300);
    await rename(st, fixture, "Fallback truth");
    await target.clock.runFor(30100);
    await expect(target.getByText("Fallback truth", { exact: true }).first()).toBeVisible();
    await visibility(target, "hidden");
    const hiddenReads = reads;
    await rename(st, fixture, "Foreground truth");
    await target.clock.runFor(60100);
    expect(reads).toBe(hiddenReads);
    await expect(target.getByText("Foreground truth", { exact: true })).toHaveCount(0);
    await target.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
      window.dispatchEvent(new Event("offline"));
    });
    await visibility(target, "visible");
    await target.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(target.getByText("Foreground truth", { exact: true }).first()).toBeVisible();
    await expect(target.getByRole("status").filter({ hasText: "OFFLINE" }).first()).toBeVisible();
    if (role === "storyteller") {
      await target.getByPlaceholder("np. Ela").fill("HTTP is authoritative");
      await expect(target.getByRole("button", { name: "Dodaj do kręgu" })).toBeEnabled();
    }
    await target.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
      window.dispatchEvent(new Event("online"));
    });
    await expect(target.getByRole("status").filter({ hasText: "LIVE" }).first()).toBeVisible();
    await context.close();
  });

  for (const obsolete of ["success", "failure"] as const) {
    test(`E2E-10 ${role}: deadline releases work; obsolete ${obsolete} cannot replace accepted truth`, async ({ page, browser }) => {
      const { target, context, st, fixture, endpoint } = await specimen(role, page, browser);
      await target.clock.runFor(300);
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      let reads = 0;
      await target.route(endpoint, async route => {
        reads++;
        if (reads !== 1) return route.continue();
        const old = await route.fetch();
        await held;
        if (obsolete === "success") await route.fulfill({ response: old }).catch(() => {});
        else await route.fulfill({ status: 503, json: { error: { code: "NETWORK", message: "Obsolete failure" } } }).catch(() => {});
      });
      await target.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect.poll(() => reads).toBe(1);
      const version = await rename(st, fixture, "Newest accepted truth");
      await emit(target, "invalidate", { gameId: fixture.gameId, version });
      await target.clock.runFor(15100);
      await expect(target.getByRole("status").filter({ hasText: "LIVE" })).toHaveCount(0);
      await target.clock.runFor(2100);
      await expect(target.getByText("Newest accepted truth", { exact: true }).first()).toBeVisible();
      await expect(target.getByRole("status").filter({ hasText: "LIVE" }).first()).toBeVisible();
      release();
      await target.clock.runFor(300);
      await expect(target.getByText("Newest accepted truth", { exact: true }).first()).toBeVisible();
      await expect(target.getByText("Obsolete failure", { exact: true })).toHaveCount(0);
      await expect(target.getByRole("status").filter({ hasText: "LIVE" }).first()).toBeVisible();
      await context.close();
    });
  }
}

test("E2E-10 native EventSource: disconnect/reconnect without a further notification reconciles HTTP truth", async ({ page }) => {
  const fixture = await createStorytellerGame(page.request, "E2E-10 native", 1);
  const initial = await (await page.request.get(`/api/v1/games/${fixture.gameId}/storyteller`)).json();
  let release!: () => void;
  const reconnect = new Promise<void>(resolve => { release = resolve; });
  let connections = 0;
  await page.route(`**/api/v1/games/${fixture.gameId}/events/stream`, async route => {
    if (++connections === 1) {
      // A real EventSource sees EOF and performs its native retry, not a synthetic open.
      await route.fulfill({ status: 200, contentType: "text/event-stream",
        body: `retry: 20\nevent: hello\ndata: ${JSON.stringify({ gameId: fixture.gameId, version: initial.version })}\n\n` });
    } else { await reconnect; await route.continue(); }
  });
  // Observe native events without replacing the browser's EventSource implementation.
  await page.addInitScript(() => {
    const NativeSource = window.EventSource;
    class ObservedSource extends NativeSource {
      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init);
        this.addEventListener("open", () => {
          const root = document.documentElement;
          root.dataset.nativeOpens = String(Number(root.dataset.nativeOpens ?? 0) + 1);
        });
      }
    }
    window.EventSource = ObservedSource;
  });
  await page.goto(`/storyteller/${fixture.gameId}?view=players`);
  await expect.poll(() => connections).toBeGreaterThanOrEqual(2);
  const opens = Number(await page.locator("html").getAttribute("data-native-opens"));
  await expect(page.getByRole("status").filter({ hasText: "LIVE" })).toHaveCount(0);
  await rename(page.request, fixture, "Native reconnect truth");
  release();
  await expect(page.getByText("Native reconnect truth", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "LIVE" }).first()).toBeVisible();
  await expect.poll(async () => Number(await page.locator("html").getAttribute("data-native-opens"))).toBeGreaterThan(opens);
});

test("E2E-10 player: role acknowledgement is disabled while catch-up is held, inspection stays available", async ({ page, browser }) => {
  const fixture = await createStorytellerGame(page.request, "E2E-10 role guard", 13);
  const setup = await generateAndCommitSetup(page.request, fixture.gameId, fixture.version);
  const context = await browser.newContext({ baseURL: "http://localhost:3100" });
  await claimPlayer(page.request, context.request, fixture.gameId, fixture.playerIds[0], setup.version);
  const target = await context.newPage();
  await controlledStream(target);
  await target.goto("/player?view=map");
  await target.getByRole("button", { name: "Pokaż moją rolę" }).click();
  await expect(target.getByRole("button", { name: "Zapamiętałem — ukryj" })).toBeEnabled();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await target.route("**/api/v1/me", async route => { const response = await route.fetch(); await held; await route.fulfill({ response }); });
  await emit(target, "open");
  await expect(target.getByRole("button", { name: "Zapamiętałem — ukryj" })).toBeDisabled();
  await expect(target.getByRole("status").filter({ hasText: "Aktualizacja sprawy…" })).toBeVisible();
  release();
  await expect(target.getByRole("button", { name: "Zapamiętałem — ukryj" })).toBeEnabled();
  await context.close();
});

test("E2E-10 storyteller: checkpoint acknowledgement survives refresh failure and retry never replays", async ({ page, browser }) => {
  const { target, context, endpoint } = await specimen("storyteller", page, browser);
  await target.getByRole("button", { name: "System", exact: true }).click();
  let fail = true;
  let commands = 0;
  target.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/checkpoints")) commands++; });
  await target.route(endpoint, route => fail ? route.fulfill({ status: 503, json: { error: { code: "NETWORK" } } }) : route.continue());
  await target.getByRole("button", { name: "Utwórz punkt kontrolny", exact: true }).click();
  await expect(target.getByText("Punkt kontrolny utworzony — stan spójny.", { exact: true })).toBeVisible();
  await expect(target.getByRole("button", { name: "Utwórz punkt kontrolny", exact: true })).toBeDisabled();
  await expect(target.getByRole("button", { name: "Spróbuj ponownie" })).toBeEnabled();
  expect(commands).toBe(1);
  fail = false;
  await target.getByRole("button", { name: "Spróbuj ponownie" }).click();
  await target.clock.runFor(2100);
  await expect(target.getByRole("button", { name: "Utwórz punkt kontrolny", exact: true })).toBeEnabled();
  expect(commands).toBe(1);
  await context.close();
});

test("E2E-10 storyteller: conflict and failed refresh remain distinct without unhandled rejection or replay", async ({ page, browser }) => {
  const { target, context, endpoint, st, fixture } = await specimen("storyteller", page, browser);
  const errors: string[] = [];
  target.on("pageerror", error => errors.push(error.message));
  await target.clock.runFor(300);
  await rename(st, fixture, "Changed in another session");
  let fail = true;
  let commands = 0;
  target.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/players")) commands++; });
  await target.route(endpoint, route => fail ? route.fulfill({ status: 503, json: { error: { code: "NETWORK" } } }) : route.continue());
  await target.getByPlaceholder("np. Ela").fill("Must not be added");
  await target.getByRole("button", { name: "Dodaj do kręgu" }).click();
  await expect(target.getByText(/Ta sprawa zmieniła się w innej karcie/)).toBeVisible();
  await expect(target.getByRole("button", { name: "Spróbuj ponownie" })).toBeVisible();
  await expect(target.getByRole("button", { name: "Dodaj do kręgu" })).toBeDisabled();
  fail = false;
  await target.getByRole("button", { name: "Spróbuj ponownie" }).click();
  await target.clock.runFor(2100);
  await expect(target.getByText("Changed in another session", { exact: true }).first()).toBeVisible();
  expect(commands).toBe(1);
  expect(errors).toEqual([]);
  const persisted = await (await st.get(`/api/v1/games/${fixture.gameId}/storyteller`)).json();
  expect(persisted.players).toHaveLength(1);
  await context.close();
});

test("E2E-10 player: acknowledged QR result survives failed projection and manual retry never rescans", async ({ page, browser }) => {
  const fixture = await createStorytellerGame(page.request, "E2E-10 QR ack", 13);
  const setup = await generateAndCommitSetup(page.request, fixture.gameId, fixture.version);
  const { contexts, sessions, version } = await claimAllPlayers(page.request, browser, fixture.gameId, fixture.playerIds, setup.version);
  const investigationVersion = await driveOperationalCycle(page.request, sessions, fixture.gameId, version);
  await commandVersion(await sessions[1].request.post(`/api/v1/games/${fixture.gameId}/scenario/qr/scan`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: investigationVersion, payload: { token: "tsf-qr-letter-001" } },
  }), investigationVersion);
  const target = await contexts[0].newPage();
  await controlledStream(target);
  await target.clock.install();
  await target.goto("/player?view=map");
  await target.getByRole("button", { name: "Pokaż moją rolę" }).click();
  await target.getByRole("button", { name: "Zapamiętałem — ukryj" }).click();
  await target.getByRole("button", { name: "Skanuj kod QR" }).click();
  let fail = true;
  let commands = 0;
  target.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/scenario/qr/scan")) commands++; });
  await target.route("**/api/v1/me", route => fail ? route.fulfill({ status: 503, json: { error: { code: "NETWORK" } } }) : route.continue());
  await target.evaluate(() => window.dispatchEvent(new CustomEvent("tsf:qr-simulate", { detail: "tsf-qr-annex-001" })));
  await expect(target.getByText("Otrzymano nowy dowód. Mapa rozszerzona odblokowana — aneks dołączony do akt.", { exact: true })).toBeVisible();
  expect(commands).toBe(1);
  await target.getByRole("button", { name: "Zamknij okno" }).click();
  await expect(target.getByRole("button", { name: "Skanuj kod QR" })).toBeDisabled();
  fail = false;
  await target.getByRole("button", { name: "Spróbuj ponownie" }).click();
  await target.clock.runFor(2100);
  await expect(target.getByRole("button", { name: "Skanuj kod QR" })).toBeEnabled();
  expect(commands).toBe(1);
  const persisted = await (await sessions[0].request.get("/api/v1/me")).json();
  expect(persisted.scenario.clues.length).toBeGreaterThan(0);
  expect(persisted.scenario.mapVersionId).toBe("MAP_EXTENDED");
  for (const context of contexts) await context.close();
});

test("E2E-10 storyteller: audit filter/head invalidates held pagination and current retry clears pane failure", async ({ page, browser }) => {
  const { target, context, fixture, st } = await specimen("storyteller", page, browser);
  await target.clock.runFor(300);
  const version = await rename(st, fixture, "Audit specimen");
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let pageHeld = false;
  let failHead = false;
  let duplicatePage = false;
  await target.route(`**/api/v1/games/${fixture.gameId}/storyteller/audit*`, async route => {
    const url = new URL(route.request().url());
    if (failHead && !url.searchParams.has("cursor")) return route.fulfill({ status: 503, json: { error: { code: "NETWORK" } } });
    url.searchParams.set("limit", "2");
    if (duplicatePage && url.searchParams.has("cursor")) url.searchParams.set("cursor", String(Number(url.searchParams.get("cursor")) + 1));
    const response = await route.fetch({ url: url.toString() });
    if (url.searchParams.has("cursor")) { pageHeld = true; await held; }
    await route.fulfill({ response });
  });
  await target.getByRole("button", { name: "Audyt", exact: true }).click();
  await emit(target, "invalidate", { gameId: fixture.gameId, version });
  await target.clock.runFor(200);
  await expect(target.getByText("2 zdarzeń", { exact: true })).toBeVisible();
  await target.getByRole("button", { name: "Więcej", exact: true }).click();
  await expect.poll(() => pageHeld).toBe(true);
  await target.getByRole("button", { name: "Scenariusz", exact: true }).last().click();
  await expect(target.getByText("0 zdarzeń", { exact: true })).toBeVisible();
  release();
  await target.clock.runFor(300);
  await expect(target.getByText("0 zdarzeń", { exact: true })).toBeVisible();
  failHead = true;
  await target.getByRole("button", { name: "Silnik gry", exact: true }).click();
  await expect(target.getByRole("button", { name: "Odśwież dziennik" })).toBeVisible();
  failHead = false;
  await target.getByRole("button", { name: "Odśwież dziennik" }).click();
  await expect(target.getByRole("button", { name: "Odśwież dziennik" })).toHaveCount(0);
  await expect(target.getByText("2 zdarzeń", { exact: true })).toBeVisible();
  duplicatePage = true;
  await target.getByRole("button", { name: "Więcej", exact: true }).click();
  await expect(target.getByText("3 zdarzeń", { exact: true })).toBeVisible();
  await expect(target.getByRole("button", { name: "Pokaż szczegóły zdarzenia #2", exact: true })).toHaveCount(1);
  await context.close();
});

test("E2E-10 player: latest discovery changes game scope and obsolete /me cannot restore the old identity", async ({ page, browser }) => {
  const { target, context, fixture, st } = await specimen("player", page, browser);
  await target.clock.runFor(300);
  const oldClosed = Number(await target.locator("html").getAttribute("data-closed-streams"));
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let oldFetched = false;
  let requests = 0;
  await target.route("**/api/v1/me", async route => {
    if (++requests !== 1) return route.continue();
    const old = await route.fetch();
    oldFetched = true;
    await held;
    await route.fulfill({ response: old }).catch(() => {});
  });
  await target.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => oldFetched).toBe(true);
  const second = await createStorytellerGame(st, "Second player game", 1);
  const renamed = await rename(st, second, "Only new identity");
  await claimPlayer(st, context.request, second.gameId, second.playerIds[0], renamed);
  await target.clock.runFor(17300);
  await expect(target.getByText("Only new identity", { exact: true }).first()).toBeVisible();
  await expect(target.locator("html")).toHaveAttribute("data-active-stream", `/api/v1/games/${second.gameId}/events/stream`);
  expect(Number(await target.locator("html").getAttribute("data-closed-streams"))).toBeGreaterThan(oldClosed);
  release();
  await target.clock.runFor(300);
  await expect(target.getByText("Only new identity", { exact: true }).first()).toBeVisible();
  await expect(target.getByText("Player 0", { exact: true })).toHaveCount(0);
  expect(fixture.gameId).not.toBe(second.gameId);
  await context.close();
});

test("E2E-10 storyteller: old game/control/audit and claim completion cannot write into a different game", async ({ page, browser }) => {
  const { target, context, fixture, st } = await specimen("storyteller", page, browser);
  await target.clock.runFor(300);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const fetched = new Set<string>();
  await target.route(`**/api/v1/games/${fixture.gameId}/**`, async route => {
    const url = route.request().url();
    if (url.includes("presence/") || url.includes("events/stream")) return route.continue();
    const response = await route.fetch();
    fetched.add(url.split("/").at(-1)!);
    await held;
    await route.fulfill({ response }).catch(() => {});
  });
  // The claim command really commits, but its one-time response stays with A.
  await target.getByRole("button", { name: "Akcje dla: Player 0", exact: true }).click();
  await target.getByRole("button", { name: "Link do odbioru", exact: true }).click();
  await expect.poll(() => fetched.has("claim-token")).toBe(true);
  await target.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => fetched.has("storyteller") && fetched.has("control") && fetched.has("audit")).toBe(true);
  const second = await createStorytellerGame(st, "Only game B", 1);
  await target.goto(`/storyteller/${second.gameId}?view=players`);
  await expect(target.getByRole("heading", { name: "Only game B" })).toBeVisible();
  release();
  await target.clock.runFor(300);
  await expect(target.getByRole("heading", { name: "Only game B" })).toBeVisible();
  await expect(target.getByRole("dialog")).toHaveCount(0);
  await expect(target.getByText(/Nie udało się wydać|Jednorazowy token/)).toHaveCount(0);
  await context.close();
});

test("E2E-10 storyteller: obsolete control failure cannot replace equal-version success; current failure is honest", async ({ page, browser }) => {
  const { target, context, fixture } = await specimen("storyteller", page, browser);
  await target.clock.runFor(300);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  let failCurrent = false;
  await target.route(`**/api/v1/games/${fixture.gameId}/storyteller/control`, async route => {
    if (++requests === 1) {
      await held;
      return route.fulfill({ status: 503, json: { error: { code: "NETWORK" } } });
    }
    if (failCurrent) return route.fulfill({ status: 503, json: { error: { code: "NETWORK" } } });
    return route.continue();
  });
  await target.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => requests).toBe(1);
  const currentResponse = target.waitForResponse(response => response.url().endsWith("/control") && response.ok());
  await emit(target, "invalidate", { gameId: fixture.gameId, version: 0 });
  await target.clock.runFor(200);
  await currentResponse;
  release();
  await target.clock.runFor(300);
  await expect(target.getByRole("button", { name: "Odśwież panel" })).toHaveCount(0);
  failCurrent = true;
  await target.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(target.getByRole("button", { name: "Odśwież panel" })).toBeVisible();
  failCurrent = false;
  await target.getByRole("button", { name: "Odśwież panel" }).click();
  await expect(target.getByRole("button", { name: "Odśwież panel" })).toHaveCount(0);
  await context.close();
});

test("E2E-10 commands: action, nomination and vote await projection without resetting selections", async ({ page, browser }) => {
  const fixture = await createStorytellerGame(page.request, "E2E-10 guarded gameplay", 13);
  const setup = await generateAndCommitSetup(page.request, fixture.gameId, fixture.version);
  const { contexts, sessions, version } = await claimAllPlayers(page.request, browser, fixture.gameId, fixture.playerIds, setup.version);
  const st = page.request;
  const started = await commandVersion(await st.post(`/api/v1/games/${fixture.gameId}/operational/start`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: version },
  }), version);
  let operational = await (await st.get(`/api/v1/games/${fixture.gameId}/storyteller`)).json();
  for (let guard = 0; guard < 100; guard++) {
    const waiting = operational.operational.actions.find((a: { status: string }) => a.status === "WAITING_FOR_STORYTELLER");
    if (!waiting) break;
    await commandVersion(await st.post(`/api/v1/games/${fixture.gameId}/storyteller/actions/${waiting.id}/resolve`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: operational.version, payload: {} },
    }), operational.version);
    operational = await (await st.get(`/api/v1/games/${fixture.gameId}/storyteller`)).json();
  }
  const action = operational.operational.actions.find((a: { status: string }) => a.status === "WAITING_FOR_PLAYER");
  expect(action).toBeDefined();
  const actor = sessions.findIndex(s => s.playerId === action.actorPlayerId);
  const target = await contexts[actor].newPage();
  await controlledStream(target);
  await target.goto("/player");
  await target.getByRole("button", { name: "Pokaż moją rolę" }).click();
  await target.getByRole("button", { name: "Zapamiętałem — ukryj" }).click();
  await expect(target.getByRole("button", { name: "Zatwierdź wybór" })).toBeVisible();
  // Choosing targets is still possible while the authoritative read is held.
  let release!: () => void;
  let hold = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  await target.route("**/api/v1/me", async route => { const response = await route.fetch(); if (hold) await held; await route.fulfill({ response }); });
  hold = true;
  await emit(target, "open");
  await expect(target.getByRole("button", { name: "Zatwierdź wybór" })).toBeDisabled();
  release(); hold = false;
  // Finish the current cycle with the same fixed specimen, using the discovered action targets.
  // driveOperationalCycle starts a cycle, so finish this already-started queue explicitly.
  let v = (await (await st.get(`/api/v1/games/${fixture.gameId}/storyteller`)).json()).version;
  expect(v).toBeGreaterThan(started);
  for (let guard = 0; guard < 100; guard++) {
    const current = await (await st.get(`/api/v1/games/${fixture.gameId}/storyteller`)).json();
    const active = current.operational.actions.find((a: { status: string }) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER");
    if (!active) break;
    if (active.status === "WAITING_FOR_PLAYER") {
      const session = sessions.find(s => s.playerId === active.actorPlayerId)!;
      const others = current.players.filter((p: { id: string }) => p.id !== active.actorPlayerId).map((p: { id: string }) => p.id);
      v = await commandVersion(await session.request.post(`/api/v1/games/${fixture.gameId}/operational/actions/${active.id}/submit`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: current.version, payload: { targetPlayerIds: others.slice(0, active.kind === "FORTUNE_TELLER_CHOOSE" ? 2 : 1) } },
      }), current.version);
    } else v = await commandVersion(await st.post(`/api/v1/games/${fixture.gameId}/storyteller/actions/${active.id}/resolve`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: current.version, payload: {} },
    }), current.version);
  }
  v = await commandVersion(await st.post(`/api/v1/games/${fixture.gameId}/operational/complete`, { data: { commandId: crypto.randomUUID(), expectedVersion: v } }), v);
  await controlledStream(page);
  await page.goto(`/storyteller/${fixture.gameId}`);
  let closeCommands = 0;
  page.on("request", request => { if (request.method() === "POST" && request.url().endsWith("/investigation/close")) closeCommands++; });
  await page.getByRole("button", { name: "Zamknij śledztwo", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Zamknij śledztwo", exact: true })).toBeVisible();
  v = await commandVersion(await st.post(`/api/v1/games/${fixture.gameId}/storyteller/checkpoints`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { reason: "Renewed confirmation required" } },
  }), v);
  await emit(page, "invalidate", { gameId: fixture.gameId, version: v });
  await expect(page.getByRole("dialog", { name: "Zamknij śledztwo", exact: true })).toHaveCount(0);
  expect(closeCommands).toBe(0);
  v = await commandVersion(await st.post(`/api/v1/games/${fixture.gameId}/investigation/nominations/open`, { data: { commandId: crypto.randomUUID(), expectedVersion: v } }), v);
  await emit(target, "invalidate", { gameId: fixture.gameId, version: v });
  await expect(target.getByRole("heading", { name: "Kogo nominujesz?" })).toBeVisible();
  await target.getByRole("button", { name: /Player 0/ }).first().click();
  // Hold another boundary without resetting the selected nominee.
  let releaseNomination!: () => void;
  const nominationRead = new Promise<void>(resolve => { releaseNomination = resolve; });
  await target.route("**/api/v1/me", async route => { const response = await route.fetch(); await nominationRead; await route.fulfill({ response }); });
  await target.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(target.getByRole("button", { name: "Nominuj", exact: true })).toBeDisabled();
  releaseNomination();
  await expect(target.getByRole("button", { name: "Nominuj", exact: true })).toBeEnabled();
  const nominee = fixture.playerIds.find(id => id !== sessions[actor].playerId)!;
  const nominated = await sessions[actor].request.post(`/api/v1/games/${fixture.gameId}/nominations`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { nomineeId: nominee } },
  });
  v = await commandVersion(nominated, v);
  const nominationId = (await nominated.json()).nominationId;
  v = await commandVersion(await st.post(`/api/v1/games/${fixture.gameId}/nominations/${nominationId}/voting/start`, { data: { commandId: crypto.randomUUID(), expectedVersion: v } }), v);
  const voting = await (await st.get(`/api/v1/games/${fixture.gameId}/storyteller`)).json();
  const seat = voting.nominations.find((n: { id: string }) => n.id === nominationId).currentVirtualSeat;
  const voterIndex = voting.players.findIndex((p: { virtualSeat: number }) => p.virtualSeat === seat);
  const votePage = await contexts[voterIndex].newPage();
  await controlledStream(votePage);
  await votePage.goto("/player");
  if (voterIndex !== actor) {
    await votePage.getByRole("button", { name: "Pokaż moją rolę" }).click();
    await votePage.getByRole("button", { name: "Zapamiętałem — ukryj" }).click();
  }
  await expect(votePage.getByRole("button", { name: "TAK", exact: true })).toBeVisible();
  let releaseVote!: () => void;
  const voteRead = new Promise<void>(resolve => { releaseVote = resolve; });
  await votePage.route("**/api/v1/me", async route => { const response = await route.fetch(); await voteRead; await route.fulfill({ response }); });
  await votePage.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(votePage.getByRole("button", { name: "TAK", exact: true })).toBeDisabled();
  releaseVote();
  await expect(votePage.getByRole("button", { name: "TAK", exact: true })).toBeEnabled();
  for (const context of contexts) await context.close();
});
