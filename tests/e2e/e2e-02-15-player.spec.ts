import { test, expect } from "@playwright/test";
import {
  createStorytellerGame,
  generateAndCommitSetup,
  driveOperationalCycle,
  claimAllPlayers,
  executeDemonToEnd,
} from "./fixtures";

// E2E-02 — 15-player complete fixture (audit spec 24 §4): same lifecycle at 15
// players with composition/ordering differences.
test("E2E-02: 15-player complete lifecycle ends through an ordinary path", async ({ page, browser }) => {
  const st = page.request;
  const { gameId, playerIds, version: rosterVersion } = await createStorytellerGame(st, "E2E-02", 15);
  const { candidate } = await generateAndCommitSetup(st, gameId, rosterVersion);

  let version = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  const { sessions } = await claimAllPlayers(st, browser, gameId, playerIds, version);
  version = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  version = await driveOperationalCycle(st, sessions, gameId, version);

  const imp = (candidate as { assignments: Array<{ playerId: string; trueCharacterId: string }> }).assignments.find(
    (a) => a.trueCharacterId === "IMP",
  )!.playerId;
  const { projection } = await executeDemonToEnd(st, sessions, gameId, version, imp);
  expect(projection.status).toBe("ENDED");
  expect(projection.result?.winner).toBe("GOOD");
});
