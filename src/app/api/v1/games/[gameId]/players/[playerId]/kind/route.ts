import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { setParticipantKind } from "@/modules/game-session/game-session.service";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ participantKind: z.enum(["NORMAL", "TRAVELLER"]) }),
});

// Designate a participant as NORMAL or TRAVELLER (pre-commit, Storyteller-only).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string; playerId: string }> },
) {
  try {
    const { gameId, playerId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, schema);
    const { version } = await setParticipantKind({
      gameId,
      playerId,
      participantKind: payload.participantKind,
      commandId,
      expectedVersion,
    });
    return jsonOk({ version });
  } catch (err) {
    return jsonError(err);
  }
}
