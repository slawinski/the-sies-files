import { test, expect } from "@playwright/test";
import { createStorytellerGame, generateAndCommitSetup, driveOperationalCycle, claimAllPlayers, commandVersion } from "./fixtures";

// E2E-09 — UX shell regression (UX audit 18 / spec 19 §13): the redesigned
// player shell exposes four stable destinations, the deliberate role reveal
// gates everything, evidence lands in the journal, and the scanner opens as a
// bottom sheet on the dedicated map destination.
test("E2E-09: player shell — reveal gate, bottom nav, journal, scanner sheet", async ({ page, browser }) => {
  const st = page.request;
  const { gameId, playerIds, version } = await createStorytellerGame(st, "E2E-09", 13);
  await generateAndCommitSetup(st, gameId, version);
  let v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;

  const { sessions, contexts } = await claimAllPlayers(st, browser, gameId, playerIds, v);
  v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  v = await driveOperationalCycle(st, sessions, gameId, v); // now INVESTIGATION

  // Deliver one clue so the journal has content.
  const p0 = sessions[0].request;
  const scanLetter = await p0.post(`/api/v1/games/${gameId}/scenario/qr/scan`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { token: "tsf-qr-letter-001" } },
  });
  expect(scanLetter.ok()).toBeTruthy();
  const deepLinkProjection = await (await sessions[1].request.get("/api/v1/me")).json();
  expect(deepLinkProjection.scenario.clues.length).toBeGreaterThan(0);

  const playerPage = await contexts[0].newPage();
  // Bookmarks and reloads must gate every destination, even with delivered clues.
  for (const [index, view] of ["people", "journal", "map"].entries()) {
    const deepLinkPage = await contexts[index + 1].newPage();
    await deepLinkPage.goto(`/player?view=${view}`);
    await deepLinkPage.reload();
    await expect(deepLinkPage.getByRole("button", { name: "Pokaż moją rolę" })).toBeVisible();
    await expect(deepLinkPage.getByText("Player 12", { exact: true })).toHaveCount(0);
    await expect(deepLinkPage.getByText("Otrzymano nową wskazówkę")).toHaveCount(0);
    await expect(deepLinkPage.locator(".map-viewport")).toHaveCount(0);
    await expect(deepLinkPage.getByRole("navigation", { name: "Nawigacja gracza" })).toHaveCount(0);
    await deepLinkPage.getByRole("button", { name: "Pokaż moją rolę" }).click();
    await expect(deepLinkPage.getByRole("button", { name: "Zapamiętałem — ukryj" })).toBeVisible();
    await deepLinkPage.reload();
    await expect(deepLinkPage.getByRole("button", { name: "Pokaż moją rolę" })).toBeVisible();
    await expect(deepLinkPage.getByRole("button", { name: "Zapamiętałem — ukryj" })).toHaveCount(0);
    await deepLinkPage.getByRole("button", { name: "Pokaż moją rolę" }).click();
    await deepLinkPage.getByRole("button", { name: "Zapamiętałem — ukryj" }).click();
    await expect(deepLinkPage).toHaveURL(new RegExp(`view=${view}`));
    await expect(deepLinkPage.getByRole("navigation", { name: "Nawigacja gracza" })).toBeVisible();
    if (view === "people") await expect(deepLinkPage.getByText("Player 12", { exact: true })).toBeVisible();
    if (view === "journal") await expect(deepLinkPage.getByText("Otrzymano nową wskazówkę")).toBeVisible();
    if (view === "map") await expect(deepLinkPage.getByRole("button", { name: "Skanuj kod QR" })).toBeVisible();
    await deepLinkPage.reload();
    await expect(deepLinkPage.getByRole("navigation", { name: "Nawigacja gracza" })).toBeVisible();
    await expect(deepLinkPage.getByRole("button", { name: "Pokaż moją rolę" })).toHaveCount(0);
    await deepLinkPage.close();
  }
  await playerPage.goto("/player");
  // The Next.js dev-mode indicator portal sits at the bottom-left and would
  // intercept pointer events over the first bottom-nav item ("Akta"). It is a
  // dev-server artifact only — hide it for interaction fidelity.
  await playerPage.addStyleTag({ content: "nextjs-portal { display: none; }" });

  // The reveal gate owns the first viewport; the bottom nav stays hidden.
  await expect(playerPage.getByRole("button", { name: "Pokaż moją rolę" })).toBeVisible();
  await expect(playerPage.getByRole("navigation", { name: "Nawigacja gracza" })).toHaveCount(0);
  await playerPage.getByRole("button", { name: "Pokaż moją rolę" }).click();
  await playerPage.getByRole("button", { name: "Zapamiętałem — ukryj" }).click();

  // Akta: the four destinations + current state.
  const nav = playerPage.getByRole("navigation", { name: "Nawigacja gracza" });
  await expect(nav).toBeVisible();
  for (const label of ["Akta", "Gracze", "Dziennik", "Mapa"]) {
    await expect(nav.getByRole("button", { name: label })).toBeVisible();
  }
  await expect(nav.getByRole("button", { name: "Akta" })).toHaveAttribute("aria-current", "page");
  await expect(playerPage.locator(".map-viewport")).toBeVisible();

  // Gracze: public roster, URL-addressable.
  await nav.getByRole("button", { name: "Gracze" }).click();
  await expect(playerPage).toHaveURL(/view=people/);
  await expect(playerPage.getByText("Player 0", { exact: true })).toBeVisible();
  await expect(playerPage.getByText("Player 12", { exact: true })).toBeVisible();

  // Dziennik: the delivered clue appears as a timeline event.
  await nav.getByRole("button", { name: "Dziennik" }).click();
  await expect(playerPage).toHaveURL(/view=journal/);
  await expect(playerPage.getByText("Otrzymano nową wskazówkę")).toBeVisible();

  // Mapa: dedicated destination with the scanner bottom sheet.
  await nav.getByRole("button", { name: "Mapa" }).click();
  await expect(playerPage).toHaveURL(/view=map/);
  await playerPage.getByRole("button", { name: "Skanuj kod QR" }).click();
  const dialog = playerPage.getByRole("dialog", { name: "Skaner kodów QR" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Zamknij okno" }).click();
  await expect(dialog).toHaveCount(0);

  // Back to Akta restores the case view.
  await nav.getByRole("button", { name: "Akta" }).click();
  await expect(playerPage).toHaveURL("/player");
  await expect(playerPage.locator(".map-viewport")).toBeVisible();

  for (const context of contexts) await context.close();
});

