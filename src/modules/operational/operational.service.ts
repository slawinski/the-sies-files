// Recurring Operational engine (docs/06). One engine handles the first and all
// later cycles; poison/Drunk malfunction, protection, Demon attacks, death
// resolution, triggers, and Demon succession are centralized here.

import { Prisma } from "@prisma/client";
import { runCommand } from "@/lib/command";
import { DomainError } from "@/lib/errors";
import { systemClock } from "@/lib/clock";
import { EVENTS } from "@/modules/events/event-types";
import {
  STEP_ACTOR,
  STEP_CHARACTER,
  STEP_OCCURRENCE,
  TROUBLE_BREWING,
  type Occurrence,
  type StepKind,
} from "@/modules/trouble-brewing/script";
import type { SetupCandidate } from "@/modules/setup/types";
import { publish } from "@/modules/realtime/broker";
import { getAbilityFunctionState } from "./ability";
import { EFFECT_BOUNDARY, type EffectType } from "./effects";
import { demonDeathOutcome } from "./death";
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

function waitingStatus(kind: StepKind): "WAITING_FOR_PLAYER" | "WAITING_FOR_STORYTELLER" {
  return STEP_ACTOR[kind] === "PLAYER" ? "WAITING_FOR_PLAYER" : "WAITING_FOR_STORYTELLER";
}

function cycleMatches(occurrence: Occurrence, cycle: number): boolean {
  switch (occurrence) {
    case "FIRST_CYCLE_ONLY":
      return cycle === 1;
    case "EACH_CYCLE":
      return true;
    case "NOT_FIRST_CYCLE":
      return cycle > 1;
    case "TRIGGERED":
      return false; // triggered actions are inserted dynamically
  }
}

function computeSecretFor(
  kind: StepKind,
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
      return null; // player choices + lazily-resolved info (FT/Imp/Ravenkeeper)
  }
}

async function getFunctioning(
  tx: Prisma.TransactionClient,
  playerId: string,
  phase: "OPERATIONAL" | "INVESTIGATION",
  cycle: number,
): Promise<"FUNCTIONING" | "MALFUNCTIONING"> {
  const secret = await tx.playerSecret.findUnique({ where: { playerId } });
  if (!secret) return "FUNCTIONING";
  const effects = await tx.effect.findMany({
    where: { targetPlayerId: playerId, active: true },
  });
  return getAbilityFunctionState(secret, effects, phase, cycle);
}

async function loadCandidate(tx: Prisma.TransactionClient, gameId: string): Promise<SetupCandidate> {
  const draft = await tx.setupDraft.findUnique({ where: { gameId } });
  if (!draft || !draft.committedAt) {
    throw new DomainError("SETUP_NOT_COMMITTED", "Setup must be committed first");
  }
  return draft.candidateJson as unknown as SetupCandidate;
}

interface QueueSpec {
  kind: StepKind;
  actorPlayerId: string;
  secretJson: unknown;
}

async function buildQueue(
  tx: Prisma.TransactionClient,
  gameId: string,
  candidate: SetupCandidate,
  cycle: number,
): Promise<QueueSpec[]> {
  const order =
    cycle === 1 ? TROUBLE_BREWING.firstOperationalOrder : TROUBLE_BREWING.otherOperationalOrder;

  const players = await tx.player.findMany({ where: { gameId } });
  const aliveById = new Map(players.map((p) => [p.id, p.alive]));

  // Perceived character → alive player (so a Drunk believes their Townsfolk role).
  const byPerceived = new Map<string, string>();
  for (const a of candidate.assignments) {
    if (aliveById.get(a.playerId)) byPerceived.set(a.perceivedCharacterId, a.playerId);
  }

  const specs: QueueSpec[] = [];
  for (const step of order) {
    if (!cycleMatches(STEP_OCCURRENCE[step], cycle)) continue;
    const charId = STEP_CHARACTER[step];
    const playerId = byPerceived.get(charId);
    if (!playerId) continue;

    const info = computeSecretFor(step, candidate, playerId);
    const functioning = await getFunctioning(tx, playerId, "OPERATIONAL", cycle);
    specs.push({
      kind: step,
      actorPlayerId: playerId,
      secretJson: { info, functioning },
    });
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
    data: { status: waitingStatus(next.kind as StepKind) },
  });
}

