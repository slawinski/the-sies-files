// Investigation engine (docs/07): nominations, voting, execution, victory,
// Traveller exile, and the Slayer day ability. Server-authoritative throughout.

import { Prisma } from "@prisma/client";
import { runCommand } from "@/lib/command";
import { DomainError } from "@/lib/errors";
import { systemClock } from "@/lib/clock";
import { EVENTS } from "@/modules/events/event-types";
import type { CharacterId } from "@/modules/trouble-brewing/characters";
import { publish } from "@/modules/realtime/broker";
import { getAbilityFunctionState } from "@/modules/operational/ability";
import { tallyVotes, qualifies, type VoterState } from "./voting";
import { checkGenericVictory, checkMayorVictory, type Winner } from "./victory";
import { markPlayerDead, type DeathSource } from "@/modules/game-session/death";
import { autoCheckpoint } from "@/modules/recovery/recovery.service";
import {
  getRegistrationOptions,
  resolveRegistrationOptions,
  type RegistrationOption,
} from "@/modules/trouble-brewing/registration";

function publishInvalidation(gameId: string, version: number, sequence: number): void {
  publish(gameId, { type: "invalidate", version, sequence });
}

async function ensureInvestigation(
  tx: Prisma.TransactionClient,
  gameId: string,
  cycleNumber: number,
) {
  return tx.investigationState.upsert({
    where: { gameId },
    create: { gameId, cycleNumber },
    update: {},
  });
}

async function livingNormalCount(tx: Prisma.TransactionClient, gameId: string): Promise<number> {
  return tx.player.count({
    where: { gameId, alive: true, participantKind: "NORMAL" },
  });
}

async function demonAlive(tx: Prisma.TransactionClient, gameId: string): Promise<boolean> {
  const demon = await tx.player.findFirst({
    where: { gameId, alive: true, secret: { trueCharacterId: "IMP" } },
  });
  return demon != null;
}

async function finalizeGame(
  tx: Prisma.TransactionClient,
  gameId: string,
  winner: Winner,
  reason: string,
  appendEvent: (type: string, payload?: unknown) => Promise<number>,
): Promise<void> {
  await tx.gameSession.update({
    where: { id: gameId },
    data: { status: "ENDED", winner, winReason: reason },
  });
  await appendEvent(EVENTS.GAME_ENDED, { winner, reason });
  const game = await tx.gameSession.findUniqueOrThrow({ where: { id: gameId } });
  await autoCheckpoint(tx, gameId, "GAME_ENDED", game.version + 1, appendEvent);
}

async function recordDeath(
  tx: Prisma.TransactionClient,
  gameId: string,
  cycle: number,
  playerId: string,
  source: DeathSource,
  phase: "INVESTIGATION" | "OPERATIONAL",
  executed: boolean,
  causedByPlayerId: string | undefined,
  appendEvent: (type: string, payload?: unknown) => Promise<number>,
): Promise<{ died: boolean }> {
  return markPlayerDead(tx, {
    gameId,
    playerId,
    source,
    cycleNumber: cycle,
    phase,
    executed,
    causedByPlayerId,
    appendEvent,
  });
}

