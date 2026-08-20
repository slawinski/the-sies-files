// First-Operational runner (docs/05 §8, docs/06 §3–§5). A narrow, correct
// first-cycle runner that Slice 3 will generalize into the recurring engine.

import { Prisma } from "@prisma/client";
import { runCommand } from "@/lib/command";
import { DomainError } from "@/lib/errors";
import { systemClock } from "@/lib/clock";
import { EVENTS } from "@/modules/events/event-types";
import { STEP_ACTOR, STEP_CHARACTER, TROUBLE_BREWING } from "@/modules/trouble-brewing/script";
import type { SetupCandidate } from "@/modules/setup/types";
import { publish } from "@/modules/realtime/broker";
import {
  computeAdjacentEvilPairs,
  computeCharacterCandidates,
  computeEmpathCount,
  computeFortuneTellerResult,
  type InfoResult,
} from "./info-resolver";

function publishInvalidation(gameId: string, version: number, sequence: number): void {
  publish(gameId, { type: "invalidate", version, sequence });
}

function waitingStatus(kind: string): "WAITING_FOR_PLAYER" | "WAITING_FOR_STORYTELLER" {
  const actor = STEP_ACTOR[kind as keyof typeof STEP_ACTOR];
  return actor === "PLAYER" ? "WAITING_FOR_PLAYER" : "WAITING_FOR_STORYTELLER";
}

function computeSecretFor(
  kind: string,
  candidate: SetupCandidate,
  actorPlayerId: string,
): InfoResult | null {
  switch (kind) {
    case "WASHERWOMAN_INFO":
      return computeCharacterCandidates(candidate, "TOWNSFOLK");
    case "LIBRARIAN_INFO":
      return computeCharacterCandidates(candidate, "OUTSIDER") ?? { kind: "NO_OUTSIDERS" };
    case "INVESTIGATOR_INFO":
      return computeCharacterCandidates(candidate, "MINION");
    case "CHEF_INFO":
      return { kind: "NUMBER", value: computeAdjacentEvilPairs(candidate) };
    case "EMPATH_INFO":
      return { kind: "NUMBER", value: computeEmpathCount(candidate, actorPlayerId) };
    case "SPY_GRIMOIRE":
      return { kind: "GRIMOIRE", assignments: candidate.assignments };
    default:
      return null; // player-choice steps + FT_INFO (computed at resolve time)
  }
}

interface QueueSpec {
  kind: string;
  actorPlayerId: string;
  secretJson: unknown | null;
}

function buildFirstCycleQueue(candidate: SetupCandidate): QueueSpec[] {
  const byTrueCharacter = new Map<string, string>();
  for (const a of candidate.assignments) {
    byTrueCharacter.set(a.trueCharacterId, a.playerId);
  }

  const specs: QueueSpec[] = [];
  for (const step of TROUBLE_BREWING.firstOperationalOrder) {
    const charId = STEP_CHARACTER[step];
    const playerId = byTrueCharacter.get(charId);
    if (!playerId) continue;
    const secretJson = computeSecretFor(step, candidate, playerId);
    specs.push({ kind: step, actorPlayerId: playerId, secretJson });
  }
  return specs;
}

async function activateNext(
  tx: Prisma.TransactionClient,
  phaseId: string,
  resolvedOrderIndex: number,
): Promise<void> {
  const next = await tx.operationalAction.findFirst({
    where: { operationalPhaseId: phaseId, status: "PENDING" },
    orderBy: { orderIndex: "asc" },
  });
  if (!next || next.orderIndex <= resolvedOrderIndex) return;
  await tx.operationalAction.update({
    where: { id: next.id },
    data: { status: waitingStatus(next.kind) },
  });
}

export async function startOperational({
  gameId,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number; actionCount: number }> {
  const { result, version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, game, appendEvent }) => {
      if (game.status !== "ROLE_REVEAL") {
        throw new DomainError("INVALID_SESSION_STATE", `Cannot start Operational in status ${game.status}`);
      }
      const draft = await tx.setupDraft.findUnique({ where: { gameId } });
      if (!draft || !draft.committedAt) {
        throw new DomainError("SETUP_NOT_COMMITTED", "Setup must be committed first");
      }
      const existing = await tx.operationalPhase.findFirst({
        where: { gameId, status: { not: "COMPLETED" } },
      });
      if (existing) throw new DomainError("INVALID_SESSION_STATE", "An Operational phase is already running");

      const candidate = draft.candidateJson as unknown as SetupCandidate;
      const specs = buildFirstCycleQueue(candidate);
      const phase = await tx.operationalPhase.create({
        data: { gameId, cycleNumber: 1, status: "RUNNING" },
      });

      for (let i = 0; i < specs.length; i += 1) {
        const s = specs[i];
        await tx.operationalAction.create({
          data: {
            operationalPhaseId: phase.id,
            orderIndex: i,
            kind: s.kind,
            actorPlayerId: s.actorPlayerId,
            status: i === 0 ? waitingStatus(s.kind) : "PENDING",
            secretJson: s.secretJson === null ? undefined : (s.secretJson as Prisma.InputJsonValue),
          },
        });
      }

      await tx.gameSession.update({
        where: { id: gameId },
        data: { status: "ACTIVE", phase: "OPERATIONAL", cycleNumber: 1 },
      });
      await appendEvent(EVENTS.OPERATIONAL_STARTED, {});
      await appendEvent(EVENTS.ACTION_QUEUE_BUILT, { actionCount: specs.length });
      return { actionCount: specs.length };
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version, actionCount: result.actionCount };
}

