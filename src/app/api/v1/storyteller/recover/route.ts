import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { jsonError, jsonOk, parseBody } from "@/lib/http";
import { assertSameOrigin, setStorytellerSessionCookie } from "@/lib/auth/http";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import { cryptoSecureRng } from "@/lib/rng";
import { SESSION_TTL_SECONDS } from "@/lib/auth/cookies";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { EVENTS } from "@/modules/events/event-types";
import { clientIp, hashKeyPart, rateLimit } from "@/lib/rate-limit";
import { runGameAccessTransaction } from "@/lib/command";

const schema = z.object({
  gameId: z.string().min(1),
  recoverySecret: z.string().min(1),
});

function constantTimeEquals(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Storyteller access recovery (audit spec 21 §7). No existing session required.
// Generic failure text prevents a game-ID/secret oracle. Never bumps the game
// version — access restoration is not a game mutation.
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const { gameId, recoverySecret } = await parseBody(req, schema);

    // Strict rate limit on the anonymous recovery surface (spec 21 §7.3, 22 §3).
    await rateLimit(`recover:ip:${hashKeyPart(clientIp(req))}`, 5, 15 * 60 * 1000);

    const configured = process.env.STORYTELLER_RECOVERY_SECRET;
    if (!configured) {
      throw new DomainError("FORBIDDEN", "Storyteller recovery is not configured");
    }
    if (!constantTimeEquals(recoverySecret, configured)) {
      throw new DomainError("UNAUTHORIZED", "Recovery failed");
    }
    const game = await prisma.gameSession.findUnique({ where: { id: gameId } });
    if (!game) throw new DomainError("UNAUTHORIZED", "Recovery failed");

    const token = generateToken(cryptoSecureRng);
    const tokenHash = hashToken(token);
    try {
      await runGameAccessTransaction({ gameId, operation: "recoverStorytellerAccess", actor: "storyteller-recovery", handler: async ({ tx, appendEvent }) => {
        await tx.browserSession.create({
          data: {
            storytellerGameId: gameId,
            sessionTokenHash: tokenHash,
            expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
          },
        });
        await appendEvent(EVENTS.STORYTELLER_ACCESS_RECOVERED);
      } });
    } catch (error) {
      if (error instanceof DomainError && error.code === "GAME_NOT_FOUND") throw new DomainError("UNAUTHORIZED", "Recovery failed");
      throw error;
    }

    await setStorytellerSessionCookie(token);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
