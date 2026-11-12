import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStorytellerWriter } from "@/lib/auth/http";
import { archiveGame } from "@/modules/game-session/game-session.service";

const schema = z.strictObject({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
});

export async function POST(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  try {
    const { gameId } = await params;
    const write = await resolveStorytellerWriter(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion } = await parseBody(req, schema);
    return jsonOk(await write(() => archiveGame({ gameId, commandId, expectedVersion })));
  } catch (error) {
    return jsonError(error);
  }
}
