import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { verifyReplay } from "@/modules/recovery/recovery.service";

const schema = z.object({
  checkpointId: z.string().min(1),
});

// Bounded PLAYER_FLAGS diagnostics, not whole-game reconstruction or physical
// restore evidence. Incomplete inputs are explicitly reported as unverified.
export async function POST(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  try {
    const { gameId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { checkpointId } = await parseBody(req, schema);
    return jsonOk(await verifyReplay(gameId, checkpointId));
  } catch (err) {
    return jsonError(err);
  }
}
