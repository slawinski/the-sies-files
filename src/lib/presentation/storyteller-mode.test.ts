import { describe, expect, it } from "vitest";
import type { StorytellerGameProjection } from "@/lib/client-api";
import {
  selectPrimaryStorytellerBlocker,
  selectStorytellerPresentation,
} from "./storyteller-mode";

function baseGame(overrides: Partial<StorytellerGameProjection> = {}): StorytellerGameProjection {
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
    setup: { regenerationIndex: 1, committed: true, candidate: null },
    operational: null,
    investigation: {
      cycleNumber: 1,
      nominationState: "CLOSED",
      currentExecutionCandidatePlayerId: null,
      currentHighEffectiveVotes: null,
      executionOccurred: false,
    },
    nominations: [],
    scenario: null,
    ...overrides,
  };
}

const action = (overrides: Partial<StorytellerGameProjection["operational"] extends null ? never : NonNullable<StorytellerGameProjection["operational"]>["actions"][number]> = {}) => ({
  id: "a1",
  orderIndex: 0,
  kind: "POISONER_CHOOSE",
  actorPlayerId: "p1",
  actorDisplayName: "Ela",
  status: "PENDING",
  secretJson: null,
  resolutionJson: null,
  ...overrides,
});

const nomination = (overrides: Record<string, unknown> = {}) => ({
  id: "n1",
  sequence: 0,
  nominatorId: "p1",
  nominatorName: "Ela",
  nomineeId: "p2",
  nomineeName: "Janek",
  status: "VOTING",
  rawTotal: 0,
  effectiveTotal: 0,
  qualified: false,
  passStatus: "READY",
  currentVirtualSeat: null,
  decision: null,
  votes: [],
  ...overrides,
});

describe("selectStorytellerPresentation", () => {
  it("reports game end", () => {
    expect(selectStorytellerPresentation(baseGame({ result: { winner: "GOOD", reason: "r" } }))).toBe("GAME_ENDED");
  });

  it("reports ST decision blocker", () => {
    const game = baseGame({
      phase: "OPERATIONAL",
      investigation: null,
      operational: {
        phaseId: "ph1",
        cycleNumber: 1,
        status: "RUNNING",
        actions: [action({ status: "WAITING_FOR_STORYTELLER" })],
      },
    });
    expect(selectStorytellerPresentation(game)).toBe("OPERATIONAL_BLOCKED_BY_ST");
  });

  it("reports player blocker", () => {
    const game = baseGame({
      phase: "OPERATIONAL",
      investigation: null,
      operational: {
        phaseId: "ph1",
        cycleNumber: 1,
        status: "RUNNING",
        actions: [action({ status: "WAITING_FOR_PLAYER" })],
      },
    });
    expect(selectStorytellerPresentation(game)).toBe("OPERATIONAL_BLOCKED_BY_PLAYER");
  });

  it("reports voting", () => {
    const game = baseGame({ nominations: [nomination()] });
    expect(selectStorytellerPresentation(game)).toBe("VOTING");
  });

  it("reports setup", () => {
    expect(selectStorytellerPresentation(baseGame({ status: "SETUP", phase: null, investigation: null }))).toBe("SETUP");
  });
});

