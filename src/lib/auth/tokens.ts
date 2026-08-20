// Opaque token generation + constant-time hashing. Raw tokens are never stored
// or logged; only their SHA-256 hash is persisted.

import { createHash, timingSafeEqual } from "node:crypto";
import type { Rng } from "../rng";

/** One-time player claim tokens expire after 7 days (unclaimed). */
export const CLAIM_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

/** Generate a high-entropy opaque token (>=128 bits), base64url-encoded. */
export function generateToken(rng: Rng, byteLength = 32): string {
  return Buffer.from(rng.randomBytes(byteLength)).toString("base64url");
}export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string, expectedHash: string): boolean {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(expectedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
