// Storyteller control plane + recovery (docs/09). Checkpoints, consistency
// diagnostics, command status lookup, player access reset, and bounded audited
// recovery overrides. No DB surgery required for ordinary recovery.

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { runCommand } from "@/lib/command";
import { DomainError } from "@/lib/errors";
import { systemClock } from "@/lib/clock";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { cryptoSecureRng } from "@/lib/rng";
import { EVENTS } from "@/modules/events/event-types";
import { STEP_ACTOR, type StepKind } from "@/modules/trouble-brewing/script";
import { publish } from "@/modules/realtime/broker";
import { getScenarioDefinition } from "@/modules/scenario/definition";

function publishInvalidation(gameId: string, version: number, sequence: number): void {
  publish(gameId, { type: "invalidate", version, sequence });
}

// ---------- Checkpoints ----------

async function buildSnapshot(gameId: string): Promise<unknown> {
  const [game, players, secrets, effects, phases, actions, investigation, nominations, votes, scenarioState, conditions, tasks] = await Promise.all([
    prisma.gameSession.findUnique({ where: { id: gameId } }),
    prisma.player.findMany({ where: { gameId }, orderBy: { virtualSeat: "asc" } }),
    prisma.playerSecret.findMany({ where: { player: { gameId } } }),
    prisma.effect.findMany({ where: { gameId, active: true } }),
    prisma.operationalPhase.findMany({ where: { gameId } }),
    prisma.operationalAction.findMany({ where: { phase: { gameId } } }),
    prisma.investigationState.findUnique({ where: { gameId } }),
    prisma.nomination.findMany({ where: { gameId } }),
    prisma.vote.findMany({ where: { nomination: { gameId } } }),
    prisma.scenarioState.findUnique({ where: { gameId } }),
    prisma.scenarioCondition.findMany({ where: { gameId } }),
    prisma.taskState.findMany({ where: { gameId } }),
  ]);
  return {
    game,
    players,
    secrets,
    effects,
    operational: { phases, actions },
    investigation,
    nominations,
    votes,
    scenario: { scenarioState, conditions, tasks },
  };
}

