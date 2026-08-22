// Map layer model (map-reveal-system-spec §5–§7): pure, dependency-light
// definitions shared by the server (state/authorization) and mirrored client
// code. No Prisma or scenario imports — keep this module free of both so the
// scenario definition can import the layer id type without creating cycles.

export type MapLayerId = "BASE" | "WEST_AREA";

export interface MapLayer {
  id: MapLayerId;
  kind: "BASE" | "REVEAL";
  assetKey: string; // stable content key: "map-base" | "map-west-reveal"
  zIndex: number;
  unlockedByDefault: boolean;
  bounds?: { xMin: number; yMin: number; xMax: number; yMax: number };
}

export const MAP_LAYERS: MapLayer[] = [
  { id: "BASE", kind: "BASE", assetKey: "map-base", zIndex: 0, unlockedByDefault: true },
  { id: "WEST_AREA", kind: "REVEAL", assetKey: "map-west-reveal", zIndex: 10, unlockedByDefault: false, bounds: { xMin: 0.011, yMin: 0.259, xMax: 0.546, yMax: 0.77 } },
];

export type MapPoiKind = "LOCATION" | "CLUE" | "QR" | "OBJECTIVE" | "SYSTEM";
export type MapPoiVisibility = "ALWAYS" | "LAYER_UNLOCKED" | "DISCOVERED";

export interface MapPoi {
  id: string;
  label: string; // player-facing label (Polish UI, content-authored)
  position: { x: number; y: number }; // normalized 0..1 against the FULL canonical canvas
  layerId: MapLayerId;
  visibleWhen: MapPoiVisibility;
  interactive: boolean;
  kind: MapPoiKind;
}

export interface GameMapState {
  unlockedLayerIds: MapLayerId[];
  discoveredPoiIds: string[];
  revision: number;
}

// Wire DTOs (also mirrored client-side in src/lib/client-api.ts — keep names exact):
// `zIndex` is serialized so the client never needs its own layer-id table.
export interface MapLayerDto { id: string; kind: "BASE" | "REVEAL"; url: string; zIndex: number; }
export interface MapPoiDto { id: string; label: string; x: number; y: number; layerId: string; kind: MapPoiKind; visibleWhen: MapPoiVisibility; interactive: boolean; }
export interface MapStateDto { revision: number; layers: MapLayerDto[]; pois: MapPoiDto[]; }

export function findMapLayer(id: string): MapLayer | undefined {
  return MAP_LAYERS.find((l) => l.id === id);
}

/** Layer ids unlocked from the start (no scenario state required). */
export function defaultUnlockedLayerIds(): MapLayerId[] {
  return MAP_LAYERS.filter((l) => l.unlockedByDefault).map((l) => l.id);
}

/**
 * Union of unlockedLayerIds for the active map version (falling back to the
 * initial version when the id is null/unknown). BASE is always included — its
 * layer is in the layer list and the base terrain is never hidden.
 */
export function layersUnlockedByMapVersion(
  def: { mapVersions: { id: string; unlockedLayerIds: MapLayerId[] }[]; initialMapVersionId: string },
  mapVersionId: string | null,
): MapLayerId[] {
  const version =
    def.mapVersions.find((v) => v.id === mapVersionId) ??
    def.mapVersions.find((v) => v.id === def.initialMapVersionId);
  const ids = new Set<MapLayerId>(version?.unlockedLayerIds ?? []);
  if (MAP_LAYERS.some((l) => l.id === "BASE")) ids.add("BASE");
  return [...ids];
}
