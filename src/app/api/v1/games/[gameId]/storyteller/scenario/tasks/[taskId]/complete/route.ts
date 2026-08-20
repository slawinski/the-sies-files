import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { storytellerCompleteTask } from "@/modules/scenario/scenario.service";

const schema = z.object({ commandId: z.string().min(1), expectedVersion: z.number().int().nonnegative() });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string; taskId: string }> },
) {
  try {
    const { gameId, taskId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion } = await parseBody(req, schema);
    const { version } = await storytellerCompleteTask({ gameId, taskId, commandId, expectedVersion });
    return jsonOk({ version });
  } catch (err) {
    return jsonError(err);
  }
}
