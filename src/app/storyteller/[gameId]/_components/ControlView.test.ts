import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ComponentProps } from "react";
import ControlView from "./ControlView";
import { selectPrimaryStorytellerBlocker } from "@/lib/presentation/storyteller-mode";
import type { StorytellerGameProjection } from "@/lib/client-api";

function game(overrides: Partial<StorytellerGameProjection> = {}): StorytellerGameProjection {
  return {
    gameId: "g1", name: "Test", status: "ACTIVE", phase: "INVESTIGATION",
    cycleNumber: 1, version: 1, participantCount: 13, isReady: true,
    players: [], result: null, setup: null, operational: null,
    investigation: null, nominations: [], scenario: null, ...overrides,
  };
}

function render(projection: StorytellerGameProjection, privacyCovered = false) {
  const noop = () => {};
  const props: ComponentProps<typeof ControlView> = {
    game: projection, blocker: selectPrimaryStorytellerBlocker(projection),
    control: null, realtime: "LIVE", nameById: new Map(), busy: false,
    gameEnded: projection.status === "ENDED", ready: true, need: 0, privacyCovered,
    onStartOperational: noop, onCompleteOperational: noop, onResolveAction: noop,
    onOpenNominations: noop, onCloseNominations: noop, onStartVoting: noop,
    onAdvanceVoting: noop, onLockVote: noop, onResolveTrigger: noop,
    onResolveExecution: noop, onCloseInvestigation: noop, onExileTraveller: noop,
    onNavigate: noop,
  };
  return renderToStaticMarkup(createElement(ControlView, props));
}

describe("Control projector privacy", () => {
  it("removes the entire secret queue and actor blocker, not just results", () => {
    const projection = game({ phase: "OPERATIONAL", operational: {
      phaseId: "ph1", cycleNumber: 1, status: "RUNNING", actions: [{
        id: "a1", orderIndex: 3, kind: "POISONER_CHOOSE", actorPlayerId: "p1",
        actorDisplayName: "SecretActor", status: "WAITING_FOR_PLAYER",
        secretJson: null, resolutionJson: null,
      }],
    } });
    const uncovered = render(projection);
    expect(uncovered).toContain("SecretActor");
    expect(uncovered).toContain("Truciciel");
    const covered = render(projection, true);
    expect(covered).not.toContain("SecretActor");
    expect(covered).not.toContain("Truciciel");
    expect(covered).not.toContain("<ol");
    expect(covered).not.toContain("czeka na gracza");
    expect(covered).toContain("Zasłonięto");
    expect(covered).toBe(render(game(), true));
  });
});

describe("Control investigation closure", () => {
  for (const nominationState of [null, "OPEN", "CLOSED"] as const) {
    it(`offers no-execution closure with nomination state ${nominationState}`, () => {
      const projection = game({ investigation: nominationState === null ? null : {
        cycleNumber: 1, nominationState, currentExecutionCandidatePlayerId: null,
        currentHighEffectiveVotes: null, executionOccurred: false,
      } });
      const html = render(projection);
      expect(html).toContain(">Zamknij śledztwo</button>");
      if (nominationState !== "OPEN") expect(html).toContain(">Otwórz nominacje</button>");
    });
  }

  for (const status of ["CREATED", "VOTING", "DAY_TRIGGER_RESOLUTION"]) {
    it(`does not offer closure during ${status}`, () => {
      const projection = game({ nominations: [{
        id: "n1", sequence: 0, nominatorId: "p1", nominatorName: "One",
        nomineeId: "p2", nomineeName: "Two", status, rawTotal: 0,
        effectiveTotal: 0, qualified: false, passStatus: "READY",
        currentVirtualSeat: null, decision: null, votes: [],
      }] });
      expect(render(projection)).not.toContain(">Zamknij śledztwo</button>");
    });
  }

  it("does not offer closure outside investigation or after game end", () => {
    expect(render(game({ phase: "OPERATIONAL" }))).not.toContain(">Zamknij śledztwo</button>");
    expect(render(game({ status: "ENDED", result: { winner: "GOOD", reason: "Test" } })))
      .not.toContain(">Zamknij śledztwo</button>");
  });
});
