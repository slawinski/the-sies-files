# The Sieś Files — Game Engine Specification v1

**Status:** Canonical  
**Version:** 1.0  
**Date:** 2026-08-20  
**Rules foundation:** Trouble Brewing  
**Supported participants:** 13–16  
**Authority model:** human Storyteller + server-authoritative digital engine

---

## 1. Purpose

The Game Engine is the rules-and-state layer behind The Sieś Files. It must support a physical, weekend-long social-deduction game while the app provides private role delivery, a stable digital grimoire, formal resolution, voting, terrain/scenario content, and recovery.

The engine is deliberately separated into three conceptual layers:

1. **Game Engine** — Trouble Brewing rules, players, roles, phases, actions, death, voting, victory.
2. **Scenario Engine** — QR scans, clues, tasks, map progression and scenario narrative.
3. **Presentation Layer** — The Sieś Files branding, Rural Neo-Noir visual language, copy, map artwork.

Rules must not depend on visual implementation, and the scenario must not mutate Trouble Brewing victory conditions.

---

## 2. Non-negotiable invariants

### 2.1 Server authority

The server is the only authority allowed to validate commands, assign roles, generate setup randomness, compute role effects, resolve deaths/protection, record nominations and votes, consume ghost votes, resolve executions/Traveller exile, compute victory, and decide what each viewer may see.

Clients send **intent**, never authoritative state changes.

### 2.2 Two global phases only

```ts
type GamePhase = 'OPERATIONAL' | 'INVESTIGATION';
```

There is no separate global `COUNCIL`, `VOTING`, `MEETING`, or `POSIEDZENIE` phase.

`INVESTIGATION` may contain free discussion, terrain/scenario activity, day abilities, nomination window, vote in progress, execution resolution, and Traveller exile.

### 2.3 Virtual Circle

Physical seating is irrelevant. The app owns a stable circular order:

```ts
type VirtualSeat = number; // contiguous 0..N-1
```

This order is used for adjacency, Chef pairs, Empath neighbours, vote traversal/order, and any future order-dependent mechanics.

The Storyteller may reorder participants in pre-game setup. Once role setup is committed, the order is immutable for the remainder of the session.

### 2.4 Hidden information

Hidden information is not sent to unauthorized clients. Examples include another player's true role, Traveller alignment, Drunk true identity, Fortune Teller red herring, hidden poison/drunk state, Storyteller registration overrides, unseen clues, and evil-team setup knowledge.

The backend constructs viewer-specific projections.

### 2.5 Auditability

Every meaningful mutation produces an append-only domain event with actor, timestamp, command ID and resulting game version. Storyteller overrides produce explicit audit events and may never silently rewrite history.

---

## 3. Session lifecycle

```text
LOBBY
  ↓
SETUP
  ↓ commit setup
ROLE_REVEAL
  ↓
OPERATIONAL cycle 1
  ↓
INVESTIGATION cycle 1
  ↓
OPERATIONAL cycle 2
  ↓
INVESTIGATION cycle 2
  ↓
...
  ↓
ENDED
```

Recommended persisted enum:

```ts
type SessionStatus =
  | 'LOBBY'
  | 'SETUP'
  | 'ROLE_REVEAL'
  | 'ACTIVE'
  | 'ENDED';
```

When `ACTIVE`, `phase` must be non-null.

---

## 4. Player model

A participant has an immutable `playerId`, display name, session membership, stable `virtualSeat` after setup commit, alive/dead state, true/perceived character state, alignment, role/effect state, and claim/session identity.

Normal dead players remain participants in the physical and app experience. They can still talk and use terrain where allowed, and normally retain one ghost vote until used. Death is not logout or roster removal.

### 4.1 Truth, registration and belief

The engine distinguishes:

- **truth** — actual character/alignment;
- **registration** — what a specific resolver may treat the player as for a particular rule check;
- **player-facing belief** — e.g. the Drunk believing they are a Townsfolk.

Registration is a resolver concern, not destructive mutation of truth.

---

## 5. Player counts and setup composition

### 5.1 Normal Trouble Brewing players

| Normal players | Townsfolk | Outsiders | Minions | Demon |
|---:|---:|---:|---:|---:|
| 13 | 9 | 0 | 3 | 1 |
| 14 | 9 | 1 | 3 | 1 |
| 15 | 9 | 2 | 3 | 1 |

