# The Sieś Files — Map Reveal System Specification

**Status:** Implemented (2026-08-22) — see "Implementation notes" addendum at the end  
**Scope:** Player-facing world map, hidden western area reveal, POI rendering, asset delivery, reveal animation, and anti-spoiler behavior  
**Primary use case:** The initial map must show only the main property. The western area containing the path, stream, forest and hermitage must not be inferable or retrievable by the player before the reveal condition is satisfied.

---

## 1. Goals

The map system must:

1. Preserve the authored geometry of the source map. No runtime scaling, cropping, masking, or compositing may alter the relative dimensions, proportions, orientation, or location of map areas.
2. Present an initial map that gives no meaningful hint that a hidden western area exists.
3. Reveal the western area as a significant in-game event rather than as a simple visibility toggle.
4. Keep labels, markers, clue states, and interactive points separate from the raster artwork.
5. Prevent the hidden reveal asset from being bundled with or publicly addressable by an unauthorized client.
6. Use a generic reveal-layer model so future discoveries can reuse the same implementation.
7. Work on mobile-first layouts and remain resolution-independent for POI and interaction positioning.

---

## 2. Non-goals

This specification does not define:

- the narrative condition that unlocks the western area;
- exact QR payload structure beyond the map-unlock integration point;
- final POI icon artwork;
- Storyteller/admin tooling for manually forcing an unlock;
- GPS positioning or real-world geolocation;
- a zoomable geographic map engine such as Mapbox or Leaflet.

The map is an authored game-space illustration, not a geographic navigation map.

---

## 3. Canonical Asset Set

All terrain assets MUST use the same canvas dimensions and the same coordinate origin.

Current prepared source assets:

```text
/assets/maps/sieski/
  the-sies-files-map-master.png
  the-sies-files-map-base.png
  the-sies-files-map-west-reveal.png
```

Recommended production names:

```text
map-master.png
map-base.webp
map-west-reveal.webp
```

### 3.1 `map-master`

Full revealed map used for:

- visual QA;
- alignment validation;
- Storyteller/admin reference;
- authoring POI coordinates;
- regression tests.

It MUST NOT be shipped to the normal player client before the reveal if it contains unrevealed terrain.

### 3.2 `map-base`

Initial player-facing terrain.

Requirements:

- shows only the eastern/main property area;
- western content is replaced by the same atmospheric void/fog language used outside the playable map;
- must not show a rectangular mask, obvious cutoff, silhouette, land boundary, stream fragment, hermitage fragment, or other visual clue that implies additional terrain;
- seam must be visually organic and located around the western side of the main property/path transition;
- contains no baked-in labels.

### 3.3 `map-west-reveal`

Transparent overlay containing the western reveal terrain.

Includes:

- western forest;
- stream;
- hermitage;
- path/terrain required to bridge naturally into the base map;
- a small overlap region at the seam to hide compositing artifacts.

Requirements:

- same canvas size as `map-base`;
- transparent outside reveal bounds;
- pixel alignment with `map-master` and `map-base`;
- no baked-in labels;
- irregular/natural alpha edge rather than a straight line.

### 3.4 Optional FX asset

Optional visual-only transition asset:

```text
map-fog-transition.webp
```

This may be used for fog, dust, vignette or reveal particles. It MUST NOT be relied on to hide unrevealed content.

---

## 4. Coordinate System

All gameplay locations use normalized coordinates in the canonical map canvas.

```ts
type NormalizedPoint = {
  x: number; // 0..1
  y: number; // 0..1
};
```

Where:

```text
(0,0) -------------------- (1,0)
  |                          |
  |                          |
  |                          |
(0,1) -------------------- (1,1)
```

This allows POIs and hit targets to stay aligned regardless of rendered CSS size.

Rendered position:

```ts
left = `${x * 100}%`;
top = `${y * 100}%`;
```

Coordinates MUST be authored against the full canonical map, not against the current visible crop.

---

## 5. Map Data Model

Do not hardcode a `revealHermitage` boolean into map UI logic.

Use generic map layers.

```ts
type MapLayerId =
  | 'BASE'
  | 'WEST_AREA';

type MapLayer = {
  id: MapLayerId;
  kind: 'BASE' | 'REVEAL';
  assetKey: string;
  zIndex: number;
  unlockedByDefault: boolean;
  bounds?: {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
  };
};
```

Example:

