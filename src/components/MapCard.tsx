"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type { MapLayerDto, MapPoiDto, MapStateDto } from "@/lib/client-api";
import {
  FULL_VIEW,
  INITIAL_VIEW,
  POST_MAX_SCALE,
  POST_MIN_SCALE,
  POST_WORLD,
  PRE_MAX_SCALE,
  PRE_MIN_SCALE,
  PRE_WORLD,
  panRect,
  rectToCss,
  tweenRect,
  zoomRectAbout,
  type Rect,
} from "./map-camera";

/**
 * MapCard — the scenario terrain map (docs/map-reveal-system-spec.md).
 *
 * - Renders a generic stack of terrain layers (BASE + any authorized REVEAL
 *   overlays) on one canonical canvas; the client never hardcodes a specific
 *   hidden area.
 * - The camera (crop rect) frames the main property before the reveal and the
 *   whole canvas after it; pan/zoom is clamped so the hidden western world can
 *   never be explored pre-unlock (§9).
 * - When a REVEAL layer arrives, the asset is fetched (authorized URL) and
 *   decoded BEFORE the camera expands; only then the one-shot reveal ceremony
 *   plays (camera fly-out + organic mask fade, §11–§12). Reload after unlock
 *   restores the final state without replaying the animation (§14).
 * - POIs are server-filtered and positioned with normalized coords (§4, §6).
 */

const SEEN_REVISION_KEY = "tsf.seenMapRevealRevision";
/** Focal point of the organic seam in world coords (asset analysis; §12B).
 *  Camera framing constants live in ./map-camera — the spec's own §9 ships
 *  example viewport values, and this is an anti-spoiler boundary, not DRM. */
const SEAM_FOCAL = { x: 0.47, y: 0.55 };

type LayerStatus = "loading" | "loaded" | "failed";
type TransitionState = "idle" | "LOCKED_FOR_TRANSITION";
type RevealPhase = "idle" | "preparing" | "running" | "settled" | "failed";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Read a previously seen reveal revision (client-only, §14). Never throws. */
function readSeenRevision(): number {
  try {
    return Number(window.localStorage.getItem(SEEN_REVISION_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function writeSeenRevision(revision: number): void {
  try {
    window.localStorage.setItem(SEEN_REVISION_KEY, String(revision));
  } catch {
    // Private mode / storage unavailable — the ceremony simply replays later.
  }
}

/** Preload an authorized layer asset off-DOM and wait until it fully decodes. */
function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if ("decode" in img) {
        img.decode().then(resolve).catch(() => reject(new Error("decode failed")));
      } else {
        resolve();
      }
    };
    img.onerror = () => reject(new Error("image failed to load"));
    img.src = url;
  });
}

interface PointerEntry {
  x: number;
  y: number;
}