### 5.2 Sixteenth participant

At 16 participants, build a normal **15-player Trouble Brewing setup** and add one Traveller, `BUREAUCRAT` / **Pełnomocnik**, outside the normal role-count table.

Do not create a 10th Townsfolk, 4th Minion, or custom 16-player distribution.

See `13_ADR_001_TRAVELLER_BUREAUCRAT.md`.

### 5.3 Baron

If Baron is in play, increase Outsiders by 2 and decrease Townsfolk by 2. Total normal player count remains unchanged.

### 5.4 Drunk

The Drunk occupies an Outsider slot but believes they are an unused Townsfolk. Persist both:

- `trueCharacter = DRUNK`;
- `perceivedCharacter = <Townsfolk not truly in play>`.

The perceived Townsfolk ability malfunctions.

### 5.5 Fortune Teller red herring

If Fortune Teller is in play, choose exactly one valid good normal player as `redHerringPlayerId`. For Fortune Teller detection only, that player may register as the Demon.

### 5.6 Determinism

Setup generation uses a server-generated secret seed and deterministic PRNG. Persist generator version, regeneration index, final candidate, and committed setup hash. A committed setup is immutable except through audited recovery tooling.

---

## 6. Trouble Brewing character catalog

### Townsfolk
Washerwoman, Librarian, Investigator, Chef, Empath, Fortune Teller, Undertaker, Monk, Ravenkeeper, Virgin, Slayer, Soldier, Mayor.

### Outsiders
Butler, Drunk, Recluse, Saint.

### Minions
Poisoner, Spy, Scarlet Woman, Baron.

### Demon
Imp.

### Traveller for participant 16
Bureaucrat / Pełnomocnik.

Character behavior is implemented as versioned definitions + resolvers, not UI switch statements.

---

## 7. Role behavior contract

```ts
interface CharacterDefinition {
  id: CharacterId;
  category: 'TOWNSFOLK' | 'OUTSIDER' | 'MINION' | 'DEMON' | 'TRAVELLER';
  defaultAlignment: 'GOOD' | 'EVIL' | null;
  publicCharacter: boolean;
  operationalSteps: OperationalStepDefinition[];
  dayActions: DayActionDefinition[];
  triggers: TriggerDefinition[];
  registrationRules: RegistrationRule[];
  setupModifiers: SetupModifier[];
}
```

Role code must be testable independently from UI.

---

## 8. Canonical role mechanics

The following are implementation-level paraphrases of the Trouble Brewing mechanics.

### First-cycle information

- **Washerwoman:** learns a Townsfolk character and two candidate players, one validly registering as that character.
- **Librarian:** learns an Outsider character and two candidates, one validly registering as it; alternatively learns that there are no Outsiders when valid.
- **Investigator:** learns a Minion character and two candidates, one validly registering as it.
- **Chef:** learns the number of adjacent evil pairs around the Virtual Circle, applying registration rules.

### Repeating information

- **Empath:** each Operational phase learns the number of evil registrations among the nearest alive neighbours on each side in the Virtual Circle.
- **Fortune Teller:** each Operational phase chooses two players and learns whether at least one registers as the Demon for this ability, including the red herring.
- **Undertaker:** on each non-first Operational phase after an execution, learns the character the executed player registers as for Undertaker.
- **Spy:** each Operational phase can receive the Storyteller grimoire view; Spy may register as good/Townsfolk/Outsider where the rules permit.

### Protection and night death interaction

- **Monk:** each non-first Operational phase chooses another player; if functioning, that player is protected from Demon-caused death for that Operational phase.
- **Soldier:** cannot die to the Demon while functioning.
- **Mayor:** if Mayor would die during Operational, Storyteller may redirect the death to another valid player.
- **Ravenkeeper:** if Ravenkeeper dies during Operational while functioning, immediately creates a triggered private action to choose a player and learn a valid character registration.

### Investigation abilities and triggers

- **Virgin:** the first time Virgin is nominated, if the nominator validly registers as Townsfolk and Virgin functions, immediately execute the nominator through the execution pipeline; consume the once-only trigger according to canonical role semantics.
- **Slayer:** once per game during Investigation, publicly chooses a player; if the target validly registers as the Demon and Slayer functions, the target dies. Ability is spent after use.
- **Saint:** if Saint dies specifically by execution while functioning, evil wins immediately.
- **Mayor:** if exactly three relevant normal players are alive and no execution occurs during that Investigation cycle, good wins when the Investigation closes, provided Mayor functions.

