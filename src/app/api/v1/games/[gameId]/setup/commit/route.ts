import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStorytellerWriter } from "@/lib/auth/http";
import { commitSetup } from "@/modules/setup/setup.service";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    const write = await resolveStorytellerWriter(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion } = await parseBody(req, schema);
    const { version, setupHash } = await write(() => commitSetup({ gameId, commandId, expectedVersion }));
    return jsonOk({ version, setupHash });
  } catch (err) {
    return jsonError(err);
  }
}
