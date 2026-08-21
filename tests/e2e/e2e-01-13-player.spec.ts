import { test, expect } from "@playwright/test";
import {
  createStorytellerGame,
  generateAndCommitSetup,
  driveOperationalCycle,
  claimAllPlayers,
} from "./fixtures";

// E2E-01 — 13-player complete fixture (audit spec 24 §4): create → roster →
// claim → role reveal → Operational + Investigation → nomination/vote →
// execution → ordinary game end.
test("E2E-01: 13-player complete lifecycle ends through an ordinary path", async ({ page, browser }) => {
  const st = page.request;

  const { gameId, playerIds, version: rosterVersion } = await createStorytellerGame(st, "E2E-01", 13);
  const { candidate } = await generateAndCommitSetup(st, gameId, rosterVersion);

  // Claim every player into isolated contexts (per-player cookies).
  let version = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  const { sessions } = await claimAllPlayers(st, browser, gameId, playerIds, version);

  // First Operational cycle, then Investigation.
  version = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  version = await driveOperationalCycle(st, sessions, gameId, version);

  // Nominate + execute the Demon, handling Scarlet Woman succession (which can
  // postpone the GOOD win by one cycle) — loop until the game ends.
  const assignments = (candidate as { assignments: Array<{ playerId: string; trueCharacterId: string }> }).assignments;
  let currentImp = assignments.find((a) => a.trueCharacterId === "IMP")!.playerId;

  async function nominateVoteExecute(nomineeId: string): Promise<{ version: number; winner: string | null }> {
    let v = (await (await st.post(`/api/v1/games/${gameId}/investigation/nominations/open`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: version },
    })).json()).version;

    const nominator = sessions.find((s) => s.playerId !== nomineeId)!;
    const nomination = await nominator.request.post(`/api/v1/games/${gameId}/nominations`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { nomineeId } },
    });
    expect(nomination.ok()).toBeTruthy();
    v = (await nomination.json()).version;

    v = (await (await st.post(`/api/v1/games/${gameId}/nominations/${(await nomination.json()).nominationId}/voting/start`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v },
    })).json()).version;

    const stProjection = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
    for (const p of stProjection.players as Array<{ id: string }>) {
      const session = sessions.find((s) => s.playerId === p.id);
      if (!session) continue;
      const res = await session.request.post(
        `/api/v1/games/${gameId}/nominations/${(await nomination.json()).nominationId}/votes/intent`,
        { data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { intent: true } } },
      );
      if (res.ok()) v = (await res.json()).version;
    }

    v = (await (await st.post(`/api/v1/games/${gameId}/nominations/${(await nomination.json()).nominationId}/votes/lock`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v },
    })).json()).version;

    const executed = await st.post(`/api/v1/games/${gameId}/investigation/resolve-execution`, {
      data: { commandId: crypto.randomUUID(), expectedVersion: v },
    });
    expect(executed.ok()).toBeTruthy();
    const body = await executed.json();
    return { version: body.version, winner: body.winner };
  }

  let winner: string | null = null;
  for (let attempt = 0; attempt < 4 && !winner; attempt += 1) {
    const result = await nominateVoteExecute(currentImp);
    version = result.version;
    winner = result.winner;

    if (!winner) {
      // Succession happened: close the day and run the next cycle; the new
      // Demon is the actor of the next IMP_CHOOSE action.
      version = (await (await st.post(`/api/v1/games/${gameId}/investigation/nominations/close`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: version },
      })).json()).version;
      const closed = await st.post(`/api/v1/games/${gameId}/investigation/close`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: version },
      });
      expect(closed.ok()).toBeTruthy();
      version = (await closed.json()).version;
      version = await driveOperationalCycle(st, sessions, gameId, version);
      const proj = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
      const impChoose = proj.operational?.actions.find((a: { kind: string }) => a.kind === "IMP_CHOOSE");
      currentImp = impChoose.actorPlayerId;
    }
  }

  const finalProjection = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
  expect(finalProjection.status).toBe("ENDED");
  expect(finalProjection.result.winner).toBe("GOOD");
});
