# Map Reveal System
> Layer-based map reveal: server authz, protected assets, camera viewport

Spec: `the-sies-files-docs/map-reveal-system-spec.md`

Entry: `src/modules/map/layers.ts` — layer/POI model + `layersUnlockedByMapVersion()`
DTO builder: `src/modules/map/state.ts:buildMapStateDto()` — the ONLY place authorized
layers/POIs are serialized (never leak locked layers or their URLs).

Flow:
- Scenario engine keeps `ScenarioState.mapVersionId` (MAP_BASE / MAP_EXTENDED);
  map versions declare `unlockedLayerIds` (`src/modules/scenario/definition.ts`)
- `SET_MAP_VERSION` also bumps `mapRevision` in `ScenarioState.stateJson`
  (`src/modules/scenario/scenario.service.ts:170-180`, `state.ts:nextMapRevision()`)
- Protected asset: `GET /api/v1/games/:gameId/map/layers/:layerId`
  (`src/app/api/v1/games/[gameId]/map/layers/[layerId]/route.ts`) — resolveViewer →
  unlock check → 403 locked / 404 unknown → serves webp from `assets/maps/sieski/`
  (NOT public/), explicit no-store
- Client: `src/components/MapCard.tsx` + `src/components/map-camera.ts`
  - camera = crop rect in normalized coords; viewport adopts crop pixel aspect;
    world box always renders 4:3 (rectToCss)
  - pre-reveal bounds PRE_WORLD/PRE_MIN_SCALE prevent exploring the west
  - reveal ceremony: preload+decode authorized URL → rAF tween camera + mask
    fade → POIs staggered in → aria-live announce; seen revision in
    localStorage (`tsf.seenMapRevealRevision`) skips replay on reload
- POIs are content (`ScenarioDefinition.pois`, Polish labels) with layerId;
  coordinates authored against the 1448×1086 canvas, provisional pending
  visual tuning (spec step 14)

Key decisions: layer model is the API/UI model; mapVersionId remains the
scenario-content unlock key (derived, not duplicated state). Base map public +
content-hashed; reveal overlay protected + authorized per request.

Updated: 2026-08-22
