import type { APIRequestContext } from '@playwright/test';
import { createStorytellerGame, claimPlayer } from './fixtures';

export async function boundaryGame(st: APIRequestContext, player: APIRequestContext, name: string) {
  const game = await createStorytellerGame(st, name, 1);
  const claim = await claimPlayer(st, player, game.gameId, game.playerIds[0], game.version);
  return { ...game, version: claim.version };
}
export const memberReads = (gameId: string) => [
  `/api/v1/games/${gameId}/public`, `/api/v1/games/${gameId}/me`,
  `/api/v1/games/${gameId}/storyteller`, `/api/v1/games/${gameId}/storyteller/control`,
  `/api/v1/games/${gameId}/storyteller/audit`, `/api/v1/games/${gameId}/map/layers/post-world`,
  `/api/v1/games/${gameId}/storyteller/consistency`,
  `/api/v1/games/${gameId}/commands/00000000-0000-4000-8000-000000000001`,
  `/api/v1/games/${gameId}/events/stream`,
];
