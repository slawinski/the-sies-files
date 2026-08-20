# The Sieś Files — LLM Implementation Handoff v1

**Audience:** Autonomous or semi-autonomous coding agents / LLM-based implementation workflows  
**Goal:** Allow implementation from repository documentation without requiring new product decisions from the owner.

---

## 1. Mission

Build the MVP described in this documentation as a reliable, mobile-first companion PWA for an in-person social-deduction game.

The application is not the storyteller. It is the authoritative digital grimoire, workflow engine, private player channel, voting system, terrain/scenario companion, and recovery surface used by a human Storyteller.

When documentation is explicit, implement it. Do not replace product decisions with your own interpretation simply because another architecture would be more generic or more familiar.

---

## 2. Required Reading Order

Before changing code, read in this order:

1. `00_README.md`
2. `01_GAME_ENGINE_SPECIFICATION_v1.md`
3. `13_ADR_001_TRAVELLER_BUREAUCRAT.md`
4. `03_MVP_TECHNICAL_SPECIFICATION_v1.md`
5. `02_MVP_IMPLEMENTATION_BLUEPRINT_v1.md`
6. the active slice specification (`04` through `09`)
7. `11_VISUAL_DESIGN_SYSTEM.md` for any UI work
8. `12_MAP_ASSET_SPECIFICATION.md` for map/terrain work
9. `14_ACCEPTANCE_TRACEABILITY_MATRIX.md` before declaring a slice complete
10. `10_IMPLEMENTATION_ROADMAP.md` for sequencing

---

## 3. Source-of-Truth Precedence

If two documents appear to conflict, use this precedence:

1. explicit ADR for the disputed decision,
2. Game Engine Specification,
3. MVP Technical Specification,
4. slice specification,
5. MVP Implementation Blueprint,
6. Visual/Map specifications,
7. roadmap/README explanatory text.

If a genuine contradiction remains after applying this order, stop and record it as a documentation issue rather than silently inventing a behavior.

---

## 4. Implementation Philosophy

### 4.1 Spec-driven, vertical, testable

Implement one vertical slice at a time. Each slice must leave the repository in a runnable state and prove its behavior through tests.

Do not build speculative abstractions for future scripts, future scenarios, or arbitrary game engines before the current slice needs them.

### 4.2 Conventional over clever

Prefer the smallest conventional architecture that satisfies the specs:

- Next.js application,
- strict TypeScript,
- PostgreSQL,
- Prisma,
- Zod at boundaries,
- server-side domain services/commands,
- append-only event audit plus materialized current state,
- SSE for server-to-client realtime,
- Vitest for unit/integration tests,
- Playwright for critical multi-client flows.

Do not introduce microservices, Kafka, CQRS infrastructure products, GraphQL, WebSockets, Redis, or a generic rules DSL unless an explicit documented requirement makes them necessary.

---

## 5. Domain Boundaries

Keep these domains conceptually separate even if they live in one application/repository:

```text
Session / Identity
Game Engine
Operational Actions
Investigation / Voting / Execution
Scenario / Terrain
Storyteller Control Plane
Read Projections / Realtime
```

The most important boundary is:

> Scenario mechanics may react to core game state but must not silently modify Trouble Brewing rules.

For example, a QR-based injury status can change scenario UX but cannot make a player mechanically drunk, poisoned, dead, unable to nominate, or otherwise alter BotC state unless the Game Engine specification explicitly defines such an effect.

---

## 6. Command Rule

Every authoritative state mutation should follow this shape:

```text
request
 -> authentication / participant resolution
 -> schema validation
 -> authorization
 -> load authoritative aggregate/state
 -> validate domain preconditions
 -> execute command in transaction
 -> append event(s)
 -> update materialized state
 -> commit
 -> publish realtime invalidation/update
 -> return sanitized projection
```

Never trust the client to calculate:

- eligibility,
- role effects,
- vote weight,
- current execution candidate,
- death validity,
- victory,
- secret information visibility,
- map marker visibility.

---

## 7. Projection Rule

Assume every response can leak information unless explicitly filtered.

Do not fetch a full Storyteller object and hide fields in React. Build server-side projections appropriate to the viewer:

- public/session projection,
- current player's private projection,
- Storyteller projection.

Tests should assert the **absence** of secret fields as well as the presence of permitted fields.

---

## 8. Event and Recovery Rule

The event log is not optional decoration. It supports:

- auditability,
- debugging,
- Storyteller recovery,
- deterministic reconstruction of important decisions.

Every manual override must capture enough context to answer:

- who performed it,
- what changed,
- why,
- previous relevant value,
- resulting value,
- timestamp/order.

Do not implement recovery by asking operators to edit PostgreSQL manually.

---

## 9. Testing Rule

A slice is not done when screens render.

For every acceptance criterion:

