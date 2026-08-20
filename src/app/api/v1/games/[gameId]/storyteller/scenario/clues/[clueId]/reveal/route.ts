import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { storytellerRevealClue } from "@/modules/scenario/scenario.service";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ targetPlayerId: z.string().optional() }),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string; clueId: string }> },
) {
  try {
    const { gameId, clueId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, schema);
    const { version } = await storytellerRevealClue({
      gameId,
      clueId,
      targetPlayerId: payload.targetPlayerId,
      commandId,
      expectedVersion,
    });
    return jsonOk({ version });
  } catch (err) {
    return jsonError(err);
  }
}
