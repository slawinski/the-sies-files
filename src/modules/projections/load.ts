// Projection data loaders (read side). Kept separate from command writers.

import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";

export async function loadGameAndPlayers(gameId: string) {
  const game = await prisma.gameSession.findUnique({ where: { id: gameId } });
  if (!game) throw new DomainError("GAME_NOT_FOUND", "Game not found");
  const players = await prisma.player.findMany({
    where: { gameId },
    orderBy: { virtualSeat: "asc" },
  });
  return { game, players };
}

export async function loadStorytellerData(gameId: string) {
  const { game, players } = await loadGameAndPlayers(gameId);
  const claims = await prisma.playerClaim.findMany({
    where: { player: { gameId } },
  });
  return { game, players, claims };
}
