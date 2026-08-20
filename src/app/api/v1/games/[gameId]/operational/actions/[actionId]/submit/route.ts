import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolvePlayer } from "@/lib/auth/http";
import { submitAction } from "@/modules/operational/operational.service";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ targetPlayerIds: z.array(z.string().min(1)) }),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string; actionId: string }> },
) {
  try {
    const { gameId, actionId } = await params;
    const { playerId } = await resolvePlayer(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, schema);
    const { version } = await submitAction({
      gameId,
      playerId,
      actionId,
      commandId,
      expectedVersion,
      targetPlayerIds: payload.targetPlayerIds,
    });
    return jsonOk({ version });
  } catch (err) {
    return jsonError(err);
  }
}