test("E2E-09 privacy: cover removes queue identities and every private destination", async ({ page }) => {
  const st = page.request;
  const { gameId, version } = await createStorytellerGame(st, "E2E-09 privacy", 13);
  const setup = await generateAndCommitSetup(st, gameId, version);
  await commandVersion(await st.post(`/api/v1/games/${gameId}/operational/start`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: setup.version },
  }), setup.version);
  await page.goto(`/storyteller/${gameId}`);
  await expect(page.getByText("Kolejka operacyjna", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Zasłoń", exact: true }).click();
  await expect(page.getByText("Player 0", { exact: true })).toHaveCount(0);
  for (const role of ["Śledczy", "Wróżbitka", "Szpieg"]) {
    await expect(page.getByText(role, { exact: true })).toHaveCount(0);
  }
  await expect(page.locator("ol")).toHaveCount(0);
  await expect(page.getByText(/Zasłonięto/)).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Sekcje prowadzącego" });
  for (const label of ["Gracze", "Grimuar", "Scenariusz", "Audyt", "System", "Control"]) {
    await nav.getByRole("button", { name: label, exact: true }).click();
    await expect(page.getByText(/Zasłonięto/)).toBeVisible();
    await expect(page.locator("ol")).toHaveCount(0);
    await expect(page.getByText("Player 0", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Odkryj", exact: true }).click();
  await expect(page.getByText("Kolejka operacyjna", { exact: true })).toBeVisible();
});

test("E2E-09 closure: no-execution day can open nominations and close through Control", async ({ page, browser }) => {
  const st = page.request;
  const { gameId, playerIds, version } = await createStorytellerGame(st, "E2E-09 closure", 13);
  const setup = await generateAndCommitSetup(st, gameId, version);
  const { sessions, contexts, version: claimedVersion } = await claimAllPlayers(st, browser, gameId, playerIds, setup.version);
  await driveOperationalCycle(st, sessions, gameId, claimedVersion);
  await page.goto(`/storyteller/${gameId}`);
  await expect(page.getByRole("button", { name: "Zamknij śledztwo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Otwórz nominacje", exact: true }).click();
  await expect(page.getByRole("button", { name: "Zamknij", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Zamknij śledztwo", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Zamknij", exact: true }).click();
  await expect(page.getByRole("button", { name: "Otwórz nominacje", exact: true })).toBeVisible();
  const before = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
  expect(before.investigation.executionOccurred).toBe(false);
  expect(before.investigation.currentExecutionCandidatePlayerId).toBeNull();
  await page.getByRole("button", { name: "Zamknij śledztwo", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Zamknij śledztwo" });
  await expect(confirm).toBeVisible();
  const closed = page.waitForResponse(r => r.url().endsWith("/investigation/close") && r.request().method() === "POST");
  await confirm.getByRole("button", { name: "Zatwierdź", exact: true }).click();
  expect((await closed).ok()).toBeTruthy();
  await expect(confirm).toHaveCount(0);
  // Completion is persisted; the existing next-night command accepts it.
  const after = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
  await commandVersion(await st.post(`/api/v1/games/${gameId}/operational/start`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: after.version },
  }), after.version);
  for (const context of contexts) await context.close();
});
