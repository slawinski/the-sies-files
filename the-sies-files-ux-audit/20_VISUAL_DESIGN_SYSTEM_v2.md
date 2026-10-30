# The Sieś Files — Visual Design System v2

**Direction:** Rural Neo-Noir × Contemporary Case File × Bento  
**Status:** Proposed successor to `11_VISUAL_DESIGN_SYSTEM.md`  
**Design intent:** align final product with the prototypes without reproducing prototype skeuomorphism literally.

---

## 1. Brand expression

The interface is a **modern field-investigation companion that occasionally becomes a physical dossier**.

Three layers:

1. **Product shell** — precise, dark, modern, accessible.
2. **Case material** — paper, ink, stamps, archival imagery, map fragments.
3. **Formal game state** — restrained rust/red intervention.

A screen should never have all three layers shouting at equal volume.

### Recognition test

Without the logo, a screenshot should still feel like The Sieś Files because of:

- black-green shell;
- warm evidence paper;
- brass/moss support accents;
- rust formal accent;
- asymmetric bento;
- editorial mono/slab labels;
- restrained rural/archival visual material.

---

## 2. Color system

Keep the accessibility-adjusted implementation colors as the practical base.

```css
:root {
  /* foundation */
  --color-canvas:          #11130f;
  --color-elevated:        #181b16;
  --color-card:            #20231c;
  --color-card-soft:       #292b22;
  --color-line:            #3a3c31;

  /* document */
  --color-paper:           #d8c9aa;
  --color-paper-bright:    #eee3c9;
  --color-ink:             #171814;

  /* text */
  --color-text-primary:    #eee9dc;
  --color-text-secondary:  #b9b5a8;
  --color-text-muted:      #9a988b;

  /* semantic accents */
  --color-moss:            #93a066;
  --color-brass:           #b19d68;
  --color-rust:            #b9674d;
  --color-danger:          #db7d66;
  --color-success:         #8ba06c;
}
```

### Semantic use

#### Canvas
Application background. Never pure black.

#### Card
Routine product UI.

#### Soft card
Nested or lower-priority UI.

#### Paper
Only authored/received “case material”:
- role document;
- evidence;
- clue;
- journal excerpt;
- map annotation panel.

Do not use paper for settings or generic forms.

#### Moss
Discovery, live/available, section accents.

#### Brass
Selected, actionable, pending attention.

#### Rust
Formal game state:
- nomination;
- vote;
- phase commit;
- investigative warning.

#### Danger
Destructive/admin recovery only.

### Accent rule

A primary composition may have:
- one dominant semantic accent;
- one neutral support accent.

Avoid moss + brass + rust + danger in the same card.

---

## 3. Surface recipes

### Product card

```text
bg: card
border: line
radius: 16
shadow: none/minimal
padding: 16 mobile / 18–20 desktop
```

### Raised control card

```text
bg: elevated
border: line
inner highlight: subtle
```

### Dossier paper

```text
bg: paper
text: ink
border: ink at 10–15%
texture: 2–5% opacity
shadow: short soft shadow only when layered over dark shell
```

### Formal surface

```text
base: card/elevated
border: rust 45–70%
tint: rust 6–12%
```

### Secret surface

Not automatically “evil-looking”.

```text
base: elevated
border: brass
privacy icon/label
```

The visual treatment must not leak role alignment.

---

## 4. Typography

Two-family model.

### UI family

Use system/Geist-like sans stack:

```css
font-family:
  ui-sans-serif,
  system-ui,
  -apple-system,
  "Segoe UI",
  Roboto,
  sans-serif;
```

Use for:
- body;
- buttons;
- forms;
- player names;
- system status;
- numbers except decorative dossier numbers.

### Editorial family

Use a clean mono/typewriter/slab accent stack:

```css
font-family:
  ui-monospace,
  "SFMono-Regular",
  "Cascadia Mono",
  "Roboto Mono",
  Menlo,
  Consolas,
  monospace;
```

A dedicated licensed/self-hosted editorial face may replace this later.

Use for:
- wordmark;
- case label;
- phase label;
- evidence heading;
- small document metadata;
- occasional stamped status.

Do not use for:
- long paragraphs;
- dense tables;
- buttons by default;
- all player names in lists.

### Scale

| Token | Mobile | Desktop | Use |
|---|---:|---:|---|
| display-xl | 32/36 | 40/44 | landing / major reveal only |
| display-lg | 28/32 | 32/36 | role name, vote result |
| heading-lg | 22/28 | 24/30 | primary card |
| heading-md | 18/24 | 20/26 | section |
| body-lg | 17/26 | 17/26 | critical instruction |
| body | 16/24 | 16/24 | standard |
| small | 14/20 | 14/20 | secondary |
| meta | 13/20 | 13/20 | metadata |
| micro | 12/16 | 12/16 | developer-only / noncritical; avoid player UI |

