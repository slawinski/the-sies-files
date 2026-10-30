// UX screenshot capture (audit 21 §18 / spec 19 §13) — drives a real game to
// the investigation phase and captures the redesigned screens at the canonical
// acceptance sizes. Run with the dev server + test DB up:
//
//   bash scripts/reset-e2e-db.sh
//   DATABASE_URL=postgresql://$USER@localhost:5432/the_sies_files_test \
//     RATE_LIMIT_DISABLED=1 npm run dev -- --port 3100 &
//   npx tsx scripts/capture-ux-screenshots.mts

import { chromium } from "@playwright/test";

const BASE = "http://localhost:3100";
const OUT = "playwright-report/ux-screenshots";

async function main() {
  const browser = await chromium.launch();
  const stContext = await browser.newContext({ baseURL: BASE });
  const st = stContext.request;

  // 1. Create a 13-player game, commit setup, claim everyone, drive the cycle.
  const created = await st.post("/api/v1/games", { data: { name: "Screenshot Case" } });
  const game = await created.json();
  let v: number = game.version;
  const playerIds: string[] = [];
  for (let i = 0; i < 13; i += 1) {
    const res = await st.post(`/api/v1/games/${game.gameId}/players`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { displayName: `Player ${i}` } },
    });
    const body = await res.json();
    v = body.version;
    playerIds.push(body.playerId);
  }
  const generated = await st.post(`/api/v1/games/${game.gameId}/setup/generate`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v },
  });
  const committed = await st.post(`/api/v1/games/${game.gameId}/setup/commit`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: (await generated.json()).version },
  });
  v = (await committed.json()).version;

  const playerContexts: Array<{ id: string; ctx: import("@playwright/test").BrowserContext }> = [];
  for (const playerId of playerIds) {
    const ctx = await browser.newContext({ baseURL: BASE });
    const claimRes = await st.post(`/api/v1/games/${game.gameId}/players/${playerId}/claim-token`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v },
    });
    const claimBody = await claimRes.json();
    v = claimBody.version;
    const claim = await ctx.request.post("/api/v1/player-claims/claim", {
      data: { token: claimBody.claimToken, commandId: crypto.randomUUID() },
    });
    v = (await claim.json()).version;
    playerContexts.push({ id: playerId, ctx });
  }

  // Drive the operational cycle through the API.
  const started = await st.post(`/api/v1/games/${game.gameId}/operational/start`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v },
  });
  v = (await started.json()).version;
  for (let guard = 0; guard < 100; guard += 1) {
    const projection = await (await st.get(`/api/v1/games/${game.gameId}/storyteller`)).json();
    const active = (projection.operational?.actions ?? []).find(
      (a: { status: string }) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER",
    );
    if (!active) break;
    if (active.status === "WAITING_FOR_PLAYER") {
      const session = playerContexts.find((p) => p.id === active.actorPlayerId)!;
      const others = projection.players
        .filter((p: { id: string; alive: boolean }) => p.alive && p.id !== active.actorPlayerId)
        .map((p: { id: string }) => p.id);
      const chosen = active.kind === "FORTUNE_TELLER_CHOOSE" ? others.slice(0, 2) : others.slice(0, 1);
      const res = await session.ctx.request.post(`/api/v1/games/${game.gameId}/operational/actions/${active.id}/submit`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { targetPlayerIds: chosen } },
      });
      v = (await res.json()).version;
    } else {
      const res = await st.post(`/api/v1/games/${game.gameId}/storyteller/actions/${active.id}/resolve`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: {} },
      });
      v = (await res.json()).version;
    }
  }
  const complete = await st.post(`/api/v1/games/${game.gameId}/operational/complete`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v },
  });
  v = (await complete.json()).version;

  // Deliver one clue for journal content.
  const scan = await playerContexts[0].ctx.request.post(`/api/v1/games/${game.gameId}/scenario/qr/scan`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { token: "tsf-qr-letter-001" } },
  });
  v = (await scan.json()).version;

  // 2. Player screenshots (Pixel 7, 390x844-ish).
  const playerPage = await playerContexts[0].ctx.newPage();
  await playerPage.setViewportSize({ width: 390, height: 844 });
  await playerPage.goto("/player");
  await playerPage.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await playerPage.getByRole("button", { name: "Pokaż moją rolę" }).click();
  await playerPage.screenshot({ path: `${OUT}/player-1-role-reveal.png`, fullPage: true });
  await playerPage.getByRole("button", { name: "Zapamiętałem — ukryj" }).click();
  await playerPage.locator(".map-viewport").waitFor();
  await playerPage.screenshot({ path: `${OUT}/player-2-akta.png`, fullPage: true });
  await playerPage.getByRole("button", { name: "Gracze" }).click();
  await playerPage.waitForURL(/view=people/);
  await playerPage.screenshot({ path: `${OUT}/player-3-gracze.png`, fullPage: true });
  console.log("url after gracze:", playerPage.url());
  console.log("buttons:", await playerPage.getByRole("button").allTextContents());
  await playerPage.getByRole("button", { name: "Dziennik" }).click();
  await playerPage.screenshot({ path: `${OUT}/player-4-dziennik.png`, fullPage: true });
  await playerPage.getByRole("button", { name: "Mapa" }).click();
  await playerPage.screenshot({ path: `${OUT}/player-5-mapa.png`, fullPage: true });
  await playerPage.getByRole("button", { name: "Skanuj kod QR" }).click();
  await playerPage.screenshot({ path: `${OUT}/player-6-skaner.png` });

  // 3. Storyteller screenshots (tablet 1280x800).
  const stPage = await stContext.newPage();
  await stPage.setViewportSize({ width: 1280, height: 800 });
  await stPage.goto(`/storyteller/${game.gameId}`);
  await stPage.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await stPage.screenshot({ path: `${OUT}/st-1-control.png`, fullPage: true });
  for (const view of ["players", "grimoire", "scenario", "audit", "system"]) {
    await stPage.getByRole("button", { name: new RegExp(`^${view === "players" ? "Gracze" : view === "grimoire" ? "Grimuar" : view === "scenario" ? "Scenariusz" : view === "audit" ? "Audyt" : "System"}$`, "i") }).first().click();
    await stPage.waitForTimeout(250);
    await stPage.screenshot({ path: `${OUT}/st-${view}.png`, fullPage: true });
  }

  // 4. Landing / claim / storyteller entry.
  await stPage.goto("/");
  await stPage.screenshot({ path: `${OUT}/landing.png`, fullPage: true });

  await browser.close();
  console.log(`Screenshots written to ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
