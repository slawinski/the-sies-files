# The Sieś Files — Audit & Remediation Index v1

**Status:** Proposed canonical remediation plan  
**Version:** 1.0  
**Audit baseline:** `main@9099836` (`chore: Milestone 8 — release hardening automation`, 2026-08-21)  
**Repository:** `slawinski/the-sies-files`  
**Purpose:** Verify the reported implementation gaps against the current repository and define the implementation order and source-of-truth documents that close them.

---

## 1. Audit conclusion

The supplied gap list is substantially accurate.

Of the 31 reported items:

- **27 are confirmed as written.**
- **4 are confirmed with a wording/source correction**:
  - **#6:** ADR-001 explicitly prohibits **Bureaucrat** self-targeting. The current code also lacks the equivalent role-level self-target validation needed for **Butler**, but ADR-001 itself is Bureaucrat-specific.
  - **#16:** the repository clearly contains only the skeletal Slice 1 E2E file; whether Playwright browsers were *ever* installed or the tests were *ever* run cannot be proven from static source alone.
  - **#18:** there is no conventional `login` endpoint. The hardening requirement applies to the actual session-establishing/authentication surfaces: player claim, Storyteller game/session establishment, logout, and the new Storyteller recovery endpoint.
  - **#24:** `winner` and `winReason` are already persisted in `GameSession`. The defect is that the persisted terminal result is not part of the normal projection/UI contract after reload.

No supplied item was disproved.

The audit also found two directly related correctness/security defects:

- **X1 — unbounded Storyteller resolution payloads.** The Storyteller action resolution route accepts `resolution` as `z.unknown()` and casts it to `InfoResult`. For `IMP_KILL`, custom `redirectToPlayerId` and `successionPlayerId` are not validated against current-game membership and role eligibility before mutation. This turns #2 into a server-side integrity issue, not only a missing UI.
- **X2 — Operational target validation is too generic.** `submitAction` takes the first target ID and `applyChoiceEffect` writes the effect without a role-specific target contract. The missing self-target exclusion in #6 is one symptom; cardinality, same-game membership, and role-specific eligibility must be validated centrally.

These findings are addressed inside specs 18 and 19.

---

## 2. Severity model

| Priority | Meaning | Release policy |
|---|---|---|
| **P0** | Can produce a wrong game result, corrupt cross-client operation, block recovery, or violate a non-negotiable security/release requirement | Must close before a real event |
| **P1** | Production readiness, durability, content, observability, or correctness depth that is not normally hit in the happy path | Close before production event packaging unless explicitly waived |
| **P2** | Product polish / maintainability / deferred platform work | May follow the first safe event build if consciously deferred |

---

## 3. Verification matrix

