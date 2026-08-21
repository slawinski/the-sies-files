// DB-backed fixed-window rate limiter (audit spec 22 §3). Keys never store raw
// tokens — callers pass pre-hashed key parts. Production-safe across processes
// because the bucket lives in PostgreSQL.

import { createHash } from "node:crypto";
import { prisma } from "./db";

export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many requests");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Hash a key part (IP/token) so raw values never reach the limiter table. */
export function hashKeyPart(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  const bucket = await prisma.rateLimitBucket.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  if (bucket.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStart.getTime() + windowMs - now) / 1000));
    throw new RateLimitError(retryAfterSeconds);
  }

  // Opportunistic pruning of old windows (best-effort, ~1% of requests).
  if (Math.floor(Math.random() * 100) === 0) {
    await prisma.rateLimitBucket
      .deleteMany({ where: { windowStart: { lt: new Date(now - 2 * windowMs) } } })
      .catch(() => undefined);
  }
}
