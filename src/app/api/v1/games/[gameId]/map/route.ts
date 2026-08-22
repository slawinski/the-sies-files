import { resolveViewer } from "@/lib/auth/http";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/http";
import { buildMapStateDto } from "@/modules/map/state";
import { getScenarioDefinition } from "@/modules/scenario/definition";

// GET /api/v1/games/:gameId/map — authorized map state (map-reveal-system-spec
// §8.3). Only currently unlocked layers (and their POIs) are serialized. A game
// without scenario state still receives the default initial map state.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    await resolveViewer(gameId);
    const scenarioState = await prisma.scenarioState.findUnique({ where: { gameId } });
    const def = getScenarioDefinition(
      scenarioState?.scenarioId ?? "THE_SIES_FILES_MILLIONAIRE",
      scenarioState?.scenarioVersion ?? 1,
    );
    return jsonOk(buildMapStateDto({ gameId, scenarioState, def }));
  } catch (err) {
    return jsonError(err);
  }
}
