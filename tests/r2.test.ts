import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { resetDb, createGameWithPlayers } from "./helpers/db";
import { prisma } from "@/lib/db";
import { buildCspPolicy } from "@/lib/security";
import { rateLimit, RateLimitError, hashKeyPart } from "@/lib/rate-limit";
import { addPlayer } from "@/modules/game-session/game-session.service";

beforeEach(resetDb);

describe("R2 — security & data durability", () => {
  it("CSP policy bans unsafe-eval and includes the required directives", () => {
    const csp = buildCspPolicy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("rate limiter rejects beyond the limit and stores only caller-provided keys", async () => {
    const raw = "10.0.0.1:secret-token";
    const key = hashKeyPart(raw);
    expect(key).not.toContain("secret-token");

    for (let i = 0; i < 3; i += 1) {
      await rateLimit(key, 3, 60_000);
    }
    await expect(rateLimit(key, 3, 60_000)).rejects.toBeInstanceOf(RateLimitError);

    const buckets = await prisma.rateLimitBucket.findMany({ where: { key } });
    expect(buckets).toHaveLength(1);
    expect(buckets[0].count).toBe(4);
  });

  it("PostgreSQL enforces ACTIVE => phase IS NOT NULL", async () => {
    const { gameId } = await createGameWithPlayers(13);
    // Direct invalid write must be rejected by the CHECK constraint.
    await expect(
      prisma.gameSession.update({ where: { id: gameId }, data: { status: "ACTIVE", phase: null } }),
    ).rejects.toThrow();
  });

  it("durable audit history blocks hard game deletion (RESTRICT FK)", async () => {
    const { gameId } = await createGameWithPlayers(2);
    await expect(prisma.gameSession.delete({ where: { id: gameId } })).rejects.toThrow();
    const game = await prisma.gameSession.findUnique({ where: { id: gameId } });
    expect(game).not.toBeNull();
  });

  it("corrupt command receipt fails closed instead of casting through", async () => {
    const { gameId } = await createGameWithPlayers(1);
    const commandId = randomUUID();
    await addPlayer({ gameId, commandId, expectedVersion: 2, displayName: "Ada" });

    // Corrupt the stored receipt.
    await prisma.commandReceipt.update({
      where: { gameId_commandId: { gameId, commandId } },
      data: { resultJson: { bogus: true } },
    });

    await expect(
      addPlayer({ gameId, commandId, expectedVersion: 1, displayName: "Ada" }),
    ).rejects.toMatchObject({ code: "COMMAND_RECEIPT_INVALID" });
  });
});
