# The Sieś Files — UX Implementation Specification v1

**Status:** Implementation-ready proposal  
**Depends on:** existing game/scenario specifications; UX Audit v1; Visual Design System v2  
**Non-goal:** changing Trouble Brewing rules or Scenario Engine semantics

---

## 1. Objective

Refactor the current UI from long multi-purpose route dashboards into two purpose-built product experiences:

1. **Player Companion** — phone-first, one clear task at a time, stable navigation, privacy-aware.
2. **Storyteller Console** — tablet/desktop-first, blocker-first control surface, dense only where operationally useful.

The implementation must preserve current server projections and API semantics wherever possible.

---

## 2. Architectural principle

### Domain state remains authoritative

Do not create client-only pseudo-phases to make the UI easier.

UI derives a presentation mode from existing server state:

```ts
type PlayerPresentationMode =
  | "ROLE_REVEAL"
  | "OPERATIONAL_REQUIRED"
  | "OPERATIONAL_WAITING"
  | "INVESTIGATION"
  | "FORMAL_NOMINATION"
  | "FORMAL_VOTING"
  | "GAME_ENDED";

type StorytellerPresentationMode =
  | "SETUP"
  | "ROLE_REVEAL"
  | "OPERATIONAL_BLOCKED_BY_PLAYER"
  | "OPERATIONAL_BLOCKED_BY_ST"
  | "OPERATIONAL_READY_TO_ADVANCE"
  | "INVESTIGATION"
  | "VOTING"
  | "GAME_ENDED";
```

Create pure selector functions:

```text
src/lib/presentation/
  player-mode.ts
  storyteller-mode.ts
  action-priority.ts
```

Selectors must be unit tested.

---

## 3. Route and navigation plan

### Player

Keep `/player` as the authorized player entry.

Use URL-addressable destinations:

- `/player?view=case`
- `/player?view=people`
- `/player?view=journal`
- `/player?view=map`

Default: `case`.

Reasons:

- reload preserves destination;
- browser history works;
- no extra authorization plumbing required;
- same player projection can feed all destinations;
- easy migration from current single page.

If Next.js route segments become cleaner later, these may become nested routes without changing the UX contract.

#### Bottom navigation

```ts
type PlayerView = "case" | "people" | "journal" | "map";
```

Rules:

- fixed/sticky to viewport bottom;
- 4 equal targets;
- icon + label;
- current state has text + shape/color indication;
- safe-area aware;
- minimum 56 px row plus `env(safe-area-inset-bottom)`;
- page content receives corresponding bottom padding;
- hidden only on truly private reveal overlay or camera full-screen mode.

### Storyteller

Keep `/storyteller/[gameId]`.

Use:

- `?view=control`
- `?view=players`
- `?view=grimoire`
- `?view=scenario`
- `?view=audit`
- `?view=system`

Default: `control`.

Tablet/desktop: persistent side rail.  
Narrow viewport: top section selector or drawer.

---

## 4. Shared shell

### `AppShell`

Responsibilities:

- canvas background;
- viewport/safe-area;
- optional rural texture layer;
- page max width;
- connection state slot;
- navigation slot.

No game-domain logic.

### `CaseHeader`

Props:

```ts
type CaseHeaderProps = {
  caseName?: string;
  phaseLabel: string;
  cycleLabel?: string;
  mode?: "quiet" | "formal" | "critical";
  connection?: "live" | "degraded" | "offline";
  privacy?: "public" | "private";
};
```

Player mobile:
- max height ~88 px;
- compact wordmark;
- phase is more prominent than logo.

Storyteller:
- case name;
- phase/cycle;
- connection;
- optional privacy-cover control.

`formal` mode adds restrained rust accent. It must not repaint the entire interface red.

---

## 5. Design primitives

Implement before screen refactor.

### `Surface`

```ts
type SurfaceVariant =
  | "system"
  | "soft"
  | "paper"
  | "secret"
  | "formal"
  | "map";
```

Avoid raw `className="card ..."` composition in route files after migration.

### `Button`

```ts
type ButtonVariant =
  | "primary"
  | "secondary"
  | "quiet"
  | "formal"
  | "danger";
```

Semantic contract:

| Variant | Use |
|---|---|
| primary | normal task completion / forward action |
| secondary | alternate safe action |
| quiet | low-priority utility |
| formal | nominate, lock vote, advance formal game state |
| danger | destructive/recovery only |

Do not use `danger` for “important”.

States:
- default;
- hover;
- pressed;
- focus;
- disabled;
- busy.

Busy buttons keep their width and label context.

### `Badge`

Variants:
- neutral;
- moss/discovery;
- brass/pending;
- rust/formal;
- success;
- danger.

Badges may not rely on color alone.

### `Notice`

Variants:
- info;
- private;
- warning;
- error;
- success.

