import { test, expect } from "@playwright/test";
import {
  createStorytellerGame,
  generateSetupUntilRole,
  driveOperationalCycle,
  claimAllPlayers,
  executeDemonToEnd,
} from "./fixtures";

// E2E-05 — Saint execution (audit spec 24 §4): executing a functioning Saint
// produces the EVIL victory and a persistent terminal projection.
test("E2E-05: Saint execution yields an evil victory", async ({ page, browser }) => {
  const st = page.request;
  const { gameId, playerIds, version } = await createStorytellerGame(st, "E2E-05", 13);
  const { candidate } = await generateSetupUntilRole(st, gameId, version, "SAINT");

  let v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  const { sessions } = await claimAllPlayers(st, browser, gameId, playerIds, v);
  v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  v = await driveOperationalCycle(st, sessions, gameId, v);

  const saint = (candidate as { assignments: Array<{ playerId: string; trueCharacterId: string }> }).assignments.find(
    (a) => a.trueCharacterId === "SAINT",
  )!.playerId;

  // Nominate, vote, and execute the Saint.
  v = (await (await st.post(`/api/v1/games/${gameId}/investigation/nominations/open`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v },
  })).json()).version;
  const nominator = sessions.find((s) => s.playerId !== saint)!;
  const nomination = await nominator.request.post(`/api/v1/games/${gameId}/nominations`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { nomineeId: saint } },
  });
  expect(nomination.ok()).toBeTruthy();
  const nominationBody = await nomination.json();
  v = nominationBody.version;

  v = (await (await st.post(`/api/v1/games/${gameId}/nominations/${nominationBody.nominationId}/voting/start`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v },
  })).json()).version;
  const stProjection = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
  for (const p of stProjection.players as Array<{ id: string }>) {
    const session = sessions.find((s) => s.playerId === p.id);
    if (!session) continue;
    const res = await session.request.post(
      `/api/v1/games/${gameId}/nominations/${nominationBody.nominationId}/votes/intent`,
      { data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { intent: true } } },
    );
    if (res.ok()) v = (await res.json()).version;
  }
  v = (await (await st.post(`/api/v1/games/${gameId}/nominations/${nominationBody.nominationId}/votes/lock`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v },
  })).json()).version;

  const executed = await st.post(`/api/v1/games/${gameId}/investigation/resolve-execution`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v },
  });
  expect(executed.ok()).toBeTruthy();
  expect((await executed.json()).winner).toBe("EVIL");

  // The result persists in the projection (audit spec 20 §5).
  const finalProjection = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
  expect(finalProjection.status).toBe("ENDED");
  expect(finalProjection.result.winner).toBe("EVIL");
  expect(finalProjection.result.reason).toBe("SAINT_EXECUTED");
  void executeDemonToEnd;
});
