// Recurring Operational engine (docs/06). One engine handles the first and all
// later cycles; poison/Drunk malfunction, protection, Demon attacks, death
// resolution, triggers, and Demon succession are centralized here.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
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
import { CHARACTER_DEFINITIONS, type CharacterId } from "@/modules/trouble-brewing/characters";
import type { SetupCandidate } from "@/modules/setup/types";
import { publish } from "@/modules/realtime/broker";
import { getAbilityFunctionState } from "./ability";
import { EFFECT_BOUNDARY, type EffectType } from "./effects";
import { demonDeathOutcome } from "./death";
import { validateTargets } from "./targets";
import { markPlayerDead } from "@/modules/game-session/death";
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

    // Undertaker only acts after an Investigation with an execution (audit spec 19 §7).
    if (step === "UNDERTAKER_INFO") {
      const exec = await tx.deathRecord.findFirst({
        where: { gameId, source: "EXECUTION", executed: true, cycleNumber: cycle - 1 },
      });
      if (!exec) continue;
    }

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

      // Server-side target contract (audit spec 18 §8): cardinality, same-game
      // membership, role-specific self/alive constraints.
      const targets = await tx.player.findMany({
        where: { gameId, id: { in: targetPlayerIds } },
      });
      validateTargets({
        kind: action.kind as StepKind,
        actorPlayerId: playerId,
        targetPlayerIds,
        targets: targets.map((t) => ({ playerId: t.id, alive: t.alive })),
      });

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
  action: { kind: string; actorPlayerId: string | null; operationalPhaseId: string; phase: { cycleNumber: number } },
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
  if (action.kind === "UNDERTAKER_INFO") {
    const exec = await tx.deathRecord.findFirst({
      where: { gameId, source: "EXECUTION", executed: true, cycleNumber: action.phase.cycleNumber - 1 },
    });
    if (!exec) throw new DomainError("INVALID_SESSION_STATE", "No execution to report");
    const secret = await tx.playerSecret.findUnique({ where: { playerId: exec.playerId } });
    return { kind: "CHARACTER", characterId: secret?.trueCharacterId ?? "", playerId: exec.playerId };
  }

  const result = computeSecretFor(action.kind as StepKind, candidate, action.actorPlayerId ?? "");
  if (result === null) throw new DomainError("INVALID_SESSION_STATE", `Cannot resolve action kind ${action.kind}`);
  return result;
}

