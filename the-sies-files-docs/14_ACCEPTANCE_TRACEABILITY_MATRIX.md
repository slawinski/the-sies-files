# The Sieś Files — Acceptance Traceability Matrix v1

**Purpose:** Map canonical product/game requirements to implementation ownership and verification.  
**Use:** A feature is not complete merely because UI exists; the corresponding verification listed here must pass.

---

## 1. Core Game and Architecture

| ID | Requirement | Primary spec | Owning slice | Verification |
|---|---|---|---|---|
| GE-001 | Backend is authoritative for all formal game state | Game Engine § authority; Technical Spec | All | Integration tests cannot mutate authoritative state from client payload alone |
| GE-002 | Exactly two global phases: `OPERATIONAL`, `INVESTIGATION` | Game Engine | 2–4 | State-machine tests reject a third phase |
| GE-003 | Nominations/voting/execution are Investigation subprocesses, not phases | Game Engine | 4 | API/state tests preserve `INVESTIGATION` throughout subprocess |
| GE-004 | Virtual Circle order is app-owned and immutable after setup commit | Game Engine; Slice 1 | 1 | Reorder endpoint rejected after commit; restart preserves order |
| GE-005 | Physical seating has no game-state meaning | Game Engine | 1 | No seat/location field is used by role targeting logic |
| GE-006 | Formal actions are strongly consistent and idempotent | Technical Spec | 2–6 | Duplicate command tests produce one effect |
| GE-007 | Player secrets are filtered server-side | Technical Spec | All | Projection/security tests compare Storyteller vs player payloads |
| GE-008 | Storyteller has manual authority and recovery controls | Game Engine; Slice 6 | 6 | Recovery acceptance suite |
| GE-009 | State-changing domain operations append auditable events | Technical Spec | All | Event-log integration tests |
| GE-010 | SSE provides realtime session updates | Blueprint; Technical Spec | 1–6 | Two-client integration/e2e test |

---

## 2. Setup and Role Distribution

| ID | Requirement | Primary spec | Owning slice | Verification |
|---|---|---|---|---|
| SU-001 | 13 players: 9 Townsfolk, 0 Outsiders, 3 Minions, 1 Demon | Game Engine | 2 | Setup fixture test |
| SU-002 | 14 players: 9 Townsfolk, 1 Outsider, 3 Minions, 1 Demon | Game Engine | 2 | Setup fixture test |
| SU-003 | 15 players: 9 Townsfolk, 2 Outsiders, 3 Minions, 1 Demon | Game Engine | 2 | Setup fixture test |
| SU-004 | 16 participants: 15 normal players + Bureaucrat Traveller | ADR-001 | 2 | Setup fixture test |
| SU-005 | Baron modifies Outsider/Townsfolk composition correctly | Game Engine | 2 | Exhaustive setup tests for Baron present/absent |
| SU-006 | Drunk receives apparent Townsfolk identity while true role remains Drunk | Game Engine | 2 | Projection test + Storyteller view test |
| SU-007 | Fortune Teller red herring is selected and secret | Game Engine | 2 | Setup and projection tests |
| SU-008 | Role delivery cannot reveal another player's role | Slice 2 | 2 | Authorization/e2e tests |
| SU-009 | Setup becomes immutable once committed except explicit recovery path | Slice 2; Slice 6 | 2, 6 | Command rejection + recovery audit test |

---

## 3. Operational Phase

| ID | Requirement | Primary spec | Owning slice | Verification |
|---|---|---|---|---|
| OP-001 | First Operational has correct first-night actions and ordering | Game Engine; Slice 2 | 2 | Golden fixture for every setup size |
| OP-002 | Later Operational cycles execute only applicable actions | Game Engine; Slice 3 | 3 | Role-by-role action eligibility tests |
| OP-003 | Storyteller receives a deterministic resolution queue | Slice 3 | 3 | Queue-order unit/integration tests |
| OP-004 | Poison/drunk state affects information/action resolution rather than leaking to player | Game Engine | 3 | Scenario fixtures for poisoned/drunk roles |
| OP-005 | Demon kills are resolved through Storyteller-authoritative pipeline | Slice 3 | 3 | Kill-resolution tests including Soldier/Monk/etc. |
| OP-006 | Death-sensitive role state is preserved across cycles | Game Engine; Slice 3 | 3 | Ravenkeeper/Undertaker/etc. fixtures as applicable |
| OP-007 | Operational cannot advance while required unresolved items remain unless Storyteller overrides | Slice 3 | 3, 6 | Guard + override audit tests |

---

## 4. Investigation, Nomination, Voting, Execution

| ID | Requirement | Primary spec | Owning slice | Verification |
|---|---|---|---|---|
| IN-001 | Free social play occurs during Investigation | Game Engine | 4 | UI/state acceptance test |
| IN-002 | Nominations open/close as Investigation subprocess | Slice 4 | 4 | State-machine tests |
| IN-003 | Nomination eligibility is validated server-side | Slice 4 | 4 | Eligibility matrix tests |
| IN-004 | Voting uses Virtual Circle ordering rather than physical seating | Slice 4 | 4 | Deterministic vote-order test |
| IN-005 | Dead players' limited voting entitlement follows game rules | Game Engine; Slice 4 | 4 | Ghost-vote fixture tests |
| IN-006 | Vote tally and current execution candidate are authoritative | Slice 4 | 4 | Concurrency/integration tests |
| IN-007 | Execution is resolved at most once per Investigation | Slice 4 | 4 | Duplicate execution command test |
| IN-008 | Execution-specific abilities receive correct execution context | Game Engine; Slice 4 | 4 | Saint/Undertaker/etc. fixtures |
| IN-009 | Game victory is checked after relevant state changes | Game Engine; Slice 4 | 4 | Good/evil ending fixture suite |
| IN-010 | Terrain interaction is disabled while nominations are formally open | Game Engine; Slice 4/5 | 4, 5 | Projection/UI policy test |

