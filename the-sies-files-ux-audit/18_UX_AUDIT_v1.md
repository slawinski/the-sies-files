# The Sieś Files — UX Audit v1

**Status:** Proposed canonical UX audit  
**Repository reviewed:** `https://github.com/slawinski/the-sies-files` (`main`, reviewed 2026-08-23)  
**Reference direction:** project prototype screens + `the-sies-files-docs/11_VISUAL_DESIGN_SYSTEM.md` + map specifications  
**Scope:** player experience, Storyteller control plane, session setup/claim flow, navigation, information architecture, interaction hierarchy, visual consistency, accessibility, responsive behavior, and implementation maintainability.

---

## 1. Executive summary

The product already has the right **visual premise** but not yet the right **interaction architecture**.

The repository contains a strong written design direction: Rural Neo-Noir + Bento Grid, a semantic card system, accessible colors, restrained motion, differentiated evidence/map surfaces, and explicit hierarchy rules. The current implementation already uses many of those tokens and card variants. The largest UX gap is therefore not “theme work”; it is that the screens still behave like vertically stacked engineering dashboards.

The player page currently combines role reveal, operational action, identity, roster, information, investigation, nominations/voting, scenario evidence, tasks, map, and scanner into one long responsive grid. The Storyteller page similarly exposes setup, roster editing, grimoire, operational queue, nominations, scenario controls, recovery controls, health/presence, and audit in one control surface.

That makes the application functionally rich but weak at the most important live-game question:

> **What do I need to understand or do right now?**

The redesign should therefore preserve the prototype's visual DNA while replacing prototype-level skeuomorphism and current implementation-level dashboard sprawl with a focused, product-grade interaction model.

### Recommended target

The final application should feel:

- **modern product first, case dossier second;**
- **phase-aware rather than page-long;**
- **cinematic at moments of reveal, restrained during routine operation;**
- **optimized for a phone outdoors for players;**
- **optimized for tablet/desktop glanceability for the Storyteller;**
- **visually recognizable as The Sieś Files without requiring a giant logo on every screen.**

---

## 2. Sources reviewed

### Repository

Primary UX-relevant paths:

- `src/app/page.tsx`
- `src/app/claim/page.tsx`
- `src/app/player/page.tsx`
- `src/app/storyteller/page.tsx`
- `src/app/storyteller/[gameId]/page.tsx`
- `src/app/globals.css`
- `src/components/ActionDecisionPanel.tsx`
- `src/components/MapCard.tsx`
- `src/components/PhaseBadge.tsx`
- `src/components/QrScanner.tsx`
- `src/components/useGameEventStream.ts`
- `src/components/usePresenceHeartbeat.ts`
- `the-sies-files-docs/11_VISUAL_DESIGN_SYSTEM.md`
- `the-sies-files-docs/12_MAP_ASSET_SPECIFICATION.md`
- `the-sies-files-docs/17_ADR_003_MAP_REVEAL_LAYERS.md`
- `the-sies-files-docs/map-reveal-system-spec.md`

### Visual prototypes

The prototype family communicates a consistent direction:

- dark green/charcoal rural neo-noir shell;
- archival/typewriter brand layer;
- parchment evidence/dossier surfaces;
- bento stat cards;
- selective rust/red emphasis;
- strong phase titles;
- bottom mobile navigation;
- photographs/fingerprints/stamps/paper clips as investigative motifs;
- a large primary action at the bottom of the interaction;
- rural cinematic imagery and map material.

The final UI should **not** reproduce the prototype literally. It should extract its rules and reduce the decorative load.

---

## 3. What is already working

### 3.1 The semantic visual language is correctly defined

`globals.css` already implements semantic design tokens rather than arbitrary screen colors:

- dark canvas/elevated/card layers;
- paper and ink;
- moss, brass, rust, danger and success;
- WCAG-improved small-text colors;
- semantic card variants;
- 13 px metadata floor;
- global visible focus;
- reduced-motion-aware interaction animation.

Keep this foundation.

