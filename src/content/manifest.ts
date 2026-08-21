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
  extended: { src: string; width: number; height: number };
}

export const MAP_ASSET_SET: MapAssetSet = {
  id: "TSF_MILLIONAIRE_MAP_V1",
  base: { src: "/maps/tsf-millionaire/v1/map-base.webp", width: 1600, height: 1000 },
  extended: { src: "/maps/tsf-millionaire/v1/map-extended.webp", width: 1600, height: 1000 },
};

export const MAP_ASSET_PATHS = [MAP_ASSET_SET.base.src, MAP_ASSET_SET.extended.src] as const;
