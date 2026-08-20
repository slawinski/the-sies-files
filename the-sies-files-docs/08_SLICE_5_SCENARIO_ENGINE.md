# The Sieś Files — Slice 5 Implementation Specification

**Title:** Scenario Engine — QR, Clues, Tasks & Map Unlocks  
**Status:** Canonical implementation document  
**Version:** 1.0  
**Depends on:** Slices 1–4

## 1. Slice goal

Add The Sieś Files' physical/digital investigation layer **on top of** the completed Trouble Brewing engine without altering its mechanical winner.

At the end of Slice 5, players can scan physical QR markers during Investigation, receive public/private/conditional content, accumulate evidence, receive/complete tasks, encounter scenario-only conditions, advance scenario stages, unlock an expanded map and reach a scenario finale independently of the social-deduction victory resolver.

## 2. Hard boundary with Game Engine

Scenario Engine may never directly mutate alignment, true/perceived character, role ability functioning, poison/drunk state, nomination eligibility, vote weight, execution result or Trouble Brewing victory conditions.

The only MVP vote modifier is the actual Bureaucrat Traveller role.

## 3. Canonical scenario premise

The content pack supports the accepted premise:

- the previous-edition winner, referred to by title as **the Millionaire**, left a message saying someone wanted his money;
- he suspected danger and intended to expose the person;
- he disappears and the trail leads to Sieśki;
- participants investigate what happened, who was responsible and where the money/deposit trail leads;
- accepted narrative direction allows the Millionaire's disappearance to have been staged as part of his response to a real attempt against the money;
- terrain/evidence progresses throughout the weekend in parallel with social deduction.

Exact clue prose remains a versioned content asset, not an engine dependency.

## 4. Terrain availability

Scenario interaction is allowed only when:

```ts
session.status === 'ACTIVE'
&& session.phase === 'INVESTIGATION'
&& investigation.nominationState === 'CLOSED'
```

Otherwise QR scan returns `TERRAIN_UNAVAILABLE`.

This guarantees no terrain during Operational and no terrain during formal nominations/voting.

## 5. Scenario package

```ts
interface ScenarioDefinition {
  id: 'THE_SIES_FILES_MILLIONAIRE';
  version: 1;
  initialStageId: string;
  initialMapVersionId: string;
  qrTokens: QrTokenDefinition[];
  clues: ClueDefinition[];
  tasks: TaskDefinition[];
  conditions: ScenarioConditionDefinition[];
  transitions: ScenarioTransitionDefinition[];
  mapVersions: MapVersionDefinition[];
}
```

Active game persists scenario ID/version. Definitions are immutable by version.

## 6. QR token model

Printed QR encodes an opaque high-entropy token/URL, **not clue text or branching secrets**.

Definition includes stable ID, active stages, repeat policy, audience policy, prerequisites and outcome actions.

```ts
type QrRepeatPolicy =
  | 'REPEATABLE_PER_PLAYER'
  | 'ONCE_PER_PLAYER'
  | 'ONCE_PER_GAME';
```

## 7. Scan semantics

`POST /scenario/qr/scan`:

1. authenticate player;
2. validate phase/nomination availability;
3. resolve token;
4. verify scenario version;
5. evaluate stage/prerequisites/audience;
6. enforce idempotency/repeat policy;
7. persist `QrScan`;
8. atomically produce discoveries/tasks/conditions/transitions;
9. emit events;
10. return only actor-visible outcome.

Replay must never duplicate once-only clue/task/map state.

## 8. Visibility scopes

```ts
type VisibilityScope =
  | 'PUBLIC'
  | 'DISCOVERER_ONLY'
  | 'SPECIFIC_PLAYERS'
  | 'CHARACTER_FILTERED'
  | 'ALIGNMENT_FILTERED'
  | 'STORYTELLER_ONLY';
```

Character/alignment filters are evaluated server-side. Scenario may target content based on a role but may not alter the role's mechanics.

## 9. Clues

A clue definition contains stable ID, title, body/content asset ID, optional media, visibility, acquisition rules, tags/relationships and whether acquisition is public knowledge.

Persist immutable content reference/version or delivered snapshot so later content edits do not mutate an active game's evidence unexpectedly.

## 10. Tasks

Tasks may be individual/subset/public, Storyteller-confirmed, QR-confirmed or auto-completed by another scenario event.

```ts
type TaskState = 'LOCKED' | 'AVAILABLE' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
```

Support declarative prerequisites/completion actions sufficient for the accepted scenario; do not build arbitrary executable scripting.

## 11. Scenario-only conditions

The discussed QR “injury” is implemented as a **scenario condition**, never Game Engine poison/death.

