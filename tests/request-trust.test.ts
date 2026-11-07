import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { assertSameOrigin } from "@/lib/auth/http";
import { clientIp, hashKeyPart, rateLimit } from "@/lib/rate-limit";
import { resetDb } from "./helpers/db";

beforeEach(async () => { vi.stubEnv("APP_ORIGIN", "http://localhost:3100"); vi.stubEnv("RATE_LIMIT_DISABLED", "0"); await resetDb(); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("forged forwarding metadata cannot choose origin authority", () => {
  expect(() => assertSameOrigin(new Request("http://localhost:3100", { headers: {
    origin: "https://attacker.example", host: "attacker.example", "x-forwarded-host": "attacker.example",
  } }))).toThrow();
});
it.each(["null", "garbage", "http://localhost:3100,http://other", "http://localhost:3100/path", "http://localhost:3100?x=1", "http://u@localhost:3100", "https://localhost:3100", "http://localhost:3000"])("rejects noncanonical Origin %s", origin => {
  expect(() => assertSameOrigin(new Request("http://localhost:3100", { headers: { origin } }))).toThrow();
});
it("preserves configured and originless API callers without trusting forwarded host", () => {
  expect(() => assertSameOrigin(new Request("http://other", { headers: { origin: "http://localhost:3100", "x-forwarded-host": "other" } }))).not.toThrow();
  expect(() => assertSameOrigin(new Request("http://other"))).not.toThrow();
  expect(() => assertSameOrigin(new Request("http://other", { headers: { "sec-fetch-site": "cross-site" } }))).toThrow();
});
it("rotating forged addresses cannot evade the persisted anonymous budget", async () => {
  const key = (i: number) => `claim:ip:${hashKeyPart(clientIp(new Request("http://localhost", { headers: {
    "x-forwarded-for": `192.0.2.${i}`, "x-real-ip": `198.51.100.${i}`, forwarded: `for=203.0.113.${i}`,
  } })))}`;
  for (let i = 0; i < 30; i++) await rateLimit(key(i), 30, 900_000);
  await expect(rateLimit(key(31), 30, 900_000)).rejects.toMatchObject({ retryAfterSeconds: expect.any(Number) });
});

it("concurrent requests cannot exceed the fixed window and rollover restores allowance", async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1_800_000);
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => rateLimit('concurrency-control', 3, 1000)));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(3);
  expect(results.filter(r => r.status === 'rejected')).toHaveLength(7);
  now.mockReturnValue(1_801_000);
  await expect(rateLimit('concurrency-control', 3, 1000)).resolves.toBeUndefined();
});

it.each([{ operation: 'claims', elapsedMinutes: 14, windowMinutes: 15, limit: 30 },
  { operation: 'creation', elapsedMinutes: 59, windowMinutes: 60, limit: 10 }])("short token-window pruning cannot erase the active $operation budget", async ({ elapsedMinutes, windowMinutes, limit }) => {
  vi.spyOn(Date, 'now').mockReturnValue(elapsedMinutes * 60_000);
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  for (let i = 0; i < limit; i++) await rateLimit('long-operation-budget', limit, windowMinutes * 60_000);
  random.mockReturnValue(0); // deterministically execute the real pruning branch
  await rateLimit('short-token-budget', 5, 5 * 60_000);
  await expect(rateLimit('long-operation-budget', limit, windowMinutes * 60_000)).rejects.toMatchObject({ retryAfterSeconds: 60 });
});