async function insertAfter(
  tx: Prisma.TransactionClient,
  phaseId: string,
  afterOrderIndex: number,
  kind: StepKind,
  actorPlayerId: string,
  status: "WAITING_FOR_PLAYER" | "WAITING_FOR_STORYTELLER",
): Promise<void> {
  const later = await tx.operationalAction.findMany({
    where: { operationalPhaseId: phaseId, orderIndex: { gt: afterOrderIndex } },
    orderBy: { orderIndex: "desc" },
  });
  for (const a of later) {
    await tx.operationalAction.update({
      where: { id: a.id },
      data: { orderIndex: a.orderIndex + 1 },
    });
  }
  await tx.operationalAction.create({
    data: {
      operationalPhaseId: phaseId,
      orderIndex: afterOrderIndex + 1,
      kind,
      actorPlayerId,
      status,
    },
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
}): Promise<{ version: number; actionCount: number; cycleNumber: number }> {
  const { result, version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, game, appendEvent }) => {
      let cycle: number;
      if (game.status === "ROLE_REVEAL") {
        cycle = 1;
      } else if (game.status === "ACTIVE" && game.phase === "INVESTIGATION") {
        cycle = game.cycleNumber + 1;
        await tx.effect.updateMany({
          where: { gameId, active: true, expiryBoundary: "END_OF_INVESTIGATION" },
          data: { active: false },
        });
      } else {
        throw new DomainError("INVALID_SESSION_STATE", `Cannot start Operational in status ${game.status}/${game.phase ?? "none"}`);
      }

      const existing = await tx.operationalPhase.findFirst({
        where: { gameId, status: { not: "COMPLETED" } },
      });
      if (existing) throw new DomainError("INVALID_SESSION_STATE", "An Operational phase is already running");

      const candidate = await loadCandidate(tx, gameId);
      const specs = await buildQueue(tx, gameId, candidate, cycle);
      const phase = await tx.operationalPhase.create({
        data: { gameId, cycleNumber: cycle, status: "RUNNING" },
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
            secretJson: s.secretJson as Prisma.InputJsonValue,
          },
        });
      }

      await tx.gameSession.update({
        where: { id: gameId },
        data: { status: "ACTIVE", phase: "OPERATIONAL", cycleNumber: cycle },
      });
      await appendEvent(EVENTS.OPERATIONAL_STARTED, { cycleNumber: cycle });
      await appendEvent(EVENTS.ACTION_QUEUE_BUILT, { actionCount: specs.length });
      return { actionCount: specs.length, cycleNumber: cycle };
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version, ...result };
}

