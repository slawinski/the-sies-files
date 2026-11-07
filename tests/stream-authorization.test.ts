import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ check: vi.fn(), game: vi.fn(), viewer: vi.fn() }));
vi.mock("@/lib/auth/http", () => ({ resolveViewer: mocks.viewer }));
vi.mock("@/lib/db", () => ({ prisma: { gameSession: { findUnique: mocks.game } } }));
vi.mock("@/modules/auth/session", () => ({ recheckViewerSession: mocks.check }));
import { GET } from "@/app/api/v1/games/[gameId]/events/stream/route";
import { publish } from "@/modules/realtime/broker";

beforeEach(() => {
  vi.useFakeTimers();
  mocks.viewer.mockResolvedValue({ kind: "player", playerId: "player", sessionId: "session" });
  mocks.game.mockResolvedValue({ version: 1, eventSequence: 1 });
  mocks.check.mockResolvedValue({ expiresAt: new Date(Date.now() + 60_000) });
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); vi.restoreAllMocks(); });
async function open() {
  const abort = new AbortController();
  const response = await GET(new Request("http://localhost/stream", { signal: abort.signal }), { params: Promise.resolve({ gameId: "game" }) });
  const reader = response.body!.getReader();
  return { abort, reader, response };
}
const text = (value: Uint8Array | undefined) => value ? new TextDecoder().decode(value) : "";

it("rechecks original membership before metadata after admission", async () => {
  const { reader } = await open();
  expect(text((await reader.read()).value)).toContain("event: hello");
  mocks.check.mockResolvedValue(null);
  publish("game", { type: "invalidate", version: 2, sequence: 2 });
  await vi.advanceTimersByTimeAsync(0);
  const next = text((await reader.read()).value);
  await reader.cancel();
  expect(next).not.toContain("event: invalidate");
  expect(next).toContain("event: access-lost");
});

it("idle revalidation closes within ten seconds without traffic", async () => {
  const { reader, abort } = await open();
  await reader.read();
  mocks.check.mockResolvedValue(null);
  await vi.advanceTimersByTimeAsync(10_000);
  // Abort only after observing whether an idle check ran, so original code
  // fails deterministically rather than hanging on a read that never arrives.
  const checked = mocks.check.mock.calls.length;
  abort.abort();
  await reader.cancel();
  expect(checked).toBeGreaterThanOrEqual(2);
});

it("coalesces bursts into one in-flight check and the latest metadata", async () => {
  const { reader } = await open();
  await reader.read();
  let resolve!: (value: { expiresAt: Date }) => void;
  mocks.check.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const baseline = mocks.check.mock.calls.length;
  for (let i = 2; i <= 30; i++) publish("game", { type: "invalidate", version: i, sequence: i });
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.check.mock.calls.length - baseline).toBe(1);
  resolve({ expiresAt: new Date(Date.now() + 60_000) });
  await vi.advanceTimersByTimeAsync(0);
  const result = text((await reader.read()).value);
  await reader.cancel();
  expect(result).toContain('"version":30');
  expect(result).not.toContain('"sessionId"');
  expect(vi.getTimerCount()).toBe(0);
});

it.each(["timeout", "database rejection", "abort", "cancel"])("%s closes once and late authorization cannot deliver", async failure => {
  const { reader, abort } = await open();
  await reader.read();
  let resolve!: (value: { expiresAt: Date }) => void;
  let reject!: () => void;
  mocks.check.mockImplementationOnce(() => new Promise((yes, no) => { resolve = yes; reject = () => no(new Error("database unavailable")); }));
  publish("game", { type: "invalidate", version: 2, sequence: 2 });
  if (failure === "timeout") await vi.advanceTimersByTimeAsync(5000);
  if (failure === "database rejection") { reject(); await vi.advanceTimersByTimeAsync(0); }
  if (failure === "abort") abort.abort();
  if (failure === "cancel") await reader.cancel();
  resolve({ expiresAt: new Date(Date.now() + 60_000) });
  await vi.advanceTimersByTimeAsync(0);
  expect(await reader.read()).toMatchObject({ done: true });
  expect(vi.getTimerCount()).toBe(0);
  const calls = mocks.check.mock.calls.length;
  publish("game", { type: "invalidate", version: 3, sequence: 3 });
  expect(mocks.check.mock.calls.length).toBe(calls);
});

it("already-aborted admission does not check, subscribe or enqueue", async () => {
  const abort = new AbortController(); abort.abort();
  const response = await GET(new Request("http://localhost/stream", { signal: abort.signal }), { params: Promise.resolve({ gameId: "game" }) });
  expect(await response.body!.getReader().read()).toMatchObject({ done: true });
  expect(mocks.check).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("known hard expiry closes earlier than the idle interval", async () => {
  mocks.check.mockResolvedValueOnce({ expiresAt: new Date(Date.now() + 1000) });
  const { reader } = await open();
  await reader.read();
  await vi.advanceTimersByTimeAsync(1000);
  expect(text((await reader.read()).value)).toBe('event: access-lost\ndata: {}\n\n');
  expect(await reader.read()).toMatchObject({ done: true });
  expect(vi.getTimerCount()).toBe(0);
});

it("enqueue failure uses the same cleanup and removes every timer", async () => {
  vi.spyOn(ReadableStreamDefaultController.prototype, 'enqueue').mockImplementation(() => { throw new TypeError('closed controller'); });
  const { reader } = await open();
  await vi.advanceTimersByTimeAsync(0);
  expect(await reader.read()).toMatchObject({ done: true });
  expect(vi.getTimerCount()).toBe(0);
  const checks = mocks.check.mock.calls.length;
  publish('game', { type: 'invalidate', version: 2, sequence: 2 });
  expect(mocks.check.mock.calls.length).toBe(checks);
});

it("a slow successful check does not extend the ten-second revalidation cadence", async () => {
  let resolve!: (value: { expiresAt: Date }) => void;
  mocks.check.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  const { reader, abort } = await open();
  await vi.advanceTimersByTimeAsync(4000);
  resolve({ expiresAt: new Date(Date.now() + 60_000) });
  await vi.advanceTimersByTimeAsync(0);
  await reader.read();
  mocks.check.mockResolvedValue(null);
  await vi.advanceTimersByTimeAsync(6000);
  const checks = mocks.check.mock.calls.length;
  abort.abort();
  await reader.cancel();
  expect(checks).toBe(2);
  expect(vi.getTimerCount()).toBe(0);
});
