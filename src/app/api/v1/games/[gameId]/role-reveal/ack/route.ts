import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolvePlayerWriter } from "@/lib/auth/http";
import { acknowledgeRole } from "@/modules/setup/setup.service";

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
    const { playerId, write } = await resolvePlayerWriter(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion } = await parseBody(req, schema);
    const { version } = await write(() => acknowledgeRole({ gameId, playerId, commandId, expectedVersion }));
    return jsonOk({ version });
  } catch (err) {
    return jsonError(err);
  }
}
