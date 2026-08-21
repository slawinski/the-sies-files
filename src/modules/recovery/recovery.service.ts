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

type Db = Prisma.TransactionClient | typeof prisma;

async function buildSnapshot(db: Db, gameId: string): Promise<unknown> {
  const [game, players, secrets, effects, phases, actions, investigation, nominations, votes, scenarioState, conditions, tasks] = await Promise.all([
    db.gameSession.findUnique({ where: { id: gameId } }),
    db.player.findMany({ where: { gameId }, orderBy: { virtualSeat: "asc" } }),
    db.playerSecret.findMany({ where: { player: { gameId } } }),
    db.effect.findMany({ where: { gameId, active: true } }),
    db.operationalPhase.findMany({ where: { gameId } }),
    db.operationalAction.findMany({ where: { phase: { gameId } } }),
    db.investigationState.findUnique({ where: { gameId } }),
    db.nomination.findMany({ where: { gameId } }),
    db.vote.findMany({ where: { nomination: { gameId } } }),
    db.scenarioState.findUnique({ where: { gameId } }),
    db.scenarioCondition.findMany({ where: { gameId } }),
    db.taskState.findMany({ where: { gameId } }),
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
      const snapshot = JSON.parse(JSON.stringify(await buildSnapshot(prisma, gameId)));
      const checksum = computeCheckpointChecksum(snapshot);
      const checkpoint = await tx.checkpoint.create({
        data: {
          gameId,
          gameVersion: game.version + 1,
          lastEventSequence: game.eventSequence,
          snapshotJson: snapshot as Prisma.InputJsonValue,
          checksum,
          reason: reason ?? "MANUAL",
          boundaryKey: `MANUAL:${game.version + 1}:${commandId}`,
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

// ---------- Automatic checkpoints (audit spec 21 §5) ----------

export const CHECKPOINT_BOUNDARIES = [
  "SETUP_COMMITTED",
  "OPERATIONAL_COMPLETED",
  "INVESTIGATION_COMPLETED",
  "GAME_ENDED",
  "MANUAL",
] as const;
export type CheckpointBoundary = (typeof CHECKPOINT_BOUNDARIES)[number];

/**
 * Create a boundary checkpoint within the authoritative transaction. The
 * deterministic boundary key makes retries idempotent (spec 21 §5.2–5.3).
 */
export async function autoCheckpoint(
  db: Prisma.TransactionClient,
  gameId: string,
  boundary: CheckpointBoundary,
  gameVersion: number,
  appendEvent: (type: string, payload?: unknown) => Promise<number>,
): Promise<void> {
  const boundaryKey = `${boundary}:${gameVersion}`;
  const existing = await db.checkpoint.findUnique({
    where: { gameId_boundaryKey: { gameId, boundaryKey } },
  });
  if (existing) return;

  const snapshot = JSON.parse(JSON.stringify(await buildSnapshot(db, gameId)));
  const checksum = computeCheckpointChecksum(snapshot);
  const seq = await appendEvent(EVENTS.CHECKPOINT_CREATED, { reason: boundary, boundaryKey });
  await db.checkpoint.create({
    data: {
      gameId,
      gameVersion,
      lastEventSequence: seq,
      snapshotJson: snapshot as Prisma.InputJsonValue,
      checksum,
      reason: boundary,
      boundaryKey,
    },
  });
}

// ---------- Event replay verification (audit spec 21 §6) ----------

export const REPLAY_VERSION = 1;

export interface ReplayDiagnostic {
  ok: boolean;
  checkpointId: string;
  fromSequence: number;
  throughSequence: number;
  replayVersion: number;
  divergences: { path: string; expected: unknown; actual: unknown; eventSequence?: number }[];
}

export async function verifyReplay(gameId: string, checkpointId: string): Promise<ReplayDiagnostic> {
  const checkpoint = await prisma.checkpoint.findFirst({ where: { id: checkpointId, gameId } });
  if (!checkpoint) throw new DomainError("GAME_NOT_FOUND", "Checkpoint not found");
  if (!checkpoint.boundaryKey) throw new DomainError("INVALID_SESSION_STATE", "Checkpoint has no replayable boundary key");

  const snapshot = checkpoint.snapshotJson as {
    players?: Array<{ id: string; alive: boolean; ghostVoteAvailable: boolean }>;
  };
  const replayed = new Map(
    (snapshot.players ?? []).map((p) => [p.id, { alive: p.alive, ghostVoteAvailable: p.ghostVoteAvailable }]),
  );

  const events = await prisma.domainEvent.findMany({
    where: { gameId, sequence: { gt: checkpoint.lastEventSequence } },
    orderBy: { sequence: "asc" },
  });

  const divergences: ReplayDiagnostic["divergences"] = [];
  let expectedSeq = checkpoint.lastEventSequence;
  for (const e of events) {
    if (e.sequence !== expectedSeq + 1) {
      divergences.push({ path: `events.sequence.${e.sequence}`, expected: expectedSeq + 1, actual: e.sequence, eventSequence: e.sequence });
    }
    expectedSeq = e.sequence;

    const payload = e.payload as { playerId?: string; kind?: string; alive?: boolean } | null;
    const p = payload?.playerId ? replayed.get(payload.playerId) : undefined;
    if (e.eventType === "PLAYER_DIED" && p) p.alive = false;
    else if (e.eventType === "GHOST_VOTE_GRANTED" && p) p.ghostVoteAvailable = true;
    else if (e.eventType === "GHOST_VOTE_CONSUMED" && p) p.ghostVoteAvailable = false;
    else if (e.eventType === "TRAVELLER_EXILED" && p) p.alive = false;
    else if (e.eventType === "RECOVERY_OVERRIDE_APPLIED" && p) {
      if (payload?.kind === "CORRECT_ALIVE") p.alive = payload.alive ?? p.alive;
      if (payload?.kind === "RESTORE_GHOST_VOTE") p.ghostVoteAvailable = true;
    }
  }

  const current = await prisma.player.findMany({ where: { gameId } });
  for (const p of current) {
    const r = replayed.get(p.id);
    if (!r) continue;
    if (r.alive !== p.alive) divergences.push({ path: `players.${p.id}.alive`, expected: r.alive, actual: p.alive });
    if (r.ghostVoteAvailable !== p.ghostVoteAvailable) {
      divergences.push({ path: `players.${p.id}.ghostVoteAvailable`, expected: r.ghostVoteAvailable, actual: p.ghostVoteAvailable });
    }
  }

  return {
    ok: divergences.length === 0,
    checkpointId,
    fromSequence: checkpoint.lastEventSequence,
    throughSequence: expectedSeq,
    replayVersion: REPLAY_VERSION,
    divergences,
  };
}

// ---------- Audit categories (audit spec 21 §8) ----------

export const AUDIT_CATEGORIES = [
  "GAME_ENGINE",
  "OPERATIONAL",
  "INVESTIGATION_VOTING",
  "SCENARIO",
  "ACCESS_SESSION",
  "RECOVERY",
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

const EVENT_CATEGORY: Record<string, AuditCategory> = {
  GAME_CREATED: "GAME_ENGINE",
  GAME_RENAMED: "GAME_ENGINE",
  GAME_ENDED: "GAME_ENGINE",
  PLAYER_ADDED: "GAME_ENGINE",
  PLAYER_UPDATED: "GAME_ENGINE",
  PLAYER_REMOVED: "GAME_ENGINE",
  VIRTUAL_CIRCLE_REORDERED: "GAME_ENGINE",
  SETUP_GENERATED: "GAME_ENGINE",
  SETUP_COMMITTED: "GAME_ENGINE",
  ROLE_REVEALED_TO_PLAYER: "GAME_ENGINE",
  TRAVELLER_ALIGNMENT_ASSIGNED: "GAME_ENGINE",
  OPERATIONAL_STARTED: "OPERATIONAL",
  ACTION_QUEUE_BUILT: "OPERATIONAL",
  PLAYER_ACTION_SUBMITTED: "OPERATIONAL",
  STORYTELLER_DECISION_RECORDED: "OPERATIONAL",
  PRIVATE_INFORMATION_DELIVERED: "OPERATIONAL",
  OPERATIONAL_COMPLETED: "OPERATIONAL",
  DEATH_ATTEMPTED: "OPERATIONAL",
  DEATH_PREVENTED: "OPERATIONAL",
  DEATH_REDIRECTED: "OPERATIONAL",
  PLAYER_DIED: "OPERATIONAL",
  GHOST_VOTE_GRANTED: "OPERATIONAL",
  TRIGGERED_ACTION_CREATED: "OPERATIONAL",
  CHARACTER_CHANGED: "OPERATIONAL",
  EFFECT_APPLIED: "OPERATIONAL",
  EFFECT_EXPIRED: "OPERATIONAL",
  DEMON_SUCCESSION_RESOLVED: "OPERATIONAL",
  REGISTRATION_DECISION_REQUIRED: "OPERATIONAL",
  REGISTRATION_DECISION_RECORDED: "OPERATIONAL",
  VIRGIN_TRIGGER_CONSUMED: "INVESTIGATION_VOTING",
  INVESTIGATION_STARTED: "INVESTIGATION_VOTING",
  INVESTIGATION_COMPLETED: "INVESTIGATION_VOTING",
  NOMINATIONS_OPENED: "INVESTIGATION_VOTING",
  NOMINATIONS_CLOSED: "INVESTIGATION_VOTING",
  NOMINATION_CREATED: "INVESTIGATION_VOTING",
  VIRGIN_TRIGGER_RESOLVED: "INVESTIGATION_VOTING",
  SLAYER_USED: "INVESTIGATION_VOTING",
  VOTE_INTENT_RECORDED: "INVESTIGATION_VOTING",
  VOTE_LOCKED: "INVESTIGATION_VOTING",
  GHOST_VOTE_CONSUMED: "INVESTIGATION_VOTING",
  VOTING_STARTED: "INVESTIGATION_VOTING",
  VOTE_PASS_ADVANCED: "INVESTIGATION_VOTING",
  VOTE_PASS_COMPLETED: "INVESTIGATION_VOTING",
  NOMINATION_RESOLVED: "INVESTIGATION_VOTING",
  PLAYER_EXECUTED: "INVESTIGATION_VOTING",
  QR_SCANNED: "SCENARIO",
  CLUE_DISCOVERED: "SCENARIO",
  TASK_STARTED: "SCENARIO",
  TASK_COMPLETED: "SCENARIO",
  SCENARIO_STAGE_CHANGED: "SCENARIO",
  MAP_UNLOCKED: "SCENARIO",
  SCENARIO_CONDITION_APPLIED: "SCENARIO",
  SCENARIO_CONDITION_CLEARED: "SCENARIO",
  SCENARIO_OVERRIDE_APPLIED: "SCENARIO",
  PLAYER_CLAIM_TOKEN_ISSUED: "ACCESS_SESSION",
  PLAYER_CLAIMED: "ACCESS_SESSION",
  PLAYER_SESSION_REVOKED: "ACCESS_SESSION",
  PLAYER_ACCESS_RESET: "ACCESS_SESSION",
  STORYTELLER_ACCESS_RECOVERED: "ACCESS_SESSION",
  CHECKPOINT_CREATED: "RECOVERY",
  RECOVERY_OVERRIDE_APPLIED: "RECOVERY",
};

/** Unknown future event types fall into a documented safe default (spec 21 §8.2). */
export function classifyEventCategory(eventType: string): AuditCategory {
  return EVENT_CATEGORY[eventType] ?? "GAME_ENGINE";
}

export function categoryEventTypes(categories: AuditCategory[]): string[] {
  const set = new Set(categories);
  return Object.entries(EVENT_CATEGORY)
    .filter(([, cat]) => set.has(cat))
    .map(([type]) => type);
}

// ---------- Presence (audit spec 21 §4) ----------

export type PresenceConnection = "ONLINE" | "STALE" | "OFFLINE";

export const PRESENCE_ONLINE_MS = 30_000;
export const PRESENCE_STALE_MS = 120_000;

export function classifyPresence(lastSeenAt: Date, now: Date): PresenceConnection {
  const delta = now.getTime() - lastSeenAt.getTime();
  if (delta <= PRESENCE_ONLINE_MS) return "ONLINE";
  if (delta <= PRESENCE_STALE_MS) return "STALE";
  return "OFFLINE";
}

export async function heartbeat(gameId: string, viewerId: string): Promise<void> {
  await prisma.presence.upsert({
    where: { gameId_viewerId: { gameId, viewerId } },
    create: { gameId, viewerId, lastSeenAt: new Date() },
    update: { lastSeenAt: new Date() },
  });
}

export async function listPresence(gameId: string): Promise<Array<{ playerId: string | null; viewerId: string; connection: PresenceConnection; lastSeenAt: string }>> {
  const rows = await prisma.presence.findMany({ where: { gameId } });
  const now = new Date();
  return rows.map((r) => ({
    playerId: r.viewerId.startsWith("player:") ? r.viewerId.slice("player:".length) : null,
    viewerId: r.viewerId,
    connection: classifyPresence(r.lastSeenAt, now),
    lastSeenAt: r.lastSeenAt.toISOString(),
  }));
}
