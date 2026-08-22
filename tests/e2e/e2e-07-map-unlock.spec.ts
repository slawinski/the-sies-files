import { test, expect } from "@playwright/test";
import { createStorytellerGame, generateAndCommitSetup, driveOperationalCycle, claimAllPlayers } from "./fixtures";

// E2E-07 — scenario QR / map unlock (map-reveal-system-spec §8, §19): the base
// map is the only authorized content before the unlock; the annex QR flips the
// map to the extended version, bumps the map revision, and only then is the
// western reveal asset fetchable, rendered in the DOM, and its POIs present.
test("E2E-07: annex QR unlocks the western map layer with server authorization", async ({ page, browser }) => {
  const st = page.request;
  const { gameId, playerIds, version } = await createStorytellerGame(st, "E2E-07", 13);
  await generateAndCommitSetup(st, gameId, version);
  let v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;

  // Claim all players (player actions need their sessions) and run the cycle.
  const { sessions, contexts } = await claimAllPlayers(st, browser, gameId, playerIds, v);
  v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  v = await driveOperationalCycle(st, sessions, gameId, v); // now INVESTIGATION

  const p0 = sessions[0].request;
  const scanLetter = await p0.post(`/api/v1/games/${gameId}/scenario/qr/scan`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { token: "tsf-qr-letter-001" } },
  });
  expect(scanLetter.ok()).toBeTruthy();
  v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;

  // --- Before unlock: anti-spoiler boundary (API) --------------------------
  const mapBefore = await (await p0.get(`/api/v1/games/${gameId}/map`)).json();
  expect(mapBefore.revision).toBe(1);
  expect(mapBefore.layers.map((l: { id: string }) => l.id)).toEqual(["BASE"]);
  expect(JSON.stringify(mapBefore)).not.toContain("WEST_AREA");
  expect(mapBefore.pois.some((p: { id: string }) => p.id === "HERMITAGE")).toBe(false);

  const forbiddenWest = await p0.get(`/api/v1/games/${gameId}/map/layers/WEST_AREA`);
  expect(forbiddenWest.status()).toBe(403);
  const unknownLayer = await p0.get(`/api/v1/games/${gameId}/map/layers/SECRET_PATH`);
  expect(unknownLayer.status()).toBe(404);

  // --- Before unlock: anti-spoiler boundary (DOM) --------------------------
  const playerPage = await contexts[0].newPage();
  await playerPage.goto("/player");
  await expect(playerPage.locator(".map-viewport")).toBeVisible();
  await expect(playerPage.locator('img[data-layer="BASE"]')).toHaveCount(1);
  await expect(playerPage.locator('img[data-layer="WEST_AREA"]')).toHaveCount(0);
  await expect(playerPage.getByText("Pustelnia", { exact: true })).toHaveCount(0);
  await expect(playerPage.getByText("Strumień", { exact: true })).toHaveCount(0);

  // Ensure the realtime stream is connected before scanning (dev cold-start
  // compilation can delay the SSE open; a scan before it is missed forever).
  await expect(playerPage.getByText("LIVE", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  // --- Unlock --------------------------------------------------------------
  const scanAnnex = await p0.post(`/api/v1/games/${gameId}/scenario/qr/scan`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { token: "tsf-qr-annex-001" } },
  });
  expect(scanAnnex.ok()).toBeTruthy();

  // --- After unlock: state + authorization (API) ----------------------------
  const projection = await (await p0.get("/api/v1/me")).json();
  expect(projection.scenario.mapVersionId).toBe("MAP_EXTENDED");
  const map = projection.scenario.map;
  expect(map.revision).toBe(2);
  expect(map.layers.map((l: { id: string }) => l.id)).toEqual(["BASE", "WEST_AREA"]);
  const west = map.layers.find((l: { id: string }) => l.id === "WEST_AREA");
  expect(west.url).toBe(`/api/v1/games/${gameId}/map/layers/WEST_AREA`);
  const poiIds = map.pois.map((p: { id: string }) => p.id);
  expect(poiIds).toContain("HERMITAGE");
  expect(poiIds).toContain("WEST_PATH");

  const westAsset = await p0.get(west.url);
  expect(westAsset.ok()).toBeTruthy();
  expect(westAsset.headers()["content-type"]).toBe("image/webp");

  // --- After unlock: reveal renders in the live page (realtime refetch) -----
  // The invalidate event triggers a projection refetch; the map then preloads
  // the authorized reveal asset, decodes it, and plays the reveal ceremony.
  await expect(playerPage.locator('img[data-layer="WEST_AREA"]')).toHaveCount(1, {
    timeout: 20_000,
  });
  // The visible marker (the sr-only list also mentions the label).
  await expect(playerPage.locator('.map-poi-label:text-is("Pustelnia")')).toBeVisible();
  await expect(
    playerPage.getByText("Mapa została zaktualizowana. Nowy obszar jest teraz dostępny."),
  ).toHaveCount(1);

  await contexts[0].close();
});