export default function MapCard({
  map,
  mapVersionId,
}: {
  map: MapStateDto | null;
  mapVersionId: string | null;
}) {
  const reducedMotion = usePrefersReducedMotion();

  const [layerStatus, setLayerStatus] = useState<Record<string, LayerStatus>>({});
  const [transition, setTransition] = useState<TransitionState>("idle");
  const [revealPhase, setRevealPhase] = useState<RevealPhase>("idle");
  const [revealProgress, setRevealProgress] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  const [stage, setStage] = useState<"base" | "revealed">("base");
  const [rect, setRect] = useState<Rect>(INITIAL_VIEW);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const transitionRef = useRef(transition);
  transitionRef.current = transition;
  const toastTimerRef = useRef<number | null>(null);

  const pointersRef = useRef<Map<number, PointerEntry>>(new Map());
  const panRef = useRef<{ last: PointerEntry; rect: Rect; viewportW: number } | null>(null);
  const pinchRef = useRef<{
    startDist: number;
    rect: Rect;
    focalWorld: { x: number; y: number };
  } | null>(null);
  const tapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const ceremonyStartedRef = useRef<Set<number>>(new Set());
  const ceremonyGenRef = useRef(0);
  const autoRetriedRef = useRef(false);
  const tweenCancelRef = useRef<(() => void) | null>(null);

  const world = stage === "revealed" ? POST_WORLD : PRE_WORLD;
  const minScale = stage === "revealed" ? POST_MIN_SCALE : PRE_MIN_SCALE;
  const maxScale = stage === "revealed" ? POST_MAX_SCALE : PRE_MAX_SCALE;
  const stageDefaultRect = stage === "revealed" ? FULL_VIEW : INITIAL_VIEW;

  // Derived presentation flags (also consumed by the wheel effect below).
  const revealLayerIds = new Set(map?.layers.filter((l) => l.kind === "REVEAL").map((l) => l.id) ?? []);
  const revealRunning = revealPhase === "running";
  const revealSettled = revealPhase === "settled";
  const baseFailed = (map?.layers ?? []).some(
    (l) => l.kind === "BASE" && layerStatus[l.id] === "failed",
  );
  const baseLoading = (map?.layers ?? []).some(
    (l) => l.kind === "BASE" && layerStatus[l.id] !== "loaded" && layerStatus[l.id] !== "failed",
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      tweenCancelRef.current?.();
    };
  }, []);

  const markRevealLayerLoaded = useCallback((layerId: string) => {
    setLayerStatus((prev) => ({ ...prev, [layerId]: "loaded" }));
  }, []);

  const markRevealLayerFailed = useCallback((layerId: string) => {
    setLayerStatus((prev) => ({ ...prev, [layerId]: "failed" }));
  }, []);

  const loadRevealLayers = useCallback(
    async (layers: MapLayerDto[], onFailure: () => void): Promise<boolean> => {
      for (const layer of layers) {
        try {
          await preloadImage(layer.url);
          markRevealLayerLoaded(layer.id);
        } catch {
          markRevealLayerFailed(layer.id);
          onFailure();
          return false;
        }
      }
      return true;
    },
    [markRevealLayerFailed, markRevealLayerLoaded],
  );

  /** One-shot reveal ceremony (§11–§12). Runs exactly once per revision.
   *  A newer state arriving mid-transition supersedes the in-flight tween
   *  (spec §13) — the camera resumes from its current position. */
  const runRevealCeremony = useCallback(
    (revealLayers: MapLayerDto[], revision: number) => {
      setTransition("LOCKED_FOR_TRANSITION");
      setRevealPhase("preparing");
      autoRetriedRef.current = false;
      tweenCancelRef.current?.();
      ceremonyGenRef.current += 1;
      const generation = ceremonyGenRef.current;
      void (async () => {
        const ok = await loadRevealLayers(revealLayers, () => {
          setRevealPhase("failed");
          setTransition("idle");
          if (!autoRetriedRef.current) {
            autoRetriedRef.current = true;
            window.setTimeout(() => {
              void runRevealCeremony(revealLayers, revision);
            }, 2000);
          }
        });
        if (!ok) return;
        // A newer state superseded this ceremony during the preload.
        if (generation !== ceremonyGenRef.current) return;

        setStage("revealed");
        setRevealPhase("running");
        const from = rectRef.current;
        const cameraMs = reducedMotion ? 0 : 1400;
        const fadeDelayMs = reducedMotion ? 0 : 200;
        const fadeMs = reducedMotion ? 200 : 1200;

        const start = performance.now();
        let raf = 0;
        const step = (now: number) => {
          const ct = Math.min(1, (now - start) / cameraMs);
          const ctE = ct < 0.5 ? 4 * ct * ct * ct : 1 - Math.pow(-2 * ct + 2, 3) / 2;
          setRect({
            x0: from.x0 + (FULL_VIEW.x0 - from.x0) * ctE,
            y0: from.y0 + (FULL_VIEW.y0 - from.y0) * ctE,
            x1: from.x1 + (FULL_VIEW.x1 - from.x1) * ctE,
            y1: from.y1 + (FULL_VIEW.y1 - from.y1) * ctE,
          });
          const elapsed = now - start;
          if (elapsed >= fadeDelayMs) {
            const ft = Math.min(1, (elapsed - fadeDelayMs) / fadeMs);
            setRevealProgress(ft < 0.5 ? 4 * ft * ft * ft : 1 - Math.pow(-2 * ft + 2, 3) / 2);
          }
          if (ct >= 1 && elapsed >= fadeDelayMs + fadeMs) {
            setRect(FULL_VIEW);
            setRevealProgress(1);
            setRevealPhase("settled");
            setTransition("idle");
            writeSeenRevision(revision);
            showToast("Mapa zaktualizowana");
            setAnnouncement("Mapa została zaktualizowana. Nowy obszar jest teraz dostępny.");
            return;
          }
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        tweenCancelRef.current = () => cancelAnimationFrame(raf);
      })();
    },
    [loadRevealLayers, reducedMotion, showToast],
  );

  // Stage + layer lifecycle driven by the server-provided map state.
  useEffect(() => {
    if (!map) {
      setStage("base");
      setRect(INITIAL_VIEW);
      setRevealPhase("idle");
      setLayerStatus({});
      return;
    }
    const revealLayers = map.layers.filter((l) => l.kind === "REVEAL");
    if (revealLayers.length === 0) {
      // Storyteller rollback or fresh game — back to the property framing.
      setStage("base");
      setRect(INITIAL_VIEW);
      setRevealPhase("idle");
      return;
    }

    const revision = map.revision;
    const seen = readSeenRevision();
    if (seen >= revision) {
      // Reload after unlock: restore the final state directly, no ceremony (§14).
      setStage("revealed");
      setRect(FULL_VIEW);
      setRevealPhase("settled");
      void loadRevealLayers(revealLayers, () => setRevealPhase("failed"));
      return;
    }
    if (ceremonyStartedRef.current.has(revision)) return;
    ceremonyStartedRef.current.add(revision);
    runRevealCeremony(revealLayers, revision);
  }, [map, loadRevealLayers, runRevealCeremony]);

  // Initial status bookkeeping when layers first appear.
  useEffect(() => {
    if (!map) return;
    setLayerStatus((prev) => {
      const next: Record<string, LayerStatus> = { ...prev };
      for (const layer of map.layers) {
        if (layer.kind === "BASE" && next[layer.id] === undefined) next[layer.id] = "loading";
        if (layer.kind === "REVEAL" && next[layer.id] === undefined) next[layer.id] = "loading";
      }
      return next;
    });
  }, [map]);

  // ---- Camera helpers -------------------------------------------------------

  const zoomAt = useCallback(
    (focalWorld: { x: number; y: number }, factor: number) => {
      if (transitionRef.current !== "idle") return;
      setRect((current) => zoomRectAbout(current, focalWorld.x, focalWorld.y, factor, world, minScale, maxScale));
    },
    [maxScale, minScale, world],
  );

  const resetCamera = useCallback(() => {
    if (transitionRef.current !== "idle") return;
    const from = rectRef.current;
    tweenCancelRef.current?.();
    tweenCancelRef.current = tweenRect(
      from,
      stageDefaultRect,
      180,
      setRect,
      () => undefined,
      reducedMotion,
    );
  }, [reducedMotion, stageDefaultRect]);

  const zoomButton = useCallback(
    (factor: number) => {
      const current = rectRef.current;
      zoomAt({ x: (current.x0 + current.x1) / 2, y: (current.y0 + current.y1) / 2 }, factor);
    },
    [zoomAt],
  );

  // ---- Pointer gestures (pan / pinch / double-tap) --------------------------

  const worldPointFromClient = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const el = viewportRef.current;
    const current = rectRef.current;
    if (!el) return { x: 0, y: 0 };
    const bounds = el.getBoundingClientRect();
    const relX = (clientX - bounds.left) / bounds.width;
    const relY = (clientY - bounds.top) / bounds.height;
    return {
      x: current.x0 + relX * (current.x1 - current.x0),
      y: current.y0 + relY * (current.y1 - current.y0),
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (transitionRef.current !== "idle") return;
      e.currentTarget.setPointerCapture(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 2) {
        // Begin pinch.
        const [p1, p2] = [...pointersRef.current.values()];
        pinchRef.current = {
          startDist: Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1,
          rect: rectRef.current,
          focalWorld: worldPointFromClient((p1.x + p2.x) / 2, (p1.y + p2.y) / 2),
        };
        panRef.current = null;
      } else if (pointersRef.current.size === 1) {
        // Double-tap detection (touch only) for zoom toggling.
        if (e.pointerType === "touch") {
          const now = performance.now();
          const last = tapRef.current;
          if (last && now - last.time < 300 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 40) {
            tapRef.current = null;
            const current = rectRef.current;
            const scale = 1 / (current.x1 - current.x0);
            if (scale > minScale * 1.1) {
              tweenCancelRef.current?.();
              tweenCancelRef.current = tweenRect(current, stageDefaultRect, 180, setRect, () => undefined, reducedMotion);
            } else {
              zoomAt(worldPointFromClient(e.clientX, e.clientY), 2);
            }
            return;
          }
          tapRef.current = { time: now, x: e.clientX, y: e.clientY };
        }
        const el = viewportRef.current;
        panRef.current = {
          last: { x: e.clientX, y: e.clientY },
          rect: rectRef.current,
          viewportW: el?.getBoundingClientRect().width ?? 1,
        };
      }
    },
    [minScale, reducedMotion, stageDefaultRect, worldPointFromClient, zoomAt],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const pinch = pinchRef.current;
      if (pinch && pointersRef.current.size === 2) {
        const [p1, p2] = [...pointersRef.current.values()];
        const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
        const factor = dist / pinch.startDist;
        setRect(
          zoomRectAbout(
            pinch.rect,
            pinch.focalWorld.x,
            pinch.focalWorld.y,
            factor,
            world,
            minScale,
            maxScale,
          ),
        );
        return;
      }

      const pan = panRef.current;
      if (pan) {
        const dx = (e.clientX - pan.last.x) / pan.viewportW;
        const dy = (e.clientY - pan.last.y) / pan.viewportW;
        pan.last = { x: e.clientX, y: e.clientY };
        setRect(panRect({ ...pan.rect }, -dx, -dy, world, minScale, maxScale));
      }
    },
    [maxScale, minScale, world],
  );

  const handlePointerEnd = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) panRef.current = null;
  }, []);

  // Wheel zoom (desktop) — non-passive so the browser page never scrolls/zooms.
  // Depends on `map`/`baseFailed` because the viewport element only exists once
  // the base layer is present; re-attach when it (re)mounts.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (transitionRef.current !== "idle") return;
      const current = rectRef.current;
      const focal = worldPointFromClient(e.clientX, e.clientY);
      const factor = Math.exp(-e.deltaY * 0.0015);
      setRect(zoomRectAbout(current, focal.x, focal.y, factor, world, minScale, maxScale));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [map, baseFailed, maxScale, minScale, world, worldPointFromClient]);

  // ---- Render ---------------------------------------------------------------

  const css = rectToCss(rect);
  const visiblePois: MapPoiDto[] = (map?.pois ?? []).filter((p) => {
    if (layerStatus[p.layerId] !== "loaded") return false;
    if (revealLayerIds.has(p.layerId) && !revealSettled) return false;
    return true;
  });

  // Enter-animation order for newly revealed western POIs (stagger §12C).
  const westPoiOrder = new Map<string, number>();
  visiblePois
    .filter((p) => revealLayerIds.has(p.layerId))
    .forEach((p, index) => westPoiOrder.set(p.id, index));

  const retryReveal = useCallback(() => {
    const revealLayers = (map?.layers ?? []).filter((l) => l.kind === "REVEAL");
    if (revealLayers.length === 0) return;
    const revision = map?.revision ?? 1;
    if (readSeenRevision() >= revision) {
      // Reload path — the ceremony already played on this device; just load.
      setTransition("idle");
      void loadRevealLayers(revealLayers, () => setRevealPhase("failed")).then((ok) => {
        if (ok) {
          setRevealPhase("settled");
          setStage("revealed");
          setRect(FULL_VIEW);
        }
      });
      return;
    }
    autoRetriedRef.current = false;
    runRevealCeremony(revealLayers, revision);
  }, [loadRevealLayers, map, runRevealCeremony]);

  if (!map || map.layers.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-ink-muted">Brak mapy.</p>
      </div>
    );
  }

  const fallbackChips = (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {visiblePois.length === 0 ? (
        <p className="col-span-full text-sm text-ink-muted">Brak mapy.</p>
      ) : (
        visiblePois.map((poi) => (
          <span
            key={poi.id}
            className="rounded-lg border border-line bg-card-soft px-2.5 py-2 text-center text-meta text-ink-secondary"
          >
            {poi.label}
          </span>
        ))
      )}
    </div>
  );

  const revealImgStyle: CSSProperties =
    revealRunning || revealSettled
      ? {
          opacity: revealRunning ? revealProgress : 1,
          ...(revealRunning
            ? {
                WebkitMaskImage: `radial-gradient(circle at ${SEAM_FOCAL.x * 100}% ${SEAM_FOCAL.y * 100}%, black 0%, transparent 68%)`,
                maskImage: `radial-gradient(circle at ${SEAM_FOCAL.x * 100}% ${SEAM_FOCAL.y * 100}%, black 0%, transparent 68%)`,
                WebkitMaskSize: `${revealProgress * 300}% ${revealProgress * 300}%`,
                maskSize: `${revealProgress * 300}% ${revealProgress * 300}%`,
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
              }
            : {}),
        }
      : { opacity: 0 };

  return (
    <div className="p-4">
      {mapVersionId === "MAP_EXTENDED" && (
        <p className="mb-3 text-meta text-brass">aneks dołączony do akt</p>
      )}

      {/* Screen-reader announcement for the reveal (§16). */}
      <p aria-live="polite" role="status" className="sr-only">
        {announcement ?? ""}
      </p>

      {/* Accessible POI list — the illustrated map is never the only source (§16). */}
      <ul className="sr-only">
        {visiblePois.map((poi) => (
          <li key={poi.id}>{poi.label}</li>
        ))}
      </ul>

      {baseFailed ? (
        fallbackChips
      ) : (
        <div className="relative">
          <div
            ref={viewportRef}
            role="region"
            aria-label="Mapa terenu"
            className="map-viewport"
            style={{ aspectRatio: `${css.aspect}` }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
          >
            <div
              className="map-world"
              style={{
                left: `${css.leftPct}%`,
                top: `${css.topPct}%`,
                width: `${css.widthPct}%`,
                height: `${css.heightPct}%`,
              }}
            >
              {map.layers.map((layer) => {
                const status = layerStatus[layer.id] ?? "loading";
                const isReveal = layer.kind === "REVEAL";
                if (isReveal && status !== "loaded") return null;
                return (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={layer.id}
                    data-layer={layer.id}
                    src={layer.url}
                    alt={isReveal ? "" : "Mapa terenu"}
                    aria-hidden={isReveal || undefined}
                    draggable={false}
                    style={
                      isReveal
                        ? { ...revealImgStyle, zIndex: layer.zIndex }
                        : { zIndex: layer.zIndex }
                    }
                    onLoad={() => setLayerStatus((prev) => ({ ...prev, [layer.id]: "loaded" }))}
                    onError={() => setLayerStatus((prev) => ({ ...prev, [layer.id]: "failed" }))}
                  />
                );
              })}

              {visiblePois.map((poi) => {
                const westEntering = revealSettled && revealLayerIds.has(poi.layerId);
                const stagger = westEntering ? (westPoiOrder.get(poi.id) ?? 0) * 40 : 0;
                if (poi.interactive) {
                  return (
                    <button
                      key={poi.id}
                      type="button"
                      aria-label={poi.label}
                      className="map-poi map-poi-interactive"
                      style={{ left: `${poi.x * 100}%`, top: `${poi.y * 100}%` }}
                    >
                      <span className="map-poi-dot" aria-hidden="true" />
                      <span className="map-poi-label">{poi.label}</span>
                    </button>
                  );
                }
                return (
                  <span
                    key={poi.id}
                    className={westEntering ? "map-poi map-poi-in" : "map-poi"}
                    style={{
                      left: `${poi.x * 100}%`,
                      top: `${poi.y * 100}%`,
                      animationDelay: westEntering ? `${stagger}ms` : undefined,
                    }}
                  >
                    <span className="map-poi-dot" aria-hidden="true" />
                    <span className="map-poi-label">{poi.label}</span>
                  </span>
                );
              })}

              {revealRunning && <span className="map-fx" aria-hidden="true" />}
            </div>
          </div>

          {/* Zoom controls (keyboard-operable, ≥40px targets). */}
          <div className="map-zoom-controls" role="group" aria-label="Sterowanie mapą">
            <button
              type="button"
              className="map-zoom-btn"
              aria-label="Przybliż mapę"
              onClick={() => zoomButton(1.5)}
            >
              +
            </button>
            <button
              type="button"
              className="map-zoom-btn"
              aria-label="Oddal mapę"
              onClick={() => zoomButton(1 / 1.5)}
            >
              −
            </button>
            <button
              type="button"
              className="map-zoom-btn"
              aria-label="Wyśrodkuj mapę"
              onClick={resetCamera}
            >
              ⌖
            </button>
          </div>

          {toast && <span className="map-updated-toast">{toast}</span>}

          {baseLoading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-ink-muted">Wczytuję mapę…</p>
            </div>
          )}

          {revealPhase === "failed" && (
            <div className="map-retry" role="status">
              <p className="text-sm text-ink-secondary">Nie udało się wczytać aktualizacji mapy.</p>
              <button
                type="button"
                className="mt-2 min-h-11 rounded-xl border border-brass/40 bg-brass/10 px-4 text-brass transition-colors hover:bg-brass/20"
                onClick={retryReveal}
              >
                Spróbuj ponownie
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
