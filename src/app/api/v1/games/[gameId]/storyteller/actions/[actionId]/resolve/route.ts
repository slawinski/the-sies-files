import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { resolveAction } from "@/modules/operational/operational.service";
import type { InfoResult } from "@/modules/operational/info-resolver";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ resolution: z.unknown().optional() }),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string; actionId: string }> },
) {
  try {
    const { gameId, actionId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, schema);
    const { version } = await resolveAction({
      gameId,
      actionId,
      commandId,
      expectedVersion,
      resolution: payload.resolution as InfoResult | undefined,
    });
    return jsonOk({ version });
  } catch (err) {
    return jsonError(err);
  }
}
