"use client";

// useVersionedMutation — the one mutation wrapper for optimistic-versioned
// game commands (audit spec: never claim success before the server ack; a
// VERSION_CONFLICT refetches the projection and flags the view as stale).

import { useCallback, useState } from "react";
import { ApiClientError, friendlyMessage } from "@/lib/client-api";

export interface VersionedMutation {
  busy: boolean;
  actionError: string | null;
  stale: boolean;
  setBusy: (busy: boolean) => void;
  setActionError: (error: string | null) => void;
  setStale: (stale: boolean) => void;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
  runWithResult: <T>(action: () => Promise<T>) => Promise<{ ok: boolean; value: T | null }>;
}

export function useVersionedMutation(apply: () => Promise<void>): VersionedMutation {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      setBusy(true);
      setActionError(null);
      setStale(false);
      try {
        await action();
        await apply();
        return true;
      } catch (err) {
        const e = err as ApiClientError;
        if (e.code === "VERSION_CONFLICT") {
          await apply();
          setStale(true);
        } else {
          setActionError(friendlyMessage(e.code ?? "UNKNOWN", "Coś poszło nie tak."));
        }
        return false;
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  const runWithResult = useCallback(
    async <T,>(action: () => Promise<T>): Promise<{ ok: boolean; value: T | null }> => {
      setBusy(true);
      setActionError(null);
      setStale(false);
      try {
        const value = await action();
        await apply();
        return { ok: true, value };
      } catch (err) {
        const e = err as ApiClientError;
        if (e.code === "VERSION_CONFLICT") {
          await apply();
          setStale(true);
        } else {
          setActionError(friendlyMessage(e.code ?? "UNKNOWN", "Coś poszło nie tak."));
        }
        return { ok: false, value: null };
      } finally {
        setBusy(false);
      }
    },
    [apply],
  );

  return { busy, actionError, stale, setBusy, setActionError, setStale, run, runWithResult };
}
