// Authorized map state (map-reveal-system-spec §7–§8): builds the wire DTO a
// viewer may legally receive from persisted scenario state. Layer ids and POIs
// are filtered server-side — locked layers and their POIs are never serialized.
// Works with a null scenario state (initial version, revision 1).

import type { ScenarioDefinition } from "@/modules/scenario/definition";
import { MAP_BASE_PUBLIC_URL } from "./assets";
import {
  MAP_LAYERS,
  layersUnlockedByMapVersion,
  type MapLayer,
  type MapLayerDto,
  type MapPoiDto,
  type MapStateDto,
} from "./layers";

// Re-exported so consumers (projections, routes) can import the DTO alongside
// the builder from this module.
export type { MapStateDto } from "./layers";

export function getMapRevision(scenarioState: { stateJson: unknown } | null): number {
  return (scenarioState?.stateJson as { mapRevision?: number } | null)?.mapRevision ?? 1;
}

/** Increment the map revision, preserving any other stateJson keys. */
export function nextMapRevision(scenarioState: { stateJson: unknown } | null): { revision: number; stateJson: unknown } {
  const current = getMapRevision(scenarioState);
  const existing = scenarioState?.stateJson;
  const base =
    existing !== null && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { revision: current + 1, stateJson: { ...base, mapRevision: current + 1 } };
}

function layerUrl(gameId: string, layer: MapLayer): string {
  if (layer.kind === "BASE") return MAP_BASE_PUBLIC_URL;
  return `/api/v1/games/${gameId}/map/layers/${layer.id}`;
}

function discoveredPoiIds(stateJson: unknown): string[] {
  const ids = (stateJson as { discoveredPoiIds?: string[] } | null)?.discoveredPoiIds;
  return Array.isArray(ids) ? ids : [];
}

export function buildMapStateDto(args: {
  gameId: string;
  scenarioState: { mapVersionId: string | null; stateJson: unknown } | null;
  def: ScenarioDefinition;
}): MapStateDto {
  const layerIds = layersUnlockedByMapVersion(args.def, args.scenarioState?.mapVersionId ?? null);
  const discovered = discoveredPoiIds(args.scenarioState?.stateJson);
  const layers: MapLayerDto[] = MAP_LAYERS
    .filter((l) => layerIds.includes(l.id))
    .map((l) => ({ id: l.id, kind: l.kind, url: layerUrl(args.gameId, l), zIndex: l.zIndex }));
  const pois: MapPoiDto[] = args.def.pois
    .filter((p) => layerIds.includes(p.layerId))
    .filter((p) => p.visibleWhen !== "DISCOVERED" || discovered.includes(p.id))
    .map((p) => ({
      id: p.id,
      label: p.label,
      x: p.x,
      y: p.y,
      layerId: p.layerId,
      kind: p.kind,
      visibleWhen: p.visibleWhen,
      interactive: p.interactive,
    }));
  return { revision: getMapRevision(args.scenarioState), layers, pois };
}
