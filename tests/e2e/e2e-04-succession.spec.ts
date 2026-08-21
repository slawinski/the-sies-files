import { test, expect } from "@playwright/test";
import { createStorytellerGame, generateAndCommitSetup, driveOperationalCycle, claimAllPlayers } from "./fixtures";

// E2E-04 — Demon succession (audit spec 24 §4): Imp self-kill star-pass to a
// legal Minion, plus rejection of an invalid successor.
test("E2E-04: Imp self-kill star-pass to a legal Minion; invalid successor rejected", async ({ page, browser }) => {
  const st = page.request;
  const { gameId, playerIds, version } = await createStorytellerGame(st, "E2E-04", 13);
  const { candidate } = await generateAndCommitSetup(st, gameId, version);

  const assignments = (candidate as { assignments: Array<{ playerId: string; trueCharacterId: string }> }).assignments;
  const imp = assignments.find((a) => a.trueCharacterId === "IMP")!.playerId;
  const minion = assignments.find((a) => a.trueCharacterId === "POISONER" || a.trueCharacterId === "SPY" || a.trueCharacterId === "SCARLET_WOMAN" || a.trueCharacterId === "BARON");
  expect(minion).toBeDefined();

  let v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  const { sessions } = await claimAllPlayers(st, browser, gameId, playerIds, v);
  v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;

  v = await driveOperationalCycle(st, sessions, gameId, v); // cycle 1 (no kill)
  v = (await (await st.post(`/api/v1/games/${gameId}/operational/start`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v },
  })).json()).version;

  // Drive the cycle-2 queue in order until the IMP_KILL decision is reached.
  const townsfolk = assignments.find((a) => a.trueCharacterId === "CHEF" || a.trueCharacterId === "MONK")!.playerId;
  let impKillId: string | null = null;
  for (let guard = 0; guard < 100 && !impKillId; guard += 1) {
    const proj = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
    const active = (proj.operational?.actions ?? []).find(
      (a: { status: string }) => a.status === "WAITING_FOR_PLAYER" || a.status === "WAITING_FOR_STORYTELLER",
    );
    expect(active, "queue advanced").toBeDefined();

    if (active.kind === "IMP_CHOOSE") {
      const impSession = sessions.find((s) => s.playerId === imp)!;
      const res = await impSession.request.post(`/api/v1/games/${gameId}/operational/actions/${active.id}/submit`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { targetPlayerIds: [imp] } },
      });
      expect(res.ok(), "imp self-target submit").toBeTruthy();
      v = (await res.json()).version;
      continue;
    }

    if (active.kind === "IMP_KILL") {
      impKillId = active.id;

      // Invalid successor (a non-Minion) must be rejected without mutating state.
      const invalid = await st.post(`/api/v1/games/${gameId}/storyteller/actions/${active.id}/resolve`, {
        data: {
          commandId: crypto.randomUUID(),
          expectedVersion: v,
          payload: { resolution: { kind: "IMP_KILL", starPassSuccessorPlayerId: townsfolk } },
        },
      });
      expect(invalid.ok(), "invalid successor rejected").toBeFalsy();

      // Valid successor resolves the star-pass.
      const valid = await st.post(`/api/v1/games/${gameId}/storyteller/actions/${active.id}/resolve`, {
        data: {
          commandId: crypto.randomUUID(),
          expectedVersion: v,
          payload: { resolution: { kind: "IMP_KILL", starPassSuccessorPlayerId: minion!.playerId } },
        },
      });
      expect(valid.ok(), "valid successor resolves").toBeTruthy();
      break;
    }

    if (active.status === "WAITING_FOR_PLAYER") {
      const session = sessions.find((s) => s.playerId === active.actorPlayerId)!;
      const others = proj.players
        .filter((p: { id: string; alive: boolean }) => p.alive && p.id !== active.actorPlayerId)
        .map((p: { id: string }) => p.id);
      const chosen = active.kind === "FORTUNE_TELLER_CHOOSE" ? others.slice(0, 2) : others.slice(0, 1);
      const res = await session.request.post(`/api/v1/games/${gameId}/operational/actions/${active.id}/submit`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { targetPlayerIds: chosen } },
      });
      expect(res.ok(), `submit ${active.kind}`).toBeTruthy();
      v = (await res.json()).version;
    } else {
      const res = await st.post(`/api/v1/games/${gameId}/storyteller/actions/${active.id}/resolve`, {
        data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: {} },
      });
      expect(res.ok(), `resolve ${active.kind}`).toBeTruthy();
      v = (await res.json()).version;
    }
  }

  // The minion became the Demon; the original Imp is dead.
  const minionSecret = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
  const actionsAfter = minionSecret.operational.actions;
  const characterChanged = (await (await st.get(`/api/v1/games/${gameId}/storyteller/audit`)).json()).events.some(
    (e: { eventType: string; payload: { reason?: string; playerId?: string } }) =>
      e.eventType === "CHARACTER_CHANGED" && e.payload?.playerId === minion!.playerId && e.payload?.reason === "STAR_PASS",
  );
  expect(characterChanged).toBe(true);
  expect(impKillId).not.toBeNull();
  void actionsAfter;
});