async function applyChoiceEffect(
  tx: Prisma.TransactionClient,
  gameId: string,
  cycle: number,
  kind: StepKind,
  actorPlayerId: string,
  targetPlayerId: string,
): Promise<void> {
  let effectType: EffectType | null = null;
  if (kind === "POISONER_CHOOSE") effectType = "POISONED";
  else if (kind === "MONK_CHOOSE") effectType = "MONK_PROTECTED_FROM_DEMON";
  else if (kind === "BUTLER_CHOOSE") effectType = "BUTLER_MASTER";
  else if (kind === "BUREAUCRAT_CHOOSE") effectType = "BUREAUCRAT_VOTE_WEIGHT_TARGET";
  if (!effectType) return;

  const functioning = await getFunctioning(tx, actorPlayerId, "OPERATIONAL", cycle);
  if (functioning === "MALFUNCTIONING") return; // choice recorded, no effect

  await tx.effect.create({
    data: {
      gameId,
      effectType,
      sourcePlayerId: actorPlayerId,
      targetPlayerId,
      cycleNumber: cycle,
      expiryBoundary: EFFECT_BOUNDARY[effectType],
    },
  });
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
      if (game.phase !== "OPERATIONAL") throw new DomainError("INVALID_PHASE", "No Operational phase in progress");
      const action = await tx.operationalAction.findUnique({
        where: { id: actionId },
        include: { phase: true },
      });
      if (!action || action.phase.gameId !== gameId) throw new DomainError("ACTION_NOT_ACTIVE", "Action not found");
      if (action.actorPlayerId !== playerId) throw new DomainError("FORBIDDEN", "This action belongs to another player");
      if (action.status !== "WAITING_FOR_PLAYER") throw new DomainError("ACTION_NOT_ACTIVE", "This action is not awaiting a player");

      await applyChoiceEffect(
        tx,
        gameId,
        action.phase.cycleNumber,
        action.kind as StepKind,
        playerId,
        targetPlayerIds[0],
      );

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
  const candidate = await loadCandidate(tx, gameId);

  if (action.kind === "FORTUNE_TELLER_INFO") {
    const choose = await tx.operationalAction.findFirst({
      where: { operationalPhaseId: action.operationalPhaseId, kind: "FORTUNE_TELLER_CHOOSE" },
    });
    const targets = (choose?.resolutionJson as { targetPlayerIds?: string[] } | null)?.targetPlayerIds ?? [];
    return { kind: "DEMON_YES_NO", value: computeFortuneTellerResult(candidate, targets) };
  }
  if (action.kind === "RAVENKEEPER_INFO") {
    throw new DomainError("INVALID_TARGET", "The Storyteller must provide the Ravenkeeper's answer");
  }

  const result = computeSecretFor(action.kind as StepKind, candidate, action.actorPlayerId ?? "");
  if (result === null) throw new DomainError("INVALID_SESSION_STATE", `Cannot resolve action kind ${action.kind}`);
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
      if (game.phase !== "OPERATIONAL") throw new DomainError("INVALID_PHASE", "No Operational phase in progress");
      const action = await tx.operationalAction.findUnique({
        where: { id: actionId },
        include: { phase: true },
      });
      if (!action || action.phase.gameId !== gameId) throw new DomainError("ACTION_NOT_ACTIVE", "Action not found");
      if (action.status !== "WAITING_FOR_STORYTELLER") throw new DomainError("ACTION_NOT_ACTIVE", "This action is not awaiting the Storyteller");

      const cycle = action.phase.cycleNumber;

      if (action.kind === "IMP_KILL") {
        await resolveImpKill(tx, gameId, cycle, action, resolution as { redirectToPlayerId?: string; successionPlayerId?: string } | undefined, appendEvent);
        await tx.operationalAction.update({
          where: { id: actionId },
          data: { status: "RESOLVED", resolutionJson: { resolved: true } as Prisma.InputJsonValue },
        });
        await activateNext(tx, action.operationalPhaseId, action.orderIndex);
        return {};
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

async function resolveImpKill(
  tx: Prisma.TransactionClient,
  gameId: string,
  cycle: number,
  action: { operationalPhaseId: string; orderIndex: number; actorPlayerId: string | null },
  payload: { redirectToPlayerId?: string; successionPlayerId?: string } | undefined,
  appendEvent: (type: string, payload?: unknown) => Promise<void>,
): Promise<void> {
  const choose = await tx.operationalAction.findFirst({
    where: { operationalPhaseId: action.operationalPhaseId, kind: "IMP_CHOOSE" },
  });
  const targetId = (choose?.resolutionJson as { targetPlayerIds?: string[] } | null)?.targetPlayerIds?.[0];
  if (!targetId) throw new DomainError("INVALID_TARGET", "The Demon has not chosen a kill target");

  const targetSecret = await tx.playerSecret.findUnique({ where: { playerId: targetId } });
  const targetEffects = await tx.effect.findMany({ where: { targetPlayerId: targetId, active: true } });
  const monkProtected = targetEffects.some(
    (e) => e.effectType === "MONK_PROTECTED_FROM_DEMON" && e.active && e.cycleNumber === cycle,
  );
  const targetFunctioning =
    getAbilityFunctionState(targetSecret!, targetEffects, "OPERATIONAL", cycle) === "FUNCTIONING";
  const targetChar = targetSecret!.trueCharacterId ?? "";

  // Mayor redirect: only when the target is a functioning Mayor.
  let deathTargetId = targetId;
  if (targetChar === "MAYOR" && targetFunctioning && payload?.redirectToPlayerId) {
    deathTargetId = payload.redirectToPlayerId;
    await appendEvent(EVENTS.DEATH_REDIRECTED, { from: targetId, to: deathTargetId });
  }

  const outcome = demonDeathOutcome({
    targetCharacterId: targetChar,
    targetFunctioning,
    monkProtected,
  });
  if (!outcome.dies) {
    await appendEvent(EVENTS.DEATH_PREVENTED, { playerId: targetId, reason: outcome.reason });
    await tx.operationalAction.update({
      where: { id: choose!.id },
      data: { status: "RESOLVED" },
    });
    return;
  }

  // Apply the death to the final target.
  await tx.player.update({ where: { id: deathTargetId }, data: { alive: false } });
  await appendEvent(EVENTS.PLAYER_DIED, { playerId: deathTargetId, source: "DEMON", cycleNumber: cycle });

  // Demon self-kill → star-pass succession.
  if (deathTargetId === action.actorPlayerId) {
    const successorId =
      payload?.successionPlayerId ??
      (await pickScarletWoman(tx, gameId, cycle));
    if (!successorId) throw new DomainError("INVALID_TARGET", "No valid living Minion to become the Demon");
    await tx.playerSecret.update({
      where: { playerId: successorId },
      data: { trueCharacterId: "IMP", perceivedCharacterId: "IMP" },
    });
    await appendEvent(EVENTS.CHARACTER_CHANGED, { playerId: successorId, to: "IMP", reason: "STAR_PASS" });
  } else {
    // Ravenkeeper trigger: insert a Storyteller-resolved info action.
    const rkSecret = await tx.playerSecret.findUnique({ where: { playerId: deathTargetId } });
    if (rkSecret && rkSecret.trueCharacterId === "RAVENKEEPER") {
      const functioning =
        getAbilityFunctionState(rkSecret, await tx.effect.findMany({ where: { targetPlayerId: deathTargetId, active: true } }), "OPERATIONAL", cycle) === "FUNCTIONING";
      if (functioning) {
        await insertAfter(tx, action.operationalPhaseId, action.orderIndex, "RAVENKEEPER_INFO", deathTargetId, "WAITING_FOR_STORYTELLER");
        await appendEvent(EVENTS.TRIGGERED_ACTION_CREATED, { playerId: deathTargetId, kind: "RAVENKEEPER_INFO" });
      }
    }
  }
}

async function pickScarletWoman(tx: Prisma.TransactionClient, gameId: string, cycle: number): Promise<string | null> {
  const secrets = await tx.playerSecret.findMany({ where: { player: { gameId, alive: true } } });
  const sw = secrets.find((s) => s.trueCharacterId === "SCARLET_WOMAN");
  if (sw) {
    const functioning =
      getAbilityFunctionState(sw, await tx.effect.findMany({ where: { targetPlayerId: sw.playerId, active: true } }), "OPERATIONAL", cycle) === "FUNCTIONING";
    if (functioning) return sw.playerId;
  }
  return null;
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
      if (game.phase !== "OPERATIONAL") throw new DomainError("INVALID_PHASE", "No Operational phase in progress");
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
      if (unresolved > 0) throw new DomainError("ACTION_NOT_ACTIVE", "Unresolved actions remain");

      await tx.effect.updateMany({
        where: { gameId, active: true, expiryBoundary: "END_OF_OPERATIONAL" },
        data: { active: false },
      });
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
