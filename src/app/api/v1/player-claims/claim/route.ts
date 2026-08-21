import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, setPlayerSessionCookie } from "@/lib/auth/http";
import { claimPlayer } from "@/modules/game-session/game-session.service";
import { clientIp, hashKeyPart, rateLimit } from "@/lib/rate-limit";

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

    // Rate limits (audit spec 22 §3): per-IP and per-token, hashed only.
    const ip = clientIp(req);
    await rateLimit(`claim:ip:${hashKeyPart(ip)}`, 30, 15 * 60 * 1000);
    await rateLimit(`claim:token:${hashKeyPart(token)}`, 5, 5 * 60 * 1000);

    const result = await claimPlayer({ token, commandId });
    await setPlayerSessionCookie(result.sessionToken);
    return jsonOk({ ok: true, gameId: result.gameId, playerId: result.playerId, version: result.version });
  } catch (err) {
    return jsonError(err);
  }
}