### `Dialog`

Required:
- focus trap;
- `aria-modal`;
- Escape unless action is irreversible and explicit design says otherwise;
- restore focus;
- labelled title and description;
- mobile bottom-sheet option.

---

## 6. Player screen implementation

## 6.1 `PlayerShell`

Files:

```text
src/app/player/_components/PlayerShell.tsx
src/app/player/_components/PlayerBottomNav.tsx
src/app/player/_components/PlayerCaseView.tsx
src/app/player/_components/PlayerPeopleView.tsx
src/app/player/_components/PlayerJournalView.tsx
src/app/player/_components/PlayerMapView.tsx
```

`src/app/player/page.tsx` becomes the data/controller layer.

It should:
- fetch projection;
- own event stream;
- own mutations;
- compute presentation selectors;
- delegate rendering.

Do not duplicate API calls per tab unless caching architecture later justifies it.

---

## 6.2 Case view

Composition priority:

```tsx
<PlayerCaseView>
  <CaseHeader />
  <PhaseStatus />
  <PrimaryStage />
  <SecondaryCaseContent />
</PlayerCaseView>
```

`PrimaryStage` resolves exactly one of:

```ts
PrivateRevealGate
CurrentActionStage
VoteStage
NominationStatus
GameEndedStage
InvestigationSummary
```

There must never be two equal primary calls to action above the fold.

### Acceptance

At 390×844:
- CaseHeader + state + primary action must fit without requiring scroll whenever content length reasonably permits.
- Secondary content begins below primary stage.
- No map camera or long roster appears in Case view.

---

## 6.3 Private reveal

Component:

`src/components/game/PrivateReveal.tsx`

State machine:

```text
covered -> revealed -> acknowledged/covered
```

Covered UI:
- no role-derived styling;
- one reveal button;
- screen-level privacy notice.

Revealed UI:
- role display;
- ability text;
- alignment if rules allow player to know;
- initial information;
- “Hide” action.

Security:
- do not add secret role to page title;
- do not add secret role to notification text;
- do not cache it in public analytics payloads;
- server projection remains the source.

---

## 6.4 Current action

Component:

`CurrentActionStage`

Subcomponents:

- `ActionBrief`
- `PlayerTargetPicker`
- `ActionDecisionPanel` (existing behavior may be migrated behind new presentation)
- `ActionConfirmation`

Target picker:

```ts
type PersonTileModel = {
  id: string;
  displayName: string;
  seat?: number;
  secondaryStatus?: string;
  disabled?: boolean;
  disabledReason?: string;
};
```

The component must not derive private status not present in the player projection.

Use one-column compact rows at <=359 px and optional 2-column cards at >=360 px when labels remain readable.

---

## 6.5 People view

Purpose: public player model, not detective-story invented biographies unless the Scenario Engine supplies them.

Cards contain:
- player name;
- virtual seat;
- alive/dead;
- nomination/public state;
- ghost-vote state where public/appropriate.

Optional authored scenario portrait:
- component supports image;
- image is not required.

Search is unnecessary for 13–16 players.

---

## 6.6 Journal view

Source data:
- player-visible event/timeline projection;
- received evidence history;
- scenario events that are intentionally visible.

Use `Timeline`.

Do not mirror Storyteller audit events.

Event groups:
- phase changes;
- evidence received;
- map extension;
- nomination/voting public events;
- scenario status changes.

Time is secondary to semantic event label.

---

## 6.7 Map view

Composition:

```text
CaseHeader compact
MapContextBar
MapCard full-width / flex-grow
MapActions
```

`MapActions`:
- `Skanuj kod`;
- optional current-task route/context;
- map state info.

QR scanner opens as:
- full-screen camera on phone, or
- bottom sheet that expands to camera.

Permission states:
- prompt;
- denied;
- unavailable;
- scanning;
- recognized;
- server validation;
- success/error.

Do not display developer token input outside development builds.

---

## 6.8 Formal vote stage

Component:
`VoteStage.tsx`

State:

```ts
type VoteStageState =
  | "NOT_ELIGIBLE"
  | "READY"
  | "SUBMITTING"
  | "LOCKED_YES"
  | "LOCKED_NO"
  | "RESOLVED";
```

Layout:
- formal heading;
- nominee;
- vote eligibility;
- YES/NO as clear binary controls;
- ghost vote copy if relevant;
- lock acknowledgement.

Rules:
- no optimistic “locked” state;
- disabled controls state why;
- navigation does not accidentally discard a submitted vote;
- public tally only if domain projection permits it.

---

## 7. Storyteller implementation

## 7.1 Controller decomposition

Current page should be split into:

```text
src/app/storyteller/[gameId]/
  page.tsx
  _components/
    StorytellerShell.tsx
    ControlView.tsx
    PlayersView.tsx
    GrimoireView.tsx
    ScenarioView.tsx
    AuditView.tsx
    SystemView.tsx
```

