import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { removePlayer, updatePlayer } from "@/modules/game-session/game-session.service";

const updateSchema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ displayName: z.string() }),
});

const removeSchema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ gameId: string; playerId: string }> },
) {
  try {
    const { gameId, playerId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, updateSchema);
    const { version } = await updatePlayer({
      gameId,
      playerId,
      commandId,
      expectedVersion,
      displayName: payload.displayName,
    });
    return jsonOk({ version });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ gameId: string; playerId: string }> },
) {
  try {
    const { gameId, playerId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion } = await parseBody(req, removeSchema);
    const { version } = await removePlayer({ gameId, playerId, commandId, expectedVersion });
    return jsonOk({ version });
  } catch (err) {
    return jsonError(err);
  }
}