export async function openNominations({
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
      if (game.phase !== "INVESTIGATION") throw new DomainError("INVALID_PHASE", "Nominations require Investigation");
      const inv = await ensureInvestigation(tx, gameId, game.cycleNumber);
      await tx.investigationState.update({
        where: { gameId: inv.gameId },
        data: { nominationState: "OPEN", cycleNumber: game.cycleNumber },
      });
      await appendEvent(EVENTS.NOMINATIONS_OPENED, {});
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export async function closeNominations({
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
      if (game.phase !== "INVESTIGATION") throw new DomainError("INVALID_PHASE", "Nominations require Investigation");
      await ensureInvestigation(tx, gameId, game.cycleNumber);
      await tx.investigationState.update({
        where: { gameId },
        data: { nominationState: "CLOSED" },
      });
      await appendEvent(EVENTS.NOMINATIONS_CLOSED, {});
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export async function nominate({
  gameId,
  nominatorId,
  nomineeId,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  nominatorId: string;
  nomineeId: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number; nominationId: string }> {
  const { result, version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: `player:${nominatorId}`,
    handler: async ({ tx, game, appendEvent }) => {
      if (game.phase !== "INVESTIGATION") throw new DomainError("INVALID_PHASE", "Nomination requires Investigation");
      const inv = await ensureInvestigation(tx, gameId, game.cycleNumber);
      if (inv.nominationState !== "OPEN") throw new DomainError("INVALID_SESSION_STATE", "Nominations are closed");

      const nominator = await tx.player.findFirst({ where: { id: nominatorId, gameId } });
      const nominee = await tx.player.findFirst({ where: { id: nomineeId, gameId } });
      if (!nominator || !nominee) throw new DomainError("PLAYER_NOT_FOUND", "Player not found");
      if (!nominator.alive) throw new DomainError("PLAYER_DEAD", "Dead players cannot nominate");
      if (!nominee.alive) throw new DomainError("INVALID_TARGET", "Cannot nominate a dead player");
      if (nominatorId === nomineeId) throw new DomainError("INVALID_TARGET", "Cannot nominate yourself");

      const cycle = game.cycleNumber;
      const alreadyNominated = await tx.nomination.findFirst({
        where: { gameId, cycleNumber: cycle, nominatorId },
      });
      if (alreadyNominated) throw new DomainError("PLAYER_ALREADY_NOMINATED_TODAY", "Already nominated this day");
      const alreadyNominee = await tx.nomination.findFirst({
        where: { gameId, cycleNumber: cycle, nomineeId },
      });
      if (alreadyNominee) throw new DomainError("INVALID_TARGET", "This player has already been nominated");

      const count = await tx.nomination.count({ where: { gameId, cycleNumber: cycle } });
      const nomination = await tx.nomination.create({
        data: {
          gameId,
          cycleNumber: cycle,
          nominatorId,
          nomineeId,
          sequence: count,
          status: "DAY_TRIGGER_RESOLUTION",
        },
      });
      await appendEvent(EVENTS.NOMINATION_CREATED, { nominationId: nomination.id, nominatorId, nomineeId });

      // Day-trigger resolution (audit specs 18 §6, 20 §2–§3): Virgin hook.
      let finalStatus: "VOTING" | "RESOLVED" | "DAY_TRIGGER_RESOLUTION" = "VOTING";
      const nomineeSecret = await tx.playerSecret.findUnique({ where: { playerId: nomineeId } });
      if (nomineeSecret?.trueCharacterId === "VIRGIN") {
        const virginState = (nomineeSecret.abilityStateJson as { virginNominated?: boolean } | null) ?? {};
        if (!virginState.virginNominated) {
          // Functioning gate: a poisoned/Drunk Virgin never triggers.
          const virginEffects = await tx.effect.findMany({ where: { targetPlayerId: nomineeId, active: true } });
          const virginFunctioning =
            getAbilityFunctionState(nomineeSecret, virginEffects, "INVESTIGATION", cycle) === "FUNCTIONING";
          // Consume the once-only trigger opportunity regardless of outcome.
          await tx.playerSecret.update({
            where: { playerId: nomineeId },
            data: { abilityStateJson: { ...virginState, virginNominated: true } },
          });
          await appendEvent(EVENTS.VIRGIN_TRIGGER_CONSUMED, { nomineeId, nominatorId });

          if (virginFunctioning) {
            const nominatorSecret = await tx.playerSecret.findUnique({ where: { playerId: nominatorId } });
            const nominatorEffects = await tx.effect.findMany({ where: { targetPlayerId: nominatorId, active: true } });
            const nominatorFunctioning = nominatorSecret
              ? getAbilityFunctionState(nominatorSecret, nominatorEffects, "INVESTIGATION", cycle) === "FUNCTIONING"
              : false;
            const options = getRegistrationOptions(
              {
                playerId: nominatorId,
                trueCharacterId: nominatorSecret!.trueCharacterId as CharacterId,
                trueAlignment: nominatorSecret!.trueAlignment as "GOOD" | "EVIL",
              },
              { kind: "CATEGORY", category: "TOWNSFOLK" },
              nominatorFunctioning,
            );
            const resolution = resolveRegistrationOptions(options);
            if (resolution.kind === "AUTO") {
              if (resolution.satisfies) {
                await recordDeath(tx, gameId, cycle, nominatorId, "VIRGIN", "INVESTIGATION", false, nomineeId, appendEvent);
                await appendEvent(EVENTS.VIRGIN_TRIGGER_RESOLVED, { nominatorId, nomineeId });
                finalStatus = "RESOLVED"; // terminal — no vote opens
              }
            } else {
              await tx.nomination.update({
                where: { id: nomination.id },
                data: {
                  decisionJson: {
                    context: "VIRGIN_NOMINATOR_TOWNSFOLK",
                    nominatorId,
                    options: resolution.options,
                  } as unknown as Prisma.InputJsonValue,
                },
              });
              await appendEvent(EVENTS.REGISTRATION_DECISION_REQUIRED, {
                nominationId: nomination.id,
                context: "VIRGIN_NOMINATOR_TOWNSFOLK",
              });
              finalStatus = "DAY_TRIGGER_RESOLUTION";
            }
          }
        }
      }

      await tx.nomination.update({
        where: { id: nomination.id },
        data: { status: finalStatus },
      });

      return { nominationId: nomination.id };
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version, nominationId: result.nominationId };
}

export async function resolveNominationTrigger({
  gameId,
  nominationId,
  optionId,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  nominationId: string;
  optionId: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, game, appendEvent }) => {
      const nomination = await tx.nomination.findFirst({ where: { id: nominationId, gameId } });
      if (!nomination) throw new DomainError("GAME_NOT_FOUND", "Nomination not found");
      if (nomination.status !== "DAY_TRIGGER_RESOLUTION") {
        throw new DomainError("INVALID_SESSION_STATE", "No pending day-trigger decision");
      }
      const decision = nomination.decisionJson as {
        context: string;
        nominatorId: string;
        options: RegistrationOption[];
      } | null;
      if (!decision) throw new DomainError("INVALID_SESSION_STATE", "No pending registration decision");
      const option = decision.options.find((o) => o.optionId === optionId);
      if (!option) throw new DomainError("INVALID_TARGET", "Not a legal registration option");

      await tx.nomination.update({ where: { id: nominationId }, data: { decisionJson: Prisma.JsonNull } });
      await appendEvent(EVENTS.REGISTRATION_DECISION_RECORDED, {
        nominationId,
        context: decision.context,
        optionId,
      });

      if (decision.context === "VIRGIN_NOMINATOR_TOWNSFOLK") {
        if (option.satisfies) {
          await recordDeath(tx, gameId, game.cycleNumber, decision.nominatorId, "VIRGIN", "INVESTIGATION", false, nomination.nomineeId, appendEvent);
          await appendEvent(EVENTS.VIRGIN_TRIGGER_RESOLVED, { nominatorId: decision.nominatorId, nomineeId: nomination.nomineeId });
          await tx.nomination.update({ where: { id: nominationId }, data: { status: "RESOLVED" } });
        } else {
          await tx.nomination.update({ where: { id: nominationId }, data: { status: "VOTING" } });
        }
      }
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export async function voteIntent({
  gameId,
  nominationId,
  playerId,
  intent,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  nominationId: string;
  playerId: string;
  intent: boolean;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: `player:${playerId}`,
    handler: async ({ tx, appendEvent }) => {
      const nomination = await tx.nomination.findFirst({ where: { id: nominationId, gameId } });
      if (!nomination) throw new DomainError("GAME_NOT_FOUND", "Nomination not found");
      if (nomination.status !== "VOTING") throw new DomainError("VOTE_LOCKED", "Voting is not open for this nomination");

      // Virtual-Circle voting pass (audit spec 20 §4): only the player at the
      // current seat may cast; the pass then advances deterministically.
      if (nomination.passStatus !== "RUNNING" || nomination.currentVirtualSeat == null) {
        throw new DomainError("VOTE_LOCKED", "The voting pass is not at your seat");
      }
      const voter = await tx.player.findFirst({ where: { id: playerId, gameId } });
      if (!voter || voter.virtualSeat !== nomination.currentVirtualSeat) {
        throw new DomainError("FORBIDDEN", "It is not your turn in the voting pass");
      }
      if (!voter.alive && !(voter.participantKind === "NORMAL" && voter.ghostVoteAvailable)) {
        throw new DomainError("GHOST_VOTE_ALREADY_USED", "No vote available");
      }

      await tx.vote.upsert({
        where: { nominationId_playerId: { nominationId, playerId } },
        create: { nominationId, playerId, rawIntent: intent },
        update: { rawIntent: intent },
      });
      await appendEvent(EVENTS.VOTE_INTENT_RECORDED, { nominationId, playerId, intent });

      const next = await tx.player.findFirst({
        where: { gameId, virtualSeat: { gt: nomination.currentVirtualSeat } },
        orderBy: { virtualSeat: "asc" },
      });
      if (next) {
        await tx.nomination.update({ where: { id: nominationId }, data: { currentVirtualSeat: next.virtualSeat } });
        await appendEvent(EVENTS.VOTE_PASS_ADVANCED, { nominationId, virtualSeat: next.virtualSeat });
      } else {
        await tx.nomination.update({ where: { id: nominationId }, data: { passStatus: "COMPLETE", currentVirtualSeat: null } });
        await appendEvent(EVENTS.VOTE_PASS_COMPLETED, { nominationId });
      }
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export async function startVotingPass({
  gameId,
  nominationId,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  nominationId: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, appendEvent }) => {
      const nomination = await tx.nomination.findFirst({ where: { id: nominationId, gameId } });
      if (!nomination) throw new DomainError("GAME_NOT_FOUND", "Nomination not found");
      if (nomination.status !== "VOTING") throw new DomainError("VOTE_LOCKED", "Voting is not open for this nomination");
      if (nomination.passStatus === "RUNNING") throw new DomainError("INVALID_SESSION_STATE", "Voting pass is already running");
      // Deterministic start seat: seat 0 of the Virtual Circle.
      const first = await tx.player.findFirst({ where: { gameId, virtualSeat: 0 } });
      await tx.nomination.update({
        where: { id: nominationId },
        data: { passStatus: "RUNNING", currentVirtualSeat: first?.virtualSeat ?? 0 },
      });
      await appendEvent(EVENTS.VOTING_STARTED, { nominationId });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export async function advanceVotingPass({
  gameId,
  nominationId,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  nominationId: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, appendEvent }) => {
      const nomination = await tx.nomination.findFirst({ where: { id: nominationId, gameId } });
      if (!nomination) throw new DomainError("GAME_NOT_FOUND", "Nomination not found");
      if (nomination.passStatus !== "RUNNING" || nomination.currentVirtualSeat == null) {
        throw new DomainError("INVALID_SESSION_STATE", "Voting pass is not running");
      }
      const next = await tx.player.findFirst({
        where: { gameId, virtualSeat: { gt: nomination.currentVirtualSeat } },
        orderBy: { virtualSeat: "asc" },
      });
      if (next) {
        await tx.nomination.update({ where: { id: nominationId }, data: { currentVirtualSeat: next.virtualSeat } });
        await appendEvent(EVENTS.VOTE_PASS_ADVANCED, { nominationId, virtualSeat: next.virtualSeat });
      } else {
        await tx.nomination.update({ where: { id: nominationId }, data: { passStatus: "COMPLETE", currentVirtualSeat: null } });
        await appendEvent(EVENTS.VOTE_PASS_COMPLETED, { nominationId });
      }
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export async function lockVote({
  gameId,
  nominationId,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  nominationId: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number }> {
  const { version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, game, appendEvent }) => {
      const nomination = await tx.nomination.findFirst({ where: { id: nominationId, gameId } });
      if (!nomination) throw new DomainError("GAME_NOT_FOUND", "Nomination not found");
      if (nomination.status !== "VOTING") throw new DomainError("VOTE_LOCKED", "Voting is not open");
      if (nomination.passStatus !== "COMPLETE") {
        throw new DomainError("VOTE_LOCKED", "The voting pass must complete before locking");
      }

      const cycle = game.cycleNumber;
      const players = await tx.player.findMany({ where: { gameId } });
      const secrets = await tx.playerSecret.findMany({ where: { player: { gameId } } });
      const secretById = new Map(secrets.map((s) => [s.playerId, s]));
      const votes = await tx.vote.findMany({ where: { nominationId } });
      const voteById = new Map(votes.map((v) => [v.playerId, v]));

      const butlerMaster = await tx.effect.findFirst({
        where: { gameId, effectType: "BUTLER_MASTER", active: true, cycleNumber: cycle },
      });
      const bureaucratTarget = await tx.effect.findFirst({
        where: { gameId, effectType: "BUREAUCRAT_VOTE_WEIGHT_TARGET", active: true, cycleNumber: cycle },
      });

      const voters: VoterState[] = players.map((p) => {
        const s = secretById.get(p.id);
        return {
          playerId: p.id,
          rawIntent: voteById.get(p.id)?.rawIntent ?? false,
          alive: p.alive,
          participantKind: p.participantKind,
          ghostVoteAvailable: p.ghostVoteAvailable,
          isButler: s?.trueCharacterId === "BUTLER",
          isBureaucratTarget: p.id === bureaucratTarget?.targetPlayerId,
        };
      });

      const tally = tallyVotes(voters, butlerMaster?.targetPlayerId ?? null);
      const living = await livingNormalCount(tx, gameId);
      const qualified = qualifies(tally.effectiveTotal, living);

      await tx.nomination.update({
        where: { id: nominationId },
        data: {
          status: "LOCKED",
          rawTotal: tally.rawVotes,
          effectiveTotal: tally.effectiveTotal,
          qualified,
        },
      });

      for (const v of votes) {
        const valid = !tally.invalidVotes.some((iv) => iv.playerId === v.playerId) && v.rawIntent;
        const consumed = tally.consumedGhostVotes.includes(v.playerId);
        await tx.vote.update({
          where: { id: v.id },
          data: { valid, lockedAt: systemClock.now(), ghostVoteConsumed: consumed },
        });
      }
      for (const ghostId of tally.consumedGhostVotes) {
        await tx.player.update({ where: { id: ghostId }, data: { ghostVoteAvailable: false } });
        await appendEvent(EVENTS.GHOST_VOTE_CONSUMED, { playerId: ghostId });
      }

      // Update current execution candidate (strictly beat to replace).
      const inv = await ensureInvestigation(tx, gameId, cycle);
      if (qualified && (inv.currentHighEffectiveVotes == null || tally.effectiveTotal > inv.currentHighEffectiveVotes)) {
        await tx.investigationState.update({
          where: { gameId },
          data: {
            currentExecutionCandidatePlayerId: nomination.nomineeId,
            currentHighEffectiveVotes: tally.effectiveTotal,
          },
        });
      }

      await appendEvent(EVENTS.VOTE_LOCKED, { nominationId, effectiveTotal: tally.effectiveTotal, qualified });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

async function resolveScarletWomanSuccession(
  tx: Prisma.TransactionClient,
  gameId: string,
  cycle: number,
  appendEvent: (type: string, payload?: unknown) => Promise<number>,
): Promise<boolean> {
  const sw = await tx.player.findFirst({
    where: { gameId, alive: true, secret: { trueCharacterId: "SCARLET_WOMAN" } },
    include: { secret: true },
  });
  if (!sw) return false;
  const effects = await tx.effect.findMany({ where: { targetPlayerId: sw.id, active: true } });
  const functioning =
    getAbilityFunctionState(sw.secret!, effects, "INVESTIGATION", cycle) === "FUNCTIONING";
  if (!functioning) return false;
  await tx.playerSecret.update({
    where: { playerId: sw.id },
    data: { trueCharacterId: "IMP", perceivedCharacterId: "IMP" },
  });
  await appendEvent(EVENTS.CHARACTER_CHANGED, { playerId: sw.id, to: "IMP", reason: "SCARLET_WOMAN" });
  return true;
}

export async function resolveExecution({
  gameId,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number; winner: Winner | null }> {
  const { result, version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, game, appendEvent }) => {
      if (game.phase !== "INVESTIGATION") throw new DomainError("INVALID_PHASE", "Execution requires Investigation");
      const inv = await ensureInvestigation(tx, gameId, game.cycleNumber);
      let winner: Winner | null = null;

      const candidateId = inv.currentExecutionCandidatePlayerId;
      if (candidateId) {
        const candidate = await tx.player.findFirst({ where: { id: candidateId, gameId } });
        if (candidate && candidate.alive) {
          await recordDeath(tx, gameId, game.cycleNumber, candidateId, "EXECUTION", "INVESTIGATION", true, undefined, appendEvent);
          await appendEvent(EVENTS.PLAYER_EXECUTED, { playerId: candidateId });

          const candidateSecret = await tx.playerSecret.findUnique({ where: { playerId: candidateId } });
          const candidateEffects = await tx.effect.findMany({ where: { targetPlayerId: candidateId, active: true } });
          const functioning =
            getAbilityFunctionState(candidateSecret!, candidateEffects, "INVESTIGATION", game.cycleNumber) === "FUNCTIONING";

          // Saint executed → evil wins immediately.
          if (candidateSecret?.trueCharacterId === "SAINT" && functioning) {
            winner = "EVIL";
            await finalizeGame(tx, gameId, "EVIL", "SAINT_EXECUTED", appendEvent);
            return { winner };
          }

          // Demon executed → Scarlet Woman succession before good victory.
          if (candidateSecret?.trueCharacterId === "IMP") {
            const succeeded = await resolveScarletWomanSuccession(tx, gameId, game.cycleNumber, appendEvent);
            if (succeeded) {
              await tx.investigationState.update({
                where: { gameId },
                data: { executionOccurred: true, currentExecutionCandidatePlayerId: null, currentHighEffectiveVotes: null },
              });
              return { winner: null };
            }
          }
        }
      }

      await tx.investigationState.update({
        where: { gameId },
        data: { executionOccurred: candidateId != null, currentExecutionCandidatePlayerId: null, currentHighEffectiveVotes: null },
      });

      // Generic victory.
      const living = await livingNormalCount(tx, gameId);
      const demon = await demonAlive(tx, gameId);
      const g = checkGenericVictory({ livingNormalCount: living, demonAlive: demon });
      if (g.winner) {
        winner = g.winner;
        await finalizeGame(tx, gameId, g.winner, g.reason ?? "VICTORY", appendEvent);
      }
      return { winner };
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version, winner: result.winner };
}

export async function exileTraveller({
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
    actor: "storyteller",
    handler: async ({ tx, appendEvent }) => {
      const traveller = await tx.player.findFirst({ where: { id: playerId, gameId } });
      if (!traveller || traveller.participantKind !== "TRAVELLER") {
        throw new DomainError("INVALID_TARGET", "Only a Traveller can be exiled");
      }
      // Exile: not a death, no ghost vote, no execution-triggered effects.
      await tx.player.update({ where: { id: playerId }, data: { alive: false } });
      await tx.effect.updateMany({
        where: { targetPlayerId: playerId, active: true },
        data: { active: false },
      });
      await appendEvent(EVENTS.TRAVELLER_EXILED, { playerId });
      return {};
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version };
}

export async function slayer({
  gameId,
  playerId,
  targetPlayerId,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  playerId: string;
  targetPlayerId: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number; winner: Winner | null }> {
  const { result, version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: `player:${playerId}`,
    handler: async ({ tx, game, appendEvent }) => {
      if (game.phase !== "INVESTIGATION") throw new DomainError("INVALID_PHASE", "Slayer requires Investigation");
      const slayer = await tx.player.findFirst({ where: { id: playerId, gameId } });
      if (!slayer || !slayer.alive) throw new DomainError("PLAYER_DEAD", "Slayer is dead");
      const secret = await tx.playerSecret.findUnique({ where: { playerId } });
      if (secret?.trueCharacterId !== "SLAYER") throw new DomainError("FORBIDDEN", "Not a Slayer");
      const state = (secret.abilityStateJson as { slayerSpent?: boolean } | null) ?? {};
      if (state.slayerSpent) throw new DomainError("ABILITY_SPENT", "Slayer ability already used");
      const target = await tx.player.findFirst({ where: { id: targetPlayerId, gameId } });
      if (!target || !target.alive) throw new DomainError("INVALID_TARGET", "Invalid Slayer target");

      await tx.playerSecret.update({
        where: { playerId },
        data: { abilityStateJson: { ...state, slayerSpent: true } },
      });
      await appendEvent(EVENTS.SLAYER_USED, { playerId, targetPlayerId });

      // Functioning gate: a poisoned/Drunk Slayer consumes the use but kills nobody.
      const slayerEffects = await tx.effect.findMany({ where: { targetPlayerId: playerId, active: true } });
      const slayerFunctioning = getAbilityFunctionState(secret, slayerEffects, "INVESTIGATION", game.cycleNumber) === "FUNCTIONING";
      if (!slayerFunctioning) return { winner: null };

      // SLAYER_TARGET_DEMON through the registration resolver.
      const targetSecret = await tx.playerSecret.findUnique({ where: { playerId: targetPlayerId } });
      if (!targetSecret) throw new DomainError("INVALID_TARGET", "Invalid Slayer target");
      const targetEffects = await tx.effect.findMany({ where: { targetPlayerId, active: true } });
      const targetFunctioning =
        getAbilityFunctionState(targetSecret, targetEffects, "INVESTIGATION", game.cycleNumber) === "FUNCTIONING";
      const options = getRegistrationOptions(
        {
          playerId: targetPlayerId,
          trueCharacterId: targetSecret.trueCharacterId as CharacterId,
          trueAlignment: targetSecret.trueAlignment as "GOOD" | "EVIL",
        },
        { kind: "CHARACTER", characterId: "IMP" },
        targetFunctioning,
      );
      const registration = resolveRegistrationOptions(options);
      if (registration.kind === "DECISION_REQUIRED") {
        // Recluse can register as the Demon — requires a bounded Storyteller
        // decision; until resolved, no death occurs (never assume either way).
        await appendEvent(EVENTS.REGISTRATION_DECISION_REQUIRED, { context: "SLAYER_TARGET_DEMON", targetPlayerId });
        return { winner: null };
      }

      let winner: Winner | null = null;
      if (registration.satisfies) {
        const death = await recordDeath(tx, gameId, game.cycleNumber, targetPlayerId, "SLAYER", "INVESTIGATION", false, playerId, appendEvent);
        if (death.died) {
          const living = await livingNormalCount(tx, gameId);
          const g = checkGenericVictory({ livingNormalCount: living, demonAlive: await demonAlive(tx, gameId) });
          if (g.winner) {
            winner = g.winner;
            await finalizeGame(tx, gameId, g.winner, g.reason ?? "VICTORY", appendEvent);
          }
        }
      }
      return { winner };
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version, winner: result.winner };
}

export async function closeInvestigation({
  gameId,
  commandId,
  expectedVersion,
}: {
  gameId: string;
  commandId: string;
  expectedVersion: number;
}): Promise<{ version: number; winner: Winner | null }> {
  const { result, version, sequence } = await runCommand({
    gameId,
    commandId,
    expectedVersion,
    actor: "storyteller",
    handler: async ({ tx, game, appendEvent }) => {
      if (game.phase !== "INVESTIGATION") throw new DomainError("INVALID_PHASE", "Investigation not in progress");
      const inv = await ensureInvestigation(tx, gameId, game.cycleNumber);

      const mayor = await tx.player.findFirst({
        where: { gameId, alive: true, secret: { trueCharacterId: "MAYOR" } },
        include: { secret: true },
      });
      let mayorFunctioning = false;
      if (mayor?.secret) {
        const mayorEffects = await tx.effect.findMany({ where: { targetPlayerId: mayor.id, active: true } });
        mayorFunctioning =
          getAbilityFunctionState(mayor.secret, mayorEffects, "INVESTIGATION", game.cycleNumber) === "FUNCTIONING";
      }
      const living = await livingNormalCount(tx, gameId);
      const mayorWin = checkMayorVictory({
        livingNormalCount: living,
        mayorAlive: mayorFunctioning,
        executionOccurred: inv.executionOccurred,
      });
      if (mayorWin.winner) {
        await finalizeGame(tx, gameId, mayorWin.winner, mayorWin.reason ?? "MAYOR", appendEvent);
        await tx.investigationState.update({ where: { gameId }, data: { completedAt: systemClock.now() } });
        return { winner: mayorWin.winner };
      }

      const g = checkGenericVictory({ livingNormalCount: living, demonAlive: await demonAlive(tx, gameId) });
      if (g.winner) {
        await finalizeGame(tx, gameId, g.winner, g.reason ?? "VICTORY", appendEvent);
        await tx.investigationState.update({ where: { gameId }, data: { completedAt: systemClock.now() } });
        return { winner: g.winner };
      }

      await tx.investigationState.update({ where: { gameId }, data: { completedAt: systemClock.now() } });
      await appendEvent(EVENTS.INVESTIGATION_COMPLETED, {});
      await autoCheckpoint(tx, gameId, "INVESTIGATION_COMPLETED", game.version + 1, appendEvent);
      return { winner: null };
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version, winner: result.winner };
}
