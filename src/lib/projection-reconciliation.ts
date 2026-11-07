/** Client-only coordination of authoritative reads; never retries commands. */
export interface ProjectionMetadata { gameId: string; version: number }
export function validVersion(version: unknown): version is number {
  return typeof version === "number" && Number.isSafeInteger(version) && version >= 0;
}

/** Request intent, not completion order, owns publication (including errors). */
export class ProjectionGate {
  private intent = 0;
  private disposed = false;
  private version = -1;
  constructor(private gameId: string | null, private readonly discovery = false) {}
  begin() { return ++this.intent; }
  current(ticket: number) { return !this.disposed && ticket === this.intent; }
  accept(ticket: number, candidate: ProjectionMetadata): boolean {
    if (!this.current(ticket)) return false;
    if (!candidate || typeof candidate.gameId !== "string" || !candidate.gameId ||
      (!this.discovery && candidate.gameId !== this.gameId) || !validVersion(candidate.version)) {
      throw new Error("Nieprawidłowa odpowiedź aktualizacji.");
    }
    if (this.discovery && candidate.gameId !== this.gameId) { this.gameId = candidate.gameId; this.version = -1; }
    if (candidate.version < this.version) return false;
    this.version = candidate.version;
    return true;
  }
  dispose() { this.disposed = true; ++this.intent; }
}

export interface ReconciliationState {
  gameId: string | null;
  ready: boolean;
  target: number;
  applied: number | null;
  error: unknown | null;
}
export type RefreshOutcome<T> = { status: "applied"; projection: T } |
  { status: "failed"; error: unknown } | { status: "superseded" };

const RETRY_MS = 2000;
const DEADLINE_MS = 15000;
const FALLBACK_MS = 30000;

/** One read and one pending obligation per effect lifetime. Timers are completion-scheduled. */
export class ReconciliationCoordinator<T extends ProjectionMetadata> {
  snapshot: ReconciliationState = { gameId: null, ready: false, target: 0, applied: null, error: null };
  private readonly gate: ProjectionGate;
  private boundary = 0;
  private satisfiedBoundary = -1;
  private disposed = false;
  private visible = true;
  private pending = false;
  private active: Promise<RefreshOutcome<T>> | null = null;
  private controller: AbortController | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private retryAfter = 0;
  private debouncing = false;
  private cancel: (() => void) | null = null;

  constructor(gameId: string | null, private readonly work: (signal: AbortSignal) => Promise<T>,
    private readonly publish: (projection: T) => void,
    private readonly notify: (state: ReconciliationState) => void = () => {}) {
    this.gate = new ProjectionGate(gameId, gameId === null);
  }

  private update(patch: Partial<ReconciliationState>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.notify(this.snapshot);
  }
  private clearTimer() { if (this.timer !== null) clearTimeout(this.timer); this.timer = null; this.debouncing = false; }
  private schedule(delay: number) {
    this.clearTimer();
    if (this.disposed || !this.visible) return;
    this.timer = setTimeout(() => { this.timer = null; void this.refresh(); }, Math.max(delay, this.retryAfter - Date.now()));
  }
  raiseTarget(version: number) {
    if (this.disposed || !validVersion(version) || version <= this.snapshot.target) return;
    this.update({ target: version, ready: this.snapshot.ready && (this.snapshot.applied ?? -1) >= version });
    if (!this.active && !this.snapshot.ready && !this.debouncing) { this.schedule(150); this.debouncing = true; }
  }
  requireBoundary() {
    if (this.disposed) return;
    ++this.boundary;
    this.pending = true;
    this.update({ ready: false });
    if (!this.active) this.schedule(0);
  }
  invalidate(version: number) {
    this.raiseTarget(version);
    this.pending = true;
    if (!this.active && !this.debouncing) { this.schedule(150); this.debouncing = true; }
  }
  setVisible(visible: boolean) {
    if (this.disposed || this.visible === visible) return;
    this.visible = visible;
    if (!visible) this.clearTimer();
    else this.requireBoundary();
  }

  rejectAccess(error: unknown) {
    if (this.disposed) return;
    this.gate.begin();
    this.controller?.abort();
    this.cancel?.();
    ++this.boundary;
    this.pending = true;
    this.update({ ready: false, error });
    if (!this.active) this.schedule(RETRY_MS);
  }

  refresh(): Promise<RefreshOutcome<T>> {
    if (this.disposed) return Promise.resolve({ status: "superseded" });
    if (this.active) { this.pending = true; return this.active; }
    if (Date.now() < this.retryAfter) {
      this.pending = true;
      this.schedule(this.retryAfter - Date.now());
      return Promise.resolve({ status: "superseded" });
    }
    this.clearTimer();
    this.pending = false;
    const boundary = this.boundary;
    const ticket = this.gate.begin();
    const controller = new AbortController();
    this.controller = controller;
    const deadline = new Promise<never>((_, reject) => {
      this.cancel = () => reject(new Error("Aktualizacja anulowana."));
      this.deadline = setTimeout(() => {
        controller.abort();
        reject(new Error("Aktualizacja trwa zbyt długo. Spróbuj ponownie."));
      }, DEADLINE_MS);
    });
    let unapplied = false;
    this.active = (async (): Promise<RefreshOutcome<T>> => {
      try {
        const projection = await Promise.race([this.work(controller.signal), deadline]);
        if (controller.signal.aborted || !this.gate.current(ticket)) return { status: "superseded" };
        if (!this.gate.accept(ticket, projection)) {
          unapplied = true;
          this.update({ ready: false });
          return { status: "superseded" };
        }
        this.publish(projection);
        if (this.snapshot.gameId !== null && this.snapshot.gameId !== projection.gameId) {
          this.snapshot = { ...this.snapshot, target: 0, applied: null };
        }
        this.satisfiedBoundary = boundary;
        this.update({ gameId: projection.gameId, applied: projection.version, error: null,
          ready: boundary === this.boundary && projection.version >= this.snapshot.target });
        return { status: "applied", projection };
      } catch (error) {
        if (!this.gate.current(ticket)) return { status: "superseded" };
        this.update({ ready: false, error });
        return { status: "failed", error };
      } finally {
        if (this.deadline !== null) clearTimeout(this.deadline);
        this.deadline = null;
        this.active = null;
        this.controller = null;
        this.cancel = null;
        if (!this.disposed) {
          const failed = unapplied || this.snapshot.error !== null || (this.snapshot.applied ?? -1) < this.snapshot.target;
          if (failed) this.retryAfter = Date.now() + RETRY_MS;
          const needsRead = this.pending || this.satisfiedBoundary !== this.boundary || !this.snapshot.ready;
          const followUpDelay = failed ? RETRY_MS : 150;
          this.schedule(needsRead ? followUpDelay : FALLBACK_MS);
        }
      }
    })();
    return this.active;
  }

  dispose() {
    this.disposed = true;
    this.gate.dispose();
    this.clearTimer();
    this.controller?.abort();
    this.cancel?.();
    if (this.deadline !== null) clearTimeout(this.deadline);
    this.deadline = null;
  }
}
