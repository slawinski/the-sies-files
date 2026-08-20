# The Sieś Files — MVP Implementation Blueprint v1

**Status:** Canonical build blueprint  
**Version:** 1.0  
**Date:** 2026-08-20

## 1. Product objective

Build a mobile-first companion PWA that makes a real-world, weekend-long game of The Sieś Files operationally practical for 13–16 participants and one human Storyteller.

The app does not replace conversation, deception, movement through the property, or Storyteller judgment. It provides the reliable digital machinery that is difficult to run manually:

- private identity/role delivery;
- stable Virtual Circle / grimoire order;
- deterministic Trouble Brewing setup;
- Operational action routing;
- secret information delivery;
- nominations, voting, ghost votes and execution;
- Traveller handling;
- authoritative victory resolution;
- QR/scenario progression and map unlock;
- Storyteller control/recovery.

## 2. Product principles

### P1 — Physical-first
The game happens around the participants, not inside the phone. Screens are glanceable and task-oriented. Avoid long mandatory flows while people socialize.

### P2 — Backend remembers rules and secrets
The client is disposable. Refreshing or changing device must not change truth.

### P3 — Human Storyteller remains in control
Automation handles deterministic legality/bookkeeping; ambiguous Trouble Brewing judgment remains an explicit Storyteller decision.

### P4 — Vertical slices over horizontal projects
Each slice ends with a demonstrable playable increment.

### P5 — Scenario is data
QRs, clues, tasks, narrative steps and map unlocks are versioned scenario definitions. The engine is not hardcoded to final prose.

### P6 — No invisible coupling
Terrain progression must not secretly alter role powers or social-deduction victory.

## 3. Personas

### Storyteller
Needs to create/restore a game, manage pre-lock roster, see full secret state, step through Operational actions, make legal discretionary choices, control nominations, inspect scenario state, and recover without DB surgery.

### Player
Needs to claim identity once, see own private role/action, know current phase, participate in formal votes, scan QRs, inspect owned clues/tasks, see the current map, and reconnect without losing identity.

## 4. Architectural shape

Use one deployable Next.js application with clear internal module boundaries:

```text
app/
  player/
  storyteller/
  api/v1/
modules/
  auth/
  game-session/
  grimoire/
  trouble-brewing/
  operational/
  investigation/
  voting/
  victory/
  traveller/
  scenario/
  projections/
  realtime/
  recovery/
  audit/
lib/
  db/
  validation/
  idempotency/
  rng/
  clock/
```

Do not create microservices for MVP.

## 5. Data strategy

Use two complementary persistence models:

1. **Materialized current state** for efficient reads and constraints.
2. **Append-only `DomainEvent` log** for audit, recovery and timeline inspection.

Every domain mutation is transactional across both representations. Use checkpoints in Slice 6 to speed recovery, not as a substitute for events.

## 6. Realtime strategy

Use SSE because the primary need is server → many-client projection refresh while client commands remain authenticated HTTP.

Clients subscribe to game-scoped events, refetch their own projection after relevant events, reconnect with cursor/Last-Event-ID, and never infer authoritative resolution from animations.

## 7. UX information architecture

### Player shell

- **Home / Case Board** — phase, required action, important personal status.
- **Role** — own perceived role/private information.
- **Investigation** — nomination/vote UI when formal mode is active.
- **Evidence** — clues/tasks already revealed to the player.
- **Map** — current scenario map version.

QR scan is a prominent contextual action rather than necessarily a permanent tab.

### Storyteller shell

- **Control** — current state, phase controls, active blocker.
- **Grimoire** — complete secret roster in immutable Virtual Circle order.
- **Operational Queue** — action/resolution workflow.
- **Investigation** — nominations, votes, execution, Traveller exile.
- **Scenario** — QR/clue/task/map state.
- **Audit / Recovery** — event log, checkpoints, health and overrides.

## 8. Six vertical slices

### Slice 1 — Session, roster, player claim, Virtual Circle
Demo result: create a game, add 13–16 people, order them, issue claim links, reconnect and see consistent role-free projections.

### Slice 2 — Trouble Brewing setup, role delivery, First Operational
Demo result: commit legal setup, privately reveal roles, run first Operational end-to-end, enter first Investigation.

### Slice 3 — Full Operational engine + Storyteller resolution queue
Demo result: repeated cycles with poison, protection, deaths, triggers, role changes and private information.

### Slice 4 — Investigation + nominations + voting + execution + victory
Demo result: complete the Trouble Brewing loop repeatedly until a valid winner is declared.

### Slice 5 — Scenario Engine: QR, clues, tasks and map unlocks
Demo result: run the physical evidence layer in parallel with Investigation, including hidden content and one map expansion.

### Slice 6 — Storyteller control plane, recovery and resilience
Demo result: finish a weekend-length game safely despite refreshes, disconnects and server restarts.

## 9. Cross-cutting technical standards

- TypeScript strict mode; no `any` in domain code.
- Zod at external boundaries.
- UTC timestamps in persistence; local formatting only in UI.
- Stable string IDs/enums for characters/events/content.
- Typed domain errors.
- No direct DB writes from page/route handlers; route → application command → domain → repository transaction.
- Formal mutations use idempotency keys.
- Domain clock/RNG/ID generation injectable for tests.
- Projection DTOs separate from persistence entities.
- WCAG AA contrast target, visible focus, tap targets >= 44×44 CSS px.
- Mobile is primary; Storyteller desktop/tablet may use wider bento grids.

## 10. Test pyramid

### Unit
Role resolvers, setup counts, registration logic, vote calculation, victory priority, scenario conditions.

### Integration
Command transaction + event append, concurrency/version conflicts, authorization/projections, queue progression, reconnect/event cursor.

### End-to-end
At minimum:

- 13-player full setup → first cycle;
- 15-player repeated Operational/Investigation loop;
- 16-player Bureaucrat vote and exile;
- Demon death → Scarlet Woman succession;
- Saint execution evil victory;
- Mayor special victory;
- map unlock after scenario event;
- server restart → recovery → continue.

## 11. Deterministic fixtures

Create development/test fixtures:

- `tb-13-basic`
- `tb-15-baron-drunk`
- `tb-15-scarlet-succession`
- `tb-16-bureaucrat`
- `scenario-map-unlock`
- `recovery-mid-operational`
- `recovery-mid-vote`

Fixtures contain no production secrets and are resettable.

## 12. Deployment expectations

- one application deployment;
- one PostgreSQL database;
- HTTPS in production;
- persistent DB storage independent of app container lifecycle;
- explicit migrations;
- app restart does not lose active state.

No Redis dependency unless measurements demonstrate a specific need.

## 13. Non-blocking content dependencies

These may be replaced after software implementation without product rework:

- final scenario prose;
- final QR artwork/print layout;
- final map illustration;
- decorative textures/icons;
- final Polish microcopy.

Code uses stable content IDs so asset replacement does not change rules logic.

## 14. Blueprint Definition of Done

Every requirement has one owning slice, cross-cutting concerns have automated checks, and the product can be built in roadmap order without a later “big bang” integration phase.
