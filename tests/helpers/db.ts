import { prisma } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { createGame, addPlayer } from "@/modules/game-session/game-session.service";

const TABLES = [
  "browser_sessions",
  "player_claims",
  "players",
  "domain_events",
  "command_receipts",
  "game_sessions",
] as const;

/** Wipe all tables between tests so each test is isolated + deterministic. */
export async function resetDb(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`,
  );
}

export async function createGameWithPlayers(
  count: number,
  name = "Test Game",
): Promise<{ gameId: string; playerIds: string[]; version: number }> {
  const { gameId } = await createGame(name);
  let version = 1;
  const playerIds: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = await addPlayer({
      gameId,
      commandId: randomUUID(),
      expectedVersion: version,
      displayName: `Player ${i}`,
    });
    version = r.version;
    playerIds.push(r.playerId);
  }
  return { gameId, playerIds, version };
}