### Outsider vote constraint

- **Butler:** each Operational phase chooses a living master other than self. During the following Investigation, Butler's vote is valid only while the master is also voting in the relevant vote snapshot.

### Evil actions

- **Poisoner:** each Operational phase chooses a player. Poison covers the configured Trouble Brewing window through the following Investigation and causes the target's ability to malfunction.
- **Scarlet Woman:** if the Demon dies while the alive-player threshold is met and Scarlet Woman functions, resolve Demon succession before declaring good victory.
- **Imp:** each non-first Operational phase chooses a player to attack. If Imp chooses self and dies, Storyteller selects a valid living Minion to become the new Imp.
- **Baron:** only modifies setup composition.

### Recluse and Spy registration

Recluse and Spy are not implemented by rewriting truth. Resolver-specific Storyteller choices record legal registration ambiguity and are audited.

---

## 9. Operational phase

`OPERATIONAL` is the app-managed formal resolution window corresponding to BotC night mechanics, but it need not align to literal nighttime.

During Operational:

- terrain scanning is disabled;
- nominations/voting are disabled;
- private role actions and Storyteller decisions proceed in deterministic order;
- players not required to act see a safe waiting projection.

### 9.1 Cycle numbering and occurrence

```ts
type Occurrence =
  | 'FIRST_CYCLE_ONLY'
  | 'EACH_CYCLE'
  | 'NOT_FIRST_CYCLE'
  | 'TRIGGERED';
```

### 9.2 Queue

The server builds and persists an action queue from current characters, perceived roles where necessary for Drunk, alive/dead state, ability state, active effects, cycle number and triggers.

```ts
type OperationalActionStatus =
  | 'PENDING'
  | 'WAITING_FOR_PLAYER'
  | 'WAITING_FOR_STORYTELLER'
  | 'RESOLVING'
  | 'RESOLVED'
  | 'SKIPPED';
```

Only one formal blocking queue item should be active unless a specific step is explicitly non-blocking.

### 9.3 First Operational phase

The first cycle additionally handles Minion team knowledge, Demon knowledge, Demon bluffs/not-in-play characters, first-cycle-only information roles, and Bureaucrat selection if the 16th participant exists.

Exact order lives in versioned script metadata and is snapshot-tested. UI code never owns the order.

### 9.4 Death resolution pipeline

```text
DEATH_ATTEMPT
→ determine source and target
→ evaluate ability functioning
→ evaluate immunity/protection
→ optional Storyteller redirect
→ apply death if valid
→ create triggered actions
→ resolve succession/role changes
→ emit events
→ run victory checks when legally required
```

Persist the source (`DEMON`, `EXECUTION`, `SLAYER`, `VIRGIN`, `STORYTELLER_OVERRIDE`, etc.) because downstream rules depend on it.

---

## 10. Investigation phase

`INVESTIGATION` is intentionally open-ended. The app should not artificially pace normal conversation. Players may talk, bluff, form alliances, inspect clues, move through the terrain and use allowed day abilities.

### 10.1 Terrain availability

```text
phase == INVESTIGATION
AND nominationState == CLOSED
AND game.status == ACTIVE
```

When Storyteller opens nominations, terrain interaction pauses until nominations close.

### 10.2 Nomination subprocess

```ts
type NominationState = 'CLOSED' | 'OPEN' | 'VOTING' | 'RESOLVING';
```

Storyteller opens/closes nominations. The server enforces eligibility and per-cycle nomination limits.

### 10.3 Voting

Votes use the immutable Virtual Circle. Persist both raw vote intention and effective contribution. Dead normal players have one ghost vote until consumed by a valid locked vote. Butler validity is checked against the master's vote state. Bureaucrat may change effective weight.

### 10.4 Execution candidate / ties

Track the current candidate and vote total. A later nominee must both qualify and strictly beat the current leading total to replace the candidate. A tie does not replace it. If nobody qualifies, there is no execution.

### 10.5 Closing Investigation

Storyteller closes Investigation after formal processes resolve or after explicitly ending the cycle with no execution. The engine then checks Mayor/no-execution rules, ordinary victory, and if no winner transitions to the next `OPERATIONAL` cycle.

---

## 11. Victory resolver

