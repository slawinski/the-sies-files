# The Sieś Files — Visual Design System v1

**Direction:** Wiejski neo-noir / Rural Neo-Noir + Bento Grid  
**Status:** Canonical visual direction for MVP

## 1. Design statement

The interface should feel like a **rural investigation dossier assembled at night in an old house**, translated into a modern mobile product.

It is not generic detective noir, cyberpunk, horror-gothic or a sepia scrapbook. The visual tension comes from restrained rural materials/landscape cues, dark neo-noir atmosphere, functional contemporary bento layouts, editorial/file-dossier typography, selective paper/document motifs, and clean live-game hierarchy.

Atmosphere never outranks legibility or secrecy.

## 2. Core principles

### Dark, not muddy
Charcoal/black-green backgrounds are appropriate, but text/actions need strong contrast. Do not crush detail into black.

### Bento first
Card size expresses importance: active required action is largest; phase/status prominent; evidence/status secondary; history/audit dense but subordinate.

### Rural texture as accent
Use subtle weathered paper, dark wood, oxidized metal, moss/grass, field-map markings, stamps and archival-photo cues. Do not texture every UI surface.

### One strong accent at a time
Use muted rust/red for critical/formal danger; moss/brass for discovery/status. Avoid saturated neon.

### Documents inside a product
Role/clue/map assets may feel like documents. Navigation, forms, buttons and system feedback behave like modern mobile UI.

## 3. Color tokens

Implementation defaults; values may be tuned in final art pass while semantic roles stay stable.

```css
--bg-canvas:        #11130f;
--bg-elevated:      #181b16;
--bg-card:          #20231c;
--bg-card-soft:     #292b22;
--paper:            #d8c9aa;
--paper-bright:     #eee3c9;
--ink:              #171814;
--text-primary:     #eee9dc;
--text-secondary:   #b9b5a8;
--text-muted:       #858477;
--moss:             #7b8450;
--brass:            #a6925f;
--rust:             #9a4f3e;
--danger:           #b95c4b;
--success:          #7c9460;
--border:           #3a3c31;
```

Avoid pure-white large surfaces in the dark shell. Paper cards may be light.

## 4. Typography

Use two conceptual families:

1. **UI sans** for body, controls, numbers and forms.
2. **Editorial/typewriter/slab accent** only for dossier headings, location labels, clue titles and wordmark.

Do not set long paragraphs/small meta text in distressed typewriter faces.

Suggested hierarchy:

- Display/case title: 28–36 px equivalent;
- card title: 18–22 px;
- player-critical body: minimum 16 px;
- meta: 13–14 px with sufficient contrast;
- vote numbers: tabular numerals.

## 5. Card system

Base card:

- 14–18 px radius; rounded but not bubbly;
- subtle 1 px border/inner highlight;
- minimal shadow in dark mode;
- 16–20 px mobile padding;
- strict spacing grid.

Variants:

- `system-card` — dark neutral;
- `paper-card` — parchment evidence/document;
- `critical-card` — rust/danger emphasis;
- `secret-card` — private-information treatment;
- `map-card` — edge-to-edge map with controlled overlays;
- `status-card` — compact phase/cycle/ghost-vote data.

## 6. Bento layout

### Mobile
Use a 2-column logical grid but let most meaningful cards span both columns. Avoid tiny half-width text cards.

```text
[ current action / phase     ] span 2
[ role/status ][ ghost vote  ]
[ evidence / task            ] span 2
[ map                        ] span 2
```

### Storyteller desktop/tablet
Use 4–6 columns with asymmetric spans. Active blocker is always dominant.

```text
[ active queue  ][ active queue  ][ grimoire ][ health ]
[ active queue  ][ active queue  ][ effects  ][ audit  ]
[ nominations   ][ votes         ][ scenario ][ audit  ]
```

## 7. Navigation

Player navigation should stay at roughly 4–5 primary destinations. Icons are simple, clear and modern; avoid skeuomorphic compass/lantern motifs everywhere.

Storyteller may expose more sections but retains stable Control home.

## 8. Role reveal

Privacy-sensitive and dramatic:

- explicit “private information” pre-state;
- deliberate reveal action;
- role card fills most screen;
- role name/ability immediately readable;
- no bright flashing animation visible across a room;
- easy return to neutral screen.

Drunk sees only perceived Townsfolk role.

## 9. Operational visuals

Mood: quiet, controlled, secret.

Active player gets one focused task, clean Virtual Circle target selection and submit confirmation. Waiting state must not leak how many roles are acting or who is blocking progress.

## 10. Investigation visuals

Mood: open case board.

Free Investigation emphasizes evidence/tasks/map. When nominations open, shell shifts to formal mode, terrain CTA disappears/locks, and nominee/vote/block state becomes top hierarchy using restrained rust/red emphasis.

## 11. Evidence/clue cards

Paper surfaces over dark canvas may use case-number stamps, clipped-photo edges, monospaced metadata and thin red-pencil annotations. Avoid fake stains/folds/noise that harm readability.

Do not show undiscovered `???` slots if that leaks content count.

## 12. Map treatment

Map may be the most illustrative asset. Use muted greens/olives, charcoal surround, warm desaturated structures, subtle hand-painted/topographic texture, minimal labels and enough contrast for phone use.

See `12_MAP_ASSET_SPECIFICATION.md`.

## 13. Motion

Use sparingly:

- restrained role reveal;
- short dossier insertion on clue acquire;
- new-annex expansion/replacement on map unlock;
- subtle phase transition;
- crisp vote lock confirmation, never casino-like.

Respect reduced-motion preference.

## 14. Sound/haptics

Not required for MVP. If later added, they are quiet/opt-in because secrecy/social interaction matters.

## 15. Accessibility/outdoor use

- WCAG AA contrast target;
- primary text >= 16 px;
- tap targets >= 44×44 CSS px;
- visible focus;
- never encode state only by color;
- map labels use halo/backing where needed;
- avoid ultra-low-opacity controls invisible in daylight.

## 16. Anti-patterns

Do not implement neon cyberpunk, glassmorphism-heavy busy overlays, claymorphism as main theme, generic fintech dashboard styling, full-screen grunge under body text, every heading in distressed typewriter, constant dominant red, decorative fog obscuring content, or UI suggesting the hidden map extension before unlock.

## 17. Visual acceptance checklist

- [ ] Screenshot is recognizable as The Sieś Files without logo alone.
- [ ] Reads as modern app first, dossier second.
- [ ] Bento hierarchy makes required action obvious.
- [ ] Neo-noir darkness preserves legibility.
- [ ] Rural cues are restrained, not western/fantasy.
- [ ] Player and Storyteller screens share one system.
- [ ] Formal nominations visually interrupt terrain/free play.
- [ ] Map unlock feels like genuine discovery.
