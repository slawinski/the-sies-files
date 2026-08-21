import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { resolveAction, type StorytellerActionResolution } from "@/modules/operational/operational.service";

// Typed Storyteller resolution contract (audit spec 19 §3): no z.unknown() at
// the domain boundary; unexpected fields are rejected.
const infoResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("CHARACTER_CANDIDATES"), characterId: z.string(), candidatePlayerIds: z.array(z.string()) }),
  z.object({ kind: z.literal("CHARACTER"), characterId: z.string(), playerId: z.string() }),
  z.object({ kind: z.literal("NUMBER"), value: z.number() }),
  z.object({ kind: z.literal("NO_OUTSIDERS") }),
  z.object({ kind: z.literal("DEMON_YES_NO"), value: z.boolean() }),
  z.object({ kind: z.literal("GRIMOIRE"), assignments: z.array(z.unknown()) }),
]);

const resolutionSchema = z
  .union([
    z.object({ kind: z.literal("INFO"), value: infoResultSchema }),
    z
      .object({
        kind: z.literal("IMP_KILL"),
        mayorRedirectToPlayerId: z.string().optional(),
        starPassSuccessorPlayerId: z.string().optional(),
      })
      .strict(),
    z.object({ kind: z.literal("REGISTRATION"), optionId: z.string().min(1) }),
  ])
  .optional();

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ resolution: resolutionSchema }),
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
      // Runtime shape validated by `resolutionSchema` above; cast is type-only.
      resolution: payload.resolution as unknown as StorytellerActionResolution | undefined,
    });
    return jsonOk({ version });
  } catch (err) {
    return jsonError(err);
  }
}
