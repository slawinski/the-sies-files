import { cookies } from "next/headers";
import { jsonError, jsonOk } from "@/lib/http";
import { hashToken } from "@/lib/auth/tokens";
import { COOKIE_PLAYER_SESSION } from "@/lib/auth/cookies";
import { DomainError } from "@/lib/errors";
import { findPlayerSessionByHashOnly } from "@/modules/auth/session";
import { loadPlayerData } from "@/modules/projections/load";
import { buildPlayerProjection } from "@/modules/projections/projections";

// Returns the current player's projection, resolving the game from the session
// cookie (the player client never needs to know the gameId up front).
export async function GET() {
  try {
    const store = await cookies();
    const token = store.get(COOKIE_PLAYER_SESSION)?.value;
    if (!token) throw new DomainError("UNAUTHORIZED", "Not authenticated");
    const session = await findPlayerSessionByHashOnly(hashToken(token));
    if (!session || !session.playerId || !session.player) {
      throw new DomainError("UNAUTHORIZED", "Not authenticated");
    }
    const { game, players, secret, candidate, myActions } = await loadPlayerData(
      session.player.gameId,
      session.playerId,
    );
    return jsonOk(
      buildPlayerProjection(game, players, session.playerId, { secret, candidate, myActions }),
    );
  } catch (err) {
    return jsonError(err);
  }
}
