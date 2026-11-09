import { jsonError, jsonOk } from "@/lib/http";
import { resolveStoryteller } from "@/lib/auth/http";
import { getCommandStatus } from "@/modules/recovery/recovery.service";
import { DomainError } from "@/lib/errors";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string; commandId: string }> },
) {
  try {
    const { gameId, commandId } = await params;
    const admitted = await resolveStoryteller(gameId);
    const status = await getCommandStatus(gameId, commandId, { kind: "storyteller" }).finally(async () => {
      const current = await resolveStoryteller(gameId);
      if (current.sessionId !== admitted.sessionId) throw new DomainError("GAME_NOT_FOUND", "Game not found");
    });
    return jsonOk(status);
  } catch (err) {
    return jsonError(err);
  }
}
