import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { addPlayer } from "@/modules/game-session/game-session.service";

const addPlayerSchema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ displayName: z.string() }),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, addPlayerSchema);
    const { playerId, version } = await addPlayer({
      gameId,
      commandId,
      expectedVersion,
      displayName: payload.displayName,
    });
    return jsonOk({ playerId, version }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
