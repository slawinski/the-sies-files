import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { reorderPlayers } from "@/modules/game-session/game-session.service";

const reorderSchema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ orderedPlayerIds: z.array(z.string().min(1)) }),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, reorderSchema);
    const { version } = await reorderPlayers({
      gameId,
      commandId,
      expectedVersion,
      orderedPlayerIds: payload.orderedPlayerIds,
    });
    return jsonOk({ version });
  } catch (err) {
    return jsonError(err);
  }
}
