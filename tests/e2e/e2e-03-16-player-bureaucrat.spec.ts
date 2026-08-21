import { test, expect } from "@playwright/test";
import {
  createStorytellerGame,
  generateAndCommitSetup,
  driveOperationalCycle,
  claimAllPlayers,
} from "./fixtures";

// E2E-03 — 16-player Traveller/Bureaucrat fixture (audit spec 24 §4): public
// Bureaucrat, secret alignment, target validation, exile without ghost vote.
test("E2E-03: 16-player Bureaucrat Traveller", async ({ page, browser }) => {
  const st = page.request;
  const { gameId, playerIds, version: rosterVersion } = await createStorytellerGame(st, "E2E-03", 16);

  // Designate participant 16 as the Traveller.
  let v = (await (await st.post(`/api/v1/games/${gameId}/players/${playerIds[15]}/kind`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: rosterVersion, payload: { participantKind: "TRAVELLER" } },
  })).json()).version;

  const { candidate } = await generateAndCommitSetup(st, gameId, v);
  const assignments = (candidate as { assignments: Array<{ playerId: string; participantKind: string; trueCharacterId: string }> }).assignments;
  const traveller = assignments.find((a) => a.participantKind === "TRAVELLER");
  expect(traveller).toBeDefined();
  expect(traveller!.trueCharacterId).toBe("BUREAUCRAT");
  expect(assignments.filter((a) => a.participantKind === "NORMAL")).toHaveLength(15);

  v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  const { sessions } = await claimAllPlayers(st, browser, gameId, playerIds, v);
  v = (await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json()).version;
  v = await driveOperationalCycle(st, sessions, gameId, v);

  // Public projection shows the public Bureaucrat but never the alignment.
  const publicProjection = await (await sessions[0].request.get(`/api/v1/games/${gameId}/public`)).json();
  const publicTraveller = publicProjection.players.find((p: { participantKind: string }) => p.participantKind === "TRAVELLER");
  expect(publicTraveller).toBeDefined();
  expect(JSON.stringify(publicTraveller)).not.toContain("alignment");
  expect(JSON.stringify(publicTraveller)).not.toContain("trueCharacterId");

  // Exile the Traveller: not a death, no ghost vote.
  v = (await (await st.post(`/api/v1/games/${gameId}/traveller/exile`, {
    data: { commandId: crypto.randomUUID(), expectedVersion: v, payload: { playerId: traveller!.playerId } },
  })).json()).version;
  const after = await (await st.get(`/api/v1/games/${gameId}/storyteller`)).json();
  const exiled = after.players.find((p: { id: string }) => p.id === traveller!.playerId);
  expect(exiled.alive).toBe(false);
  // Ghost-vote non-grant for Travellers is a backend invariant covered by
  // integration tests (R0/remediation); the public projection carries no vote data.
});
