import { test, expect } from "@playwright/test";
import {
  createStorytellerGame,
  generateAndCommitSetup,
  driveOperationalCycle,
  claimAllPlayers,
} from "./fixtures";

// E2E-08 — restart recovery (audit spec 24 §4): mid-formal-process consistency
// and replay verification prove no active truth lives only in process memory.
// (The physical server restart is a CI-orchestrated drill; state itself is
// PostgreSQL-authoritative.)
test("E2E-08: mid-vote consistency and replay verification pass", async ({ page, browser }) => {
  const st = page.request;
  const { gameId, playerIds, version } = await createStorytellerGame(st, "E2E-08", 13);
  await generateAndCommitSetup(st, gameId, version);

  let v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  const { sessions } = await claimAllPlayers(st, browser, gameId, playerIds, v);
  v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  v = await driveOperationalCycle(st, sessions, gameId, v);

  // Open nominations and start the voting pass — a formal process in flight.
  v = (await (await st.post(`/api/v1/games/${gameId}/investigation/nominations/open`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v },
  })).json()).version;
  const nomination = await sessions[0].request.post(`/api/v1/games/${gameId}/nominations`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { nomineeId: playerIds[1] } },
  });
  expect(nomination.ok()).toBeTruthy();
  const nominationBody = await nomination.json();
  v = nominationBody.version;
  v = (await (await st.post(`/api/v1/games/${gameId}/nominations/${nominationBody.nominationId}/voting/start`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v },
  })).json()).version;
  const firstVote = await sessions[0].request.post(
    `/api/v1/games/${gameId}/nominations/${nominationBody.nominationId}/votes/intent`,
    { data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { intent: true } } },
  );
  expect(firstVote.ok(), "first seat votes").toBeTruthy();

  // Consistency checks must be clean mid-process.
  const consistency = await st.get(`/api/v1/games/${gameId}/storyteller/consistency`);
  expect(consistency.ok()).toBeTruthy();
  const issues = (await consistency.json()).issues as Array<{ check: string; ok: boolean }>;
  for (const issue of issues) {
    expect(issue.ok, issue.check).toBe(true);
  }

  // Replay verification from the last automatic checkpoint must report no divergence.
  const checkpoints = await st.get(`/api/v1/games/${gameId}/storyteller/checkpoints`);
  const checkpointList = (await checkpoints.json()).checkpoints as Array<{ id: string }>;
  expect(checkpointList.length).toBeGreaterThan(0);
  const replay = await st.post(`/api/v1/games/${gameId}/storyteller/consistency/replay`, {
    data: { checkpointId: checkpointList[checkpointList.length - 1].id },
  });
  expect(replay.ok()).toBeTruthy();
  expect((await replay.json()).ok).toBe(true);
});
