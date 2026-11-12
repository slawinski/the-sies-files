import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolvePlayerWriter } from "@/lib/auth/http";
import { voteIntent } from "@/modules/investigation/investigation.service";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ intent: z.boolean() }),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string; nominationId: string }> },
) {
  try {
    const { gameId, nominationId } = await params;
    const { playerId, write } = await resolvePlayerWriter(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, schema);
    const { version } = await write(() => voteIntent({
      gameId,
      nominationId,
      playerId,
      intent: payload.intent,
      commandId,
      expectedVersion,
    }));
    return jsonOk({ version });
  } catch (err) {
    return jsonError(err);
  }
}
