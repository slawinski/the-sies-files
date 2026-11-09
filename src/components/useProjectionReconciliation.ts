"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiClientError } from "@/lib/client-api";
import { AccessLifetime, isAccessDenial } from "@/lib/access-lifetime";
import { ReconciliationCoordinator, type ProjectionMetadata, type ReconciliationState, type RefreshOutcome } from "@/lib/projection-reconciliation";

/** The only publication point for each page's authoritative projection. */
export function useProjectionReconciliation<T extends ProjectionMetadata>(
  scope: string | null,
  read: (signal: AbortSignal) => Promise<T>,
) {
  const readRef = useRef(read);
  readRef.current = read;
  const owner = useRef<ReconciliationCoordinator<T> | null>(null);
  const access = useRef(new AccessLifetime());
  const denial = useRef<(error: unknown) => void>(() => {});
  const [state, setState] = useState<{ scope: string | null; data: T | null; generation: number; freshness: ReconciliationState }>({
    scope, data: null, generation: 0, freshness: { gameId: null, applied: null, target: 0, ready: false, error: null },
  });
  useEffect(() => {
    let data: T | null = null;
    const coordinator = new ReconciliationCoordinator(scope, signal => readRef.current(signal),
      next => { access.current.authorize(); data = next; }, freshness => {
        const error = freshness.error;
        if (isAccessDenial(error, true)) { access.current.lose(); data = null; }
        setState({ scope, data, generation: access.current.generation, freshness });
      });
    denial.current = error => { access.current.lose(); data = null; coordinator.rejectAccess(error); };
    owner.current = coordinator;
    setState({ scope, data: null, generation: access.current.generation, freshness: coordinator.snapshot });
    coordinator.setVisible(document.visibilityState !== "hidden");
    void coordinator.refresh();
    const visibility = () => coordinator.setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      coordinator.dispose();
      access.current.lose();
      denial.current = () => {};
      if (owner.current === coordinator) owner.current = null;
    };
  }, [scope]);
  const refresh = useCallback((): Promise<RefreshOutcome<T>> => owner.current?.refresh() ?? Promise.resolve({ status: "superseded" }), []);
  const boundary = useCallback(() => owner.current?.requireBoundary(), []);
  const target = useCallback((version: number) => owner.current?.raiseTarget(version), []);
  const captureAccess = useCallback(() => access.current.capture(), []);
  const ownsAccess = useCallback((ticket: number) => access.current.owns(ticket), []);
  const denyAccess = useCallback((error: unknown) => {
    if (isAccessDenial(error)) denial.current(error);
  }, []);
  const accessLost = useCallback(() => denial.current(new ApiClientError(401, "UNAUTHORIZED", "Not authenticated")), []);
  const isCurrent = useCallback((gameId: string | null) => {
    const state = owner.current?.snapshot;
    return state?.gameId === gameId && access.current.active;
  }, []);
  const canCommand = useCallback((metadata: ProjectionMetadata) => {
    const state = owner.current?.snapshot;
    return access.current.active && state?.ready === true && state.gameId === metadata.gameId && state.applied === metadata.version;
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
    ready: current && state.freshness.ready, refresh, boundary, target, acknowledge, canCommand, isCurrent,
    accessGeneration: state.generation, captureAccess, ownsAccess, denyAccess, accessLost };
}
