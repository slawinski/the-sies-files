import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { recoveryOverride } from "@/modules/recovery/recovery.service";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({
    kind: z.enum(["RESOLVE_ACTION", "SKIP_ACTION", "CORRECT_ALIVE", "RESTORE_GHOST_VOTE"]),
    actionId: z.string().optional(),
    playerId: z.string().optional(),
    alive: z.boolean().optional(),
    reason: z.string().min(1),
  }),
});

export async function POST(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  try {
    const { gameId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, schema);

    const override =
      payload.kind === "RESOLVE_ACTION" || payload.kind === "SKIP_ACTION"
        ? { kind: payload.kind as "RESOLVE_ACTION" | "SKIP_ACTION", actionId: payload.actionId ?? "" }
        : payload.kind === "CORRECT_ALIVE"
          ? { kind: "CORRECT_ALIVE" as const, playerId: payload.playerId ?? "", alive: payload.alive ?? true }
          : { kind: "RESTORE_GHOST_VOTE" as const, playerId: payload.playerId ?? "" };

    const { version } = await recoveryOverride({
      gameId,
      commandId,
      expectedVersion,
      payload: override,
      reason: payload.reason,
    });
    return jsonOk({ version });
  } catch (err) {
    return jsonError(err);
  }
}
