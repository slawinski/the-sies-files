import { describe, expect, it } from "vitest";
import { actionSeverity } from "./action-priority";

describe("actionSeverity", () => {
  it("keeps routine progression on the primary variant", () => {
    expect(actionSeverity("scan").variant).toBe("primary");
    expect(actionSeverity("submit-target").variant).toBe("primary");
    expect(actionSeverity("start-operational").variant).toBe("primary");
  });

  it("reserves the formal variant for game-state commits", () => {
    expect(actionSeverity("nominate").variant).toBe("formal");
    expect(actionSeverity("vote").variant).toBe("formal");
    expect(actionSeverity("lock-vote").variant).toBe("formal");
    expect(actionSeverity("advance-phase").variant).toBe("formal");
    expect(actionSeverity("commit-grimoire").variant).toBe("formal");
  });

  it("reserves danger for destructive/admin actions only", () => {
    expect(actionSeverity("remove-player").variant).toBe("danger");
    expect(actionSeverity("reset-access").variant).toBe("danger");
    expect(actionSeverity("recovery-override").variant).toBe("danger");
  });

  it("requires the strongest confirmation for irreversible actions", () => {
    expect(actionSeverity("remove-player").confirmation).toBe("strong");
    expect(actionSeverity("recovery-override").confirmation).toBe("strong");
    expect(actionSeverity("commit-grimoire").confirmation).toBe("strong");
  });

  it("never confirms routine utility actions", () => {
    expect(actionSeverity("open-map").confirmation).toBe("none");
    expect(actionSeverity("scan").confirmation).toBe("none");
    expect(actionSeverity("rename").confirmation).toBe("none");
  });

  it("marks the reveal / primary progressions full-width", () => {
    expect(actionSeverity("reveal-role").fullWidth).toBe(true);
    expect(actionSeverity("submit-target").fullWidth).toBe(true);
    expect(actionSeverity("vote").fullWidth).toBe(false);
  });
});