### 3.2 The map architecture is stronger than a typical MVP

The map specifications correctly separate:

- gameplay location identity from art;
- `MAP_BASE` from `MAP_EXTENDED`;
- normalized coordinates from raster pixels;
- server-authorized hidden state from CSS hiding;
- gameplay usefulness from geographic precision.

Do not undo this in the redesign.

### 3.3 Touch target awareness is visible

Many existing controls use `min-h-11`, approximately the correct minimum touch size. This is especially important because the player UI will often be used standing outdoors.

### 3.4 State semantics are already present

The application has meaningful concepts for:

- phase;
- operational queue;
- action blockers;
- nominations;
- voting;
- map state;
- realtime health;
- presence;
- audit;
- recovery.

The redesign does not need a new domain model. It needs a better projection of the existing domain model.

---

## 4. Priority findings

Severity:

- **P0** — live-game confusion, privacy, accidental state change, or serious usability risk.
- **P1** — substantial UX degradation or design-system divergence.
- **P2** — polish, consistency, maintainability.
- **P3** — optional enhancement.

| ID | Priority | Finding | Why it matters | Target change |
|---|---|---|---|---|
| UX-01 | P0 | Player page is a single long multi-purpose dashboard | Current action can be visually displaced by unrelated information; scroll position becomes part of game operation | Introduce stable player IA and a phase-aware Home/Now screen |
| UX-02 | P0 | Storyteller dashboard exposes too many operating modes at once | High error risk during a live session; hard to identify the blocker | Create a persistent Control Home; move setup, players, scenario, audit/recovery into dedicated sections |
| UX-03 | P0 | Private role reveal is visually subordinate | Privacy-critical content appears inside the same page context rather than a deliberate confidential moment | Full-screen/private reveal state with deliberate reveal + explicit close/hide |
| UX-04 | P0 | Formal nomination/voting does not sufficiently interrupt free investigation | Players need an unmistakable mode change when terrain actions are no longer primary | Formal Mode shell, rust accent, focused vote screen, terrain actions hidden/locked |
| UX-05 | P1 | Current application only partially expresses prototype identity | Theme is mostly tokens/cards; composition still looks generic | Add restrained case-file composition: dossier title strips, evidence paper, rural hero crop, stamps/annotations only where semantic |
| UX-06 | P1 | Red/brass emphasis is not governed tightly enough | Too many “important-looking” actions flatten hierarchy | Define explicit action severity matrix |
| UX-07 | P1 | Storyteller roster rows carry too many inline actions | Rename/reset/reorder/remove compete with primary operations | Row overflow menu + explicit arrangement mode |
| UX-08 | P1 | Scenario tools and emergency recovery sit too close to routine game controls | Accidental misuse risk and attention clutter | Separate `Scenario` and `Recovery` workspaces; recovery behind Danger Zone affordance |
| UX-09 | P1 | Player navigation promised by design docs is not implemented as a stable 4–5 destination shell | Users must rediscover sections by scrolling | Add bottom nav: `Akta`, `Gracze`, `Dziennik`, `Mapa` or `Więcej` |
| UX-10 | P1 | Player target selection is functionally list-oriented | In a social game, people are the core entities; lists are slower to scan under pressure | `PersonTile` / compact player cards with state and selection |
| UX-11 | P1 | Evidence surfaces are visually under-differentiated from normal UI | Clues should read as “received material”, not settings cards | Canonical `DossierDocument` component |
| UX-12 | P1 | Landing/claim flows do not establish enough context or trust | Entry is the first moment of the experience | Branded but clean entry; explain Storyteller vs player paths; claim privacy copy |
| UX-13 | P1 | Long page components increase UX inconsistency risk | `player/page.tsx` and Storyteller game page centralize too many interaction patterns | Decompose into shell, sections and domain-specific presentational components |
| UX-14 | P2 | Browser-native/simple destructive confirmation patterns should be replaced | Native confirm is visually and accessibly inconsistent | Accessible modal confirmation with explicit object/action |
| UX-15 | P2 | Realtime/offline feedback is secondary rather than persistent | Outdoors/mobile networks can be unreliable | Compact persistent network badge; action-level retry; never imply success before server ack |
| UX-16 | P2 | Loading states are primarily text | Feels unfinished and can cause layout shift | Skeletons for public/non-secret structures; no skeletons that leak secret item counts |
| UX-17 | P2 | Typeface implementation looks more “developer monospace” than “editorial dossier” | Prototype character is lost, while all-uppercase mono can harm scanning | UI sans for almost everything; editorial mono/slab only for titles/labels |
| UX-18 | P2 | Decorative prototype cues are too heavy to copy literally | Full grunge, clips, fingerprints and giant photo headers would reduce legibility/performance | Use texture as a localized material system, not wallpaper |
| UX-19 | P2 | No explicit compact/live density mode for Storyteller | Tablet space should serve operations, not decoration | Storyteller-specific density tokens and 3-zone layout |
| UX-20 | P3 | Micro-interactions could reinforce case-file metaphor | Helpful for delight, not required for comprehension | Dossier insertion, phase change, annex reveal, vote lock only |

