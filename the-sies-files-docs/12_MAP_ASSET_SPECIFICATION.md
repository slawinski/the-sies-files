# The Sieś Files — Map Asset Specification v1

**Status:** Canonical implementation specification  
**Scope:** In-app terrain map asset, progressive reveal, location identity, and interaction contract  
**Reference asset:** `assets/map-reference.png`  

---

## 1. Purpose

The map is a gameplay surface, not a geographic survey. It must help players understand the playable area, locate terrain interactions, and experience a meaningful expansion when the hidden western area is unlocked.

The current reference image is **not a production asset**. It is included only to communicate relative spatial relationships and known locations while the final artwork is being developed.

---

## 2. Canonical Spatial Model

The implementation must use stable logical location identifiers independent of final labels, artwork, exact pixel positions, or language.

Recommended IDs:

| Location ID | Human meaning | Base map | Extended map |
|---|---|---:|---:|
| `HOUSE` | Main house | Yes | Yes |
| `OUTBUILDING` | Utility/outbuilding | Yes | Yes |
| `TERRACE` | Terrace by outbuilding | Yes | Yes |
| `FIELD` | Playing field / boisko | Yes | Yes |
| `FIREPIT` | Firepit | Yes | Yes |
| `HAMMOCK_APPLES` | Apple trees with hammocks | Yes | Yes |
| `PARKING` | Grass parking area | Yes | Yes |
| `GATE` | Main vehicle gate | Yes | Yes |
| `WICKET` | Pedestrian gate | Yes | Yes |
| `TRASH` | Waste-bin area | Yes | Yes |
| `WEST_PATH` | Path toward hidden area | No | Yes |
| `STREAM` | Watercourse / stream | No | Yes |
| `WOODS` | Western wooded area | No | Yes |
| `HERMITAGE` | Hermitage / pustelnia | No | Yes |

Final naming shown to players is content/localization and may differ from these IDs.

---

## 3. Two Production Map States

The MVP has exactly two canonical map states.

### 3.1 `MAP_BASE`

This is the map available at the start of the scenario.

It contains only the currently accessible eastern/main property area and must look visually complete in its own right.

**Critical rule:** the player must not be able to infer from `MAP_BASE` that another map region exists.

Therefore `MAP_BASE` must not contain:

- fog covering the western extension,
- a locked or greyed-out region,
- clipped labels or roads that obviously continue off-map,
- a mysterious empty panel reserved for later content,
- a visible outline of the extended boundary,
- arrows, affordances, or copy suggesting an unlockable area,
- partially visible stream/path/woods/hermitage assets.

The western edge must read as a natural visual boundary of the map composition.

### 3.2 `MAP_EXTENDED`

After the scenario-specific unlock event, the map is replaced or expanded to show the newly discovered western area.

It adds at minimum:

- the path leading west,
- the watercourse/stream,
- woods,
- the hermitage.

The reveal should feel like receiving a newly discovered annex, second sheet, or extended case-file map rather than merely removing a generic game fog layer.

---

## 4. Visual Direction

The map must belong to the same visual system as the application:

> **Rural Neo-Noir + Bento Grid**

The map itself should be more illustrative and atmospheric than a standard web map, while remaining legible on a phone outdoors.

### 4.1 Desired qualities

- rural, hand-assembled case-file feeling,
- restrained neo-noir atmosphere,
- muted vegetation and earth tones,
- clear hierarchy between playable landmarks and background texture,
- subtle analog imperfections,
- enough contrast for daylight mobile use,
- simple silhouettes for buildings and terrain,
- restrained labels and markers,
- no cartographic clutter that does not serve gameplay.

### 4.2 Avoid

- generic Google/OSM visual language,
- photorealistic orthophoto as the final presentation layer,
- excessive darkness,
- bright arcade-game colors,
- fantasy treasure-map styling,
- military tactical-map styling,
- over-detailed foliage that obscures interaction targets,
- heavy vignette or noise behind every label.

---

## 5. Accuracy vs. Readability

