import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolvePlayer } from "@/lib/auth/http";
import { nominate } from "@/modules/investigation/investigation.service";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ nomineeId: z.string().min(1) }),
});

export async function POST(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  try {
    const { gameId } = await params;
    const { playerId } = await resolvePlayer(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, schema);
    const { version, nominationId } = await nominate({
      gameId,
      nominatorId: playerId,
      nomineeId: payload.nomineeId,
      commandId,
      expectedVersion,
    });
    return jsonOk({ version, nominationId }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
