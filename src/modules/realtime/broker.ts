// In-memory realtime broker. Correctness never depends on delivery: a client
// can always refetch its projection from the DB. The broker only signals that
// something changed so connected clients can refetch immediately (docs/04 §10).

export interface RealtimeEvent {
  gameId: string;
  type: "hello" | "invalidate";
  version: number;
  sequence: number;
}

type Listener = (event: RealtimeEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribe(gameId: string, listener: Listener): () => void {
  let set = listeners.get(gameId);
  if (!set) {
    set = new Set();
    listeners.set(gameId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(gameId);
  };
}

export function publish(gameId: string, event: Omit<RealtimeEvent, "gameId">): void {
  const set = listeners.get(gameId);
  if (!set) return;
  const full: RealtimeEvent = { gameId, ...event };
  for (const listener of set) {
    // A throwing listener must not prevent delivery to other subscribers.
    try {
      listener(full);
    } catch {
      // ignore — listeners are expected to be defensive about stream closure
    }
  }
}
