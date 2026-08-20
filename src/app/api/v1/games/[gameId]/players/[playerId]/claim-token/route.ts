import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, resolveStoryteller } from "@/lib/auth/http";
import {
  issueClaimToken,
  newClaimToken,
} from "@/modules/game-session/game-session.service";

const schema = z.object({
  commandId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ gameId: string; playerId: string }> },
) {
  try {
    const { gameId, playerId } = await params;
    await resolveStoryteller(gameId);
    assertSameOrigin(req);
    const { commandId, expectedVersion } = await parseBody(req, schema);

    // Raw token is generated outside the command and returned once here;
    // only its hash is persisted (never in receipts/events).
    const { token, tokenHash, expiresAt } = newClaimToken();
    const result = await issueClaimToken({
      gameId,
      playerId,
      commandId,
      expectedVersion,
      tokenHash,
      expiresAt,
    });

    if (result.duplicate) {
      // Retry of the same commandId: acknowledge without re-exposing the token.
      return jsonOk({
        playerId,
        claimId: result.claimId,
        expiresAt: result.expiresAt,
        duplicate: true,
        version: result.version,
      });
    }
    return jsonOk({
      playerId,
      claimId: result.claimId,
      expiresAt: result.expiresAt,
      claimToken: token,
      version: result.version,
    });
  } catch (err) {
    return jsonError(err);
  }
}