```ts
const MAP_LAYERS: MapLayer[] = [
  {
    id: 'BASE',
    kind: 'BASE',
    assetKey: 'map-base',
    zIndex: 0,
    unlockedByDefault: true,
  },
  {
    id: 'WEST_AREA',
    kind: 'REVEAL',
    assetKey: 'map-west-reveal',
    zIndex: 10,
    unlockedByDefault: false,
  },
];
```

The structure must support additional reveal layers later without changing the renderer architecture.

Possible future examples:

```text
SECRET_PATH
STREAM_CROSSING
CACHE_03
HERMITAGE_INTERIOR
SECONDARY_ROUTE
```

---

## 6. POI Model

Text and markers MUST be data-driven and not baked into raster assets.

```ts
type MapPoi = {
  id: string;
  label: string;
  position: NormalizedPoint;
  layerId: MapLayerId;
  visibleWhen: 'ALWAYS' | 'LAYER_UNLOCKED' | 'DISCOVERED';
  interactive: boolean;
  kind:
    | 'LOCATION'
    | 'CLUE'
    | 'QR'
    | 'OBJECTIVE'
    | 'SYSTEM';
};
```

Examples of base POIs:

```text
HOUSE
OUTBUILDING
TERRACE
SPORTS_FIELD
FIREPIT
PARKING
GATE
WICKET_GATE
HAMMOCK_AREA
```

Examples of western POIs:

```text
WEST_PATH
STREAM
HERMITAGE
```

A POI belonging to a locked layer MUST NOT be returned to a normal player client unless the product intentionally permits undiscovered metadata.

---

## 7. Player Map State

Server-authoritative state:

```ts
type GameMapState = {
  unlockedLayerIds: MapLayerId[];
  discoveredPoiIds: string[];
  revision: number;
};
```

Initial state:

```json
{
  "unlockedLayerIds": ["BASE"],
  "discoveredPoiIds": [],
  "revision": 1
}
```

After western reveal:

```json
{
  "unlockedLayerIds": ["BASE", "WEST_AREA"],
  "discoveredPoiIds": [],
  "revision": 2
}
```

The server is the source of truth. A client-side flag must never be sufficient to authorize a reveal.

---

## 8. Asset Security and Delivery

### 8.1 Public assets

Safe to expose publicly:

```text
map-base.webp
ambient/fog textures that contain no hidden information
icons
UI chrome
```

### 8.2 Protected assets

Do NOT place unrevealed assets in a public static directory that can be guessed or inspected.

Protected examples:

```text
map-west-reveal.webp
future hidden reveal layers
full map-master asset
```

### 8.3 Recommended API

```http
GET /api/games/:gameId/map
```

Returns authorized map state and URLs only for currently available layers.

Example before reveal:

```json
{
  "revision": 1,
  "layers": [
    {
      "id": "BASE",
      "url": "/maps/sieski/map-base.webp"
    }
  ],
  "pois": []
}
```

Example after reveal:

```json
{
  "revision": 2,
  "layers": [
    {
      "id": "BASE",
      "url": "/maps/sieski/map-base.webp"
    },
    {
      "id": "WEST_AREA",
      "url": "/api/games/GAME_ID/map/layers/WEST_AREA"
    }
  ],
  "pois": [
    { "id": "WEST_PATH", "...": "..." },
    { "id": "STREAM", "...": "..." },
    { "id": "HERMITAGE", "...": "..." }
  ]
}
```

Protected asset endpoint:

```http
GET /api/games/:gameId/map/layers/:layerId
```

Authorization rule:

```ts
if (!game.mapState.unlockedLayerIds.includes(layerId)) {
  return forbidden();
}
```

The endpoint may return the file directly or issue a short-lived signed URL.

### 8.4 Anti-spoiler requirement

Before unlock, the player client must not receive:

- the western raster asset;
- its asset URL;
- the full master image;
- western POI names;
- western POI coordinates;
- western bounding boxes that make the size of the hidden area obvious.

This is an anti-spoiler boundary, not a DRM requirement. A Storyteller/admin role may use different permissions.

---

## 9. Initial Viewport

The initial presentation should not simply display the full 4:3 canvas with a large empty left side. Doing that would imply that content is missing.

The map component therefore needs a stage-dependent camera/viewport.

Example conceptual viewport:

```ts
const INITIAL_VIEW = {
  xMin: 0.42,
  yMin: 0.08,
  xMax: 1.0,
  yMax: 0.88,
};
```

