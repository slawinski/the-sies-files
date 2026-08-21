import { test, expect } from "@playwright/test";
import { createStorytellerGame, generateAndCommitSetup, driveOperationalCycle, claimAllPlayers } from "./fixtures";

// E2E-07 — scenario QR / map unlock (audit spec 24 §4): clue/task progression,
// MAP_BASE -> MAP_EXTENDED via the annex QR, visible in the player projection.
test("E2E-07: annex QR unlocks the extended map", async ({ page, browser }) => {
  const st = page.request;
  const { gameId, playerIds, version } = await createStorytellerGame(st, "E2E-07", 13);
  await generateAndCommitSetup(st, gameId, version);
  let v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;

  // Claim all players (player actions need their sessions) and run the cycle.
  const { sessions } = await claimAllPlayers(st, browser, gameId, playerIds, v);
  v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  v = await driveOperationalCycle(st, sessions, gameId, v); // now INVESTIGATION

  const p0 = sessions[0].request;
  const scanLetter = await p0.post(`/api/v1/games/${gameId}/scenario/qr/scan`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { token: "tsf-qr-letter-001" } },
  });
  expect(scanLetter.ok()).toBeTruthy();
  v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;

  // Annex QR unlocks the map.
  const scanAnnex = await p0.post(`/api/v1/games/${gameId}/scenario/qr/scan`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { token: "tsf-qr-annex-001" } },
  });
  expect(scanAnnex.ok()).toBeTruthy();

  const projection = await (await p0.get("/api/v1/me")).json();
  expect(projection.scenario.mapVersionId).toBe("MAP_EXTENDED");
  const locationIds = projection.scenario.mapLocations.map((l: { id: string }) => l.id);
  expect(locationIds).toContain("HERMITAGE");
});