| # | Reported gap | Audit status | Priority | Primary evidence in current tree | Remediation spec |
|---:|---|---|---|---|---|
| 1 | Ghost vote not granted on death | **Confirmed** | P0 | `recordDeath`; `resolveImpKill`; `Player.ghostVoteAvailable` defaults false | 18 |
| 2 | Mayor redirect & Imp star-pass not drivable from UI | **Confirmed + broader validation defect** | P0 | backend accepts IDs; Storyteller UI unwrap/submit has no selectors | 19 |
| 3 | `functioning` flag hidden from Storyteller | **Confirmed** | P0 | action `secretJson` stores `{info,functioning}`; UI unwrap discards `functioning` | 19 |
| 4 | Virgin ignores functioning / registration | **Confirmed** | P0 | nomination handler checks true character/category directly | 18 |
| 5 | Slayer ignores functioning / registration | **Confirmed** | P0 | Slayer handler checks true character directly | 18 |
| 6 | Bureaucrat / Butler self-target exclusion absent | **Confirmed with source correction** | P0 | generic target submission; ADR-001 explicitly covers Bureaucrat | 18 |
| 7 | Undertaker missing | **Confirmed** | P0 | character exists; no recurring resolver/action implementation; `DeathRecord` exists | 19 |
| 8 | Recluse / Spy registration choice flow missing | **Confirmed** | P0 | no bounded registration resolver; generic Storyteller answer override is not equivalent | 18 |
| 9 | Camera QR scanning missing | **Confirmed** | P1 | player scanner is manual token input | 23 |
| 10 | SSE not wired to clients / no health or presence | **Confirmed** | P0 | stream endpoint exists; player/ST clients do not subscribe | 21 |
| 11 | Automatic safe-boundary checkpoints missing | **Confirmed** | P0 | only explicit checkpoint create/list path | 21 |
| 12 | Event replay verification missing | **Confirmed** | P0 | recovery service validates snapshots but has no replay projector/compare path | 21 |
| 13 | Storyteller access recovery missing | **Confirmed** | P0 | env secret exists; no unauthenticated operator recovery bootstrap route | 21 |
| 14 | Virtual-Circle vote-pass UX missing | **Confirmed** | P0 | vote intents accepted freely while nomination is voting | 20 |
| 15 | Nomination lifecycle simplified | **Confirmed** | P0 | schema lacks `DAY_TRIGGER_RESOLUTION`; creation jumps to `VOTING` | 20 |
| 16 | E2E suite skeletal | **Confirmed; historical browser-run claim not statically verifiable** | P0 release gate | only `tests/e2e/slice1.spec.ts` is present | 24 |
| 17 | CSP missing | **Confirmed** | P0 | security headers omit `Content-Security-Policy` | 22 |
| 18 | Auth/session rate limiting missing | **Confirmed with endpoint correction** | P0 | claim/create/logout surfaces have no rate limiting | 22 |
| 19 | cascade delete can erase audit events | **Confirmed** | P1 | `DomainEvent.game` uses `onDelete: Cascade` | 22 |
| 20 | Production map art missing | **Confirmed** | P1 / production gate | `public/` has no production base/extended map assets | 23 |
| 21 | Scenario prose is dev fixture content | **Confirmed** | P1 / production gate | `TSF_Millionaire` explicitly labels its content development fixtures | 23 |
| 22 | Polish character names missing | **Confirmed** | P1 / production gate | character catalog contains stable IDs/category metadata only | 23 |
| 23 | i18n framework/string externalization deferred | **Confirmed** | P2 | UI copy is hard-coded; no locale layer/dependency | 23 |
| 24 | Winner transient after reload | **Confirmed with correction** | P0 polish/correctness | winner is stored on `GameSession`, absent from normal projection contract | 20 |
| 25 | 12px meta text remains | **Confirmed** | P2 | `text-xs` remains in user-facing metadata; visual spec calls for 13–14px | 24 |
| 26 | Audit timeline category filters missing | **Confirmed** | P1 | audit route returns unfiltered latest events | 21 |
| 27 | PRNG state collapses to 32 bits | **Confirmed** | P1 | seeded RNG hashes seed into `xorshift32` state | 24 |
| 28 | CommandReceipt replay uses unchecked `as T` | **Confirmed** | P1 | duplicate receipt path casts stored JSON to generic T | 22 |
| 29 | DB has no ACTIVE ⇒ phase non-null CHECK | **Confirmed** | P1 | `phase` nullable in Prisma; migrations do not add the invariant | 22 |
| 30 | Game rename unsupported | **Confirmed** | P2 | no rename command/route/UI | 20 |
| 31 | Playwright config hard-codes local DB user | **Confirmed** | P0 test/release infrastructure | hard-coded `postgresql://psla@localhost...` | 24 |

---

## 4. Canonical requirements already present but not implemented

The audit distinguishes “newly requested behavior” from behavior already promised by existing documentation.

The following gaps are already required by the current canonical docs and should therefore be treated as **implementation debt**, not feature expansion:

- Virgin functioning and registration-sensitive trigger resolution.
- Slayer functioning and Demon-registration resolution.
- Virtual-Circle voting pass.
- execution reference needed by Undertaker.
- automatic checkpoints at setup commit, phase boundaries, and game end.
- checkpoint + event replay verification.
- audit category filters.
- realtime UI health states `LIVE`, `RECONNECTING`, `OFFLINE`.
- Storyteller access recovery via an operator-held secret.
- 13/15/16-player and special-outcome E2E coverage.
- visual meta text at 13–14px.

The remediation specs below must be read as amendments/clarifications to the existing canonical documents, not replacements for them.

---

## 5. Remediation document set

1. **18_RULES_CORRECTNESS_AND_REGISTRATION_SPEC_v1.md**  
   Gaps **1, 4, 5, 6, 8** plus X2. Centralizes functioning, registration, death/ghost-vote, and target validation.

2. **19_OPERATIONAL_STORYTELLER_ROLE_UX_SPEC_v1.md**  
   Gaps **2, 3, 7** plus X1. Adds typed Storyteller resolution flows, Mayor/star-pass UI, malfunction visibility, and Undertaker.

3. **20_INVESTIGATION_VOTING_AND_SESSION_UX_SPEC_v1.md**  
   Gaps **14, 15, 24, 30**. Models nomination stages and Virtual-Circle vote pass; restores persisted winner display; adds rename.

4. **21_REALTIME_CONTROL_PLANE_AND_RECOVERY_SPEC_v1.md**  
   Gaps **10, 11, 12, 13, 26**. Wires SSE, presence/health, checkpoints, replay verification, Storyteller access recovery, audit filters.

5. **22_SECURITY_AND_DATA_DURABILITY_SPEC_v1.md**  
   Gaps **17, 18, 19, 28, 29**. CSP, rate limiting, audit retention, typed receipt replay, DB invariant.

6. **23_PRODUCTION_CONTENT_CAMERA_AND_LOCALIZATION_SPEC_v1.md**  
   Gaps **9, 20, 21, 22, 23**. Camera scanner, map assets, production scenario pack, Polish role names, typed i18n.

