// Protected map asset delivery (map-reveal-system-spec §8): reveals live
// OUTSIDE public/ and are read from disk relative to process.cwd() only after
// authorization. Server-only module — imported exclusively from route handlers.
// Unknown layers and missing files collapse to null so filesystem paths are
// never observable through the API.

import path from "node:path";
import { readFile } from "node:fs/promises";
import type { MapLayerId } from "./layers";

export const MAP_BASE_PUBLIC_URL = "/maps/sieski/map-base-029178c4b18a.webp";

// protected layer assets keyed by MapLayerId; file path relative to process.cwd()
export const PROTECTED_LAYER_FILES: Partial<Record<MapLayerId, string>> = {
  WEST_AREA: "assets/maps/sieski/map-west-reveal-3c1b1cdf7268.webp",
};

export async function readProtectedLayerAsset(
  layerId: string,
): Promise<{ data: Buffer; contentType: string } | null> {
  const file = PROTECTED_LAYER_FILES[layerId as MapLayerId];
  if (!file) return null;
  try {
    const data = await readFile(path.join(process.cwd(), file));
    return { data, contentType: "image/webp" };
  } catch {
    return null; // missing/unreadable — do not leak paths
  }
}
