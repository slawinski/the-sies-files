"use client";

import { useEffect, useRef, useState } from "react";

export type RealtimeHealth = "LIVE" | "RECONNECTING" | "OFFLINE";

/** Trailing-debounce window that coalesces invalidate bursts (docs/04 §10). */
const INVALIDATE_DEBOUNCE_MS = 150;

/**
 * Custom window events exchanged with `usePresenceHeartbeat` so the two hooks
 * stay decoupled: a failed heartbeat implies the origin is unreachable, a
 * successful one lets this hook re-evaluate instead of staying stuck OFFLINE.
 */
export const HEARTBEAT_FAILED_EVENT = "tsf:presence-heartbeat-failed";
export const HEARTBEAT_OK_EVENT = "tsf:presence-heartbeat-ok";

/**
 * Subscribes to the game's SSE invalidation stream and reports connection
 * health. Never marks LIVE on mount — only after the stream's `open` event.
 * On `invalidate` messages, calls `onInvalidate` with a trailing debounce so
 * bursts of events (one command → several events) cause a single refetch.
 */
export function useGameEventStream(
  gameId: string | null,
  onInvalidate: () => void,
): RealtimeHealth {
  const [health, setHealth] = useState<RealtimeHealth>("RECONNECTING");
  const sourceRef = useRef<EventSource | null>(null);
  const debounceRef = useRef<number | null>(null);
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;

  useEffect(() => {
    if (!gameId) {
      setHealth("OFFLINE");
      return;
    }

    const source = new EventSource(`/api/v1/games/${gameId}/events/stream`);
    sourceRef.current = source;

    const queueInvalidate = () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        onInvalidateRef.current();
      }, INVALIDATE_DEBOUNCE_MS);
    };

    /** Derive health from browser connectivity + the stream's readyState. */
    const evaluateHealth = () => {
      if (navigator.onLine === false) {
        setHealth("OFFLINE");
      } else {
        setHealth(
          sourceRef.current?.readyState === EventSource.OPEN ? "LIVE" : "RECONNECTING",
        );
      }
    };

    const handleHeartbeatFailed = () => setHealth("OFFLINE");

    source.addEventListener("open", evaluateHealth);
    source.addEventListener("error", evaluateHealth);
    source.addEventListener("invalidate", queueInvalidate);

    window.addEventListener("offline", evaluateHealth);
    window.addEventListener("online", evaluateHealth);
    window.addEventListener(HEARTBEAT_FAILED_EVENT, handleHeartbeatFailed);
    window.addEventListener(HEARTBEAT_OK_EVENT, evaluateHealth);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      source.removeEventListener("open", evaluateHealth);
      source.removeEventListener("error", evaluateHealth);
      source.removeEventListener("invalidate", queueInvalidate);
      source.close();
      sourceRef.current = null;
      window.removeEventListener("offline", evaluateHealth);
      window.removeEventListener("online", evaluateHealth);
      window.removeEventListener(HEARTBEAT_FAILED_EVENT, handleHeartbeatFailed);
      window.removeEventListener(HEARTBEAT_OK_EVENT, evaluateHealth);
    };
  }, [gameId]);

  return health;
}
