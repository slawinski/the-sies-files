"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@/lib/client-api";
import { ReconciliationCoordinator, type ProjectionMetadata, type ReconciliationState, type RefreshOutcome } from "@/lib/projection-reconciliation";

/** The only publication point for each page's authoritative projection. */
export function useProjectionReconciliation<T extends ProjectionMetadata>(
  scope: string | null,
  read: (signal: AbortSignal) => Promise<T>,
) {
  const readRef = useRef(read);
  readRef.current = read;
  const owner = useRef<ReconciliationCoordinator<T> | null>(null);
  const [state, setState] = useState<{ scope: string | null; data: T | null; freshness: ReconciliationState }>({
    scope, data: null, freshness: { gameId: null, applied: null, target: 0, ready: false, error: null },
  });
  useEffect(() => {
    let data: T | null = null;
    const coordinator = new ReconciliationCoordinator(scope, signal => readRef.current(signal),
      next => { data = next; }, freshness => {
        const error = freshness.error;
        if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) data = null;
        setState({ scope, data, freshness });
      });
    owner.current = coordinator;
    setState({ scope, data: null, freshness: coordinator.snapshot });
    coordinator.setVisible(document.visibilityState !== "hidden");
    void coordinator.refresh();
    const visibility = () => coordinator.setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      coordinator.dispose();
      if (owner.current === coordinator) owner.current = null;
    };
  }, [scope]);
  const refresh = useCallback((): Promise<RefreshOutcome<T>> => owner.current?.refresh() ?? Promise.resolve({ status: "superseded" }), []);
  const boundary = useCallback(() => owner.current?.requireBoundary(), []);
  const target = useCallback((version: number) => owner.current?.raiseTarget(version), []);
  const isCurrent = useCallback((gameId: string | null) => {
    const state = owner.current?.snapshot;
    const error = state?.error;
    return state?.gameId === gameId && !(error instanceof ApiClientError && (error.status === 401 || error.status === 403));
  }, []);
  const canCommand = useCallback((metadata: ProjectionMetadata) => {
    const state = owner.current?.snapshot;
    return state?.ready === true && state.gameId === metadata.gameId && state.applied === metadata.version;
  }, []);
  const acknowledge = useCallback((value: unknown) => {
    if (value && typeof value === "object" && "version" in value && typeof value.version === "number") {
      owner.current?.raiseTarget(value.version);
    }
    owner.current?.requireBoundary();
  }, []);
  const current = state.scope === scope;
  return { data: current ? state.data : null, gameId: current ? state.data?.gameId ?? scope : scope,
    error: current ? state.freshness.error : null,
    ready: current && state.freshness.ready, refresh, boundary, target, acknowledge, canCommand, isCurrent };
}
