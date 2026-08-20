import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolvePlayer } from "@/lib/auth/http";
import { slayer } from "@/modules/investigation/investigation.service";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ targetPlayerId: z.string().min(1) }),
});

export async function POST(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  try {
    const { gameId } = await params;
    const { playerId } = await resolvePlayer(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, schema);
    const { version, winner } = await slayer({
      gameId,
      playerId,
      targetPlayerId: payload.targetPlayerId,
      commandId,
      expectedVersion,
    });
    return jsonOk({ version, winner });
  } catch (err) {
    return jsonError(err);
  }
}
