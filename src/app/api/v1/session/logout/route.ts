import { cookies } from "next/headers";
import { jsonError, jsonOk } from "@/lib/http";
import { hashToken } from "@/lib/auth/tokens";
import { clearSessionCookies } from "@/lib/auth/http";
import { COOKIE_PLAYER_SESSION, COOKIE_STORYTELLER_SESSION } from "@/lib/auth/cookies";
import { revokeSessionByHash } from "@/modules/auth/session";

export async function POST() {
  try {
    const store = await cookies();
    const tokens = [
      store.get(COOKIE_STORYTELLER_SESSION)?.value,
      store.get(COOKIE_PLAYER_SESSION)?.value,
    ].filter((t): t is string => typeof t === "string");

    for (const token of tokens) {
      await revokeSessionByHash(hashToken(token));
    }
    await clearSessionCookies();
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
