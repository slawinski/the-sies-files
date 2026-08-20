// Scenario engine service (docs/08): QR scan resolution, transition evaluation,
// map unlock, and scenario-only conditions. Scenario never mutates game state.

import { Prisma } from "@prisma/client";
import { runCommand } from "@/lib/command";
import { DomainError } from "@/lib/errors";
import { EVENTS } from "@/modules/events/event-types";
import { publish } from "@/modules/realtime/broker";
import { getScenarioDefinition, type ScenarioAction, type ScenarioDefinition } from "./definition";

function publishInvalidation(gameId: string, version: number, sequence: number): void {
  publish(gameId, { type: "invalidate", version, sequence });
}

export interface ScenarioFacts {
  clueIds: Set<string>;
  completedTaskIds: Set<string>;
  activeConditionIds: Set<string>;
  stageId: string;
}

function factIds(facts: ScenarioFacts): Set<string> {
  return new Set([...facts.clueIds, ...facts.completedTaskIds, ...facts.activeConditionIds, facts.stageId]);
}

/** Evaluate transitions until fixpoint; returns the actions to apply. */
export function evaluateTransitions(def: ScenarioDefinition, facts: ScenarioFacts): ScenarioAction[] {
  const applied: ScenarioAction[] = [];
  const fired = new Set<string>();
  let guard = 0;
  let changed = true;

  while (changed && guard < 100) {
    guard += 1;
    changed = false;
    for (const t of def.transitions) {
      if (fired.has(t.id)) continue;
      const ids = factIds(facts);
      const allOk = (t.when.allOf ?? []).every((id) => ids.has(id));
      const anyOk = t.when.anyOf ? t.when.anyOf.some((id) => ids.has(id)) : true;
      if (!allOk || !anyOk) continue;

      fired.add(t.id);
      for (const a of t.actions) {
        applied.push(a);
        if (a.type === "REVEAL_CLUE") facts.clueIds.add(a.clueId);
        if (a.type === "APPLY_CONDITION") facts.activeConditionIds.add(a.conditionId);
        if (a.type === "CLEAR_CONDITION") facts.activeConditionIds.delete(a.conditionId);
        if (a.type === "SET_STAGE") facts.stageId = a.stageId;
      }
      changed = true;
    }
  }
  if (guard >= 100) throw new DomainError("INVALID_SESSION_STATE", "Scenario transition loop detected");
  return applied;
}

async function loadFacts(tx: Prisma.TransactionClient, gameId: string): Promise<ScenarioFacts> {
  const state = await tx.scenarioState.findUnique({ where: { gameId } });
  const discoveries = await tx.scenarioDiscovery.findMany({ where: { gameId, objectType: "CLUE" } });
  const tasks = await tx.taskState.findMany({ where: { gameId, state: "COMPLETED" } });
  const conditions = await tx.scenarioCondition.findMany({ where: { gameId, active: true } });
  return {
    clueIds: new Set(discoveries.map((d) => d.objectId)),
    completedTaskIds: new Set(tasks.map((t) => t.taskId)),
    activeConditionIds: new Set(conditions.map((c) => c.conditionId)),
    stageId: state?.stageId ?? getScenarioDefinition("THE_SIES_FILES_MILLIONAIRE", 1).initialStageId,
  };
}

async function ensureScenarioState(tx: Prisma.TransactionClient, gameId: string) {
  const def = getScenarioDefinition("THE_SIES_FILES_MILLIONAIRE", 1);
  return tx.scenarioState.upsert({
    where: { gameId },
    create: { gameId, scenarioId: def.id, scenarioVersion: def.version, stageId: def.initialStageId, mapVersionId: def.initialMapVersionId, stateJson: {} },
    update: {},
  });
}

