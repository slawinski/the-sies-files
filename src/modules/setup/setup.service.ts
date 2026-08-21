// Setup application commands (docs/05 §4–§6). Generation is deterministic given
// the seed; commit is immutable; role reveal/ack marks the player's private
// reveal as seen.

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runCommand } from "@/lib/command";
import { DomainError } from "@/lib/errors";
import { systemClock } from "@/lib/clock";
import { cryptoSecureRng, SeededRngV2 } from "@/lib/rng";
import { EVENTS } from "@/modules/events/event-types";
import { isRosterReady } from "@/modules/game-session/roster.rules";
import {
  TROUBLE_BREWING_SCRIPT_ID,
  TROUBLE_BREWING_SCRIPT_VERSION,
} from "@/modules/trouble-brewing/script";
import { publish } from "@/modules/realtime/broker";
import { autoCheckpoint } from "@/modules/recovery/recovery.service";
import {
  generateSetupCandidate,
  SETUP_GENERATOR_VERSION,
} from "./generator";
import type { SetupCandidate } from "./types";

function publishInvalidation(gameId: string, version: number, sequence: number): void {
  publish(gameId, { type: "invalidate", version, sequence });
}

/** A >=128-bit (unguessable) seed; the RNG state is derived from it (v2). */
export function newSetupSeed(): string {
  return Buffer.from(cryptoSecureRng.randomBytes(16)).toString("hex");
}

export function computeSetupHash(candidate: SetupCandidate): string {
  return createHash("sha256").update(JSON.stringify(candidate)).digest("hex");
}

/** Load the immutable committed candidate (null if setup not committed). */
export async function getCommittedCandidate(gameId: string): Promise<SetupCandidate | null> {
  const draft = await prisma.setupDraft.findUnique({ where: { gameId } });
  if (!draft || !draft.committedAt) return null;
  return draft.candidateJson as unknown as SetupCandidate;
}

export async function generateSetup({
  gameId,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number; regenerationIndex: number }> {
  const { result, version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    resultSchema: z.object({ regenerationIndex: z.number() }),
    handler: async ({ tx, game, appendEvent }) => {
      if (game.status !== "LOBBY" && game.status !== "SETUP") {
        throw new DomainError("INVALID_SESSION_STATE", `Cannot generate setup in status ${game.status}`);
      }
      const players = await tx.player.findMany({
        where: { gameId },
        orderBy: { virtualSeat: "asc" },
      });
      if (!isRosterReady(players.length)) {
        throw new DomainError("ROSTER_SIZE_INVALID", "Setup requires 13–16 participants");
      }

      const seed = newSetupSeed();
      const candidate = generateSetupCandidate({
        players: players.map((p) => ({
          playerId: p.id,
          virtualSeat: p.virtualSeat,
          participantKind: p.participantKind,
        })),
        rng: new SeededRngV2(seed),
      });

      const existing = await tx.setupDraft.findUnique({ where: { gameId } });
      const regenerationIndex = existing ? existing.regenerationIndex + 1 : 0;
      await tx.setupDraft.upsert({
        where: { gameId },
        create: {
          gameId,
          generatorVersion: SETUP_GENERATOR_VERSION,
          seed,
          candidateJson: candidate as unknown as Prisma.InputJsonValue,
          regenerationIndex,
        },
        update: {
          generatorVersion: SETUP_GENERATOR_VERSION,
          seed,
          candidateJson: candidate as unknown as Prisma.InputJsonValue,
          regenerationIndex,
          committedAt: null,
          setupHash: null,
        },
      });

      if (game.status === "LOBBY") {
        await tx.gameSession.update({ where: { id: gameId }, data: { status: "SETUP" } });
      }
      await appendEvent(EVENTS.SETUP_GENERATED, { regenerationIndex });
      return { regenerationIndex };
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version, regenerationIndex: result.regenerationIndex };
}

export async function commitSetup({
  gameId,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number; setupHash: string }> {
  const { result, version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    resultSchema: z.object({ setupHash: z.string() }),
    handler: async ({ tx, game, appendEvent }) => {
      if (game.status !== "SETUP") {
        throw new DomainError("INVALID_SESSION_STATE", `Cannot commit setup in status ${game.status}`);
      }
      const draft = await tx.setupDraft.findUnique({ where: { gameId } });
      if (!draft) throw new DomainError("SETUP_NOT_COMMITTED", "No setup draft has been generated");
      if (draft.committedAt) throw new DomainError("INVALID_SESSION_STATE", "Setup is already committed");

      const candidate = draft.candidateJson as unknown as SetupCandidate;
      const players = await tx.player.findMany({ where: { gameId } });
      const normalCount = players.filter((p) => p.participantKind === "NORMAL").length;
      if (candidate.normalCount !== normalCount || candidate.assignments.length !== players.length) {
        throw new DomainError("INVALID_SESSION_STATE", "Setup candidate does not match the roster");
      }

      const setupHash = computeSetupHash(candidate);
      await tx.setupDraft.update({
        where: { gameId },
        data: { committedAt: systemClock.now(), setupHash },
      });

      for (const a of candidate.assignments) {
        await tx.playerSecret.upsert({
          where: { playerId: a.playerId },
          create: {
            playerId: a.playerId,
            trueCharacterId: a.trueCharacterId,
            perceivedCharacterId: a.perceivedCharacterId,
            trueAlignment: a.trueAlignment,
            abilityStateJson: {},
          },
          update: {
            trueCharacterId: a.trueCharacterId,
            perceivedCharacterId: a.perceivedCharacterId,
            trueAlignment: a.trueAlignment,
            roleAcknowledgedAt: null,
          },
        });
      }

      await tx.gameSession.update({
        where: { id: gameId },
        data: {
          status: "ROLE_REVEAL",
          scriptId: TROUBLE_BREWING_SCRIPT_ID,
          scriptVersion: TROUBLE_BREWING_SCRIPT_VERSION,
        },
      });
      await appendEvent(EVENTS.SETUP_COMMITTED, { setupHash });
      await autoCheckpoint(tx, gameId, "SETUP_COMMITTED", game.version + 1, appendEvent);
      return { setupHash };
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version, setupHash: result.setupHash };
}

export async function acknowledgeRole({
  gameId,
  playerId,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  playerId: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: `player:${playerId}`,
    handler: async ({ tx, game, appendEvent }) => {
      if (game.status !== "ROLE_REVEAL" && game.status !== "ACTIVE") {
        throw new DomainError("INVALID_SESSION_STATE", `Cannot acknowledge role in status ${game.status}`);
      }
      const secret = await tx.playerSecret.findUnique({ where: { playerId } });
      if (!secret) throw new DomainError("SETUP_NOT_COMMITTED", "Role has not been assigned yet");
      await tx.playerSecret.update({
        where: { playerId },
        data: { roleAcknowledgedAt: systemClock.now() },
      });
      await appendEvent(EVENTS.ROLE_REVEALED_TO_PLAYER, { playerId });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}
