"use client";

import { useEffect } from "react";
import { HEARTBEAT_FAILED_EVENT, HEARTBEAT_OK_EVENT } from "@/components/useGameEventStream";

const HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * Keeps the viewer's presence row fresh while the shell is mounted: one
 * heartbeat immediately, then every ~20s, plus one when connectivity returns.
 * Failures are silent here — connectivity signalling is delegated to
 * `useGameEventStream` via window events (a rejected fetch means the origin
 * is unreachable; any HTTP response means it is reachable again).
 */
export function usePresenceHeartbeat(gameId: string | null): void {
  useEffect(() => {
    if (!gameId) return;
    let stopped = false;

    const beat = () => {
      fetch(`/api/v1/games/${gameId}/presence/heartbeat`, {
        method: "POST",
        cache: "no-store",
      })
        .then(() => {
          if (!stopped) window.dispatchEvent(new Event(HEARTBEAT_OK_EVENT));
        })
        .catch(() => {
          if (!stopped) window.dispatchEvent(new Event(HEARTBEAT_FAILED_EVENT));
        });
    };

    beat();
    const interval = window.setInterval(beat, HEARTBEAT_INTERVAL_MS);
    window.addEventListener("online", beat);

    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("online", beat);
    };
  }, [gameId]);
}
