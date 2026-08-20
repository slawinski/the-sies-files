"use client";

import { useEffect, useRef, useState } from "react";

/**
 * MapCard — the scenario terrain map (docs/12_MAP_ASSET_SPECIFICATION.md).
 *
 * - Tries the production art `/maps/map-{base|extended}@1x.webp`; on error it
 *   falls back to the schematic chip grid (which is also the pre-art state).
 * - Location markers come ONLY from the server projection (`mapLocations`,
 *   already filtered to the current map version by the server). The client
 *   never receives hidden-location metadata before the unlock (docs/12 §8).
 * - A one-time "new annex attached" treatment plays when the map flips to
 *   MAP_EXTENDED (docs/11 §13); neutralized under prefers-reduced-motion.
 */

export interface MapLocationDto {
  id: string;
  x: number;
  y: number;
}

/** "HAMMOCK_APPLES" → "Hammock Apples". */
function titleCaseLocation(id: string): string {
  return id
    .split("_")
    .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(" ");
}

/** "MAP_BASE" → "map-base"; anything else → null (no art attempt). */
function assetStemFor(mapVersionId: string | null): "map-base" | "map-extended" | null {
  if (mapVersionId === "MAP_BASE") return "map-base";
  if (mapVersionId === "MAP_EXTENDED") return "map-extended";
  return null;
}

export default function MapCard({
  mapVersionId,
  mapLocations,
}: {
  mapVersionId: string | null;
  mapLocations: MapLocationDto[];
}) {
  const stem = assetStemFor(mapVersionId);
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const [justUnlocked, setJustUnlocked] = useState(false);
  const [annexing, setAnnexing] = useState(false);
  const prevVersionRef = useRef<string | null>(null);

  useEffect(() => {
    setImageStatus("loading");
  }, [mapVersionId]);

  // Detect the unlock event (version flip to MAP_EXTENDED) exactly once.
  useEffect(() => {
    const prev = prevVersionRef.current;
    prevVersionRef.current = mapVersionId;
    if (prev === null || prev === mapVersionId) return;
    if (mapVersionId === "MAP_EXTENDED") setJustUnlocked(true);
  }, [mapVersionId]);

  // Play the one-shot annex treatment once the extended sheet has loaded.
  useEffect(() => {
    if (!justUnlocked || imageStatus !== "loaded") return;
    setAnnexing(true);
    const timer = window.setTimeout(() => {
      setAnnexing(false);
      setJustUnlocked(false);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [justUnlocked, imageStatus]);

  const showImage = stem !== null && imageStatus === "loaded";

  const fallback = () => {
    if (mapLocations.length === 0) {
      return <p className="text-sm text-ink-muted">Brak mapy.</p>;
    }
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {mapLocations.map((location) => (
          <span
            key={location.id}
            className="rounded-lg border border-line bg-card-soft px-2.5 py-2 text-center text-xs text-ink-secondary"
          >
            {titleCaseLocation(location.id)}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="p-4">
      {mapVersionId === "MAP_EXTENDED" && (
        <p className="mb-3 text-xs text-brass">aneks dołączony do akt</p>
      )}

      <div className={annexing ? "annex-in" : undefined}>
        {showImage ? (
          <div className="relative w-full overflow-hidden rounded-xl border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/maps/${stem}@1x.webp`}
              alt={
                mapVersionId === "MAP_EXTENDED"
                  ? "Mapa terenu — wersja rozszerzona"
                  : "Mapa terenu"
              }
              onError={() => setImageStatus("failed")}
              className="block h-auto w-full"
            />
            {mapLocations.map((marker) => (
              <span
                key={marker.id}
                className="map-marker"
                style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
              >
                <span className="map-marker-dot" aria-hidden="true" />
                <span className="map-marker-label">{titleCaseLocation(marker.id)}</span>
              </span>
            ))}
          </div>
        ) : stem !== null && imageStatus === "loading" ? (
          <div className="flex min-h-40 items-center justify-center rounded-xl border border-line bg-card-soft/40">
            <p className="text-sm text-ink-muted">Wczytuję mapę…</p>
          </div>
        ) : (
          fallback()
        )}
      </div>
    </div>
  );
}
