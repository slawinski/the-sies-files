import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolvePlayer } from "@/lib/auth/http";
import { scanQr } from "@/modules/scenario/scenario.service";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ token: z.string().min(1) }),
});

export async function POST(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  try {
    const { gameId } = await params;
    const { playerId } = await resolvePlayer(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, schema);
    const { version, outcome } = await scanQr({
      gameId,
      playerId,
      token: payload.token,
      commandId,
      expectedVersion,
    });
    return jsonOk({ version, outcome });
  } catch (err) {
    return jsonError(err);
  }
}
