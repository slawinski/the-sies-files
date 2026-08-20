import { jsonError, jsonOk } from "@/lib/http";
import { resolvePlayer } from "@/lib/auth/http";
import { loadPlayerData } from "@/modules/projections/load";
import { buildPlayerProjection } from "@/modules/projections/projections";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    const { playerId } = await resolvePlayer(gameId);
    const { game, players, secret, candidate, myActions, investigation, nominations, scenarioState, discoveries, taskStates, conditions } = await loadPlayerData(gameId, playerId);
    return jsonOk(buildPlayerProjection(game, players, playerId, { secret, candidate, myActions, investigation, nominations, scenarioState, discoveries, taskStates, conditions }));
  } catch (err) {
    return jsonError(err);
  }
}
