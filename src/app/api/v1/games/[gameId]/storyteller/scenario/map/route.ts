import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { storytellerSetMap } from "@/modules/scenario/scenario.service";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ mapVersionId: z.string().min(1) }),
});

export async function POST(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  try {
    const { gameId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, schema);
    const { version } = await storytellerSetMap({
      gameId,
      mapVersionId: payload.mapVersionId,
      commandId,
      expectedVersion,
    });
    return jsonOk({ version });
  } catch (err) {
    return jsonError(err);
  }
}
