import { jsonError, jsonOk } from "@/lib/http";
import { resolvePlayer } from "@/lib/auth/http";
import { DomainError } from "@/lib/errors";
import { getCommandStatus } from "@/modules/recovery/recovery.service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string; commandId: string }> },
) {
  try {
    const { gameId, commandId } = await params;
    const admitted = await resolvePlayer(gameId);
    const status = await getCommandStatus(gameId, commandId, { kind: "player", playerId: admitted.playerId }).finally(async () => {
      const current = await resolvePlayer(gameId);
      if (current.sessionId !== admitted.sessionId || current.playerId !== admitted.playerId)
        throw new DomainError("GAME_NOT_FOUND", "Game not found");
    });
    return jsonOk(status);
  } catch (err) {
    return jsonError(err);
  }
}
