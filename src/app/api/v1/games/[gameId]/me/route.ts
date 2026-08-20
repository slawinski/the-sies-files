import { jsonError, jsonOk } from "@/lib/http";
import { resolvePlayer } from "@/lib/auth/http";
import { loadGameAndPlayers } from "@/modules/projections/load";
import { buildPlayerProjection } from "@/modules/projections/projections";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    const { playerId } = await resolvePlayer(gameId);
    const { game, players } = await loadGameAndPlayers(gameId);
    return jsonOk(buildPlayerProjection(game, players, playerId));
  } catch (err) {
    return jsonError(err);
  }
}