---

## 5. Player UX audit

### 5.1 Current information architecture

The current `player/page.tsx` renders many concerns in one page:

1. role reveal;
2. active operational action;
3. identity/status;
4. roster;
5. delivered role information;
6. investigation;
7. nominations and vote state;
8. scenario clues;
9. tasks;
10. map;
11. QR scanner.

Responsive columns do not solve the underlying information architecture problem. They only reflow it.

### 5.2 Target player navigation

Use four persistent destinations:

| Destination | Purpose |
|---|---|
| **Akta** | phase-aware home, current action, current clue/task, urgent state |
| **Gracze** | public roster, alive/dead status, nomination context |
| **Dziennik** | public/personal timeline, received evidence history |
| **Mapa** | terrain map, location context, QR scanner entry |

`Ustawienia` should live behind a small profile/more action unless player settings become substantial. The prototype's four-item bottom nav is correct structurally, but the labels should reflect actual product functions rather than be copied automatically.

### 5.3 Akta / Now

The first viewport must answer:

- What phase/cycle is this?
- Am I alive?
- Do I need to do something?
- Is the information on screen private?
- What changed since I last looked?

Recommended order:

```text
CaseHeader
PhaseStatusRow

IF private reveal needed:
    PrivateRevealGate
ELSE IF action required:
    CurrentActionStage
ELSE IF voting:
    FormalVoteStage
ELSE:
    CurrentCaseSummary

LatestEvidence
CurrentTask
MapPreview / JournalPreview
BottomNav
```

The highest-priority state must span the full width and appear before historical content.

### 5.4 Role reveal

Current direction: deliberate reveal is good. Presentation must become a dedicated privacy flow.

States:

1. **Covered**
   - dark neutral screen;
   - “Informacja prywatna”;
   - one deliberate `Pokaż rolę` action;
   - no visible role length, alignment or icon that leaks information.

2. **Revealed**
   - parchment or dark dossier depending on role class;
   - role name;
   - alignment;
   - ability;
   - any initial information;
   - private warning;
   - `Zapamiętałem — ukryj` primary action.

3. **Hidden again**
   - return to normal Akta;
   - role is reachable later through an intentionally private action, not permanently exposed.

Do not put unrelated roster/evidence content behind the revealed card in a way that encourages shoulder surfing.

### 5.5 Operational actions

Use a single `ActionStage` composition:

```text
eyebrow: "Cicha akcja · tylko dla Ciebie"
title: role/action name
instruction
optional secret information
target selector
validation
submit
```

The target selector should be a player-focused grid/list with:

- initials or approved avatar artwork;
- name;
- alive/dead state only if public;
- selection state;
- disabled reason where relevant.

Avoid adding arbitrary “suspect portraits” as canonical product entities unless the scenario actually owns those portraits. The prototype's photographic cards are a visual metaphor; the reusable product component should work with initials, icon portraits or future authored images.

### 5.6 Investigation

