import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { resolveSlayerDecision } from "@/modules/investigation/investigation.service";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ slayerPlayerId: z.string().min(1), optionId: z.string().min(1) }),
});

// Bounded Storyteller registration decision for the Slayer (audit spec 18 §7).
export async function POST(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  try {
    const { gameId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, schema);
    const { version, winner } = await resolveSlayerDecision({
      gameId,
      slayerPlayerId: payload.slayerPlayerId,
      optionId: payload.optionId,
      commandId,
      expectedVersion,
    });
    return jsonOk({ version, winner });
  } catch (err) {
    return jsonError(err);
  }
}