Extract mutation hooks:

```text
src/hooks/storyteller/
  useStorytellerGame.ts
  useStorytellerRosterActions.ts
  useOperationalActions.ts
  useNominationActions.ts
  useScenarioActions.ts
  useRecoveryActions.ts
```

This is primarily a maintainability refactor; do not change APIs merely to match component boundaries.

---

## 7.2 Control view

Create `selectPrimaryStorytellerBlocker(projection)`.

Priority order:

1. explicit storyteller decision required;
2. player action waiting / blocking;
3. voting action required;
4. phase advancement ready;
5. setup readiness incomplete;
6. no blocker.

`ControlView`:

```text
Header
PrimaryBlockerCard       2/3 width
SessionHealth            1/3 width
OperationalQueue         2/3 width
PlayerReadiness          1/3 width
NominationSummary        1/2 width
ScenarioPulse            1/2 width
```

On <=900 px, collapse to one dominant column + secondary accordion/stack.

### Primary blocker card

Must include:
- action label;
- actor;
- what Storyteller is waiting for;
- next allowed operation;
- required decision UI if applicable.

Do not display internal action IDs by default.

---

## 7.3 Players view

Use a dense responsive table/list.

Desktop columns:
- handle;
- seat;
- name;
- access;
- connection;
- alive/dead;
- role summary if permitted for ST;
- overflow.

Mobile/tablet portrait:
- stacked row.

### Arrangement mode

Entering `Arrange circle`:
- exposes drag/reorder controls;
- freezes unrelated per-player mutations;
- explicit `Done` exit.

Fallback up/down buttons remain keyboard accessible.

### Overflow actions

- rename;
- copy/recreate claim link;
- reset access;
- remove.

`Remove` opens danger confirmation with player name.

---

## 7.4 Grimoire view

Before setup commit:
- show validation summary;
- role counts;
- assignment list;
- Drunk perceived role;
- red herring;
- Demon bluffs;
- regenerate;
- commit.

Commit requires confirmation:
“After committing, player roles can be revealed.”

After commit:
- default read-only;
- current effects badges;
- temporary statuses;
- privacy-cover button.

---

## 7.5 Scenario view

Normal runtime controls:
- current stage;
- map state;
- active tasks;
- revealed clues;
- scan history;
- active conditions.

Advanced overrides:
- collapsed by default;
- explicit label;
- every state mutation records audit reason when appropriate.

Replace free-text stage ID with a select/radio generated from scenario definition when technically available.

Map state action labels should be human:
- “Reveal western annex”
not:
- `MAP_EXTENDED`.

---

## 7.6 Audit view

Use a real data-dense surface, not bento cards.

Desktop:
- filter bar;
- table/timeline;
- fixed-height virtualized or paginated list if event counts grow.

Columns:
- sequence;
- time;
- category;
- event;
- actor;
- version.

Event row expands to technical details.

Do not put audit permanently on Control Home.

---

## 7.7 System view

Sections:
- realtime;
- connected viewers/presence;
- checkpoint;
- diagnostics;
- recovery danger zone.

Recovery requires:
1. choose operation;
2. choose entity using human-readable picker where possible;
3. preview consequence;
4. type reason;
5. confirm.

Raw IDs may be shown in an Advanced disclosure, but should not be the primary input when the entity is available in projection data.

---

## 8. Dossier document implementation

Create:

`src/components/ui/DossierDocument.tsx`

API:

```ts
type DossierDocumentProps = {
  eyebrow?: string;
  title: string;
  body?: React.ReactNode;
  metadata?: Array<{ label: string; value: string }>;
  stamp?: string;
  illustration?: React.ReactNode;
  tone?: "neutral" | "secret" | "formal";
  children?: React.ReactNode;
};
```

CSS characteristics:
- paper token;
- ink text;
- 14–16 px radius;
- subtle inner border;
- optional texture via pseudo-element;
- texture opacity 0.02–0.05;
- content above texture;
- no texture embedded behind small text;
- optional 1–2° decorative rotation only for non-interactive nested artifact, never the main clickable card.

---

## 9. Action severity matrix

| Action | Variant | Confirmation |
|---|---|---|
| open map | quiet/secondary | no |
| scan QR | primary | no |
| submit target | primary | optional review for irreversible ability |
| nominate | formal | yes if rule action is hard to undo |
| vote yes/no | formal | server lock feedback |
| start voting | formal | no/short confirmation depending state |
| advance phase | formal | confirmation if it closes pending opportunities |
| commit grimoire | formal | yes |
| remove player | danger | yes |
| recovery override | danger | strong confirmation + reason |

Red/danger must never become the generic “primary button” color.

---

## 10. Content and microcopy

