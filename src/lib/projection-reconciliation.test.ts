import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectionGate, ReconciliationCoordinator } from "./projection-reconciliation";

const projection = (version: number, gameId = "a", name = "current") => ({ gameId, version, name });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
afterEach(() => vi.useRealTimers());

describe("scoped projection publication", () => {
  it("rejects old successes and failures after newer intent, including equal versions", () => {
    const gate = new ProjectionGate("a");
    const old = gate.begin();
    const latest = gate.begin();
    expect(gate.accept(latest, projection(15))).toBe(true);
    expect(gate.accept(old, projection(14))).toBe(false);
    expect(gate.current(old)).toBe(false);
    const equalOld = gate.begin();
    const equalNew = gate.begin();
    expect(gate.accept(equalNew, projection(15, "a", "new payload"))).toBe(true);
    expect(gate.accept(equalOld, projection(15, "a", "old payload"))).toBe(false);
    expect(gate.accept(gate.begin(), projection(14))).toBe(false);
  });

  it("never publishes invalid metadata or a wrong scope and invalidates disposed tickets", () => {
    const gate = new ProjectionGate("a");
    for (const value of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => gate.accept(gate.begin(), projection(value))).toThrow();
    }
    expect(() => gate.accept(gate.begin(), projection(1, "b"))).toThrow();
    const ticket = gate.begin();
    gate.dispose();
    expect(gate.accept(ticket, projection(20))).toBe(false);
    expect(gate.current(ticket)).toBe(false);
  });
});

describe("authoritative reconciliation", () => {
  it("does not starve a read during continuous invalidation bursts", async () => {
    vi.useFakeTimers();
    const work = vi.fn().mockResolvedValue(projection(3));
    const c = new ReconciliationCoordinator("a", work, () => {});
    await c.refresh();
    c.invalidate(3);
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(20);
      c.invalidate(3);
    }
    expect(work).toHaveBeenCalledTimes(2);
    c.dispose();
  });

  it("bounds below-applied retries and never republishes the lower version", async () => {
    vi.useFakeTimers();
    const work = vi.fn().mockResolvedValueOnce(projection(15)).mockResolvedValue(projection(14));
    const commits: number[] = [];
    const c = new ReconciliationCoordinator("a", work, p => commits.push(p.version));
    await c.refresh();
    await c.refresh();
    expect(c.snapshot.ready).toBe(false);
    await vi.advanceTimersByTimeAsync(1999);
    expect(work).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(work).toHaveBeenCalledTimes(3);
    expect(commits).toEqual([15]);
    c.dispose();
  });

  it("makes disposed failures inert even when work ignores cancellation", async () => {
    vi.useFakeTimers();
    const held = deferred<ReturnType<typeof projection>>();
    const notify = vi.fn();
    const publish = vi.fn();
    const c = new ReconciliationCoordinator("a", () => held.promise, publish, notify);
    const request = c.refresh();
    c.dispose();
    expect((await request).status).toBe("superseded");
    held.reject(new Error("obsolete failure"));
    await vi.advanceTimersByTimeAsync(0);
    expect(notify).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("requires a post-boundary read and keeps exactly one follow-up for in-flight triggers", async () => {
    vi.useFakeTimers();
    const first = deferred<ReturnType<typeof projection>>();
    const second = deferred<ReturnType<typeof projection>>();
    const work = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const published: number[] = [];
    const c = new ReconciliationCoordinator("a", work, (p) => published.push(p.version));
    const initial = c.refresh();
    c.requireBoundary();
    c.raiseTarget(11);
    for (let i = 0; i < 30; i++) c.invalidate(11);
    first.resolve(projection(11));
    await initial;
    expect(c.snapshot.ready).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    expect(work).toHaveBeenCalledTimes(2);
    second.resolve(projection(11));
    await vi.advanceTimersByTimeAsync(0);
    expect(c.snapshot.ready).toBe(true);
    expect(published).toEqual([11, 11]);
    c.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds retries after failure or below-target results and never lowers the target", async () => {
    vi.useFakeTimers();
    const work = vi.fn().mockRejectedValueOnce(new Error("unreachable"))
      .mockResolvedValueOnce(projection(10)).mockResolvedValue(projection(11));
    const c = new ReconciliationCoordinator("a", work, () => {});
    c.raiseTarget(11);
    await c.refresh();
    expect(c.snapshot.ready).toBe(false);
    expect(c.snapshot.error).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1999);
    expect(work).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(work).toHaveBeenCalledTimes(2);
    expect(c.snapshot.ready).toBe(false);
    c.raiseTarget(3);
    await vi.advanceTimersByTimeAsync(2000);
    expect(c.snapshot.ready).toBe(true);
    expect(c.snapshot.target).toBe(11);
    c.dispose();
  });

  it("times out hung work, aborts it, and ignores its late completion", async () => {
    vi.useFakeTimers();
    const held = deferred<ReturnType<typeof projection>>();
    let signal!: AbortSignal;
    const commits: number[] = [];
    const c = new ReconciliationCoordinator("a", (s) => { signal = s; return held.promise; }, p => commits.push(p.version));
    const request = c.refresh();
    await vi.advanceTimersByTimeAsync(15000);
    await request;
    expect(signal.aborted).toBe(true);
    expect(c.snapshot.ready).toBe(false);
    expect(c.snapshot.error).not.toBeNull();
    c.dispose();
    held.resolve(projection(99));
    await vi.advanceTimersByTimeAsync(30000);
    expect(commits).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a ready screen usable during routine fallback and pauses while hidden", async () => {
    vi.useFakeTimers();
    const held = deferred<ReturnType<typeof projection>>();
    const work = vi.fn().mockResolvedValueOnce(projection(1)).mockReturnValue(held.promise);
    const c = new ReconciliationCoordinator("a", work, () => {});
    await c.refresh();
    expect(c.snapshot.ready).toBe(true);
    await vi.advanceTimersByTimeAsync(30000);
    expect(work).toHaveBeenCalledTimes(2);
    expect(c.snapshot.ready).toBe(true);
    c.setVisible(false);
    held.resolve(projection(1));
    await vi.advanceTimersByTimeAsync(60000);
    expect(work).toHaveBeenCalledTimes(2);
    c.setVisible(true);
    expect(c.snapshot.ready).toBe(false);
    c.dispose();
  });
});
