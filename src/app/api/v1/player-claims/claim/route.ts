import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, setPlayerSessionCookie } from "@/lib/auth/http";
import { claimPlayer } from "@/modules/game-session/game-session.service";

// The claim token is submitted in the POST body (never the URL path), so it
// does not leak into access logs / Referer / browser history. See ADR-002.
const schema = z.object({
  token: z.string().min(1),
  commandId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { token, commandId } = await parseBody(req, schema);
    const result = await claimPlayer({ token, commandId });
    await setPlayerSessionCookie(result.sessionToken);
    return jsonOk({ ok: true, gameId: result.gameId, playerId: result.playerId });
  } catch (err) {
    return jsonError(err);
  }
}