1. identify the domain invariant,
2. add unit tests for pure rules,
3. add integration tests for transactional commands/projections,
4. add Playwright only for flows where multiple viewers, realtime, secrecy, or interaction sequencing matters.

Maintain deterministic fixtures for 13, 14, 15, and 16 participants.

At minimum, keep two end-to-end golden games:

- one representative 13-player session,
- one 16-participant session with Bureaucrat.

---

## 10. Slice Execution Protocol

For each slice:

```text
A. Read active slice + referenced canonical sections.
B. List required domain types and invariants.
C. Add/adjust database schema only for current needs.
D. Implement pure domain behavior first.
E. Implement transactional application commands.
F. Implement projections/API.
G. Implement minimal UI to exercise the feature.
H. Add realtime where specified.
I. Add automated tests mapped to acceptance criteria.
J. Run migrations, lint, typecheck, unit/integration/e2e tests.
K. Update documentation only if implementation uncovered a real ambiguity.
L. Do not start the next slice until current acceptance criteria pass.
```

---

## 11. UI Implementation Rules

All product UI must follow `11_VISUAL_DESIGN_SYSTEM.md`.

Non-negotiable direction:

> **Rural Neo-Noir + Bento Grid**

Use it as a design system, not as decorative wallpaper.

Priorities:

1. game-state clarity,
2. privacy of secret information,
3. outdoor readability,
4. one-handed mobile operation,
5. atmospheric identity.

Do not trade away clarity for texture, darkness, animation, or novelty.

For role reveal / secret choices, intentionally reduce accidental exposure. Do not place the full secret role in persistent navigation or push-style public UI.

---

## 12. Map Implementation Rules

Read `12_MAP_ASSET_SPECIFICATION.md` before implementing terrain UI.

The current `assets/map-reference.png` is not final production art.

Architecture must therefore make artwork replaceable:

- stable logical location IDs,
- normalized coordinates/metadata outside React layout code,
- separate base and extended map state,
- scenario-controlled visibility.

**Never** fake the hidden-area requirement with CSS fog over an already delivered extended map. If the user is not authorized to know an area/marker exists, do not send that hidden data in the normal player projection.

---

## 13. Explicit Non-Goals / Do Not Invent

Unless a later ADR changes scope, do **not** add any of the following to MVP:

- a third global phase such as `NOMINATION`, `COUNCIL`, or `MEETING`,
- game logic based on real physical seating,
- arbitrary reordering of Virtual Circle after setup commit,
- a custom 16-normal-player Trouble Brewing distribution,
- Travellers other than Bureaucrat,
- arbitrary Traveller join/leave lifecycle,
- AI-generated Storyteller decisions,
- automatic Storyteller replacement,
- generic scripting language for role abilities,
- scenario effects that rewrite core BotC mechanics,
- map fog that hints at the hidden western area,
- countdown timers that force real-world play to accelerate,
- mandatory always-online client behavior for merely viewing already cached public UI,
- client-authoritative votes/actions,
- microservice decomposition,
- premature support for multiple scripts beyond what the data model can cheaply accommodate.

---

## 14. Handling Unspecified Narrative Content

The game engine and scenario platform must be implementable even if final clue wording, QR placement, or final map artwork changes late.

Represent narrative material as content/configuration where practical:

- clue copy,
- task copy,
- QR token mapping,
- location labels,
- scenario unlock conditions that fit the documented MVP model.

Do not hard-code prose into domain-rule files.

If a final clue sequence is not specified, create development fixtures clearly labeled as non-production rather than inventing canonical story content.

---

## 15. Repository Hygiene

Recommended conventions:

- keep domain code independent of UI framework where practical,
- no `any` in authoritative domain code,
- validate all external payloads with Zod,
- use transactions around state mutation + event append,
- use explicit enums/discriminated unions for phases/statuses,
- avoid magic strings for role/location/event IDs,
- keep migrations committed and reproducible,
- seed only deterministic development fixtures,
- never commit real access tokens/QR secrets,
- preserve a short ADR when changing a canonical design decision.

---

## 16. Definition of Done for the Whole MVP

The implementation is complete when:

- all six slices are accepted in order,
- the traceability matrix release gate passes,
- a Storyteller can create and run a full session without database intervention,
- every player sees only authorized information,
- 13–16 participant setup works exactly as specified,
- Operational and Investigation loops can repeat until a valid victory,
- nominations/voting/execution work through the Virtual Circle,
- the Bureaucrat works correctly in 16-person games,
- scenario QR/clue/task/map progression works without contaminating core game rules,
- Storyteller recovery handles realistic mistakes and reconnects,
- the app is usable as a mobile PWA in the intended rural/outdoor context,
- final visual assets can be swapped in without rewriting game logic.

At that point, further work should be treated as post-MVP product development rather than unfinished foundational implementation.
