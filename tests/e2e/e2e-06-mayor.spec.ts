import { test, expect } from "@playwright/test";
import {
  createStorytellerGame,
  generateSetupUntilRole,
  driveOperationalCycle,
  claimAllPlayers,
} from "./fixtures";

// E2E-06 — Mayor ending (audit spec 24 §4): exactly three living normal
// players + no execution → GOOD victory via the Mayor.
test("E2E-06: Mayor three-alive no-execution win", async ({ page, browser }) => {
  const st = page.request;
  const { gameId, playerIds, version } = await createStorytellerGame(st, "E2E-06", 13);
  const { candidate } = await generateSetupUntilRole(st, gameId, version, "MAYOR");

  let v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  const { sessions } = await claimAllPlayers(st, browser, gameId, playerIds, v);
  v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  v = await driveOperationalCycle(st, sessions, gameId, v); // now INVESTIGATION

  const assignments = (candidate as { assignments: Array<{ playerId: string; trueCharacterId: string }> }).assignments;
  const mayor = assignments.find((a) => a.trueCharacterId === "MAYOR")!.playerId;
  const imp = assignments.find((a) => a.trueCharacterId === "IMP")!.playerId;
  const keep = new Set([mayor, imp, playerIds.find((id) => id !== mayor && id !== imp)!]);

  // Reduce to exactly three living normal players via audited recovery overrides.
  for (const pid of playerIds) {
    if (keep.has(pid)) continue;
    const res = await st.post(`/api/v1/games/${gameId}/storyteller/recovery/override`, {
      data: {
        commandId: crypto.randomUUID(),
        expectedVersion: v,
        payload: { kind: "CORRECT_ALIVE", playerId: pid, alive: false, reason: "E2E fixture: reduce to three alive" },
      },
    });
    expect(res.ok(), `override ${pid}`).toBeTruthy();
    v = (await res.json()).version;
  }

  // Close the investigation with no execution → Mayor win.
  const closed = await st.post(`/api/v1/games/${gameId}/investigation/close`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v },
  });
  expect(closed.ok()).toBeTruthy();
  expect((await closed.json()).winner).toBe("GOOD");

  const finalProjection = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
  expect(finalProjection.status).toBe("ENDED");
  expect(finalProjection.result.winner).toBe("GOOD");
  expect(finalProjection.result.reason).toBe("MAYOR");
});
