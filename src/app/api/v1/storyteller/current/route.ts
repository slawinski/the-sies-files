import { cookies } from "next/headers";
import { jsonError, jsonOk } from "@/lib/http";
import { hashToken } from "@/lib/auth/tokens";
import { COOKIE_STORYTELLER_SESSION } from "@/lib/auth/cookies";
import { findStorytellerSessionByHashOnly } from "@/modules/auth/session";

// Returns the current storyteller's active game (or null), used by the
// storyteller home to "reopen" a game after refresh.
export async function GET() {
  try {
    const store = await cookies();
    const token = store.get(COOKIE_STORYTELLER_SESSION)?.value;
    if (!token) return jsonOk({ gameId: null });
    const session = await findStorytellerSessionByHashOnly(hashToken(token));
    return jsonOk({ gameId: session?.storytellerGameId ?? null });
  } catch (err) {
    return jsonError(err);
  }
}