Never put critical player information below 16 px.

---

## 5. Spacing

Base unit: 4 px.

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
```

Player mobile:
- viewport x padding: 16 px;
- card gap: 12–16 px;
- section gap: 24 px.

Storyteller:
- grid gap: 16 px;
- rail width: 176–208 px;
- content x padding: 20–28 px.

---

## 6. Radius and border

```css
--radius-sm: 10px;
--radius-md: 14px;
--radius-lg: 16px;
--radius-xl: 20px;
--radius-pill: 999px;
```

Rules:
- product cards: 16;
- nested cards: 10–14;
- controls: 10–12;
- paper: 14–16;
- never make every surface pill-shaped.

Borders:
- 1 px routine;
- 2 px only for selected/formal emphasis;
- no neon glows.

---

## 7. Elevation

Dark UI should rely on surface contrast, not large shadows.

```css
--shadow-paper: 0 8px 24px rgba(0,0,0,.18);
--shadow-sheet: 0 -12px 32px rgba(0,0,0,.28);
```

No multi-layer glossy shadows.

---

## 8. Texture

Texture is a material cue, not a filter.

### Shell

- optional fine grain;
- 1–2.5% opacity;
- large scale;
- never reduces text contrast.

### Paper

- 2–5%;
- fiber/grain;
- no dirty stains under text.

### Archival image

- desaturated;
- olive/charcoal cast;
- controlled contrast;
- optional vignette inside image only.

### Rules

Do not:
- overlay scratches across controls;
- distress icons;
- distress body text;
- use different random paper styles per card.

---

## 9. Iconography

Use one modern outline set or custom equivalent.

Specification:
- 20 px default;
- 24 px primary nav;
- ~1.75 px stroke;
- rounded joins;
- simple silhouettes.

Avoid literal detective clichés as universal navigation:
- magnifying glass is okay for search/clue;
- no lantern/compass/revolver/fedora as generic app metaphors.

The prototype's illustrative icons are mood references, not mandatory assets.

---

## 10. Bento system

### Principle

**Span communicates importance.**

Player grid:
- logical 2 columns;
- text-heavy or action-heavy cards span 2;
- half-width only for compact stats/status.

Example:

```text
[ phase / current action            ]
[ status             ][ ghost vote ]
[ latest evidence                   ]
[ current task                      ]
[ map preview                       ]
```

Storyteller:
- 6 or 12 CSS grid columns;
- primary blocker 4/6 or 8/12;
- health 2/6 or 4/12;
- lower panels sized by operational relevance.

No masonry layout. Stable positioning matters under pressure.

---

## 11. Core component anatomy

### CaseHeader

Contains:
- compact wordmark;
- case/phase;
- optional connection;
- optional privacy/formal mode.

Does not contain:
- giant hero title during normal game operation.

### StatTile

For one compact metric only.

Must have:
- label;
- value/status;
- optional icon.

Do not create a tile for every datum.

### PersonTile

States:
- default;
- selected;
- disabled;
- dead;
- current voter/actor;
- formal nominee.

Content:
- avatar/initial;
- name;
- optional state label.

Do not use decorative fingerprints by default.

### DossierDocument

See UX implementation spec.

### Timeline

Uses:
- semantic icon/dot;
- event label;
- secondary time;
- optional detail disclosure.

### MapPanel

Map is edge-to-edge inside its surface.

Overlay chrome is modern product UI, not burned into artwork.

---

## 12. Buttons

Minimum height:
- 44 px absolute;
- 48 px preferred primary mobile;
- 52–56 px for single dominant action.

### Primary

Normal progression.
- brass/light neutral relationship;
- strong text contrast.

### Secondary

Outline/soft.

### Formal

Rust.
Use for:
- nomination commit;
- vote commit;
- phase transition.

### Danger

Danger token.
Use only for:
- remove;
- reset destructive state;
- recovery override.

### Full-width CTA

Allowed when:
- exactly one action matters;
- role reveal acknowledgement;
- submit secret action;
- formal vote/advance.

Not needed for:
- closing journal;
- navigating to details;
- generic “back”.

This intentionally differs from the prototype, which overuses giant red CTA bars.

---

## 13. Forms

Inputs:
- 48 px mobile height;
- card-soft/elevated fill;
- visible label;
- helper/error text;
- no placeholder-only labels.

Selects:
- human-readable values;
- no raw engine IDs in normal mode.

Errors:
- inline near field;
- summary only for multi-field workflow.

---

## 14. Navigation

### Player bottom nav

Four destinations.

Visual:
- 24 px icon;
- 12–13 px label;
- active state uses background/indicator + text tone;
- no heavy skeuomorphic frame.

### Storyteller rail

Active:
- subtle card/soft fill;
- left indicator;
- icon + label.

Include:
- Control;
- Players;
- Grimoire;
- Scenario;
- Audit;
- System.

System may be visually separated.

---

## 15. Modal and sheet system

Phone:
- bottom sheet for context;
- full-screen overlay for private reveal / camera when appropriate.

Desktop:
- centered dialog.

Never use browser `confirm()` as final UX.

High-impact confirmation format:

```text
Title: what will happen
Body: affected entity + consequence
Optional reason
Cancel
Confirm [formal/danger]
```

---

## 16. Formal mode

Formal mode is a temporary UI state during nomination/voting/critical public resolution.

Changes:
- header accent rust;
- primary card border/tint rust;
- action vocabulary becomes explicit;
- terrain/scanner activity is visually suppressed;
- vote numbers tabular;
- lock/result animation crisp.

Does not change:
- entire background to red;
- all buttons to danger red;
- navigation into alarm styling.

---

## 17. Private mode

Private information has an explicit state.

Covered:
- generic private label;
- neutral visuals.

Revealed:
- information shown;
- visible “private” indicator;
- easy hide control.

Privacy cover shortcut for Storyteller:
- hides secret role details immediately;
- leaves safe session status visible.

---

## 18. Imagery

### Rural header imagery

Use on:
- landing;
- session creation;
- possibly pre-game lobby.

Do not use as a 35% tall hero on every in-game screen.

Crop:
- dark but with readable midtones;
- avoid church/horror imagery becoming canonical unless it actually belongs to the scenario/location.

The prototype's village scene establishes mood; the final product may instead use:
- the actual property;
- map fragments;
- abstract rural textures;
- authored scenario image.

### Player portraits

Optional.
Component system must work without them.

If used:
- consistent aspect/crop;
- authored scenario source;
- not AI-randomized during runtime;
- never imply identity traits not part of game content.

---

## 19. Map visual rules

Carry over existing map specifications.

Add UI-specific rules:

- map chrome is separate from raster;
- current location/task markers use app-rendered symbols;
- labels use backed/haloed text;
- base map has a natural edge, not fog hinting at hidden world;
- extended map reveal can use a “new annex” physical-document metaphor;
- map is brighter/cleaner than the surrounding shell.

---

## 20. Motion tokens

```css
--motion-fast: 140ms;
--motion-base: 200ms;
--motion-reveal: 280ms;
--motion-map: 420ms;