export type StorytellerActionResolution =
  | { kind: "INFO"; value: InfoResult }
  | { kind: "IMP_KILL"; mayorRedirectToPlayerId?: string; starPassSuccessorPlayerId?: string }
  | { kind: "REGISTRATION"; optionId: string };

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
  resolution?: StorytellerActionResolution;
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
        const payload = resolution && resolution.kind === "IMP_KILL" ? resolution : undefined;
        await resolveImpKill(tx, gameId, cycle, action, payload, appendEvent);
        await tx.operationalAction.update({
          where: { id: actionId },
          data: { status: "RESOLVED", resolutionJson: { resolved: true } as Prisma.InputJsonValue },
        });
        await activateNext(tx, action.operationalPhaseId, action.orderIndex);
        return {};
      }

      const finalResolution =
        resolution && resolution.kind === "INFO" ? resolution.value : await computeDefaultResolution(tx, gameId, action);
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
  payload: { mayorRedirectToPlayerId?: string; starPassSuccessorPlayerId?: string } | undefined,
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

  // Mayor redirect: only when the target is a functioning Mayor, and the
  // redirect target must be a living member of this game (audit finding X1).
  let deathTargetId = targetId;
  if (payload?.mayorRedirectToPlayerId) {
    if (!(targetChar === "MAYOR" && targetFunctioning)) {
      throw new DomainError("INVALID_TARGET", "Mayor redirect is not available for this target");
    }
    const redirectTarget = await tx.player.findFirst({
      where: { id: payload.mayorRedirectToPlayerId, gameId, alive: true },
    });
    if (!redirectTarget) throw new DomainError("INVALID_TARGET", "Invalid redirect target");
    deathTargetId = payload.mayorRedirectToPlayerId;
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

  // Apply the death to the final target (grants the ghost vote, emits events).
  const death = await markPlayerDead(tx, {
    gameId,
    playerId: deathTargetId,
    source: "DEMON",
    cycleNumber: cycle,
    phase: "OPERATIONAL",
    executed: false,
    appendEvent,
  });
  if (!death.died) return; // already dead — no succession/triggers

  // Demon self-kill → star-pass succession (audit spec 19 §5). Successors are
  // living Minions in this game; Scarlet Woman is NOT a generic default here.
  if (deathTargetId === action.actorPlayerId) {
    const minionSecrets = await tx.playerSecret.findMany({
      where: { player: { gameId, alive: true } },
    });
    const legalSuccessors = minionSecrets
      .filter((s) => CHARACTER_DEFINITIONS[s.trueCharacterId as CharacterId]?.category === "MINION")
      .map((s) => s.playerId);

    let successorId: string | null = null;
    if (payload?.starPassSuccessorPlayerId) {
      if (!legalSuccessors.includes(payload.starPassSuccessorPlayerId)) {
        throw new DomainError("INVALID_TARGET", "Not a legal star-pass successor");
      }
      successorId = payload.starPassSuccessorPlayerId;
    } else if (legalSuccessors.length === 1) {
      successorId = legalSuccessors[0];
    } else if (legalSuccessors.length > 1) {
      throw new DomainError("INVALID_TARGET", "Multiple legal successors — the Storyteller must choose one");
    }
    if (successorId) {
      await tx.playerSecret.update({
        where: { playerId: successorId },
        data: { trueCharacterId: "IMP", perceivedCharacterId: "IMP" },
      });
      await appendEvent(EVENTS.CHARACTER_CHANGED, { playerId: successorId, to: "IMP", reason: "STAR_PASS" });
    }
    // Zero legal successors: the Demon stays dead (victory rules handle it).
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

/** Server-derived Storyteller decision context for a pending action (spec 19 §9). */
export async function getActionDecisionContext(gameId: string, actionId: string): Promise<unknown> {
  const action = await prisma.operationalAction.findUnique({
    where: { id: actionId },
    include: { phase: true },
  });
  if (!action || action.phase.gameId !== gameId) throw new DomainError("ACTION_NOT_ACTIVE", "Action not found");

  if (action.kind === "IMP_KILL") {
    const choose = await prisma.operationalAction.findFirst({
      where: { operationalPhaseId: action.operationalPhaseId, kind: "IMP_CHOOSE" },
    });
    const targetId = (choose?.resolutionJson as { targetPlayerIds?: string[] } | null)?.targetPlayerIds?.[0] ?? null;
    const players = await prisma.player.findMany({ where: { gameId }, include: { secret: true } });
    const target = players.find((p) => p.id === targetId) ?? null;
    const targetEffects = target ? await prisma.effect.findMany({ where: { targetPlayerId: target.id, active: true } }) : [];
    const targetFunctioning =
      target?.secret != null
        ? getAbilityFunctionState(target.secret, targetEffects, "OPERATIONAL", action.phase.cycleNumber) === "FUNCTIONING"
        : false;
    const redirectAvailable = target?.secret?.trueCharacterId === "MAYOR" && targetFunctioning;
    const successors = players.filter(
      (p) => p.alive && p.secret && CHARACTER_DEFINITIONS[p.secret.trueCharacterId as CharacterId]?.category === "MINION",
    );
    const selfKill = targetId != null && targetId === action.actorPlayerId;
    return {
      kind: "IMP_KILL",
      originalTarget: target ? { playerId: target.id, displayName: target.displayName } : null,
      mayorRedirect: {
        available: redirectAvailable,
        eligibleTargets: redirectAvailable
          ? players.filter((p) => p.alive && p.id !== targetId).map((p) => ({ playerId: p.id, displayName: p.displayName }))
          : [],
      },
      starPass: {
        required: selfKill && successors.length >= 2,
        eligibleSuccessors: selfKill
          ? successors.map((p) => ({ playerId: p.id, displayName: p.displayName }))
          : [],
      },
    };
  }

  const secretJson = action.secretJson as { info?: unknown; functioning?: string } | null;
  return {
    kind: "INFO",
    functioning: secretJson?.functioning ?? "FUNCTIONING",
    info: secretJson?.info ?? null,
    requiresFalseInformation: secretJson?.functioning === "MALFUNCTIONING",
  };
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
