import { jsonError, jsonOk } from "@/lib/http";
import { resolveStoryteller } from "@/lib/auth/http";
import { loadStorytellerData } from "@/modules/projections/load";
import { buildStorytellerProjection } from "@/modules/projections/projections";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    await resolveStoryteller(gameId);
    const { game, players, claims, draft, operational, investigation, nominations } = await loadStorytellerData(gameId);
    return jsonOk(buildStorytellerProjection(game, players, claims, { draft, operational, investigation, nominations }));
  } catch (err) {
    return jsonError(err);
  }
}