The exact values MUST be tuned against the final production assets.

Before reveal:

- camera frames the main property naturally;
- user cannot pan into the hidden western world bounds;
- minimum zoom prevents zooming far enough out to expose the intentionally unused canvas;
- no scrollbar/minimap indicates extra width.

After reveal:

- allowed camera bounds expand to the whole authored map;
- the reveal transition animates the viewport toward the new framing.

---

## 10. Rendering Architecture

Recommended DOM layering:

```html
<div class="map-viewport">
  <div class="map-world">
    <img data-layer="BASE" />
    <img data-layer="WEST_AREA" />
    <div class="map-pois"></div>
    <div class="map-effects"></div>
  </div>
</div>
```

Order:

```text
1. Base terrain
2. Reveal terrain overlays
3. POIs / markers / clue indicators
4. Temporary interaction highlights
5. Fog / vignette / reveal FX
6. UI chrome
```

All terrain layers MUST share an identical positioning context:

```css
.map-world {
  position: relative;
  aspect-ratio: 4 / 3;
}

.map-world > img[data-layer] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}
```

Do not independently `object-fit: cover` individual layers because cropping differences will break alignment.

---

## 11. Reveal Trigger Flow

Canonical flow:

```text
Player completes QR/event
        ↓
Server validates condition
        ↓
Server persists WEST_AREA unlock
        ↓
Game state revision increments
        ↓
Client receives/refetches map state
        ↓
Client discovers new authorized layer
        ↓
Client fetches WEST_AREA asset
        ↓
Asset decodes completely
        ↓
Reveal animation starts
        ↓
Camera expands / moves west
        ↓
POIs for WEST_AREA become available
```

The reveal MUST begin only after the new image has decoded successfully to avoid showing a blank region during animation.

```ts
await image.decode();
startRevealAnimation();
```

---

## 12. Reveal Animation

Target duration: approximately **1.2–2.0 seconds**.

The reveal should communicate that the known world has expanded.

Recommended sequence:

### Phase A — preparation, 0–200 ms

- new layer loaded but opacity remains 0;
- POIs remain hidden;
- optional subtle map pulse/haptic feedback;
- temporary map interaction lock.

### Phase B — expansion, 200–1200 ms

- camera eases left and slightly zooms out;
- western layer fades/reveals using an irregular mask or opacity plus fog transition;
- visual motion should originate around the existing path/vegetation seam rather than from the far edge of the canvas.

### Phase C — settle, 1200–1800 ms

- camera settles into full-map framing;
- new labels/markers appear after terrain is readable;
- optional UI toast/card:

```text
MAP UPDATED
```

or narrative copy supplied by scenario data.

### Reduced motion

When `prefers-reduced-motion: reduce` is enabled:

- skip camera fly-out;
- crossfade new layer over ~150–250 ms;
- update POIs immediately after fade.

---

## 13. Interaction During Reveal

While reveal animation is active:

```ts
mapInteractionState = 'LOCKED_FOR_TRANSITION';
```

Disable:

- pan;
- zoom;
- POI activation;
- QR-driven map actions that would start another transition.

Re-enable after animation completion.

If another map-state update arrives during the transition, queue it and reconcile after the current transition.

---

## 14. Failure Handling

### Reveal asset fetch fails

Do not expand the viewport into empty space.

Behavior:

1. retain current base view;
2. preserve the server unlock state;
3. show a non-spoiler retry message;
4. retry the authorized asset request.

Example:

```text
Map update could not be loaded.
Retry
```

Do not disclose the name of the hidden area in an error shown before the asset becomes available.

### Animation interrupted

If the app is backgrounded/reloaded after unlock:

- restore the final unlocked state directly;
- the reveal animation does not need to replay automatically.

Optionally persist a client-only `seenRevealRevision` to determine whether a newly unlocked layer deserves the reveal animation on that device.

---

## 15. Cache Strategy

`map-base`:

```text
Cache-Control: public, max-age=31536000, immutable
```

Use a content-hashed filename.

Protected reveal assets:

- asset bytes may be cached after authorization;
- signed URLs should be short-lived if used;
- file names should be content-hashed;
- authorization MUST not depend solely on obscurity of the URL.

A previously authorized player seeing the reveal asset in browser cache later is acceptable; preventing that is outside this system's threat model.

---

