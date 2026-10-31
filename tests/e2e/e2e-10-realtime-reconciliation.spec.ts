import { test, expect, type Page } from "@playwright/test";
import { claimPlayer, commandVersion, createStorytellerGame } from "./fixtures";

async function controlledStream(page: Page) {
  await page.addInitScript(() => {
    class ControlledSource extends EventTarget {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSED = 2;
      readyState = 0;
      constructor(readonly url: string) {
        super();
        const receive = (event: Event) => {
          const { type, data } = (event as CustomEvent).detail;
          if (this.readyState === 2) return;
          if (type === "open") this.readyState = 1;
          if (type === "error") this.readyState = 0;
          this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
        };
        window.addEventListener("test:stream", receive);
        this.close = () => { this.readyState = 2; window.removeEventListener("test:stream", receive); };
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
    release();
    await expect(target.getByText("After missed update", { exact: true }).first()).toBeVisible();
    await expect(target.getByRole("status").filter({ hasText: "LIVE" }).first()).toBeVisible();
    await playerContext.close();
  });
}
