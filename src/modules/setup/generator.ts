// Deterministic Trouble Brewing setup generator (docs/05 §4).
// Given the same players + seed, the generator always produces the same
// candidate (docs/01 §5.6). The caller supplies an injectable RNG.

import { DomainError } from "@/lib/errors";
import type { Rng } from "@/lib/rng";
import {
  MINIONS,
  OUTSIDERS,
  TOWNSFOLK,
  alignmentOf,
  type CharacterId,
} from "@/modules/trouble-brewing/characters";
import { applyBaron, baseCounts } from "./counts";
import type { SetupAssignment, SetupCandidate } from "./types";

export const SETUP_GENERATOR_VERSION = 1;

export interface SetupPlayer {
  playerId: string;
  virtualSeat: number;
  participantKind: "NORMAL" | "TRAVELLER";
}

function pickDistinct<T>(rng: Rng, pool: T[], count: number): T[] {
  const copy = [...pool];
  const result: T[] = [];
  for (let i = 0; i < count; i += 1) {
    const idx = rng.randomInt(0, copy.length - 1);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function shuffle<T>(rng: Rng, items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = rng.randomInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateSetupCandidate(input: {
  players: SetupPlayer[];
  rng: Rng;
}): SetupCandidate {
  const { players, rng } = input;

  const normals = players
    .filter((p) => p.participantKind === "NORMAL")
    .sort((a, b) => a.virtualSeat - b.virtualSeat);
  const travellers = players.filter((p) => p.participantKind === "TRAVELLER");

  if (travellers.length > 1) {
    throw new DomainError("ROSTER_SIZE_INVALID", "At most one Traveller is supported");
  }

  const normalCount = normals.length;
  const base = baseCounts(normalCount);

  // 1. Select minions (Baron detection drives the final counts).
  const minions = pickDistinct(rng, MINIONS, base.minions);
  const baronInPlay = minions.includes("BARON");
  const counts = applyBaron(base, baronInPlay);

  // 2. Select outsiders, townsfolk, demon.
  const outsiders = pickDistinct(rng, OUTSIDERS, counts.outsiders);
  const townsfolk = pickDistinct(rng, TOWNSFOLK, counts.townsfolk);
  const demon: CharacterId = "IMP";

  // 3. Full character pool, shuffled across the (ordered) normal players.
  const pool: CharacterId[] = [...townsfolk, ...outsiders, ...minions, demon];
  const shuffled = shuffle(rng, pool);

  const assignments: SetupAssignment[] = normals.map((p, i) => {
    const trueCharacterId = shuffled[i];
    let perceivedCharacterId = trueCharacterId;
    if (trueCharacterId === "DRUNK") {
      const unusedTownsfolk = TOWNSFOLK.filter((t) => !pool.includes(t));
      perceivedCharacterId = pickDistinct(rng, unusedTownsfolk, 1)[0];
    }
    return {
      playerId: p.playerId,
      virtualSeat: p.virtualSeat,
      participantKind: "NORMAL",
      trueCharacterId,
      perceivedCharacterId,
      trueAlignment: alignmentOf(trueCharacterId),
    };
  });

  // 4. Traveller (participant 16): public Bureaucrat, secret alignment.
  for (const t of travellers) {
    assignments.push({
      playerId: t.playerId,
      virtualSeat: t.virtualSeat,
      participantKind: "TRAVELLER",
      trueCharacterId: "BUREAUCRAT",
      perceivedCharacterId: "BUREAUCRAT",
      trueAlignment: rng.randomInt(0, 1) === 0 ? "GOOD" : "EVIL",
    });
  }

  // 5. Fortune Teller red herring: one valid GOOD normal player.
  let fortuneTellerRedHerringPlayerId: string | null = null;
  if (pool.includes("FORTUNE_TELLER")) {
    const goodNormals = assignments.filter(
      (a) => a.participantKind === "NORMAL" && a.trueAlignment === "GOOD",
    );
    fortuneTellerRedHerringPlayerId = pickDistinct(
      rng,
      goodNormals.map((a) => a.playerId),
      1,
    )[0];
  }

  // 6. Demon bluffs: three legal not-in-play good characters.
  const inPlay = new Set(pool);
  const notInPlay = [...TOWNSFOLK, ...OUTSIDERS].filter((c) => !inPlay.has(c));
  const demonBluffs = pickDistinct(rng, notInPlay, 3);

  return {
    generatorVersion: SETUP_GENERATOR_VERSION,
    participantCount: players.length,
    normalCount,
    assignments,
    fortuneTellerRedHerringPlayerId,
    demonBluffs,
  };
}
