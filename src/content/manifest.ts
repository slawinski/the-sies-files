// Production-content manifest (audit spec 23 §7). `productionReady` is a hard
// gate: release validation refuses `true` unless the map assets exist, the
// scenario pack is approved, all character names are present, and the scanner
// does not expose manual token entry in production.

export const PRODUCTION_CONTENT_MANIFEST = {
  scenarioPack: "TSF_MILLIONAIRE_V1",
  locale: "pl",
  mapAssetSet: "TSF_MILLIONAIRE_MAP_V1",
  /** False until production map art + approved prose/names ship. */
  productionReady: false,
} as const;

export interface MapAssetSet {
  id: "TSF_MILLIONAIRE_MAP_V1";
  base: { src: string; width: number; height: number };
  /**
   * The western reveal overlay is a PROTECTED asset (map-reveal-system-spec
   * §8.2): it is served only through the authorized API route — it must never
   * become a public static path.
   */
  extended: { src: string; width: number; height: number; protectedApiRoute: true };
}

export const MAP_ASSET_SET: MapAssetSet = {
  id: "TSF_MILLIONAIRE_MAP_V1",
  base: { src: "/maps/sieski/map-base-029178c4b18a.webp", width: 1448, height: 1086 },
  extended: {
    src: "/api/v1/games/:gameId/map/layers/WEST_AREA",
    width: 1448,
    height: 1086,
    protectedApiRoute: true,
  },
};

/** Public static asset paths only — the protected reveal is deliberately absent. */
export const MAP_ASSET_PATHS = [MAP_ASSET_SET.base.src] as const;
