import { test, expect } from "@playwright/test";
import { createStorytellerGame, generateAndCommitSetup, driveOperationalCycle, claimAllPlayers } from "./fixtures";

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

  const playerPage = await contexts[0].newPage();
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

  await contexts[0].close();
});
