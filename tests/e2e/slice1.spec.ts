import { test, expect } from "@playwright/test";

// Slice 1 happy path (docs/04 §12). Run with `npm run test:e2e` after
// `npx playwright install`. Uses the API contract via `page.request`.

test("Storyteller creates a game, adds 13 players, issues a claim, player claims", async ({
  page,
}) => {
  const api = page.request;

  // 1. Storyteller creates a game.
  const created = await api.post("/api/v1/games", {
    data: { name: "The Sieś Files — 2026" },
  });
  expect(created.status()).toBe(201);
  const game = await created.json();

  // 2. Add 13 participants.
  let version = game.version;
  const players: { id: string }[] = [];
  for (let i = 0; i < 13; i += 1) {
    const res = await api.post(`/api/v1/games/${game.gameId}/players`, {
      data: {
        commandId: crypto.randomUUID(),
        expectedVersion: version,
        payload: { displayName: `Player ${i}` },
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    version = body.version;
    players.push({ id: body.playerId });
  }

  // 3. Issue a claim link for the first player.
  const claimRes = await api.post(
    `/api/v1/games/${game.gameId}/players/${players[0].id}/claim-token`,
    { data: { commandId: crypto.randomUUID(), expectedVersion: version } },
  );
  expect(claimRes.status()).toBe(200);
  const claimBody = await claimRes.json();

  // 4. Player opens the claim page (token in fragment) and claims.
  await page.goto(`/claim#${claimBody.claimToken}`);
  await page.getByRole("button", { name: /claim/i }).click();
  await expect(page).toHaveURL(/\/player$/);

  // 5. Player sees their identity.
  await expect(page.getByText("Player 0")).toBeVisible();
});
