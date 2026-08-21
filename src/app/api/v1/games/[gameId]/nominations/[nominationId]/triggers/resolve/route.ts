import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { resolveNominationTrigger } from "@/modules/investigation/investigation.service";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ optionId: z.string().min(1) }),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string; nominationId: string }> },
) {
  try {
    const { gameId, nominationId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, schema);
    const { version } = await resolveNominationTrigger({
      gameId,
      nominationId,
      optionId: payload.optionId,
      commandId,
      expectedVersion,
    });
    return jsonOk({ version });
  } catch (err) {
    return jsonError(err);
  }
}