Investigation should feel open and explorable, but still have a clear current state.

Use:

- 2-up status tiles only for genuinely useful metrics;
- one current evidence dossier;
- task progress;
- map preview;
- recent journal entry.

Do not show metrics merely because the prototype has metric cards.

### 5.7 Nomination and voting

This needs a modal change in visual hierarchy, not necessarily a literal modal.

When nominations open:

- `CaseHeader` receives `formal` mode;
- rust line/accent appears;
- investigation CTAs are disabled or removed;
- nomination/voting becomes first content;
- bottom navigation remains available only where game rules permit.

Vote screen:

```text
FormalModeHeader
NomineeCard
"Twój głos"
[ TAK ] [ NIE ]
vote availability / ghost-vote explanation
locked confirmation
public progress if permitted by game rules
```

Do not imply that a vote is counted until the server confirms the state.

### 5.8 Evidence and journal

Evidence should use a reusable document primitive, not bespoke decorative HTML.

`DossierDocument` may contain:

- document classification / source;
- title;
- body;
- received timestamp;
- stamp/status;
- optional illustration/photo;
- optional thin pencil annotation.

Avoid:

- large coffee stains;
- torn edges around every card;
- decorative fingerprints on every person;
- fake paper clips where they do not communicate grouping;
- tiny typewriter text.

### 5.9 Map and scanner

Keep the strong existing map architecture.

UX changes:

- give `Mapa` a dedicated navigation destination;
- let the map occupy most of the viewport;
- put current task/location chips above or over a safe map margin;
- expose QR scanner as a prominent sheet/button, not a permanent camera-sized block inside a long dashboard;
- after map expansion, briefly explain “Nowy fragment mapy” but do not expose hidden-region metadata before unlock.

---

## 6. Storyteller UX audit

### 6.1 Core problem

The current Storyteller page behaves like a complete control-plane debug/dashboard view. This is valuable for development, but risky in a live game.

The Storyteller should not scan through setup, operational queue, nominations, scenario overrides, presence, recovery, checkpoints and audit to discover the active blocker.

### 6.2 Target Storyteller information architecture

Persistent sections:

- **Control**
- **Players**
- **Grimoire**
- **Scenario**
- **Audit**
- **System**

`Recovery` belongs under `System` or a protected Danger Zone, not as a routine peer of gameplay controls.

Desktop/tablet shell:

```text
┌ Rail ─────┬───────────────────────────────┐
│ Control   │ Case header / health          │
│ Players   ├──────────────┬────────────────┤
│ Grimoire  │ NOW / blocker │ phase queue    │
│ Scenario  │              │                │
│ Audit     ├──────────────┼────────────────┤
│ System    │ nominations  │ people/status  │
└───────────┴──────────────┴────────────────┘
```

### 6.3 Control Home

Top priority is the active blocker.

Examples:

- “Waiting for Investigator to choose a target”
- “You must resolve Poisoned information”
- “Voting ready — start pass”
- “All operational actions complete — advance to Investigation”

The Storyteller should be able to run the normal session primarily from this page.

Control Home contains:

1. current phase + cycle;
2. realtime health;
3. dominant `Next required action`;
4. compact queue;
5. nomination/vote state;
6. player connection/readiness summary;
7. one contextual next-phase action.

### 6.4 Players

Roster management should not compete with live controls.

Row anatomy:

```text
drag/order handle
seat
name
connection/status
role status summary where authorized
••• overflow
```

Overflow:

- rename;
- regenerate/replace claim link;
- reset access;
- remove.

Reordering should occur in explicit **Arrange circle** mode. This prevents accidental seat movement during routine play.

### 6.5 Grimoire

The setup candidate and committed grimoire are important enough for a dedicated view.

Before commit:

- role distribution summary;
- assignments;
- Drunk perceived role presentation;
- red herring;
- Demon bluffs;
- regenerate secondary;
- commit primary with confirmation.

After commit:

- read-only by default;
- effects/status overlays during play;
- no routine “regenerate” affordance.