---

## 5. Bureaucrat Traveller

| ID | Requirement | Primary spec | Owning slice | Verification |
|---|---|---|---|---|
| TR-001 | Bureaucrat character is public; alignment is secret | ADR-001 | 2 | Projection tests |
| TR-002 | Bureaucrat chooses another eligible player during Operational | ADR-001 | 2, 3 | Action validation tests |
| TR-003 | Chosen player's next valid vote has raw weight 1 and effective weight 3 | ADR-001 | 4 | Vote resolver fixture |
| TR-004 | Vote multiplier is server-side and auditable | ADR-001 | 4 | Tampered-client test + event assertion |
| TR-005 | Traveller exile is not execution | ADR-001 | 4 | Event/type assertion |
| TR-006 | Exile does not trigger Saint, Undertaker, or normal ghost-vote behavior | ADR-001 | 4 | Regression fixtures |
| TR-007 | Traveller is excluded from normal-player count rules where required | ADR-001 | 4 | Mayor/victory population fixtures |
| TR-008 | Other Travellers and dynamic joining/leaving are out of MVP | ADR-001 | — | Scope review; no APIs/UI for unsupported lifecycle |

---

## 6. Scenario / Terrain Layer

| ID | Requirement | Primary spec | Owning slice | Verification |
|---|---|---|---|---|
| SC-001 | Scenario engine is separate from Trouble Brewing mechanics | Game Engine; Slice 5 | 5 | Domain dependency test/review |
| SC-002 | QR scan resolves a configured scenario interaction | Slice 5 | 5 | API integration tests |
| SC-003 | Clues/tasks may be role/participant scoped without leaking hidden content | Slice 5 | 5 | Projection and authorization tests |
| SC-004 | Terrain injury/first-aid mechanics never modify BotC role logic | Slice 5 | 5 | Cross-domain regression test |
| SC-005 | Terrain is available during Investigation except while nominations are open | Game Engine; Slice 5 | 5 | Policy tests |
| SC-006 | Terrain is unavailable during Operational | Game Engine; Slice 5 | 5 | Policy tests |
| SC-007 | Scenario content is data-driven/versioned where practical | Blueprint; Technical Spec | 5 | Fixture loading/version test |
| SC-008 | Map unlock is a Scenario Engine event | Map Spec; Slice 5 | 5 | Event/projection integration test |

---

## 7. Map

| ID | Requirement | Primary spec | Owning slice | Verification |
|---|---|---|---|---|
| MP-001 | Base map contains no hint that a hidden western region exists | Map Spec | 5 / design | Visual acceptance review |
| MP-002 | Extended map reveals path, stream, woods, hermitage | Map Spec | 5 / design | Visual acceptance review |
| MP-003 | Location IDs are stable and independent of final art | Map Spec | 5 | Metadata/component test |
| MP-004 | Hidden markers are filtered server-side | Map Spec; Technical Spec | 5 | Security/projection test |
| MP-005 | Map unlock has no effect on core game phase/role state | Map Spec | 5 | Cross-domain regression test |
| MP-006 | Current uploaded map is reference-only, not production artwork | Map Spec | — | Release checklist |

---

## 8. UX / Visual System

| ID | Requirement | Primary spec | Owning slice | Verification |
|---|---|---|---|---|
| UX-001 | Product uses Rural Neo-Noir + Bento Grid design direction | Visual Design System | All UI | Design review / screenshot regression |
| UX-002 | Critical player actions remain legible in outdoor mobile use | Visual Design System | All UI | Real-device usability review |
| UX-003 | Sensitive role/action screens resist accidental shoulder-surfing | Visual Design System; Slice 2/3 | 2, 3 | UX acceptance review |
| UX-004 | Color is not the only carrier of game-state meaning | Visual Design System | All UI | Accessibility review |
| UX-005 | Touch targets meet mobile usability requirements | Visual Design System | All UI | Automated/manual accessibility check |
| UX-006 | Formal game status is visually distinct from optional scenario content | Visual Design System | 4, 5 | Design review |

---

## 9. Recovery and Operations

| ID | Requirement | Primary spec | Owning slice | Verification |
|---|---|---|---|---|
| RC-001 | Storyteller dashboard exposes authoritative session status | Slice 6 | 6 | E2E test |
| RC-002 | Storyteller can recover from interrupted/incorrect formal action without DB editing | Slice 6 | 6 | Recovery scenarios |
| RC-003 | Overrides require explicit reason and are audited | Slice 6 | 6 | Audit log test |
| RC-004 | Reconnect restores correct projection without duplicate action | Technical Spec; Slice 6 | 6 | Network interruption E2E |
| RC-005 | Process restart does not lose committed game state | Technical Spec; Slice 6 | 6 | Restart integration test |
| RC-006 | Unsupported destructive edits are not exposed as convenience controls | Slice 6 | 6 | UI/API scope review |

---

## 10. Release Gate

The MVP is eligible for a real event only when:

- [ ] Every requirement marked as MVP in the canonical specs has either an automated test or an explicit manual acceptance procedure.
- [ ] All `GE`, `SU`, `OP`, `IN`, `TR`, `SC`, `MP`, `UX`, and `RC` rows applicable to MVP pass.
- [ ] A full 13-player golden-path simulation passes.
- [ ] A full 16-participant Bureaucrat simulation passes.
- [ ] At least one recovery drill is performed from an interrupted Operational action.
- [ ] At least one recovery drill is performed from an interrupted nomination/vote.
- [ ] Player projections are manually inspected for secret leakage.
- [ ] Base-map hidden-area secrecy is visually verified on the production asset.
