import { describe, it, expect } from "vitest";
import { generateToken, hashToken, tokenMatches } from "./tokens";
import { SeededRng } from "@/lib/rng";

describe("tokens", () => {
  it("generates unique base64url tokens with >=128 bits entropy", () => {
    const rng = new SeededRng(42);
    const a = generateToken(rng);
    const b = generateToken(rng);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40); // 32 bytes → 43 base64url chars
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes deterministically", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });

  it("matches the correct token", () => {
    const t = generateToken(new SeededRng(1));
    expect(tokenMatches(t, hashToken(t))).toBe(true);
    expect(tokenMatches("other", hashToken(t))).toBe(false);
  });

  it("does not throw on length mismatch", () => {
    expect(tokenMatches("short", hashToken("a-much-longer-token-value"))).toBe(false);
  });
});
