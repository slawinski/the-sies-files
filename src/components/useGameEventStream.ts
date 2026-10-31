"use client";

import { useEffect, useRef, useState } from "react";
import { validVersion } from "@/lib/projection-reconciliation";

export type RealtimeHealth = "LIVE" | "SYNCHRONIZING" | "RECONNECTING" | "OFFLINE";

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
 * health independently of applied projection readiness. Lifecycle boundaries
 * require HTTP truth; neither opening a socket nor a heartbeat certifies it.
 */
export function useGameEventStream(
  gameId: string | null,
  onInvalidate: () => void,
  reconciliation?: { ready: boolean; boundary: () => void; target: (version: number) => void },
): RealtimeHealth {
  const [health, setHealth] = useState<"OPEN" | "RECONNECTING" | "OFFLINE">("RECONNECTING");
  const sourceRef = useRef<EventSource | null>(null);
  const debounceRef = useRef<number | null>(null);
  const onInvalidateRef = useRef(onInvalidate);
  onInvalidateRef.current = onInvalidate;
  const reconciliationRef = useRef(reconciliation);
  reconciliationRef.current = reconciliation;

  useEffect(() => {
    if (!gameId) {
      setHealth("OFFLINE");
      return;
    }

    const source = new EventSource(`/api/v1/games/${gameId}/events/stream`);
    sourceRef.current = source;

    const queueInvalidate = () => {
      if (debounceRef.current !== null) return;
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
          source.readyState === EventSource.OPEN ? "OPEN" : "RECONNECTING",
        );
      }
    };

    const handleHeartbeatFailed = () => setHealth("OFFLINE");
    const boundary = () => {
      reconciliationRef.current?.boundary();
      onInvalidateRef.current();
    };
    const open = () => { evaluateHealth(); boundary(); };
    const metadata = (event: Event) => {
      try {
        const value = JSON.parse((event as MessageEvent).data);
        if (value.gameId !== gameId) return;
        if (!validVersion(value.version)) throw new Error("Invalid stream version");
        reconciliationRef.current?.target(value.version);
      } catch {
        reconciliationRef.current?.boundary();
      }
      queueInvalidate();
    };
    const foreground = () => { if (document.visibilityState !== "hidden") boundary(); };
    const online = () => { evaluateHealth(); boundary(); };
    const heartbeatOk = () => {
      evaluateHealth();
      if (!reconciliationRef.current?.ready) onInvalidateRef.current();
    };

    source.addEventListener("open", open);
    source.addEventListener("error", evaluateHealth);
    source.addEventListener("hello", metadata);
    source.addEventListener("invalidate", metadata);

    window.addEventListener("offline", evaluateHealth);
    window.addEventListener("online", online);
    window.addEventListener(HEARTBEAT_FAILED_EVENT, handleHeartbeatFailed);
    window.addEventListener(HEARTBEAT_OK_EVENT, heartbeatOk);
    window.addEventListener("focus", foreground);
    window.addEventListener("pageshow", foreground);
    document.addEventListener("visibilitychange", foreground);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      source.removeEventListener("open", open);
      source.removeEventListener("error", evaluateHealth);
      source.removeEventListener("hello", metadata);
      source.removeEventListener("invalidate", metadata);
      source.close();
      sourceRef.current = null;
      window.removeEventListener("offline", evaluateHealth);
      window.removeEventListener("online", online);
      window.removeEventListener(HEARTBEAT_FAILED_EVENT, handleHeartbeatFailed);
      window.removeEventListener(HEARTBEAT_OK_EVENT, heartbeatOk);
      window.removeEventListener("focus", foreground);
      window.removeEventListener("pageshow", foreground);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [gameId]);

  return health === "OPEN" ? (reconciliation?.ready ? "LIVE" : "SYNCHRONIZING") : health;
}