/** Canonical, key-order-independent serialization (jsonb does not preserve key order). */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(",")}}`;
}

export function computeCheckpointChecksum(snapshot: unknown): string {
  return createHash("sha256").update(canonicalJson(snapshot)).digest("hex");
}

export async function createCheckpoint({
  gameId,
  commandId,
  expectedVersion,
  reason,
}: {
  gameId: string;
  commandId: string;
  expectedVersion: number;
  reason?: string;
}): Promise<{ version: number; checkpointId: string }> {
  const { result, version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, game, appendEvent }) => {
      // Normalize (Dates → strings) so the stored JSON hashes identically.
      const snapshot = JSON.parse(JSON.stringify(await buildSnapshot(gameId)));
      const checksum = computeCheckpointChecksum(snapshot);
      const checkpoint = await tx.checkpoint.create({
        data: {
          gameId,
          gameVersion: game.version + 1,
          lastEventSequence: game.eventSequence,
          snapshotJson: snapshot as Prisma.InputJsonValue,
          checksum,
          reason: reason ?? null,
        },
      });
      await appendEvent(EVENTS.CHECKPOINT_CREATED, { checkpointId: checkpoint.id, reason: reason ?? null });
      return { checkpointId: checkpoint.id };
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version, checkpointId: result.checkpointId };
}

export async function listCheckpoints(gameId: string) {
  return prisma.checkpoint.findMany({ where: { gameId }, orderBy: { createdAt: "desc" } });
}

export async function validateCheckpoint(gameId: string, checkpointId: string) {
  const checkpoint = await prisma.checkpoint.findFirst({ where: { id: checkpointId, gameId } });
  if (!checkpoint) throw new DomainError("GAME_NOT_FOUND", "Checkpoint not found");
  const recomputed = computeCheckpointChecksum(checkpoint.snapshotJson);
  return { valid: recomputed === checkpoint.checksum, checksum: checkpoint.checksum, recomputed };
}

// ---------- Command status ----------

export async function getCommandStatus(gameId: string, commandId: string) {
  const receipt = await prisma.commandReceipt.findUnique({
    where: { gameId_commandId: { gameId, commandId } },
  });
  if (!receipt) return { status: "UNKNOWN" as const };
  return {
    status: receipt.status,
    commandId,
    resultingGameVersion: receipt.resultingVersion,
    result: receipt.resultJson,
  };
}

// ---------- Consistency ----------

export interface ConsistencyIssue {
  check: string;
  ok: boolean;
  message: string;
}

export async function runConsistencyChecks(gameId: string): Promise<ConsistencyIssue[]> {
  const game = await prisma.gameSession.findUnique({ where: { id: gameId } });
  if (!game) throw new DomainError("GAME_NOT_FOUND", "Game not found");
  const issues: ConsistencyIssue[] = [];

  const players = await prisma.player.findMany({ where: { gameId }, orderBy: { virtualSeat: "asc" } });
  const seats = players.map((p) => p.virtualSeat);
  const contiguous = seats.every((s, i) => s === i);
  issues.push({ check: "VIRTUAL_CIRCLE_CONTIGUOUS", ok: contiguous, message: contiguous ? "ok" : `seats: ${seats.join(",")}` });

  const activePhases = await prisma.operationalPhase.count({ where: { gameId, status: { not: "COMPLETED" } } });
  issues.push({ check: "SINGLE_ACTIVE_OPERATIONAL", ok: activePhases <= 1, message: `${activePhases} active` });

  const latestEvent = await prisma.domainEvent.findFirst({ where: { gameId }, orderBy: { sequence: "desc" } });
  const versionMatches = (latestEvent?.gameVersion ?? 0) === game.version;
  issues.push({ check: "VERSION_MATCHES_EVENTS", ok: versionMatches, message: `game=${game.version} events=${latestEvent?.gameVersion ?? 0}` });

  if (game.status === "ENDED") {
    issues.push({ check: "ENDED_HAS_WINNER", ok: game.winner != null, message: game.winner ?? "missing winner" });
  }

  if (game.status === "ACTIVE" || game.status === "ROLE_REVEAL") {
    const demons = await prisma.playerSecret.count({ where: { player: { gameId, alive: true }, trueCharacterId: "IMP" } });
    issues.push({ check: "ONE_LIVING_DEMON", ok: demons === 1, message: `${demons} living demons` });
  }

  const traveller = players.find((p) => p.participantKind === "TRAVELLER");
  if (traveller) {
    const secret = await prisma.playerSecret.findUnique({ where: { playerId: traveller.id } });
    issues.push({ check: "TRAVELLER_IS_BUREAUCRAT", ok: secret?.trueCharacterId === "BUREAUCRAT", message: secret?.trueCharacterId ?? "none" });
  }

  const scenario = await prisma.scenarioState.findUnique({ where: { gameId } });
  if (scenario?.mapVersionId) {
    const def = getScenarioDefinition(scenario.scenarioId ?? "THE_SIES_FILES_MILLIONAIRE", scenario.scenarioVersion ?? 1);
    const mapExists = def.mapVersions.some((m) => m.id === scenario.mapVersionId);
    issues.push({ check: "SCENARIO_MAP_EXISTS", ok: mapExists, message: scenario.mapVersionId });
  }

  const active = await prisma.operationalAction.count({
    where: { phase: { gameId, status: { not: "COMPLETED" } }, status: { in: ["WAITING_FOR_PLAYER", "WAITING_FOR_STORYTELLER"] } },
  });
  issues.push({ check: "SINGLE_BLOCKING_ACTION", ok: active <= 1, message: `${active} blocking` });

  return issues;
}

// ---------- Player access reset ----------

export async function resetPlayerAccess({
  gameId,
  playerId,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  playerId: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number; claimToken: string }> {
  const rawToken = generateToken(cryptoSecureRng);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(systemClock.now().getTime() + 60 * 60 * 24 * 7 * 1000);

  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, appendEvent }) => {
      const player = await tx.player.findFirst({ where: { id: playerId, gameId } });
      if (!player) throw new DomainError("PLAYER_NOT_FOUND", "Player not found");
      await tx.browserSession.updateMany({ where: { playerId, revokedAt: null }, data: { revokedAt: systemClock.now() } });
      await tx.playerClaim.upsert({
        where: { playerId },
        create: { playerId, tokenHash, expiresAt },
        update: { tokenHash, expiresAt, claimedAt: null, commandId: null, revokedAt: null },
      });
      await appendEvent(EVENTS.PLAYER_ACCESS_RESET, { playerId });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version, claimToken: rawToken };
}

// ---------- Bounded recovery overrides ----------

export type RecoveryOverridePayload =
  | { kind: "RESOLVE_ACTION"; actionId: string }
  | { kind: "SKIP_ACTION"; actionId: string }
  | { kind: "CORRECT_ALIVE"; playerId: string; alive: boolean }
  | { kind: "RESTORE_GHOST_VOTE"; playerId: string };

export async function recoveryOverride({
  gameId,
  commandId,
  expectedVersion,
  payload,
  reason,
}: {
  gameId: string;
  commandId: string;
  expectedVersion: number;
  payload: RecoveryOverridePayload;
  reason: string;
}): Promise<{ version: number }> {
  const trimmedReason = reason.trim();
  if (!trimmedReason) throw new DomainError("INVALID_SESSION_STATE", "A reason is required for recovery overrides");

  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, appendEvent }) => {
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};

      if (payload.kind === "RESOLVE_ACTION" || payload.kind === "SKIP_ACTION") {
        const action = await tx.operationalAction.findUnique({ where: { id: payload.actionId }, include: { phase: true } });
        if (!action || action.phase.gameId !== gameId) throw new DomainError("ACTION_NOT_ACTIVE", "Action not found");
        before.status = action.status;
        await tx.operationalAction.update({
          where: { id: action.id },
          data: payload.kind === "RESOLVE_ACTION"
            ? { status: "RESOLVED", resolutionJson: { recoveryResolved: true } as Prisma.InputJsonValue }
            : { status: "SKIPPED" },
        });
        const next = await tx.operationalAction.findFirst({
          where: { operationalPhaseId: action.operationalPhaseId, status: "PENDING" },
          orderBy: { orderIndex: "asc" },
        });
        if (next && next.orderIndex > action.orderIndex) {
          const actor = STEP_ACTOR[next.kind as StepKind];
          await tx.operationalAction.update({
            where: { id: next.id },
            data: { status: actor === "PLAYER" ? "WAITING_FOR_PLAYER" : "WAITING_FOR_STORYTELLER" },
          });
        }
        after.status = payload.kind === "RESOLVE_ACTION" ? "RESOLVED" : "SKIPPED";
      } else if (payload.kind === "CORRECT_ALIVE") {
        const player = await tx.player.findFirst({ where: { id: payload.playerId, gameId } });
        if (!player) throw new DomainError("PLAYER_NOT_FOUND", "Player not found");
        before.alive = player.alive;
        await tx.player.update({ where: { id: player.id }, data: { alive: payload.alive } });
        after.alive = payload.alive;
      } else if (payload.kind === "RESTORE_GHOST_VOTE") {
        const player = await tx.player.findFirst({ where: { id: payload.playerId, gameId } });
        if (!player) throw new DomainError("PLAYER_NOT_FOUND", "Player not found");
        before.ghostVoteAvailable = player.ghostVoteAvailable;
        await tx.player.update({ where: { id: player.id }, data: { ghostVoteAvailable: true } });
        after.ghostVoteAvailable = true;
      }

      await appendEvent(EVENTS.RECOVERY_OVERRIDE_APPLIED, { kind: payload.kind, reason: trimmedReason, before, after });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}
