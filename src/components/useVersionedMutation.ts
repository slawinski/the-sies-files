"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError, friendlyMessage } from "@/lib/client-api";
import { executeCommand } from "@/lib/command-refresh";

export function useVersionedMutation(apply: () => Promise<unknown>, options: {
  scope: string | null; ready: () => boolean; current: () => boolean; acknowledge: (value: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const running = useRef(false);
  const current = useRef(options);
  current.current = options;
  const lifetime = useRef({ scope: options.scope, active: true });
  if (lifetime.current.scope !== options.scope) lifetime.current = { scope: options.scope, active: true };
  useEffect(() => {
    const generation = lifetime.current;
    generation.active = true;
    running.current = false;
    setBusy(false); setActionError(null); setStale(false);
    return () => { generation.active = false; };
  }, [options.scope]);

  const runWithResult = useCallback(async <T,>(action: () => Promise<T>): Promise<{ ok: boolean; value: T | null }> => {
    const generation = lifetime.current;
    const valid = () => generation.active && generation === lifetime.current && current.current.current();
    if (!valid() || !current.current.ready() || running.current) return { ok: false, value: null };
    running.current = true;
    setBusy(true); setActionError(null); setStale(false);
    const result = await executeCommand(action,
      () => valid() ? apply() : Promise.resolve(),
      value => { if (valid()) current.current.acknowledge(value); });
    if (!valid()) return { ok: false, value: null };
    if (result.commandError) {
      const e = result.commandError as ApiClientError;
      if (e.code === "VERSION_CONFLICT") setStale(true);
      else setActionError(friendlyMessage(e.code ?? "UNKNOWN", "Coś poszło nie tak."));
    }
    setBusy(false);
    running.current = false;
    return { ok: result.committed, value: result.value };
  }, [apply]);
  const run = useCallback(async (action: () => Promise<unknown>) => (await runWithResult(action)).ok, [runWithResult]);
  return { busy, actionError, stale, setBusy, setActionError, setStale, run, runWithResult };
}