export async function submitAction({
  gameId,
  playerId,
  actionId,
  commandId,
  expectedVersion,
  targetPlayerIds,
}: {
  gameId: string;
  playerId: string;
  actionId: string;
  commandId: string;
  expectedVersion: number;
  targetPlayerIds: string[];
}): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: `player:${playerId}`,
    handler: async ({ tx, game, appendEvent }) => {
      if (game.phase !== "OPERATIONAL") {
        throw new DomainError("INVALID_PHASE", "No Operational phase in progress");
      }
      const action = await tx.operationalAction.findUnique({
        where: { id: actionId },
        include: { phase: true },
      });
      if (!action || action.phase.gameId !== gameId) {
        throw new DomainError("ACTION_NOT_ACTIVE", "Action not found");
      }
      if (action.actorPlayerId !== playerId) {
        throw new DomainError("FORBIDDEN", "This action belongs to another player");
      }
      if (action.status !== "WAITING_FOR_PLAYER") {
        throw new DomainError("ACTION_NOT_ACTIVE", "This action is not awaiting a player");
      }

      await tx.operationalAction.update({
        where: { id: actionId },
        data: { status: "RESOLVED", resolutionJson: { targetPlayerIds } as Prisma.InputJsonValue },
      });
      await activateNext(tx, action.operationalPhaseId, action.orderIndex);
      await appendEvent(EVENTS.PLAYER_ACTION_SUBMITTED, { actionId, playerId });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

async function computeDefaultResolution(
  tx: Prisma.TransactionClient,
  gameId: string,
  action: { kind: string; actorPlayerId: string | null; operationalPhaseId: string },
): Promise<InfoResult> {
  const draft = await tx.setupDraft.findUnique({ where: { gameId } });
  const candidate = draft!.candidateJson as unknown as SetupCandidate;

  if (action.kind === "FORTUNE_TELLER_INFO") {
    const choose = await tx.operationalAction.findFirst({
      where: { operationalPhaseId: action.operationalPhaseId, kind: "FORTUNE_TELLER_CHOOSE" },
    });
    const targets = (choose?.resolutionJson as { targetPlayerIds?: string[] } | null)?.targetPlayerIds ?? [];
    return { kind: "DEMON_YES_NO", value: computeFortuneTellerResult(candidate, targets) };
  }
  const result = computeSecretFor(action.kind, candidate, action.actorPlayerId ?? "");
  if (result === null) {
    throw new DomainError("INVALID_SESSION_STATE", `Cannot resolve action kind ${action.kind}`);
  }
  return result;
}

export async function resolveAction({
  gameId,
  actionId,
  commandId,
  expectedVersion,
  resolution,
}: {
  gameId: string;
  actionId: string;
  commandId: string;
  expectedVersion: number;
  resolution?: InfoResult;
}): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, game, appendEvent }) => {
      if (game.phase !== "OPERATIONAL") {
        throw new DomainError("INVALID_PHASE", "No Operational phase in progress");
      }
      const action = await tx.operationalAction.findUnique({
        where: { id: actionId },
        include: { phase: true },
      });
      if (!action || action.phase.gameId !== gameId) {
        throw new DomainError("ACTION_NOT_ACTIVE", "Action not found");
      }
      if (action.status !== "WAITING_FOR_STORYTELLER") {
        throw new DomainError("ACTION_NOT_ACTIVE", "This action is not awaiting the Storyteller");
      }

      const finalResolution = resolution ?? (await computeDefaultResolution(tx, gameId, action));
      await tx.operationalAction.update({
        where: { id: actionId },
        data: { status: "RESOLVED", resolutionJson: finalResolution as unknown as Prisma.InputJsonValue },
      });
      await activateNext(tx, action.operationalPhaseId, action.orderIndex);
      await appendEvent(EVENTS.STORYTELLER_DECISION_RECORDED, { actionId });
      await appendEvent(EVENTS.PRIVATE_INFORMATION_DELIVERED, { actionId, playerId: action.actorPlayerId });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export async function completeOperational({
  gameId,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, game, appendEvent }) => {
      if (game.phase !== "OPERATIONAL") {
        throw new DomainError("INVALID_PHASE", "No Operational phase in progress");
      }
      const phase = await tx.operationalPhase.findFirst({
        where: { gameId, status: { not: "COMPLETED" } },
      });
      if (!phase) throw new DomainError("INVALID_SESSION_STATE", "No active Operational phase");

      const unresolved = await tx.operationalAction.count({
        where: {
          operationalPhaseId: phase.id,
          status: { in: ["PENDING", "WAITING_FOR_PLAYER", "WAITING_FOR_STORYTELLER", "RESOLVING"] },
        },
      });
      if (unresolved > 0) {
        throw new DomainError("ACTION_NOT_ACTIVE", "Unresolved actions remain");
      }

      await tx.operationalPhase.update({
        where: { id: phase.id },
        data: { status: "COMPLETED", completedAt: systemClock.now() },
      });
      await tx.gameSession.update({ where: { id: gameId }, data: { phase: "INVESTIGATION" } });
      await appendEvent(EVENTS.OPERATIONAL_COMPLETED, {});
      await appendEvent(EVENTS.INVESTIGATION_STARTED, {});
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}
