import { describe, it, expect } from "vitest";
import { SeededRng } from "@/lib/rng";
import { CHARACTER_DEFINITIONS } from "@/modules/trouble-brewing/characters";
import {
  generateSetupCandidate,
  type SetupPlayer,
} from "@/modules/setup/generator";
import type { SetupCandidate } from "@/modules/setup/types";

function makePlayers(count: number, withTraveller = false): SetupPlayer[] {
  const players: SetupPlayer[] = [];
  for (let i = 0; i < count; i += 1) {
    players.push({ playerId: `p${i}`, virtualSeat: i, participantKind: "NORMAL" });
  }
  if (withTraveller) {
    players.push({ playerId: "traveller", virtualSeat: count, participantKind: "TRAVELLER" });
  }
  return players;
}

function generate(players: SetupPlayer[], seed = 12345): SetupCandidate {
  return generateSetupCandidate({ players, rng: new SeededRng(seed) });
}

function normalAssignments(c: SetupCandidate) {
  return c.assignments.filter((a) => a.participantKind === "NORMAL");
}

function categoryCounts(c: SetupCandidate) {
  const counts = { TOWNSFOLK: 0, OUTSIDER: 0, MINION: 0, DEMON: 0 };
  for (const a of normalAssignments(c)) {
    const cat = CHARACTER_DEFINITIONS[a.trueCharacterId].category;
    if (cat !== "TRAVELLER") counts[cat] += 1;
  }
  return counts;
}

function hasBaron(c: SetupCandidate): boolean {
  return normalAssignments(c).some((a) => a.trueCharacterId === "BARON");
}

describe("setup generator — counts", () => {
  it("13 players → 9 townsfolk, 0 outsiders, 3 minions, 1 demon (no Baron)", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const c = generate(makePlayers(13), seed);
      if (hasBaron(c)) continue;
      expect(categoryCounts(c)).toEqual({
        TOWNSFOLK: 9,
        OUTSIDER: 0,
        MINION: 3,
        DEMON: 1,
      });
    }
  });

  it("14 players → 9 townsfolk, 1 outsider, 3 minions, 1 demon (no Baron)", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const c = generate(makePlayers(14), seed);
      if (hasBaron(c)) continue;
      expect(categoryCounts(c)).toEqual({
        TOWNSFOLK: 9,
        OUTSIDER: 1,
        MINION: 3,
        DEMON: 1,
      });
    }
  });

  it("15 players → 9 townsfolk, 2 outsiders, 3 minions, 1 demon (no Baron)", () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const c = generate(makePlayers(15), seed);
      if (hasBaron(c)) continue;
      expect(categoryCounts(c)).toEqual({
        TOWNSFOLK: 9,
        OUTSIDER: 2,
        MINION: 3,
        DEMON: 1,
      });
    }
  });

  it("Baron shifts +2 outsiders / −2 townsfolk", () => {
    // Find a seed that produces Baron.
    let c: SetupCandidate | null = null;
    for (let seed = 1; seed <= 200 && !c; seed += 1) {
      const cand = generate(makePlayers(13), seed);
      if (hasBaron(cand)) c = cand;
    }
    expect(c).not.toBeNull();
    expect(categoryCounts(c!)).toEqual({
      TOWNSFOLK: 7,
      OUTSIDER: 2,
      MINION: 3,
      DEMON: 1,
    });
  });
});

describe("setup generator — 16th participant Traveller", () => {
  it("16 participants → 15 normal players + one public Bureaucrat", () => {
    const c = generate(makePlayers(15, true));
    expect(c.participantCount).toBe(16);
    expect(c.normalCount).toBe(15);
    const traveller = c.assignments.find((a) => a.participantKind === "TRAVELLER");
    expect(traveller).toBeDefined();
    expect(traveller!.trueCharacterId).toBe("BUREAUCRAT");
    expect(traveller!.perceivedCharacterId).toBe("BUREAUCRAT");
    expect(["GOOD", "EVIL"]).toContain(traveller!.trueAlignment);
  });
});

describe("setup generator — determinism + uniqueness", () => {
  it("is deterministic for the same seed", () => {
    const a = generate(makePlayers(15), 999);
    const b = generate(makePlayers(15), 999);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("assigns unique true characters to normal players", () => {
    for (let seed = 1; seed <= 30; seed += 1) {
      const c = generate(makePlayers(15), seed);
      const chars = normalAssignments(c).map((a) => a.trueCharacterId);
      expect(new Set(chars).size).toBe(chars.length);
    }
  });
});

describe("setup generator — Drunk, red herring, bluffs", () => {
  function findWith(condition: (c: SetupCandidate) => boolean, seedMax = 300): SetupCandidate {
    for (let seed = 1; seed <= seedMax; seed += 1) {
      const c = generate(makePlayers(15), seed);
      if (condition(c)) return c;
    }
    throw new Error("no candidate matched");
  }

  it("Drunk perceives an unused Townsfolk, never the truth", () => {
    const c = findWith((x) => normalAssignments(x).some((a) => a.trueCharacterId === "DRUNK"));
    const drunk = normalAssignments(c).find((a) => a.trueCharacterId === "DRUNK")!;
    expect(drunk.perceivedCharacterId).not.toBe("DRUNK");
    expect(CHARACTER_DEFINITIONS[drunk.perceivedCharacterId].category).toBe("TOWNSFOLK");
    const inPlay = new Set(normalAssignments(c).map((a) => a.trueCharacterId));
    expect(inPlay.has(drunk.perceivedCharacterId)).toBe(false);
  });

  it("Fortune Teller red herring is a GOOD normal player", () => {
    const c = findWith((x) => normalAssignments(x).some((a) => a.trueCharacterId === "FORTUNE_TELLER"));
    expect(c.fortuneTellerRedHerringPlayerId).not.toBeNull();
    const rh = c.assignments.find((a) => a.playerId === c.fortuneTellerRedHerringPlayerId)!;
    expect(rh.participantKind).toBe("NORMAL");
    expect(rh.trueAlignment).toBe("GOOD");
  });

  it("Demon bluffs are three not-in-play good characters", () => {
    const c = generate(makePlayers(15));
    const inPlay = new Set(normalAssignments(c).map((a) => a.trueCharacterId));
    expect(c.demonBluffs).toHaveLength(3);
    for (const bluff of c.demonBluffs) {
      expect(inPlay.has(bluff)).toBe(false);
      expect(["TOWNSFOLK", "OUTSIDER"]).toContain(CHARACTER_DEFINITIONS[bluff].category);
    }
  });
});
