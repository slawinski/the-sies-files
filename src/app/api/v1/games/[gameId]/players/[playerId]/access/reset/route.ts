import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { resetPlayerAccess } from "@/modules/recovery/recovery.service";

const schema = z.object({ commandId: z.string().min(1), expectedVersion: z.number().int().nonnegative() });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string; playerId: string }> },
) {
  try {
    const { gameId, playerId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion } = await parseBody(req, schema);
    const { version, claimToken } = await resetPlayerAccess({ gameId, playerId, commandId, expectedVersion });
    return jsonOk({ version, claimToken });
  } catch (err) {
    return jsonError(err);
  }
}
