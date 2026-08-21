import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { setStorytellerSessionCookie } from "@/lib/auth/http";
import { createGame } from "@/modules/game-session/game-session.service";
import { loadStorytellerData } from "@/modules/projections/load";
import { buildStorytellerProjection } from "@/modules/projections/projections";
import { clientIp, hashKeyPart, rateLimit } from "@/lib/rate-limit";

const createGameSchema = z.object({ name: z.string() });

export async function POST(req: Request) {
  try {
    await rateLimit(`games:create:ip:${hashKeyPart(clientIp(req))}`, 10, 60 * 60 * 1000);
    const { name } = await parseBody(req, createGameSchema);
    const { gameId, storytellerSessionToken } = await createGame(name);
    await setStorytellerSessionCookie(storytellerSessionToken);
    const { game, players, claims } = await loadStorytellerData(gameId);
    return jsonOk(buildStorytellerProjection(game, players, claims), 201);
  } catch (err) {
    return jsonError(err);
  }
}
