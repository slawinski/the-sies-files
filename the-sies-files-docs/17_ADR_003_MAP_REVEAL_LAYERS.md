# ADR-003 — Map Reveal: Layer Model over mapVersionId, Protected Assets, Client Camera

**Status:** Accepted  
**Applies to:** `map-reveal-system-spec.md` (the whole system)  
**Supersedes:** the Slice 5 flat `MAP_BASE → MAP_EXTENDED` image-swap map
(`08_SLICE_5_SCENARIO_ENGINE.md` §13, `12_MAP_ASSET_SPECIFICATION.md` §3)

## 1. Context

The Slice 5 map was a single raster swapped wholesale on unlock
(`map-base` → `map-extended`), with locations duplicated per version. The map
reveal spec requires a generic layer system, a server-authoritative unlock,
protected asset delivery, an anti-spoiler viewport, and a reveal ceremony —
while reusing the existing scenario engine (QR → transition → `SET_MAP_VERSION`)
and realtime invalidation.

## 2. Decision

- **Two-model split:** `MapLayerId` (`BASE`, `WEST_AREA`) is the API/UI model
  (generic, extensible). `ScenarioState.mapVersionId` remains the
  scenario-content unlock key. `MapVersionDefinition.unlockedLayerIds`
  derives which layers a version unlocks — no duplicated unlock state, and
  future layers are content rows only.
- **Server-authoritative map state:** unlock persistence = `mapVersionId` plus
  a `mapRevision` counter in `ScenarioState.stateJson`, bumped on every
  `SET_MAP_VERSION` (QR flow and Storyteller override alike). The client
  receives `{ revision, layers, pois }` filtered server-side; locked layer
  URLs, POIs, and bounds are never serialized (§8.4 anti-spoiler).
- **Protected asset delivery:** the reveal overlay lives outside `public/`
  (`assets/maps/sieski/`, content-hashed), served by
  `GET /api/v1/games/:gameId/map/layers/:layerId` with per-request
  authorization (403 locked / 404 unknown / 200 member-authorized),
  `Content-Type: image/webp`, `nosniff`, explicit `no-store`. The base map is
  public + content-hashed with `Cache-Control: immutable`. `map-master` is
  never served.
- **Client camera viewport:** the map renders as a crop-rect camera over the
  canonical 1448×1086 canvas. The viewport element adopts the crop's pixel
  aspect; the world box always keeps the 4:3 ratio (no per-layer
  `object-fit: cover` — spec §10). Pre-reveal pan/zoom clamps make the hidden
  west unreachable; the reveal ceremony (preload → `decode()` → camera fly-out
  + organic mask fade → staggered POIs → aria-live announcement) runs only
  after authorization, with reduced-motion and reload-without-replay paths
  (§12–§14).
- **POIs:** content-authored (`ScenarioDefinition.pois`) with Polish labels,
  `layerId`, `kind`, `visibleWhen`; normalized coordinates against the full
  canvas; server-filtered by unlocked layer.

## 3. Consequences

- The scenario engine, QR flow, projections, and storyteller override
  endpoints keep their external behavior; `mapLocations` in projections was
  replaced by the `scenario.map` DTO.
- Client bundles still contain camera framing constants (the spec's own §9
  ships example viewport values); this is accepted as an anti-spoiler
  boundary, not DRM.
- The protected asset is `no-store` (stricter than the permissive caching
  option in spec §15) — a previously authorized client re-fetches after
  authorization; acceptable per §15's threat model.
- Known follow-ups: final POI coordinate/camera visual tuning (spec step 14);
  `discoveredPoiIds` is modeled but unused until a POI-discovery mechanic
  exists; standalone-output deployments must trace `assets/maps/`
  (`outputFileTracingIncludes` already configured).