## 16. Accessibility

The illustrated map cannot be the only source of gameplay-critical information.

Requirements:

- POI controls have accessible names;
- newly revealed gameplay-critical POIs are represented in an accessible list or equivalent semantic UI;
- reveal event is announced via an `aria-live` region;
- map interactions support touch and keyboard where actionable;
- color alone must not communicate POI state.

Example announcement:

```text
The map has been updated. A new area is now available.
```

---

## 17. Mobile Requirements

The map is mobile-first.

Minimum behavior:

- map fits portrait displays without page-level horizontal scrolling;
- panning occurs inside the map viewport only;
- POI touch target is at least ~44 × 44 CSS px even when the visual pin is smaller;
- pinch zoom must not accidentally trigger browser page zoom through custom gesture hacks;
- labels must not permanently obscure important terrain;
- initial camera framing must be tested at 320, 375, 390, 430 and tablet widths.

---

## 18. Image Quality and Formats

Authoring/master:

- PNG is acceptable for lossless source/reference assets.

Production opaque terrain:

- prefer AVIF where supported with WebP fallback, or WebP as MVP;
- preserve sufficient quality for mobile zoom;
- do not resize base and reveal assets independently.

Transparent reveal overlay:

- WebP with alpha is recommended for MVP;
- AVIF alpha may be considered after browser/device QA;
- retain PNG source for authoring and regression comparison.

All generated derivatives MUST use exactly the same output dimensions.

---

## 19. Validation and Tests

### Asset tests

Automated build validation should verify:

```text
base.width   === reveal.width
base.height  === reveal.height
base.width   === master.width
base.height  === master.height
```

If alpha reveal layer is used, also verify that pixels outside the expected reveal region are transparent.

### Authorization tests

Before unlock:

- `GET WEST_AREA` returns 403/404 according to API convention;
- map-state response contains no WEST_AREA URL;
- map-state response contains no hidden POIs.

After unlock:

- authorized player can fetch WEST_AREA;
- map-state includes WEST_AREA;
- relevant POIs become available.

### UI tests

Before unlock:

- no hidden terrain is visible;
- pan/zoom cannot expose unused western canvas;
- no western marker exists in DOM;
- screen reader cannot discover western POIs.

After unlock:

- overlay aligns with base at all supported viewport sizes;
- viewport expands correctly;
- POIs align after resize/rotation;
- reload restores final unlocked state.

---

## 20. Acceptance Criteria

The implementation is complete when all of the following are true:

- [ ] The source map's proportions, orientation, area locations and relative geometry are unchanged.
- [ ] The production terrain contains no baked-in captions or location labels.
- [ ] Initial players receive only the base map and authorized base POIs.
- [ ] The initial viewport gives no obvious visual or interaction hint that the map continues west.
- [ ] The western terrain asset cannot be fetched by an unauthorized player.
- [ ] Unlock state is persisted on the server.
- [ ] Unlocking `WEST_AREA` causes the client to fetch the reveal asset only after authorization.
- [ ] Base and reveal assets align pixel-for-pixel on the same canvas.
- [ ] Reveal animation expands the perceived world rather than merely removing a dark rectangle.
- [ ] Western POIs appear only when their layer is unlocked.
- [ ] POIs use normalized coordinates and stay aligned across responsive sizes.
- [ ] Reloading after unlock shows the revealed map correctly.
- [ ] Reduced-motion behavior is supported.
- [ ] Asset-load failure does not expose empty hidden world space.
- [ ] The architecture supports additional reveal layers without rewriting the renderer.

---

## 21. Suggested Implementation Order

1. Finalize canonical unlabeled master asset.
2. Produce pixel-aligned `map-base` and transparent `map-west-reveal` assets.
3. Add build-time dimension/alignment validation.
4. Implement normalized POI rendering on the master coordinate system.
5. Implement server-authoritative `GameMapState`.
6. Implement protected reveal-asset endpoint.
7. Implement layer renderer.
8. Implement stage-dependent camera bounds.
9. Implement western reveal flow without animation.
10. Add reveal animation and optional fog FX.
11. Add reconnect/reload/failure handling.
12. Add accessibility and reduced-motion behavior.
13. Add automated authorization and visual regression tests.
14. Tune final POI coordinates and initial/final camera framing against production assets.

---

## 22. Architectural Decision Summary

Use **separate aligned terrain layers**, not one complete image hidden by CSS fog.