### 6.6 Operational queue

Use three visual states:

- completed — quiet;
- current blocker — large/high contrast;
- upcoming — subdued.

The active queue should display decision context without requiring Storyteller to cross-reference another card.

Do not overexpose secret information on a projector-visible screen. Storyteller UI should assume the device may temporarily be seen by players and provide a **privacy cover** shortcut.

### 6.7 Scenario controls

Separate scenario authoring/debug concepts from runtime controls.

Runtime `Scenario` should expose:

- stage;
- public/revealed clues;
- active tasks;
- map state;
- scan history;
- conditions.

Manual overrides go in a collapsible `Advanced overrides` area with confirmation and audit reason where state can materially change.

Avoid asking the Storyteller to type raw stage IDs in normal operation. Use enumerated stages generated from scenario content.

### 6.8 Recovery and audit

Recovery is exceptional.

Use:

```text
System
  Health
  Presence
  Checkpoints
  Diagnostics
  Danger Zone
      Recovery override
```

Before execution:

- human-readable action;
- affected player/action;
- resulting state;
- required reason;
- typed or deliberate confirmation for high-impact overrides.

Audit remains dense but should live in its own screen with:

- filter;
- search;
- timeline/table toggle;
- expandable event payload;
- export/copy debug context if later useful.

---

## 7. Entry, claim and lobby

### Landing

Current root is extremely minimal. Replace it with a restrained branded entry:

- compact wordmark;
- one rural/case-file hero crop or texture;
- “Prowadzę grę” primary route;
- “Dołączam jako gracz” secondary route;
- short status/offline capability note only if needed.

Avoid presenting “Storyteller” as unexplained English jargon before the user has context.

### Claim flow

The claim link is a security/privacy boundary.

The screen should explicitly state:

- who is being claimed;
- that the device becomes that player's private view;
- that the screen may contain secret information;
- what to do if the name is wrong.

### Lobby/setup

Prototype strengths to keep:

- room/session identity;
- participant readiness;
- a clear “start” moment.

Prototype details to reduce:

- giant permanent logo;
- full-screen background photograph;
- every row having a fingerprint/chat icon;
- permanent bright-red CTA before validation.

Final Storyteller lobby should use the same Control shell and show a checklist-like readiness state without literally looking like a checklist UI.

---

## 8. Visual prototype interpretation

### Keep

- rural neo-noir;
- charcoal/forest shell;
- warm paper;
- red-pencil/rust emphasis;
- bento grouping;
- typewriter/editorial accent;
- dossier hierarchy;
- archival image treatment;
- strong phase transition;
- bottom player navigation;
- full-width primary action when one action matters;
- maps as authored investigative material.

### Abstract

The following are **references, not components**:

- paper clips;
- fingerprints;
- Polaroid frames;
- stamps;
- torn labels;
- red thread;
- village night photo;
- distressed type.

Use them where they reinforce content semantics.

### Remove/reduce

- grunge behind every surface;
- distressed text for body copy;
- red primary buttons for ordinary navigation;
- decorative icon circles in every stat;
- full visual density at all times;
- giant branding repeated on in-game screens;
- literal photoreal portraits as a requirement for player identity;
- skeuomorphic controls.

---

## 9. Accessibility and outdoor-use audit

### Preserve

- 44 px minimum interactive targets;
- strong focus ring;
- reduced-motion behavior;
- text + color state encoding;
- contrast-adjusted tokens.

### Add

- `aria-live="polite"` for non-secret phase/realtime updates;
- `aria-live="assertive"` only for time-critical local action changes;
- skip-to-content on Storyteller desktop;
- accessible modal focus trapping;
- restore focus to invoking control after dialogs/sheets;
- bottom navigation safe-area padding;
- content bottom padding equal to nav height + safe area;
- minimum 16 px for action instructions and evidence body;
- avoid `title` as sole explanation on touch;
- do not expose hidden information in accessible DOM when it should not be available to that projection;
- explicit offline/connection state text;
- map list alternative for interactive locations;
- camera permission/error fallback for QR scanning.