Victory is server-side and idempotent.

### Good

Good wins when the active Demon is dead and no valid Demon succession remains, or when a functioning Mayor satisfies the exactly-three-normal-players/no-execution condition.

### Evil

Evil wins when the normal-player living count reaches the Trouble Brewing terminal condition with a living Demon, or when a functioning Saint dies by execution.

Traveller does not inflate the normal-player living count.

### Priority

Triggered role changes resolve before generic victory. In particular, Demon death must allow Scarlet Woman succession before good victory can be finalized.

When a winner is finalized, set `ENDED`, freeze normal gameplay commands, emit exactly one `GAME_ENDED`, and store winner + reason.

---

## 12. Traveller model

Canonical MVP rules:

- public character `BUREAUCRAT` / Pełnomocnik;
- secret GOOD/EVIL alignment;
- each Operational phase chooses another player whose valid vote counts as 3 during the following Investigation;
- both raw and effective vote values are stored;
- removal is `EXILE`, not normal execution;
- no normal ghost vote;
- excluded from normal living-count victory thresholds;
- dynamic join/leave and additional Traveller types are out of MVP.

See ADR-001.

---

## 13. Scenario/Terrain boundary

Scenario Engine runs in parallel but may not alter role counts, alignment, character ability semantics, nomination rules, vote counts except through actual game roles, execution semantics, or Trouble Brewing victory conditions.

Scenario state may control QR availability, clues/tasks, map version, narrative progression and scenario-only conditions such as terrain injury. Such injury must never disable or modify a Trouble Brewing role ability.

---

## 14. Commands, events and concurrency

Every formal mutation uses a command envelope:

```ts
interface CommandEnvelope<T> {
  commandId: string;
  gameId: string;
  expectedVersion: number;
  payload: T;
}
```

Server flow:

1. authenticate;
2. authorize;
3. apply idempotency;
4. lock/read current version transactionally;
5. reject stale formal command;
6. validate rules;
7. update materialized state;
8. append domain events in the same transaction;
9. increment game version;
10. publish SSE/projection invalidation after commit.

Formal commands are never last-write-wins.

---

## 15. Storyteller authority

Storyteller may review/regenerate setup before commit, choose legal registrations, resolve poisoned/Drunk information, choose Mayor redirects and Imp succession targets where legal, open/close nominations, resolve phase transitions and perform audited recovery overrides.

Storyteller decisions are explicit commands/queue items, never transient local UI state.

---

## 16. Projection model

At minimum:

- `PublicGameProjection`
- `PlayerGameProjection`
- `StorytellerGameProjection`

Public/player DTOs contain only legally known information. Storyteller projection contains full state + audit context. Projection generation occurs server-side.

---

## 17. Realtime semantics

Use SSE for projection invalidation/realtime status. Correctness never depends on event delivery: a refetch reconstructs truth. Support cursor/Last-Event-ID semantics or equivalent. Reconnect must not re-submit already accepted commands.

---

## 18. Security requirements

- high-entropy one-time claim tokens; store only hashes;
- secure `HttpOnly` session cookies in production;
- player and Storyteller auth boundaries are distinct;
- explicit DTO allow-lists, never raw Prisma entities;
- no secret seeds/tokens/full Storyteller projections in logs;
- all endpoints enforce game membership and actor role;
- do not cache secret API responses in a shared service-worker cache.

---

## 19. Game Engine Definition of Done

Automated tests must prove:

- setup generation for 13, 14, 15 and 16 participants;
- Baron count modification;
- Drunk perceived role;
- immutable Virtual Circle after commit;
- first and recurring Operational loops;
- poison/drunk/protection/death/trigger behavior;
- Imp self-kill and succession;
- Scarlet Woman ordering;
- nominations and eligibility;
- ghost votes;
- Butler/Bureaucrat vote calculation;
- Saint/Undertaker execution semantics;
- ordinary and Mayor victory;
- Traveller exile;
- projection secrecy;
- command idempotency;
- reconnect correctness;
- restart/recovery safety.

---

## 20. Out of scope

- a new custom social-deduction ruleset;
- arbitrary BotC scripts;
- custom role balancing;
- more Demon types;
- generic Traveller framework beyond Bureaucrat needs;
- AI replacing Storyteller judgment;
- physical seating tracking;
- scenario progression deciding the Trouble Brewing winner.