--ease-standard: cubic-bezier(.2,.8,.2,1);
```

Use:
- selected state;
- sheet;
- evidence insertion;
- role reveal;
- map extension;
- vote lock.

No decorative continuous motion.

---

## 21. Z-index

```css
--z-base: 0;
--z-sticky: 20;
--z-nav: 30;
--z-sheet: 50;
--z-dialog: 60;
--z-private: 70;
--z-toast: 80;
```

Do not solve stacking issues with arbitrary `z-[9999]`.

---

## 22. Accessibility

- WCAG AA target;
- body/critical copy 16 px+;
- 44×44 minimum target;
- focus visible;
- state not color-only;
- reduced motion;
- semantic headings;
- navigation landmarks;
- dialogs announced;
- map has list alternative;
- text remains legible outdoors;
- no texture directly reducing glyph contrast.

---

## 23. Prototype-to-product mapping

| Prototype motif | Final product translation |
|---|---|
| giant distressed logo | compact wordmark + strong composition |
| night village photograph | selective landing/lobby hero |
| paper title strip | section/case label accent |
| green bento cards | semantic product surfaces |
| parchment clue card | `DossierDocument` |
| Polaroid suspects | optional `PersonTile` image mode |
| fingerprint | rare identity/evidence motif, not every row |
| paper clip | optional decorative grouping only |
| huge red CTA | reserved formal/danger; normal CTA uses primary token |
| bottom nav | keep structurally, modernize visually |
| grunge overlay | 1–5% localized texture |
| stamped warning | `Notice` / formal status |
| map-as-case-file | keep and refine |

---

## 24. Design QA checklist

A screen fails design QA if:

- the logo is needed to make it feel on-brand;
- more than one action looks primary;
- paper is used for generic settings;
- red is used only because a button is important;
- small body text uses distressed/mono face;
- texture noticeably lowers legibility;
- a half-width mobile card contains a paragraph;
- private information is visible without deliberate reveal;
- a player must scroll past history to find an active action;
- a Storyteller must search the page for the blocker;
- map labels are baked into temporary artwork without accessibility alternative;
- hidden map content is inferable before unlock.