### General

Use natural Polish for player-facing runtime copy. Avoid leaking internal engine terminology.

Good:
- `Czekamy na decyzję prowadzącego`
- `Wybierz jedną osobę`
- `Twój głos został zapisany`
- `Nowy fragment mapy został odkryty`

Avoid:
- `WAITING_FOR_STORYTELLER`
- `passStatus READY`
- `mapVersionId`
- raw UUIDs.

Storyteller advanced views may expose technical labels in a secondary style.

---

## 11. Realtime and network behavior

### Connection indicator

States:
- live;
- reconnecting;
- offline.

Rules:
- compact persistent indicator;
- full banner only when user action is blocked or data freshness is uncertain;
- never claim mutation success before server response;
- avoid toast spam for routine event-stream updates.

### Optimistic UI

Allowed:
- local selection highlight before submit;
- tab/nav transition.

Not allowed for:
- vote locked;
- target accepted;
- phase changed;
- role action resolved;
- recovery override;
- map unlocked.

---

## 12. Motion

Durations:
- control state: 120–180 ms;
- card insertion: 180–260 ms;
- role reveal: <=300 ms;
- map annex reveal: 300–500 ms maximum.

Only transform/opacity where possible.

No:
- continuous pulse except tiny connection indicator;
- shake;
- bright flash;
- confetti;
- large parallax;
- ambient fog moving under text.

`prefers-reduced-motion: reduce` removes nonessential animation.

---

## 13. Accessibility implementation

Required tests:

- keyboard through Storyteller console;
- focus after modal open/close;
- screen-reader names for icon-only actions;
- 200% zoom;
- 320 px viewport;
- reduced motion;
- dark palette contrast;
- QR permission failure;
- map alternative content;
- offline/reconnect.

Add Playwright coverage for:

1. role reveal focus and hiding;
2. player bottom nav;
3. vote submit/locked state;
4. Storyteller blocker priority;
5. destructive dialog;
6. map scan sheet;
7. safe-area bottom spacing via viewport snapshot where feasible.

---

## 14. CSS/token migration

`globals.css` should remain the token source initially.

Refactor classes into:

```css
@theme inline { ... }

:root {
  /* color */
  /* typography */
  /* spacing */
  /* radius */
  /* shadows */
  /* motion */
  /* z-index */
}
```

Do not duplicate final colors in JSX class strings.

Add semantic tokens such as:

```css
--surface-primary: var(--bg-card);
--surface-document: var(--paper);
--surface-formal: color-mix(...);
--action-primary: var(--brass);
--action-formal: var(--rust);
--focus-ring: var(--brass);
--nav-height: 4rem;
```

Use raw palette tokens only inside the design-system layer; screens consume semantic tokens/components.

---

## 15. Implementation milestones

### M1 — UI foundation

Deliver:
- token extension;
- Button;
- Surface;
- Badge;
- Notice;
- Dialog;
- CaseHeader;
- BottomNav;
- StorytellerRail.

Exit:
- Storybook is optional; component route/dev harness is acceptable;
- keyboard and focus states verified.

### M2 — Player shell

Deliver:
- URL-addressable views;
- primary-stage selector;
- role reveal;
- action picker;
- formal vote;
- dedicated map/scanner.

Exit:
- current game flows can be completed from new player shell.

### M3 — Storyteller shell

Deliver:
- Control Home;
- Players;
- Grimoire;
- Scenario;
- Audit;
- System.

Exit:
- normal live game can be operated without entering System/Recovery.

### M4 — visual language pass

Deliver:
- DossierDocument;
- restrained assets;
- header/brand refinement;
- evidence/journal treatment;
- map shell alignment.

### M5 — hardening

Deliver:
- Playwright UX flows;
- accessibility pass;
- outdoor contrast check;
- poor-network behavior;
- responsive matrix.

---

## 16. Explicit non-goals

This UX refactor must not:

- alter role logic;
- alter voting eligibility;
- expose hidden scenario data client-side;
- merge Scenario Engine and Game Engine;
- derive map coordinates from temporary artwork;
- add permanent player elimination outside the game rules;
- add social/chat systems merely because prototype cards show chat icons;
- require generated portraits for each participant;
- turn the UI into a literal scrapbook.

---

## 17. Pull-request acceptance checklist

Every migrated screen must answer:

- Is the most important action visually dominant?
- Is unrelated functionality subordinate or elsewhere?
- Does the screen work at 390×844?
- Does it work with long Polish names/copy?
- Does it work with no portrait asset?
- Does it use semantic components rather than custom card/button classes?
- Are secret states absent from public labels/notifications?
- Are error/loading/offline states specified?
- Are destructive actions clearly separated?
- Is keyboard focus visible?
- Is reduced motion respected?
- Does the screen still look like The Sieś Files with the logo removed?
