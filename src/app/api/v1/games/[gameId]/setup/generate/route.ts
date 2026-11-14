import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStorytellerWriter } from "@/lib/auth/http";
import { generateSetup } from "@/modules/setup/setup.service";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ seed: z.string().optional() }).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    const write = await resolveStorytellerWriter(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, schema);
    const { version, regenerationIndex } = await write(() => generateSetup({
      gameId,
      commandId,
      expectedVersion,
      seed: payload?.seed,
    }));
    return jsonOk({ version, regenerationIndex });
  } catch (err) {
    return jsonError(err);
  }
}
