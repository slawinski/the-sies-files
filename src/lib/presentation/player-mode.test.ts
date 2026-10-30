import { describe, expect, it } from "vitest";
import type { PlayerGameProjection } from "@/lib/client-api";
import {
  requiredTargetCount,
  selectActiveVotingNomination,
  selectPlayerPresentation,
} from "./player-mode";

function baseGame(overrides: Partial<PlayerGameProjection> = {}): PlayerGameProjection {
  return {
    gameId: "g1",
    name: "Test",
    status: "ACTIVE",
    phase: "INVESTIGATION",
    cycleNumber: 1,
    version: 1,
    participantCount: 13,
    isReady: true,
    players: [],
    result: null,
    me: {
      playerId: "p0",
      displayName: "Ja",
      virtualSeat: 0,
      alive: true,
      ghostVoteAvailable: false,
    },
    myRole: null,
    roleAcknowledged: true,
    activeAction: null,
    deliveredInfo: [],
    investigation: { cycleNumber: 1, nominationState: "CLOSED", currentExecutionCandidatePlayerId: null, currentHighEffectiveVotes: null, executionOccurred: false },
    nominations: [],
    scenario: null,
    ...overrides,
  };
}

describe("requiredTargetCount", () => {
  it("returns 1 for single-target picker kinds", () => {
    expect(requiredTargetCount("POISONER_CHOOSE")).toBe(1);
    expect(requiredTargetCount("BUTLER_CHOOSE")).toBe(1);
    expect(requiredTargetCount("BUREAUCRAT_CHOOSE")).toBe(1);
  });

  it("returns 2 for the Fortune Teller", () => {
    expect(requiredTargetCount("FORTUNE_TELLER_CHOOSE")).toBe(2);
  });

  it("returns null for non-picker kinds", () => {
    expect(requiredTargetCount("SPY_GRIMOIRE")).toBeNull();
  });
});

describe("selectPlayerPresentation", () => {
  it("prioritizes game end over everything", () => {
    const game = baseGame({
      result: { winner: "GOOD", reason: "r" },
      myRole: {
        characterId: "WASHERWOMAN",
        alignment: "GOOD",
        publicCharacter: false,
      },
      roleAcknowledged: false,
    });
    expect(selectPlayerPresentation(game)).toBe("GAME_ENDED");
  });

  it("requires role reveal before any action", () => {
    const game = baseGame({
      myRole: {
        characterId: "WASHERWOMAN",
        alignment: "GOOD",
        publicCharacter: false,
      },
      roleAcknowledged: false,
      activeAction: { id: "a1", kind: "POISONER_CHOOSE" },
      nominations: [{ id: "n1", sequence: 0, nominatorName: "A", nomineeName: "B", status: "VOTING", rawTotal: 0, effectiveTotal: 0, qualified: false, myVoteIntent: null, passStatus: "RUNNING", currentVirtualSeat: 0 }],
    });
    expect(selectPlayerPresentation(game)).toBe("ROLE_REVEAL");
  });

  it("shows an acknowledged role as normal waiting when pre-game", () => {
    const game = baseGame({
      status: "LOBBY",
      phase: null,
      investigation: null,
    });
    expect(selectPlayerPresentation(game)).toBe("WAITING");
  });

  it("resolves operational required vs waiting by picker kind", () => {
    const required = baseGame({
      phase: "OPERATIONAL",
      investigation: null,
      activeAction: { id: "a1", kind: "POISONER_CHOOSE" },
    });
    expect(selectPlayerPresentation(required)).toBe("OPERATIONAL_REQUIRED");

    const waiting = baseGame({
      phase: "OPERATIONAL",
      investigation: null,
      activeAction: { id: "a2", kind: "CHEF_INFO" },
    });
    expect(selectPlayerPresentation(waiting)).toBe("OPERATIONAL_WAITING");
  });

  it("enters formal voting when any nomination is VOTING", () => {
    const game = baseGame({
      nominations: [
        {
          id: "n1",
          sequence: 0,
          nominatorName: "A",
          nomineeName: "B",
          status: "VOTING",
          rawTotal: 0,
          effectiveTotal: 0,
          qualified: false,
          myVoteIntent: null,
          passStatus: "READY",
          currentVirtualSeat: null,
        },
      ],
    });
    expect(selectPlayerPresentation(game)).toBe("FORMAL_VOTING");
  });

  it("enters formal nomination when nominations are open without voting", () => {
    const game = baseGame({
      investigation: {
        cycleNumber: 1,
        nominationState: "OPEN",
        currentExecutionCandidatePlayerId: null,
        currentHighEffectiveVotes: null,
        executionOccurred: false,
      },
    });
    expect(selectPlayerPresentation(game)).toBe("FORMAL_NOMINATION");
  });

  it("falls back to investigation summary", () => {
    expect(selectPlayerPresentation(baseGame())).toBe("INVESTIGATION");
  });
});

describe("selectActiveVotingNomination", () => {
  const nom = (overrides: Partial<PlayerGameProjection["nominations"][number]> = {}) => ({
    id: "n1",
    sequence: 0,
    nominatorName: "A",
    nomineeName: "B",
    status: "VOTING",
    rawTotal: 0,
    effectiveTotal: 0,
    qualified: false,
    myVoteIntent: null,
    passStatus: "READY",
    currentVirtualSeat: null,
    ...overrides,
  });

  it("prefers the running pass", () => {
    const game = baseGame({
      nominations: [nom(), nom({ id: "n2", passStatus: "RUNNING", currentVirtualSeat: 1 })],
    });
    expect(selectActiveVotingNomination(game)?.id).toBe("n2");
  });

  it("falls back to the first voting nomination", () => {
    const game = baseGame({ nominations: [nom()] });
    expect(selectActiveVotingNomination(game)?.id).toBe("n1");
  });

  it("returns null when nothing is voting", () => {
    expect(selectActiveVotingNomination(baseGame())).toBeNull();
  });
});