7. **24_RELEASE_TESTING_DETERMINISM_AND_VISUAL_QA_SPEC_v1.md**  
   Gaps **16, 25, 27, 31**. Full E2E release gate, typography sweep, deterministic RNG v2, portable Playwright DB config.

---

## 6. Implementation order

### Milestone R0 — stop game-state correctness bugs

Implement in this order:

1. shared target validation + death transition helper;
2. ghost-vote grant;
3. registration resolver and functioning gate;
4. Virgin + Slayer on those shared primitives;
5. typed Storyteller `IMP_KILL` resolution contract and eligibility validation;
6. Storyteller functioning/malfunction UI;
7. Undertaker;
8. explicit nomination trigger stage;
9. Virtual-Circle vote pass;
10. persisted winner projection.

**Exit gate:** unit/integration tests for every rule branch pass; direct API calls cannot bypass target/registration constraints.

### Milestone R1 — make a live event recoverable and observable

1. wire SSE to both clients;
2. add reconnect/health state and presence;
3. automatic checkpoint boundaries;
4. replay verifier;
5. Storyteller access recovery;
6. audit category filters.

**Exit gate:** two concurrent clients observe one another without manual refresh; restarting the app during a formal process produces either automatic recovery or a verified safe recovery path.

### Milestone R2 — security/data integrity

1. CSP;
2. auth/session/recovery rate limits;
3. runtime-validated command receipts;
4. DB `ACTIVE => phase IS NOT NULL` invariant;
5. remove cascade destruction of durable audit history.

**Exit gate:** security integration tests and migration tests pass.

### Milestone R3 — release confidence

1. portable E2E DB configuration;
2. Playwright/CI browser install and execution;
3. eight full-game E2E scenarios;
4. deterministic RNG v2 with v1 compatibility;
5. meta typography sweep.

**Exit gate:** clean-machine/CI release suite passes from an empty test database.

### Milestone R4 — production content track

This can proceed in parallel with R1–R3, but is a **production event gate**:

1. camera QR scan;
2. production base/extended maps;
3. production scenario prose/content pack;
4. approved Polish character names;
5. typed Polish string catalog and locale boundary.

**Exit gate:** no development fixture text, English-derived role label, manual QR ID entry, or schematic map fallback appears in the production build.

### Milestone R5 — non-blocking product polish

- game rename;
- any remaining i18n expansion beyond Polish;
- additional audit/filter ergonomics beyond the required category set.

---

## 7. Cross-cutting architectural rules

All remediation work must preserve these existing architectural constraints:

1. **PostgreSQL is authoritative.** SSE/presence/brokers are acceleration/UX layers, not game truth.
2. **Mutations remain version-checked and idempotent.** New commands use `commandId` + `expectedVersion`.
3. **Every material mutation appends an auditable domain event.**
4. **Player secrets never enter public/player projections for another player.**
5. **Stable character/scenario IDs remain machine-facing.** Human copy is metadata/localization, not domain identity.
6. **Virtual Circle order is the only adjacency/order source.** Physical seating is irrelevant.
7. **Recovery must not invent state.** Restore/replay must prove a known-good state before the game resumes.
8. **Do not silently reinterpret existing games after a deterministic algorithm change.** Version deterministic generators/resolvers where replay depends on them.

---

## 8. Definition of done for the remediation program

The remediation program is complete only when:

- every row in the verification matrix has a linked implementation PR/commit and passing tests;
- all P0 items have no temporary bypass in production routes;
- the eight release E2E scenarios run in CI/clean-machine setup;
- a restart/reconnect test is demonstrated;
- a checkpoint replay comparison reports no divergence on a representative completed game;
- the production content pack passes its content gate;
- the existing canonical docs index is updated to include docs 17–24;
- the audit baseline can be re-run against the new head with every item marked **closed** or explicitly **deferred with owner/rationale**.

---

## 9. Suggested documentation index entries

Append the following to `the-sies-files-docs/00_README.md`:

- `17_AUDIT_AND_REMEDIATION_INDEX_v1.md`
- `18_RULES_CORRECTNESS_AND_REGISTRATION_SPEC_v1.md`
- `19_OPERATIONAL_STORYTELLER_ROLE_UX_SPEC_v1.md`
- `20_INVESTIGATION_VOTING_AND_SESSION_UX_SPEC_v1.md`
- `21_REALTIME_CONTROL_PLANE_AND_RECOVERY_SPEC_v1.md`
- `22_SECURITY_AND_DATA_DURABILITY_SPEC_v1.md`
- `23_PRODUCTION_CONTENT_CAMERA_AND_LOCALIZATION_SPEC_v1.md`
- `24_RELEASE_TESTING_DETERMINISM_AND_VISUAL_QA_SPEC_v1.md`