### Daylight rule

If a control is important enough to use outdoors, it must remain visible at reduced perceived contrast. Avoid opacity below approximately 0.65 for meaningful text or controls.

---

## 10. Responsive targets

### Player

Primary target:
- 360–430 CSS px phone width.

Support:
- 320 px minimum without horizontal scroll;
- 768+ as centered phone-like content, not an unnecessarily stretched desktop dashboard.

### Storyteller

Primary:
- 1024–1366 px tablet/compact laptop.

Support:
- 768 px portrait tablet with collapsible rail;
- desktop up to 1600 px with constrained reading/action regions;
- phone fallback for emergency operation, not the optimized Storyteller layout.

---

## 11. Maintainability findings

The current UI architecture concentrates too much rendering and state in large route files. This makes visual consistency harder and raises regression risk.

Refactor toward:

```text
src/components/ui/
  AppShell.tsx
  CaseHeader.tsx
  Surface.tsx
  Button.tsx
  Badge.tsx
  Notice.tsx
  Dialog.tsx
  BottomNav.tsx
  StorytellerRail.tsx
  StatTile.tsx
  DossierDocument.tsx
  PersonTile.tsx
  Timeline.tsx

src/components/game/
  PhaseSummary.tsx
  PrivateReveal.tsx
  CurrentActionStage.tsx
  PlayerTargetPicker.tsx
  VoteStage.tsx
  NominationStage.tsx
  GrimoireBoard.tsx
  OperationalQueue.tsx
  ScenarioSummary.tsx
  ConnectionSummary.tsx

src/app/player/
  _components/
  page.tsx

src/app/storyteller/[gameId]/
  _components/
  page.tsx
```

Route components should orchestrate data/state. They should not be the canonical place where every button style and card structure is defined.

---

## 12. Recommended delivery order

1. **Foundation**
   - tokens v2;
   - Button/Surface/Badge/Notice/Dialog primitives;
   - AppShell, CaseHeader, BottomNav, StorytellerRail.

2. **Player hierarchy**
   - Akta/Gracze/Dziennik/Mapa IA;
   - CurrentActionStage;
   - PrivateReveal;
   - VoteStage.

3. **Storyteller hierarchy**
   - Control Home;
   - dedicated Players/Grimoire/Scenario/Audit/System views;
   - contextual blocker model.

4. **Dossier language**
   - DossierDocument;
   - evidence/journal polish;
   - restrained textures and stamps.

5. **Map/scanner integration**
   - dedicated map destination;
   - scanner sheet;
   - extended-map reveal polish.

6. **Accessibility/outdoor QA**
   - keyboard;
   - screen reader;
   - safe areas;
   - daylight contrast;
   - poor-network states.

---

## 13. Definition of UX done

The redesign is acceptable when:

- a player can identify their current required action in under 2 seconds without scrolling;
- a Storyteller can identify the session's current blocker in under 2 seconds;
- role/secret information is never casually left visible;
- voting creates an unmistakable formal-mode change;
- player primary navigation is stable across phases;
- normal player operation never requires scanning a long dashboard;
- normal Storyteller operation can be run from Control Home;
- emergency/recovery controls cannot be mistaken for routine actions;
- evidence clearly reads as evidence without excessive skeuomorphism;
- the map remains readable in daylight and keeps hidden regions truly undiscoverable before unlock;
- the UI remains recognizable as The Sieś Files even on a screen without the wordmark;
- all primary actions meet target size, contrast and focus requirements;
- reduced motion does not remove essential feedback;
- current server/domain behavior is preserved unless a separate gameplay specification explicitly changes it.

---

## 14. Repository references

- `https://github.com/slawinski/the-sies-files`
- `src/app/player/page.tsx`
- `src/app/storyteller/[gameId]/page.tsx`
- `src/app/globals.css`
- `the-sies-files-docs/11_VISUAL_DESIGN_SYSTEM.md`
- `the-sies-files-docs/12_MAP_ASSET_SPECIFICATION.md`
