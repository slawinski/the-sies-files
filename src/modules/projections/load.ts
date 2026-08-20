// Projection data loaders (read side). Kept separate from command writers.

import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import type { SetupCandidate } from "@/modules/setup/types";

export async function loadGameAndPlayers(gameId: string) {
  const game = await prisma.gameSession.findUnique({ where: { id: gameId } });
  if (!game) throw new DomainError("GAME_NOT_FOUND", "Game not found");
  const players = await prisma.player.findMany({
    where: { gameId },
    orderBy: { virtualSeat: "asc" },
  });
  return { game, players };
}

export async function loadInvestigationData(gameId: string, cycleNumber: number) {
  const investigation = await prisma.investigationState.findUnique({ where: { gameId } });
  const nominations = await prisma.nomination.findMany({
    where: { gameId, cycleNumber },
    include: { votes: true },
    orderBy: { sequence: "asc" },
  });
  return { investigation, nominations };
}

export async function loadStorytellerData(gameId: string) {
  const { game, players } = await loadGameAndPlayers(gameId);
  const claims = await prisma.playerClaim.findMany({
    where: { player: { gameId } },
  });
  const draft = await prisma.setupDraft.findUnique({ where: { gameId } });
  const operational = await prisma.operationalPhase.findFirst({
    where: { gameId, status: { not: "COMPLETED" } },
    include: { actions: { orderBy: { orderIndex: "asc" } } },
  });
  const { investigation, nominations } = await loadInvestigationData(gameId, game.cycleNumber);
  return { game, players, claims, draft, operational, investigation, nominations };
}

export async function loadPlayerData(gameId: string, playerId: string) {
  const { game, players } = await loadGameAndPlayers(gameId);
  const secret = await prisma.playerSecret.findUnique({ where: { playerId } });
  const draft = await prisma.setupDraft.findUnique({ where: { gameId } });
  const candidate =
    draft && draft.committedAt
      ? (draft.candidateJson as unknown as SetupCandidate)
      : null;
  const myActions = await prisma.operationalAction.findMany({
    where: { actorPlayerId: playerId },
    orderBy: { orderIndex: "asc" },
  });
  const { investigation, nominations } = await loadInvestigationData(gameId, game.cycleNumber);
  return { game, players, secret, candidate, myActions, investigation, nominations };
}
