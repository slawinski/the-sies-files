import { resolveViewer } from "@/lib/auth/http";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { jsonError } from "@/lib/http";
import { readProtectedLayerAsset } from "@/modules/map/assets";
import { findMapLayer, layersUnlockedByMapVersion, type MapLayerId } from "@/modules/map/layers";
import { getScenarioDefinition } from "@/modules/scenario/definition";

// GET /api/v1/games/:gameId/map/layers/:layerId — protected reveal asset
// (map-reveal-system-spec §8.2–§8.3). The layer must exist and be authorized
// for this game; unknown layers and missing files are uniformly 404 (no
// enumeration), locked layers are 403.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string; layerId: string }> },
) {
  try {
    const { gameId, layerId } = await params;
    await resolveViewer(gameId);

    if (!findMapLayer(layerId)) throw new DomainError("GAME_NOT_FOUND", "Layer not found");

    const scenarioState = await prisma.scenarioState.findUnique({ where: { gameId } });
    const def = getScenarioDefinition(
      scenarioState?.scenarioId ?? "THE_SIES_FILES_MILLIONAIRE",
      scenarioState?.scenarioVersion ?? 1,
    );
    const unlocked = layersUnlockedByMapVersion(def, scenarioState?.mapVersionId ?? null);
    if (!unlocked.includes(layerId as MapLayerId)) {
      throw new DomainError("FORBIDDEN", "Forbidden");
    }

    const asset = await readProtectedLayerAsset(layerId);
    if (!asset) throw new DomainError("GAME_NOT_FOUND", "Layer not found");

    // Uint8Array.from yields a Uint8Array<ArrayBuffer>, which satisfies
    // BodyInit (Buffer/Uint8Array<ArrayBufferLike> does not under TS 5.7+).
    const body = Uint8Array.from(asset.data);
    return new Response(body, {
      headers: {
        "Content-Type": asset.contentType,
        // Explicit no-store: the global /api header rule already applies, but
        // the protected asset must never be shared-cached even if this route
        // ever moves out of the /api namespace (spec §8, §15).
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": String(asset.data.byteLength),
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
