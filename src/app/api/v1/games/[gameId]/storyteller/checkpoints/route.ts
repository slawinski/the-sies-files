import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import { createCheckpoint, listCheckpoints, validateCheckpoint } from "@/modules/recovery/recovery.service";

const createSchema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  payload: z.object({ reason: z.string().optional() }),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  try {
    const { gameId } = await params;
    await resolveStoryteller(gameId);
    const checkpoints = await listCheckpoints(gameId);
    return jsonOk({
      checkpoints: checkpoints.map((c) => ({
        id: c.id,
        gameVersion: c.gameVersion,
        checksum: c.checksum,
        reason: c.reason,
        createdAt: c.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ gameId: string }> }) {
  try {
    const { gameId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion, payload } = await parseBody(req, createSchema);
    const { version, checkpointId } = await createCheckpoint({
      gameId,
      commandId,
      expectedVersion,
      reason: payload.reason,
    });
    const validation = await validateCheckpoint(gameId, checkpointId);
    return jsonOk({ version, checkpointId, valid: validation.valid }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