```text
trap QR scanned
→ apply INJURED
→ player sees scenario handicap/instruction
→ selected scenario interactions may be restricted
→ first-aid QR scanned
→ clear INJURED
```

`INJURED` must not disable a Trouble Brewing role, prevent formal voting, change alignment or count as death.

## 12. Scenario transitions

Supported condition primitives:

- clue discovered;
- task completed;
- QR scanned;
- condition present/cleared;
- current stage;
- all/any composition;
- Storyteller manual trigger.

Supported actions:

- reveal clue;
- issue task;
- change stage;
- set map version;
- apply/clear scenario condition;
- emit public/private notice;
- mark finale available/completed.

Evaluate transitions transactionally after scenario mutations until no further deterministic transition fires. Detect loops.

## 13. Map unlock

MVP supports one key expansion:

```text
BASE MAP
→ authoritative scenario unlock
→ EXTENDED MAP
```

The base map must appear complete. It must not show fog, lock, faded continuation, obvious crop seam, hidden labels or other evidence that a left extension exists.

After unlock, replace/expand with an extended asset revealing:

- leftward path;
- stream/watercourse;
- wooded area;
- hermitage (`pustelnia`).

Map version is authoritative scenario state, not client inference.

## 14. Storyteller scenario controls

Storyteller can inspect stage, scans, clue ownership, tasks, conditions, map version and pending progression conditions.

Audited override commands may reveal a clue, correct/reopen/complete task, change stage, unlock map, or apply/clear condition. Normal gameplay should not require them.

## 15. Realtime

Scenario is soft realtime: persist first, emit SSE after commit, affected clients refetch. Late/missed SSE is harmless.

Map unlock may animate as “case file updated”, but refresh must show correct map even if animation was missed.

## 16. APIs

```text
POST /api/v1/games/:id/scenario/qr/scan
GET  /api/v1/games/:id/me/scenario
GET  /api/v1/games/:id/storyteller/scenario
POST /api/v1/games/:id/storyteller/scenario/clues/:clueId/reveal
POST /api/v1/games/:id/storyteller/scenario/tasks/:taskId/complete
POST /api/v1/games/:id/storyteller/scenario/stage
POST /api/v1/games/:id/storyteller/scenario/map
POST /api/v1/games/:id/storyteller/scenario/conditions
```

## 17. Events

`QR_SCANNED`, `CLUE_DISCOVERED`, `TASK_ISSUED`, `TASK_STARTED`, `TASK_COMPLETED`, `SCENARIO_CONDITION_APPLIED`, `SCENARIO_CONDITION_CLEARED`, `SCENARIO_STAGE_CHANGED`, `MAP_UNLOCKED`, `SCENARIO_FINALE_AVAILABLE`, `SCENARIO_FINALE_COMPLETED`, `SCENARIO_OVERRIDE_APPLIED`.

## 18. Player UI

### Evidence
Show only discovered clues. No empty `???` slots that reveal undiscovered clue count.

### Tasks
Emphasize current tasks; compact completed tasks; never expose private task content publicly.

### Scanner
Full-screen camera flow, immediate feedback, explicit offline/unavailable states, no need for manual ID typing.

### Map
Show only current authoritative map. Unlock transition may resemble attaching a new annex/sheet to the case file.

## 19. Storyteller UI

Bento cards for current stage/map, progress conditions, recent scans, clue distribution, task status, scenario conditions and override menu.

Keep narrative controls distinct from social-deduction secret-role controls unless directly contextual.

## 20. Tests

### Unit
Visibility rules, repeat policies, transition all/any logic, loop guard, map-unlock action, injury/first-aid lifecycle, cross-module invariant preventing Game Engine mutation.

### Integration
Duplicate QR idempotency; once-per-game race from two players resolves once; unauthorized clue absent from projection; scans rejected during Operational/nominations; map unlock survives restart; overrides audited.

### E2E
Public clue; player-private clue; task issue/completion; injury→first-aid; progression prerequisites→extended map; refresh on another device with correct authorized evidence/map.

## 21. Acceptance criteria

- [ ] Scenario engine is versioned/data-driven.
- [ ] QR payloads do not contain secret clue content.
- [ ] Scans are idempotent/repeat-safe.
- [ ] Role/player-targeted content is filtered server-side.
- [ ] Terrain unavailable during Operational/formal nominations.
- [ ] Injury cannot alter Trouble Brewing mechanics.
- [ ] Base map gives no hint of extension.
- [ ] Extended map appears only after authoritative unlock.
- [ ] Scenario progress survives reconnect/restart.

## 22. Non-goals

Generic no-code scenario editor, arbitrary executable scripts, GPS/geofencing requirement, AR map, scenario deciding Trouble Brewing winner, final production map artwork inside this slice.