The production map does **not** need to be perfectly to scale or preserve the exact Geoportal orientation.

Priorities, in order:

1. correct relative relationships between gameplay-relevant places,
2. recognition by players standing on the property,
3. mobile readability,
4. room for interaction markers and clue states,
5. visual composition,
6. geographic precision.

It is acceptable to simplify paths, reshape clearings, rotate the composition, or slightly move landmarks when this improves usability without making the terrain misleading.

---

## 6. Property Boundary and Outside World

The map represents the game arena, not the surrounding village.

Outside the relevant property/arena boundary there should be no meaningful game content. The final composition may use dark paper, texture, crop, or other neutral framing outside the playable silhouette, but it must not imply additional explorable terrain.

The boundary itself does not need to be rendered as a conspicuous red line. If shown at all, it should be integrated into the map's visual language.

---

## 7. Asset Contract

Recommended production artifacts:

```text
map-base@1x.webp
map-base@2x.webp
map-extended@1x.webp
map-extended@2x.webp
map-locations.json
```

PNG is acceptable when transparency or authoring requirements make it preferable. WebP/AVIF is preferred for the shipped raster where quality is sufficient.

The app should not hard-code interaction coordinates inside React components.

Example metadata shape:

```ts
type MapLocation = {
  id: MapLocationId;
  mapState: 'BASE' | 'EXTENDED';
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  hitRadius?: number;
};
```

Normalized coordinates allow final art to be replaced without changing domain logic.

---

## 8. Interaction Model

For MVP, the map may support:

- tap/select a known location,
- show contextual location/clue/task state,
- reveal scenario markers only when authorized,
- pan/zoom if the final mobile crop requires it,
- transition from base to extended map after the unlock event.

The map must not become a free-form GIS editor.

Scenario state must determine whether a marker is visible; the client must not receive hidden marker metadata and merely hide it with CSS.

---

## 9. Unlock Behavior

The map extension is driven by the Scenario Engine, not by the Game Engine.

Canonical flow:

```text
scenario condition satisfied
  -> Scenario Engine emits MAP_AREA_UNLOCKED
  -> session projection exposes MAP_EXTENDED
  -> connected clients receive realtime update
  -> map UI transitions to extended asset
  -> newly valid locations/markers become queryable
```

This reveal must not change Trouble Brewing phases, roles, nominations, voting, death state, or victory logic.

---

## 10. Accessibility and Outdoor Use

The map must remain usable:

- on a typical phone viewport,
- one-handed,
- in imperfect outdoor lighting,
- without relying on color alone,
- with tap targets at least 44×44 CSS px where practical,
- with text alternatives for interactive locations.

Labels embedded into artwork should be avoided where possible. Prefer application-rendered labels so they can scale, localize, and meet contrast requirements.

---

## 11. Current Reference Asset

`assets/map-reference.png` is a **design reference only**.

It currently communicates these broad relationships:

- house and entrances on the eastern/right side,
- parking near the house and road,
- outbuilding and terrace west of the house,
- playing field nearby,
- firepit and hammock/apple-tree area south of the main buildings,
- a western route that ultimately reaches the stream and hermitage.

Do not derive exact interaction coordinates from this file until the final production composition is approved.

---

## 12. Production Acceptance Criteria

The final map package is acceptable when all of the following are true:

- [ ] `MAP_BASE` looks complete and contains no visual hint of the hidden western region.
- [ ] `MAP_EXTENDED` clearly reveals the path, stream, woods, and hermitage.
- [ ] All gameplay locations have stable IDs independent of artwork labels.
- [ ] Base and extended art share one coherent Rural Neo-Noir visual language.
- [ ] The map is readable on a mobile screen in daylight.
- [ ] Interactive markers are not baked irreversibly into the raster.
- [ ] Hidden scenario markers are filtered server-side.
- [ ] Unlocking the map does not affect core Trouble Brewing state.
- [ ] Replacing the final artwork requires no domain-logic changes.
- [ ] The current reference image is not accidentally shipped as the final asset.