export async function scanQr({
  gameId,
  playerId,
  token,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  playerId: string;
  token: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number; outcome: unknown }> {
  const { result, version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: `player:${playerId}`,
    handler: async ({ tx, game, appendEvent }) => {
      // Terrain availability guard (docs/08 §4).
      const investigation = await tx.investigationState.findUnique({ where: { gameId } });
      const terrainAvailable =
        game.status === "ACTIVE" &&
        game.phase === "INVESTIGATION" &&
        (investigation?.nominationState ?? "CLOSED") === "CLOSED";
      if (!terrainAvailable) throw new DomainError("TERRAIN_UNAVAILABLE", "Terrain is unavailable right now");

      const def = getScenarioDefinition("THE_SIES_FILES_MILLIONAIRE", 1);
      const qr = def.qrTokens.find((q) => q.token === token);
      if (!qr) throw new DomainError("QR_UNKNOWN", "Unknown QR token");

      // Idempotency: same commandId for this player already applied.
      const existing = await tx.qrScan.findUnique({
        where: { gameId_playerId_commandId: { gameId, playerId, commandId } },
      });
      if (existing) return { outcome: { duplicate: true } };

      // Repeat policy.
      if (qr.repeatPolicy !== "REPEATABLE_PER_PLAYER") {
        const prior = await tx.qrScan.findFirst({ where: { gameId, qrTokenId: qr.id, ...(qr.repeatPolicy === "ONCE_PER_PLAYER" ? { playerId } : {}) } });
        if (prior) throw new DomainError("QR_ALREADY_CONSUMED", "This QR has already been used");
      }

      // Ensure scenario state exists.
      await ensureScenarioState(tx, gameId);

      // Apply the QR's actions + transitions.
      const facts = await loadFacts(tx, gameId);
      // Fold the QR's own effects into facts so transitions can see them.
      for (const a of qr.actions) {
        if (a.type === "REVEAL_CLUE") facts.clueIds.add(a.clueId);
        else if (a.type === "APPLY_CONDITION") facts.activeConditionIds.add(a.conditionId);
        else if (a.type === "CLEAR_CONDITION") facts.activeConditionIds.delete(a.conditionId);
        else if (a.type === "SET_STAGE") facts.stageId = a.stageId;
      }
      const actions = [...qr.actions, ...evaluateTransitions(def, facts)];
      const outcome: { discoveries: string[]; tasks: string[]; conditions: string[]; mapVersionId: string | null } = {
        discoveries: [],
        tasks: [],
        conditions: [],
        mapVersionId: null,
      };

      for (const a of actions) {
        if (a.type === "REVEAL_CLUE") {
          const clue = def.clues.find((c) => c.id === a.clueId);
          if (clue) {
            await tx.scenarioDiscovery.create({
              data: { gameId, playerId, objectId: clue.id, objectType: "CLUE", visibilityScope: clue.visibilityScope, contentJson: { title: clue.title, body: clue.body } },
            });
            outcome.discoveries.push(clue.id);
            await appendEvent(EVENTS.CLUE_DISCOVERED, { clueId: clue.id, playerId });
          }
        } else if (a.type === "ISSUE_TASK") {
          await tx.taskState.upsert({
            where: { id: `${gameId}:${a.taskId}` },
            create: { id: `${gameId}:${a.taskId}`, gameId, taskId: a.taskId, state: "AVAILABLE" },
            update: {},
          });
          outcome.tasks.push(a.taskId);
        } else if (a.type === "APPLY_CONDITION" || a.type === "CLEAR_CONDITION") {
          const active = a.type === "APPLY_CONDITION";
          await tx.scenarioCondition.upsert({
            where: { id: `${gameId}:${a.conditionId}` },
            create: { id: `${gameId}:${a.conditionId}`, gameId, conditionId: a.conditionId, active },
            update: { active },
          });
          outcome.conditions.push(a.conditionId);
          await appendEvent(active ? EVENTS.SCENARIO_CONDITION_APPLIED : EVENTS.SCENARIO_CONDITION_CLEARED, { conditionId: a.conditionId, playerId });
        } else if (a.type === "SET_MAP_VERSION") {
          await tx.scenarioState.update({ where: { gameId }, data: { mapVersionId: a.mapVersionId } });
          outcome.mapVersionId = a.mapVersionId;
          await appendEvent(EVENTS.MAP_UNLOCKED, { mapVersionId: a.mapVersionId });
        } else if (a.type === "SET_STAGE") {
          await tx.scenarioState.update({ where: { gameId }, data: { stageId: a.stageId } });
          await appendEvent(EVENTS.SCENARIO_STAGE_CHANGED, { stageId: a.stageId });
        }
      }

      await tx.qrScan.create({ data: { gameId, playerId, qrTokenId: qr.id, commandId, outcome: "CONSUMED" } });
      await appendEvent(EVENTS.QR_SCANNED, { qrTokenId: qr.id, playerId });
      return { outcome };
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version, outcome: result.outcome };
}

interface OverrideArgs {
  gameId: string;
  commandId: string;
  expectedVersion: number;
}

export async function storytellerRevealClue({
  gameId,
  clueId,
  targetPlayerId,
  commandId,
  expectedVersion,
}: OverrideArgs & { clueId: string; targetPlayerId?: string }): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, appendEvent }) => {
      const def = getScenarioDefinition("THE_SIES_FILES_MILLIONAIRE", 1);
      const clue = def.clues.find((c) => c.id === clueId);
      if (!clue) throw new DomainError("INVALID_TARGET", "Unknown clue");
      await ensureScenarioState(tx, gameId);
      const existing = await tx.scenarioDiscovery.findFirst({
        where: { gameId, objectId: clueId, objectType: "CLUE" },
      });
      if (!existing) {
        await tx.scenarioDiscovery.create({
          data: {
            gameId,
            playerId: targetPlayerId ?? null,
            objectId: clueId,
            objectType: "CLUE",
            visibilityScope: clue.visibilityScope,
            contentJson: { title: clue.title, body: clue.body },
          },
        });
      }
      await appendEvent(EVENTS.SCENARIO_OVERRIDE_APPLIED, { kind: "REVEAL_CLUE", clueId });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export async function storytellerCompleteTask({
  gameId,
  taskId,
  commandId,
  expectedVersion,
}: OverrideArgs & { taskId: string }): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, appendEvent }) => {
      const def = getScenarioDefinition("THE_SIES_FILES_MILLIONAIRE", 1);
      if (!def.tasks.some((t) => t.id === taskId)) throw new DomainError("INVALID_TARGET", "Unknown task");
      await ensureScenarioState(tx, gameId);
      await tx.taskState.upsert({
        where: { id: `${gameId}:${taskId}` },
        create: { id: `${gameId}:${taskId}`, gameId, taskId, state: "COMPLETED" },
        update: { state: "COMPLETED" },
      });
      await appendEvent(EVENTS.SCENARIO_OVERRIDE_APPLIED, { kind: "COMPLETE_TASK", taskId });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export async function storytellerSetStage({
  gameId,
  stageId,
  commandId,
  expectedVersion,
}: OverrideArgs & { stageId: string }): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, appendEvent }) => {
      if (!stageId.trim()) throw new DomainError("INVALID_TARGET", "Stage id is required");
      await ensureScenarioState(tx, gameId);
      await tx.scenarioState.update({ where: { gameId }, data: { stageId } });
      await appendEvent(EVENTS.SCENARIO_OVERRIDE_APPLIED, { kind: "SET_STAGE", stageId });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export async function storytellerSetMap({
  gameId,
  mapVersionId,
  commandId,
  expectedVersion,
}: OverrideArgs & { mapVersionId: string }): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, appendEvent }) => {
      const def = getScenarioDefinition("THE_SIES_FILES_MILLIONAIRE", 1);
      if (!def.mapVersions.some((m) => m.id === mapVersionId)) throw new DomainError("INVALID_TARGET", "Unknown map version");
      await ensureScenarioState(tx, gameId);
      await tx.scenarioState.update({ where: { gameId }, data: { mapVersionId } });
      await appendEvent(EVENTS.SCENARIO_OVERRIDE_APPLIED, { kind: "SET_MAP", mapVersionId });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export async function storytellerSetCondition({
  gameId,
  conditionId,
  active,
  commandId,
  expectedVersion,
}: OverrideArgs & { conditionId: string; active: boolean }): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, appendEvent }) => {
      await ensureScenarioState(tx, gameId);
      await tx.scenarioCondition.upsert({
        where: { id: `${gameId}:${conditionId}` },
        create: { id: `${gameId}:${conditionId}`, gameId, conditionId, active },
        update: { active },
      });
      await appendEvent(EVENTS.SCENARIO_OVERRIDE_APPLIED, { kind: "SET_CONDITION", conditionId, active });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}
