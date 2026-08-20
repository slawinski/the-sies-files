import { jsonError, jsonOk } from "@/lib/http";
import { resolveViewer } from "@/lib/auth/http";
import { loadGameAndPlayers } from "@/modules/projections/load";
import { buildPublicProjection } from "@/modules/projections/projections";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    await resolveViewer(gameId); // membership-scoped (uniform 404 for non-members)
    const { game, players } = await loadGameAndPlayers(gameId);
    return jsonOk(buildPublicProjection(game, players));
  } catch (err) {
    return jsonError(err);
  }
}
