import { jsonError, jsonOk } from "@/lib/http";
import { resolveViewer } from "@/lib/auth/http";
import { heartbeat } from "@/modules/recovery/recovery.service";

// Presence heartbeat (audit spec 21 §4): ephemeral connectivity signal, not
// game truth. Any member (player or storyteller) may heartbeat.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    const viewer = await resolveViewer(gameId);
    const viewerId = viewer.kind === "storyteller" ? `storyteller:${viewer.sessionId}` : `player:${viewer.playerId}`;
    await heartbeat(gameId, viewerId);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
