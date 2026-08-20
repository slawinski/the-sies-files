// Investigation engine (docs/07): nominations, voting, execution, victory,
// Traveller exile, and the Slayer day ability. Server-authoritative throughout.

import { Prisma } from "@prisma/client";
import { runCommand } from "@/lib/command";
import { DomainError } from "@/lib/errors";
import { systemClock } from "@/lib/clock";
import { EVENTS } from "@/modules/events/event-types";
import { CHARACTER_DEFINITIONS, type CharacterId } from "@/modules/trouble-brewing/characters";
import { publish } from "@/modules/realtime/broker";
import { getAbilityFunctionState } from "@/modules/operational/ability";
import { tallyVotes, qualifies, type VoterState } from "./voting";
import { checkGenericVictory, checkMayorVictory, type Winner } from "./victory";

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
  appendEvent: (type: string, payload?: unknown) => Promise<void>,
): Promise<void> {
  await tx.gameSession.update({
    where: { id: gameId },
    data: { status: "ENDED", winner, winReason: reason },
  });
  await appendEvent(EVENTS.GAME_ENDED, { winner, reason });
}

async function recordDeath(
  tx: Prisma.TransactionClient,
  gameId: string,
  cycle: number,
  playerId: string,
  source: string,
  phase: "INVESTIGATION" | "OPERATIONAL",
  executed: boolean,
  causedByPlayerId?: string,
): Promise<void> {
  await tx.player.update({ where: { id: playerId }, data: { alive: false } });
  await tx.deathRecord.create({
    data: { gameId, playerId, cycleNumber: cycle, source, phase, executed, causedByPlayerId },
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
          status: "VOTING",
        },
      });
      await appendEvent(EVENTS.NOMINATION_CREATED, { nominationId: nomination.id, nominatorId, nomineeId });

      // Virgin trigger: first nomination of a functioning Virgin by a Townsfolk.
      const nomineeSecret = await tx.playerSecret.findUnique({ where: { playerId: nomineeId } });
      if (nomineeSecret?.trueCharacterId === "VIRGIN") {
        const virginState = (nomineeSecret.abilityStateJson as { virginNominated?: boolean } | null) ?? {};
        if (!virginState.virginNominated) {
          const nominatorSecret = await tx.playerSecret.findUnique({ where: { playerId: nominatorId } });
          const isTownsfolk = nominatorSecret && CHARACTER_DEFINITIONS[nominatorSecret.trueCharacterId as CharacterId]?.category === "TOWNSFOLK";
          await tx.playerSecret.update({
            where: { playerId: nomineeId },
            data: { abilityStateJson: { ...virginState, virginNominated: true } },
          });
          if (isTownsfolk) {
            await recordDeath(tx, gameId, cycle, nominatorId, "VIRGIN", "INVESTIGATION", false, nomineeId);
            await appendEvent(EVENTS.VIRGIN_TRIGGER_RESOLVED, { nominatorId, nomineeId });
          }
        }
      }

      return { nominationId: nomination.id };
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version, nominationId: result.nominationId };
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
      await tx.vote.upsert({
        where: { nominationId_playerId: { nominationId, playerId } },
        create: { nominationId, playerId, rawIntent: intent },
        update: { rawIntent: intent },
      });
      await appendEvent(EVENTS.VOTE_INTENT_RECORDED, { nominationId, playerId, intent });
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
  appendEvent: (type: string, payload?: unknown) => Promise<void>,
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
          await recordDeath(tx, gameId, game.cycleNumber, candidateId, "EXECUTION", "INVESTIGATION", true);
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

      const targetSecret = await tx.playerSecret.findUnique({ where: { playerId: targetPlayerId } });
      let winner: Winner | null = null;
      if (targetSecret?.trueCharacterId === "IMP") {
        await recordDeath(tx, gameId, game.cycleNumber, targetPlayerId, "SLAYER", "INVESTIGATION", false, playerId);
        await appendEvent(EVENTS.PLAYER_DIED, { playerId: targetPlayerId, source: "SLAYER" });
        const living = await livingNormalCount(tx, gameId);
        const g = checkGenericVictory({ livingNormalCount: living, demonAlive: await demonAlive(tx, gameId) });
        if (g.winner) {
          winner = g.winner;
          await finalizeGame(tx, gameId, g.winner, g.reason ?? "VICTORY", appendEvent);
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
      });
      const living = await livingNormalCount(tx, gameId);
      const mayorWin = checkMayorVictory({
        livingNormalCount: living,
        mayorAlive: mayor != null,
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
      return { winner: null };
    },
  });
  publishInvalidation(gameId, version, sequence);
  return { version, winner: result.winner };
}