describe("selectPrimaryStorytellerBlocker", () => {
  it("prioritizes explicit ST decision over player waiting", () => {
    const game = baseGame({
      phase: "OPERATIONAL",
      investigation: null,
      operational: {
        phaseId: "ph1",
        cycleNumber: 1,
        status: "RUNNING",
        actions: [
          action({ id: "a2", status: "WAITING_FOR_PLAYER", actorDisplayName: "Janek" }),
          action({ status: "WAITING_FOR_STORYTELLER" }),
        ],
      },
    });
    const blocker = selectPrimaryStorytellerBlocker(game);
    expect(blocker.kind).toBe("ST_DECISION");
    expect(blocker.view).toBe("control");
  });

  it("reports a waiting player with their name", () => {
    const game = baseGame({
      phase: "OPERATIONAL",
      investigation: null,
      operational: {
        phaseId: "ph1",
        cycleNumber: 1,
        status: "RUNNING",
        actions: [action({ status: "WAITING_FOR_PLAYER", actorDisplayName: "Ela" })],
      },
    });
    const blocker = selectPrimaryStorytellerBlocker(game);
    expect(blocker.kind).toBe("PLAYER_WAITING");
    expect(blocker.actorName).toBe("Ela");
  });

  it("sequences voting blockers: start -> advance -> lock", () => {
    const ready = baseGame({ nominations: [nomination({ passStatus: "READY" })] });
    expect(selectPrimaryStorytellerBlocker(ready).kind).toBe("VOTING_START");

    const running = baseGame({
      nominations: [nomination({ passStatus: "RUNNING", currentVirtualSeat: 1 })],
    });
    expect(selectPrimaryStorytellerBlocker(running).kind).toBe("VOTING_ADVANCE");

    const complete = baseGame({ nominations: [nomination({ passStatus: "COMPLETE" })] });
    expect(selectPrimaryStorytellerBlocker(complete).kind).toBe("VOTING_LOCK");
  });

  it("reports day-trigger registration decision", () => {
    const game = baseGame({
      nominations: [
        nomination({
          status: "DAY_TRIGGER_RESOLUTION",
          passStatus: "READY",
          decision: {
            context: "x",
            nominatorId: "p1",
            options: [{ optionId: "o1", description: "true registration", satisfies: true }],
          },
        }),
      ],
    });
    expect(selectPrimaryStorytellerBlocker(game).kind).toBe("DAY_TRIGGER_DECISION");
  });

  it("reports operational phase completion", () => {
    const game = baseGame({
      phase: "OPERATIONAL",
      investigation: null,
      operational: {
        phaseId: "ph1",
        cycleNumber: 1,
        status: "RUNNING",
        actions: [action({ status: "RESOLVED", resolutionJson: { resolved: true } })],
      },
    });
    expect(selectPrimaryStorytellerBlocker(game).kind).toBe("PHASE_ADVANCE_OPERATIONAL");
  });

  it("reports execution resolution when a candidate exists", () => {
    const game = baseGame({
      investigation: {
        cycleNumber: 1,
        nominationState: "CLOSED",
        currentExecutionCandidatePlayerId: "p2",
        currentHighEffectiveVotes: 7,
        executionOccurred: false,
      },
    });
    expect(selectPrimaryStorytellerBlocker(game).kind).toBe("EXECUTION_RESOLVE");
  });

  it("reports close-investigation after execution", () => {
    const game = baseGame({
      investigation: {
        cycleNumber: 1,
        nominationState: "CLOSED",
        currentExecutionCandidatePlayerId: null,
        currentHighEffectiveVotes: null,
        executionOccurred: true,
      },
    });
    expect(selectPrimaryStorytellerBlocker(game).kind).toBe("CLOSE_INVESTIGATION");
  });

  it("reports nominations open", () => {
    expect(selectPrimaryStorytellerBlocker(baseGame()).kind).toBe("NOMINATIONS_OPEN");
  });

  it("reports incomplete roster during setup", () => {
    const game = baseGame({
      status: "SETUP",
      phase: null,
      investigation: null,
      participantCount: 10,
      setup: { regenerationIndex: 0, committed: false, candidate: null },
    });
    expect(selectPrimaryStorytellerBlocker(game).kind).toBe("ROSTER_INCOMPLETE");
  });

  it("reports grimoire commit when roster is full", () => {
    const game = baseGame({
      status: "SETUP",
      phase: null,
      investigation: null,
      participantCount: 15,
      setup: { regenerationIndex: 0, committed: false, candidate: null },
    });
    const blocker = selectPrimaryStorytellerBlocker(game);
    expect(blocker.kind).toBe("SETUP_COMMIT");
    expect(blocker.view).toBe("grimoire");
  });

  it("reports starting the operational phase after role reveal", () => {
    const game = baseGame({
      status: "ROLE_REVEAL",
      phase: null,
      investigation: null,
    });
    expect(selectPrimaryStorytellerBlocker(game).kind).toBe("START_OPERATIONAL");
  });

  it("reports no blocker when the session is quiet", () => {
    const game = baseGame({
      investigation: {
        cycleNumber: 1,
        nominationState: "OPEN",
        currentExecutionCandidatePlayerId: null,
        currentHighEffectiveVotes: null,
        executionOccurred: false,
      },
    });
    expect(selectPrimaryStorytellerBlocker(game).kind).toBe("NONE");
  });
});