The final system is:

```text
SERVER-AUTHORIZED MAP STATE
            ↓
      BASE TERRAIN
            +
  AUTHORIZED REVEAL LAYERS
            +
      DATA-DRIVEN POIs
            +
       VISUAL FX / FOG
            ↓
       MAP VIEWPORT
```

This design provides the desired narrative reveal, minimizes accidental spoilers, keeps the map art clean, and creates a reusable foundation for future discoveries in The Sieś Files.

---

## 23. Implementation Notes (2026-08-22)

Status: all §20 acceptance criteria implemented and covered by automated tests.

### 23.1 Where things live

```text
src/modules/map/layers.ts        — MapLayer/MapPoi model, MAP_LAYERS, unlock derivation
src/modules/map/state.ts         — buildMapStateDto (the only authorized serialization point)
src/modules/map/assets.ts        — public base URL + protected asset filesystem access
src/app/api/v1/games/[gameId]/map/route.ts                      — authorized map state
src/app/api/v1/games/[gameId]/map/layers/[layerId]/route.ts     — protected asset (403 locked / 404 unknown)
src/components/MapCard.tsx       — layer renderer, camera viewport, pan/zoom, reveal ceremony
src/components/map-camera.ts     — pure camera math (crop rects, clamps, tweens)
scripts/build-map-assets.mjs     — reproducible WebP derivation (content-hashed names)
assets/maps/sieski/*.png         — canonical source PNGs (1448×1086)
assets/maps/sieski/map-west-reveal-*.webp — protected reveal overlay (NOT under public/)
public/maps/sieski/map-base-*.webp        — public base terrain (immutable cache)
```

### 23.2 Decisions taken

- **Layers vs map versions:** `MapLayerId` is the API/UI model; the scenario
  engine keeps `ScenarioState.mapVersionId` as the content-side unlock key.
  `MapVersionDefinition.unlockedLayerIds` derives layer unlocks — no duplicate
  unlock state, and future layers only add content rows (§5, §20-last).
- **Server-authoritative state:** unlock = persisted `mapVersionId` + a
  `mapRevision` counter in `ScenarioState.stateJson` (bumped on every
  `SET_MAP_VERSION`, including Storyteller overrides). `discoveredPoiIds` is
  modeled but empty — no POI-discovery mechanic exists yet (§7).
- **Anti-spoiler delivery:** before unlock the client receives neither the
  WEST_AREA URL nor western POIs nor bounds; the protected asset route
  re-checks authorization on every request (403 locked / 404 unknown layer).
  `map-master` is never served. Security review found the boundary sound.
- **Camera values:** `INITIAL_VIEW` and `FULL_VIEW` (and pan/zoom clamps) are
  tuned against the production assets via pixel analysis: the base artwork's
  organic seam sits at x≈0.45; property content spans x∈[0.44, 0.96],
  y∈[0.07, 0.62]. Final visual tuning remains spec step 14.
- **POI coordinates:** authored against the full canonical canvas from
  structural analysis of the production artwork (docs/12 §11 relationships);
  all base POIs stay east of the seam, all western POIs inside the reveal
  overlay's opaque bounds. Pending the step-14 visual pass.
- **Caching:** base = public content-hashed + `immutable`; protected asset =
  `no-store` (strictly safer than the permissive §15 option).
- **Client hints:** layer `zIndex` ships in the DTO so the client needs no
  layer-id table; camera framing constants remain client-side (the spec's own
  §9 ships example viewport values — anti-spoiler, not DRM).
- **Realtime:** reveal triggers on projection refetch after the existing SSE
  invalidation. Fixed a dev-only broker bug (module duplication on cold route
  compile) so invalidation is reliable in `next dev` too.

### 23.3 Test coverage

- `tests/map-system.test.ts` — layer model, unlock derivation, DTO filtering,
  revision bumps, asset dimension equality (PNG/WebP header parsing), public-dir
  negative test, protected-asset accessor, camera math invariants.
- `tests/e2e/e2e-07-map-unlock.spec.ts` — 403-before/200-after asset
  authorization, no WEST_AREA in state or DOM before unlock, live-page reveal
  ceremony after the annex QR (realtime refetch → decode → animation → POIs →
  aria-live announcement).
- `tests/release-hardening.test.ts`, `tests/r4-content.test.ts` — updated for
  the layer model and the protected extended-map manifest entry.
