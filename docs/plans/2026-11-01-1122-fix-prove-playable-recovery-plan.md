---
title: Prove Playable Recovery - Plan
type: fix
date: 2026-11-01
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
origin: docs/ideation/2026-10-28-legacy-app-reinforcement-ideation.html
execution: code
---

# Prove Playable Recovery - Plan

## Goal Capsule

- **Objective:** A maintainer can demonstrate that an interrupted synthetic game remains playable after database restoration and can tell exactly what the recovery evidence establishes.
- **Means:** A same-build, mid-vote restore-and-continue drill plus bounded replay diagnostics (KTD1–KTD4).
- **Authority:** Requirements below govern behavior; technical decisions govern mechanisms; units implement both. Origin idea #3 supplies the motivation. Ideas #1 and #2 are completed foundations, not new work here.
- **Execution profile:** Local and CI disposable PostgreSQL resources only. Implement, review, verify, and submit the resulting PR through the surrounding delivery workflow.
- **Stop conditions:** Stop on unsafe resource ownership, source/build mismatch, a failed required check, or evidence that a settled decision cannot work. Report the failure and its cause; do not substitute weaker proof.
- **Delivery owner:** The implementing maintainer or agent completes U1–U4 and the verification contract; the calling delivery workflow owns publication.

---

## Product Contract

### Summary

Demonstrate physical restoration into a different owned database and continuation in a fresh application process. Keep checkpoint integrity, bounded event replay, restored state comparisons, and playable continuation as separately named claims.

### Problem Frame

The current restore script counts tables without asserting meaningful recovery. E2E-08 checks a running app's consistency and replay endpoint, but its comment claims a physical restart that CI does not perform. A successor maintainer cannot use either result as evidence that an interrupted game can continue.

Replay currently compares only player alive and ghost-vote flags after selected events. It does not validate the checkpoint checksum, skips missing players, and consumes a recovery-override shape that its producer does not emit. A green result therefore hides both coverage limits and concrete diagnostic defects.

### Requirements

**Playable recovery**

- R1. Exercise one deterministic, source-bound synthetic game paused during a running voting pass, restore its database into a different disposable database, and continue from a new app process using the same production build.
- R2. Reuse the persisted Storyteller and player sessions, compare authorized public/Storyteller/player projections, and verify named durable state families before completing the next legal vote intent.
- R3. Retry exactly one previously committed vote command with its original actor, command ID, payload, and expected version; it must return its original outcome without adding a vote, receipt, event, version increment, or voting-pass advance.

**Honest diagnostics**

- R4. Replay must validate snapshot integrity and supported shape, player membership, event sequence bounds, and version anchors before reporting success for its declared alive/ghost-vote scope.
- R5. Newly emitted recovery overrides must identify the audited entity and replay their validated before/after values; legacy overrides without identity and unsupported or malformed replay inputs must produce explicit unverified reasons rather than silent success.
- R6. Diagnostic responses must preserve existing response fields, add explicit scope/coverage metadata, and distinguish failed comparison from incomplete verification without claiming whole-game reconstruction.

**Operations and regression evidence**

- R7. The drill must create and own both databases and app processes, refuse existing targets and unrelated processes, and clean up only resources it created.
- R8. Canonical CI must execute the actual restore-and-continue drill, retain sanitized success/failure evidence, and fail for corrupt dumps or incomplete continuation.
- R9. Supply a runbook a second maintainer can follow, naming prerequisites, invocation, interpretation, failure recovery, cleanup, and untested guarantees.
- R10. Preserve game rules, existing authentication and projection secrecy, the item #2 freshness behavior, and the full existing release suite; explain every failed check without allowlists or weakened assertions.

### Key Decisions

- **Explain every failure.** (session-settled: user-directed — chosen over fixing every unrelated bug or merely recording unstable results: retained failures need an explanation without weakening checks.) Governs R10.

### Acceptance Examples

- AE1. **Covers R1–R3.** Given seat 0 has voted and seat 1 is pending, restoration preserves that obligation and both actors' sessions. Retrying seat 0's original command changes nothing; seat 1's new intent advances to seat 2 exactly once.
- AE2. **Covers R4–R6.** A valid checkpoint followed by a legacy identity-less player override returns `ok: false` with an unverified reason, even when current flags happen to match.
- AE3. **Covers R7–R8.** An existing target database is left untouched and the drill exits nonzero. A truncated dump or missing continuation result never produces a playable-recovery pass.

### Scope Boundaries

This is evidence for one interrupted synthetic game on the recorded build/schema/PostgreSQL version. It is not a production backup service or a claim about production RPO/RTO, arbitrary histories, cross-release upgrades, rollback compatibility, or every unfinished game state.

No production/deployment inspection, credential bundle, capsule subsystem, event-sourcing rewrite, or new database platform belongs in this work. A generic restart service and automatic command retries were considered and excluded: the owned drill and one deliberate duplicate request cover the required evidence without adding application recovery behavior.

#### Deferred to Follow-Up Work

Hostile-viewer/revocation/proxy exploration belongs to ranked idea #4. General durable receipt codecs and cross-release retry compatibility belong to #5. Content/legal provenance and retention belong to #6/#7. Expand recovery specimens only when a distinct unfinished state warrants its own proof.

---

## Planning Contract

### Assumptions

These are technical defaults inferred for this non-interactive plan, not user-settled architecture choices:

- Use a small native Node/TypeScript orchestrator with the existing PostgreSQL lease and Playwright stack. No competing mechanism remains that needs a bake-off: the existing lease/production baseline provides the necessary ownership seam, while a new platform adds no required evidence.
- Keep the app URL on the existing loopback port 3100 across the restart so in-memory browser cookie jars remain valid. Run the drill serially after the baseline browser server has exited.
- Use the existing deterministic 13-player seed, inspect its assignments, and choose a nomination without an unresolved day-trigger decision. Fixture preparation must assert this prerequisite rather than bypass game rules.
- Exercise nonempty scenario evidence with the existing letter QR before the pause; the base map remains locked for the annex. This tests reconstructed clue visibility and a protected-layer denial without broadening into a scenario progression suite.

### Key Technical Decisions

- KTD1. **Separate the drill from ordinary E2E server ownership.** Add `scripts/playable-recovery.mts` and a dedicated `playwright.recovery.config.ts` with no automatic web server or reset setup. One recovery spec calls the orchestrator's owned lifecycle helpers. The CLI runs that config as the single public entry; the normal config excludes the new spec. The parent CLI owns leases, successful database creation records and app child handles; the worker requests bounded lifecycle transitions over private parent/child IPC. Worker timeout or exit still leaves the parent able to stop its apps and clean its databases. This prevents the existing global setup from deleting a restored database and prevents Playwright from substituting a different server. Governs R1, R7–R8.
- KTD2. **Create-only database lifecycle.** Reuse `resolveTarget` connection validation and `acquireLease`, but never use the destructive `resetDatabase` path for drill resources. Derive unpredictable short source/target names ending `_test` from an explicitly supplied local test connection, lease them, and create each from `template0`. Record successful creation before enabling cleanup; a create collision is an error, never grounds to drop a database. Migrate only the new source. Stop and await the source app's owned process group before custom-format dump; restore into the new empty target with exit-on-error and no ownership/ACL replay. Do not use restore `--clean` or archive-directed database creation. PostgreSQL 16's documented empty-target restore supports this boundary. Governs R7.
- KTD3. **Compare reconstructed runtime views and durable rows, not table counts.** At the pause, stop client polling and capture projections plus an explicit per-family canonical database comparison while quiescent. Preserve IDs; sort unordered collections by stable identifiers and normalize only documented transport volatility. After restore, require identical durable rows before target requests, then re-fetch projections through the fresh process with the same cookie jars. Do not remove version, role, obligation, result, or scenario fields to make comparisons pass. The continuation oracle below checks command effects separately. Governs R1–R3.
- KTD4. **Version the bounded replay report, not the whole event store.** Increment `REPLAY_VERSION` to 2 and retain `ok`, checkpoint/sequence fields, and divergences. Add `scope: PLAYER_FLAGS`, target game version/event sequence, and `coverage` with `checked`, `notChecked`, `complete`, and structured `unverifiedReasons` carrying code and optional event sequence. `ok` means no divergence AND complete verification of the declared scope; `notChecked` names other families and does not alone force `ok: false`. Unknown event types, unsupported membership transitions, ambiguous legacy player overrides, or malformed supported payloads do force incomplete scope and `ok: false`. Known events may be ignored only through an explicit classification that states why they cannot change the two flags. Governs R4–R6.
- KTD5. **Read diagnostics from one database snapshot and checkpoint through the command transaction.** Use `tx` for manual checkpoint construction under the existing authoritative game lock. Read checkpoint, target game, replay range, and current players in one repeatable-read transaction. Validate checksum before interpreting JSON. Validate unique typed player IDs/flags, same-game identity, exact bidirectional membership, nonnegative bounds, contiguous sequences through the captured target, nondecreasing bounded event versions, and the current latest-event/version anchor. Multiple events per command/version are legal. Snapshot game counters are captured before command commit: manual checkpoints store a pre-checkpoint sequence while automatic ones include their appended checkpoint event; do not assume either equals snapshot game counters. Validate the checkpoint's event/version anchor using its existing boundary convention and add tests for both. No migration is required. Governs R4.
- KTD6. **Fix the producer/consumer contract additively.** New `RECOVERY_OVERRIDE_APPLIED` payloads retain kind/reason/before/after and add `playerId` or `actionId` from the validated entity. For player overrides, parse the relevant boolean in before/after, verify the prior value, then apply after; missing entities or inconsistent before-values are explicit diagnostics. Action overrides are classified outside player-flag replay. Historical identity-less player overrides remain unverified; do not infer identity from final state or rewrite history. Governs R5.
- KTD7. **Keep machine evidence small and credential-free.** The report records stages, UTC times, source fingerprint, lock/schema/migration hashes, production build ID, actual Node/browser/PostgreSQL server and dump/restore client versions, separate claim results, comparison failures, and cleanup outcomes. Build once in the source-bound baseline workspace and use that same build for both app starts. Keep cookies in the live test runner only. Create dumps in a private temporary directory, never upload dumps/session state/raw DB exports, and delete them in cleanup. Redact connection errors and subprocess output before CI upload; never print connection URLs or environment maps. A cleanup failure preserves the original failure and makes the run nonzero. Governs R7–R9.
- KTD8. **Hand off the port lease explicitly and preserve profile meaning.** The baseline currently holds its database and port leases until the entire run finishes. After awaiting its normal browser server's exit, release only its port lease through a token-checked helper while retaining its database lease; the recovery parent then acquires its own port lease. Final cleanup tolerates the intentionally released port without dropping ownership checks on the database. Require the physical drill in the production profile. The development profile removes production output before starting its dev server, so it retains its original gates and labels the physical production drill not applicable rather than attempting to serve missing output. Standalone recovery builds once under its owned port lease and fingerprints that build; canonical production recovery consumes the already recorded build and refuses mismatch. Governs R1, R7–R8, R10.

### High-Level Technical Design

**Process and data ownership:** the CLI launches one recovery Playwright worker and retains the resource ownership described in KTD1. Playwright contexts own synthetic session cookies. The worker queries each database using a client bound explicitly to that target, disconnects both clients before database cleanup, and sends no cookies or raw row exports to the parent. IPC exposes only the finite drill transitions to the spawned child, not a listening network service. No app endpoint for lifecycle control is added.

| Stage | Input and output | Failure boundary |
|---|---|---|
| Create source | Explicit loopback connection → unique leased source → migrations | Never adopt or delete a preexisting database |
| Prepare | Source app + fixture → mid-vote projections, row oracle, original command envelope | Illegal/ambiguous setup fails before dump |
| Quiesce and dump | Await source exit → private archive | Still-live source or dump failure blocks restore |
| Restore | Archive → different newly created leased target | Restore errors block app launch |
| Rehydrate | New app PID + same build + restored target → matching views | Readiness alone is not evidence of recovery |
| Continue | Original duplicate + next actor's legal vote → exact delta oracle | Missing/extra effects fail playable continuation |
| Finish | Sanitized report + owned cleanup | No overall pass until cleanup completes |

**Lifecycle:** unallocated → leased → created → serving source → source stopped → dumped → restored target → serving target → verified → cleaned. Every error enters cleanup from the current state. Cleanup handles only recorded created resources and child handles; ownership loss prohibits destructive action and is reported. A later run never steals a stale lease or kills a listener by port.

**Diagnostic response shape:** checkpoint integrity and input eligibility feed the declared player-flag comparison; scope completeness and divergences jointly determine `ok`. The restore report has separate results for archive restoration, row equality, runtime projection reconstruction, deliberate retry, and next-action continuation. Neither report upgrades the other's claim.

### Evidence and Coverage Boundaries

| Named family | Bounded replay v2 | Restore drill claim |
|---|---|---|
| Checkpoint integrity | Checksum, supported shape, boundary/target anchors | Restored checkpoint rows/checksums match |
| Players and ghost votes | Membership and supported alive/ghost events | Roster/flags match before continuation |
| Phase and pending obligations | Not reconstructed | Session phase/cycle, investigation, nomination/pass status/current seat and votes match; next obligation is executable |
| Roles and secrecy | Not reconstructed | Setup/secret rows and each actor's allowed role view match; public/other-player views do not acquire hidden role fields |
| Operational decisions/effects/deaths | Not reconstructed | Persisted rows and delivered information match for this completed first-cycle specimen; no unfinished operational-decision continuation claim |
| Scenario/map | Not reconstructed | Scenario, discovery, task, condition and scan rows match; letter visibility, base-map DTO/assets and locked WEST_AREA denial match |
| Commands/events/access | Only event continuity/version anchors | Receipt/event rows and session records survive; one prior vote retry is effect-free |
| Presence/rate limits | Not checked | Not a recovery correctness claim; transport/presence is re-established, not compared as durable gameplay truth |
| Other states/builds/topologies | Not checked | Explicitly untested, including unfinished registration decisions, later-night succession, other scenario stages, expired sessions and deployed recovery |

### Source Trace and System-Wide Impact

Single-pass source trace: the vote route resolves the player and origin, then `voteIntent` enters `runCommand`, locks the game, checks the receipt before expected-version validation, checks the current seat, upserts the vote, emits intent plus pass-advance events, and commits one version and receipt. Thus a genuine seat-0 retry must succeed despite a now-stale expected version, and seat-1 continuation must produce one version increment and exactly two events in this specimen. Authentication still runs before duplicate handling.

Manual checkpoints currently call `buildSnapshot(prisma)` outside that lock's transaction; automatic checkpoints already receive a transaction client. Replay currently performs separate reads and silently skips unknown player references. The Storyteller replay route is authenticated and origin-checked; those checks remain intact. `SystemView` renders ordinary consistency checks, not replay results, so do not add a replay UI or imply that its existing “Spójność OK” is playable-recovery evidence. Correct the replay-route and E2E-08 comments and document that distinction in the runbook.

The normal baseline inventories every discovered browser result and runs with zero retries. Recovery must be a separately discovered/result-reported stage in the production baseline, not a spec silently omitted from its evidence. A failed baseline browser stage need not prevent an independent recovery attempt when build and isolation prerequisites passed, but overall release success still requires every applicable gate. KTD8 governs the port handoff and development-profile exclusion.

### Risks and Dependencies

- PostgreSQL 16 client tools and server, create/drop-database privileges on the dedicated loopback instance, Chromium, and a source-bound production build are runtime prerequisites. Validate tool versions before allocation and report actual versions. Unsupported major versions fail preflight rather than changing the evidence claim.
- Existing leases serialize cooperative runners; create-only database creation prevents a naming collision from destroying an unrelated target. Ownership must be checked again at cleanup. Do not expand this into a general multi-host resource manager.
- Current Context7 Prisma results describe a newer ORM API, not this repo's Prisma 6 client. Do not adopt those API examples or upgrade Prisma. The installed generated client supports interactive `$transaction` isolation options; use its `RepeatableRead` option and existing transaction-client pattern.
- Runtime timeouts, ports, and fixture legality must be established during implementation. A failure is evidence to diagnose, not a reason to skip a vote or relax equality. No tests, application starts, or database commands were run during planning.

### Sources and Research

- Origin idea #3 and its recovery-coverage/runbook rationale: `docs/ideation/2026-10-28-legacy-app-reinforcement-ideation.html`.
- Checkpoint construction, replay and override payloads: `src/modules/recovery/recovery.service.ts`; existing regressions: `tests/r1.test.ts`, `tests/r2.test.ts`.
- Voting effects and transactional retry order: `src/modules/investigation/investigation.service.ts`, `src/lib/command.ts`, and the vote-intent route under `src/app/api/v1/games/[gameId]/nominations/[nominationId]/votes/intent/route.ts`.
- Read-side projection allowlists: `src/modules/projections/load.ts`, `src/modules/projections/projections.ts`; deterministic fixture/scenario patterns: `tests/e2e/fixtures.ts`, `tests/e2e/e2e-07-map-unlock.spec.ts`.
- Resource and evidence patterns: `scripts/test-database.mts`, `scripts/regression-baseline.mts`, `playwright.config.ts`, `.github/workflows/ci.yml`; stored constraints: `prisma/schema.prisma`, `prisma/migrations/20260821220000_r2_security_durability/migration.sql`.
- PostgreSQL 16 [pg_restore](https://www.postgresql.org/docs/16/app-pgrestore.html) and [pg_dump](https://www.postgresql.org/docs/16/app-pgdump.html): empty target, custom archive, explicit failure handling and restore-time ownership options shape KTD2.
- Playwright [web-server ownership](https://playwright.dev/docs/test-webserver): default server reuse/shutdown behavior motivates the separate externally orchestrated server lifecycle in KTD1.

---

## Implementation Units

### U1. Make checkpoint and replay diagnostics truthful

**Goal:** Implement the bounded diagnostic contract and fix the concrete override/checkpoint defects.

**Requirements:** R4–R6, R10; AE2. **Dependencies:** None.

**Files:** Modify `src/modules/recovery/recovery.service.ts`, `src/app/api/v1/games/[gameId]/storyteller/consistency/replay/route.ts`, `tests/r1.test.ts`, and `tests/e2e/e2e-08-restart-recovery.spec.ts`; add `tests/recovery-diagnostics.test.ts`.

**Approach:**
1. Add characterization cases for the current false-green and producer/consumer mismatch before changing the verifier.
2. Apply KTD4–KTD6, retaining the existing endpoint authorization and response fields.
3. Correct E2E-08's claim to in-process consistency/bounded replay and assert the new declared scope.

**Patterns to follow:** Existing canonical checksum, `autoCheckpoint` transaction-client use, `runCommand` lock semantics, and database-backed r1 tests.

**Test scenarios:**
1. Valid manual and automatic checkpoints, including no subsequent gameplay events, return scoped success with exact target counters.
2. Checksum tampering, malformed player flags, duplicate player IDs, wrong-game snapshot identity, missing/extra current players, and unknown event player references never return success.
3. A deleted tail event, internal sequence gap, future checkpoint bound, decreasing/out-of-range event version, or target-version mismatch produces a specific diagnostic.
4. New alive and ghost-vote overrides emit correct entity IDs and replay valid before/after values; bad before-values and legacy identity-less overrides return explicit incomplete coverage.
5. A future unknown event prevents scoped success; known vote/scenario events are explicitly outside flag effects and leave the other families listed as not checked.
6. Concurrent authoritative mutation and diagnostic reads produce one coherent target snapshot; manual checkpoint construction uses the locked transaction rather than a global client.
7. Existing death-divergence tests still detect altered alive state, and the authenticated route retains its existing unauthorized/wrong-game behavior.

**Verification:** Diagnostics distinguish integrity failure, divergence and incomplete verification, while valid r1/r2 histories retain their narrow passing meaning.

### U2. Add the owned restore lifecycle and fail-closed entry point

**Goal:** Make local restore execution safe, create-only, and observable.

**Requirements:** R1, R7–R8; AE3. **Dependencies:** None.

**Files:** Add `scripts/playable-recovery.mts` and `tests/playable-recovery-tooling.test.ts`; modify `scripts/test-database.mts` only for reusable create-only/process-ownership primitives, `scripts/backup-restore.sh`, and `package.json`; extend `tests/test-database-tooling.test.ts` when shared behavior changes.

**Approach:**
1. Implement KTD1/KTD2/KTD7 with parent-owned creation and process handles, bounded readiness/exit waits, and final cleanup even after worker failure.
2. Replace the old positional/default destructive shell implementation with a thin entry to the explicit disposable drill. Reject legacy arguments rather than interpreting them as authorization to dump or delete an existing database.
3. Expose `npm run recovery:prove` as the orchestrator entry. Its report names archive restoration separately from playable continuation; it cannot finish green until the spec supplies every required result.

**Patterns to follow:** `resolveTarget`, `acquireLease`, port probing and bounded stage reports in the baseline tooling. Preserve existing reset consumers.

**Test scenarios:**
1. Missing, remote, non-test, ambiguous, query-overridden or credential-bearing invalid input is refused before subprocess creation, without echoing sensitive input.
2. A database creation collision, occupied port, or conflicting lease leaves the existing resource untouched.
3. An injected failure at dump, restore, launch, readiness, continuation or cleanup produces nonzero exit and names the original stage; later stages are blocked where prerequisites failed.
4. Interrupts stop only recorded child groups, delete only successfully created owned databases/private dump files, and release leases after termination.
5. Truncated/invalid archive and incomplete or missing worker result cannot yield an overall pass.
6. Sanitized reports/logs exclude URL passwords, session cookies, environment contents and dump bytes, including subprocess error paths.
7. A forcibly terminated Playwright worker leaves the parent able to stop its recorded app groups and remove its created databases; ownership loss is reported instead of bypassed.

**Verification:** Tooling tests prove destructive operations are gated by successful creation and ownership; the real lifecycle is exercised in U3 rather than inferred from mocks.

### U3. Prove rehydration and legal continuation in a fresh process

**Goal:** Deliver the physical drill with substantive runtime and persisted-state assertions.

**Requirements:** R1–R3, R7–R8, R10; AE1, AE3. **Dependencies:** U1, U2.

**Files:** Add `playwright.recovery.config.ts`, `tests/e2e/e2e-11-playable-recovery.spec.ts`, and `tests/e2e/recovery-fixtures.ts`; modify `playwright.config.ts` to exclude only the new separately run spec. Reuse `tests/e2e/fixtures.ts` with minimal changes if needed.

**Approach:**
1. Prepare the assumed deterministic fixture through real API commands and existing authenticated contexts, acknowledge roles for the players whose pages will be inspected, scan the letter, open a legal nomination, start voting, and record seat 0's successful true intent and its exact command envelope.
2. Capture the KTD3 oracle for all named game-owned rows: session, roster, claims/browser sessions, secrets/setup draft, operational phases/actions, effects/death records, investigation/nominations/votes, scenario/discoveries/tasks/conditions/scans, checkpoints, events and receipts. Keep sensitive rows in memory and compare directly, not in uploaded exports.
3. Exercise the owned stop/dump/restore/new-process lifecycle. Assert old process exit, distinct new PID, different source/target DB identities, and unchanged build/schema/source identities. Compare rows before target requests and then all authorized projections and map responses.
4. Apply the duplicate and continuation oracle below, load the restored player/Storyteller pages with persisted sessions, and assert pending-seat/intent visibility plus the existing reconciled LIVE behavior without adding production hooks.

**Continuation oracle:** At the restored pause, version/event sequence equal the source. Replaying seat 0's envelope returns its original response version, with full game version/sequence, votes, receipts and pass seat unchanged. Seat 1 then submits a new false intent at the restored current version. Require one added receipt, one added vote with the expected actor/intent, one version increment, exactly `VOTE_INTENT_RECORDED` plus `VOTE_PASS_ADVANCED`, and pending seat 2. Existing votes, hidden roles, scenario state and unrelated rows remain unchanged. Permit only the game session's expected version/eventSequence/updatedAt change, the nomination's currentVirtualSeat change, and the new vote/events/receipt; do not invent nomination or browser-session timestamp updates. Do not retry either request automatically.

**Test scenarios:**
1. Covers AE1. Real dump/restore completes all row/projection comparisons, retains sessions, returns the effect-free prior result and applies the next legal vote exactly once.
2. The public projection has no secret role fields; each player retains only their authorized role/delivered information, and Storyteller setup remains available.
3. Letter discovery visibility, map revision/layer list and base asset response survive; WEST_AREA stays denied without an annex unlock.
4. A stale new command or wrong-seat actor is rejected without mutation; this does not prevent the deliberate original-ID duplicate.
5. A controlled corrupt archive fails restoration; a controlled missing continuation assertion/result fails the drill even if restore and diagnostic replay succeeded. Put negative controls in test-only helper seams, not application endpoints.

**Verification:** The report's playable-continuation result can be traced to actual new-process requests and exact persisted deltas, with zero retries and no source server remaining alive.

### U4. Make CI and the successor runbook carry the evidence

**Goal:** Put the drill in the canonical release path and make it independently operable.

**Requirements:** R8–R10. **Dependencies:** U1–U3.

**Files:** Modify `scripts/regression-baseline.mts`, `scripts/test-database.mts`, `tests/regression-baseline-tooling.test.ts`, `tests/test-database-tooling.test.ts`, `.github/workflows/ci.yml`, and `docs/regression-baseline.md`; add `docs/recovery-drill.md`.

**Approach:**
1. Apply KTD8's lease handoff, then add recovery discovery and execution/result ingestion after the normal production browser server is stopped, using the same captured source/build. Leave the original full browser inventory intact and include the separate recovery discovery/outcome inventory in production completeness.
2. Install/select PostgreSQL 16 client binaries explicitly in CI, execute the drill as a required canonical baseline stage, and upload only KTD7-approved report files with `if: always()`.
3. Write prerequisites and the public entry invocation in the runbook, including explicit local disposable connection setup without copied credentials, expected claim labels, troubleshooting by failed stage, resource names/ownership, interrupted cleanup, and exclusions from the coverage table.

**Test scenarios:**
1. Missing/truncated recovery native report or a discovered case without an outcome makes canonical completeness false.
2. A recovery failure remains a failed release stage even when the original browser suite passes; an original browser failure remains failed even when recovery passes.
3. An early unrelated baseline failure still permits recovery evidence when its prerequisites passed; missing build/ownership prerequisites produce a named blocked result.
4. The CI upload includes sanitized failure evidence but no archive, cookie jar or database export; successful cleanup and failed cleanup are distinguishable.
5. Port-only release does not release or impersonate database ownership; the new recovery owner can lease 3100 after baseline server exit, and an unrelated concurrent runner is refused.
6. The development baseline keeps its existing development-server gates and complete native inventory without claiming a production recovery run; standalone recovery creates one fresh build and canonical production recovery uses its existing matching build.

**Verification:** A second maintainer can execute the documented entry on dedicated PostgreSQL 16 and explain each claim from the retained report. Record whether a second human actually performed it; a self-run is not a second-operator claim.

---

## Verification Contract

Verification is implementation work. Use dedicated explicitly configured loopback resources throughout; never run the old backup script against existing data.

| Gate | Command/interface | Required evidence |
|---|---|---|
| Lint | `npm run lint` | No new or unexplained failures |
| Types | `npm run typecheck` | Existing Prisma 6/DTO consumers accept additive changes |
| Unit/integration suite | `npm test` under the existing leased database harness | Full old suite plus diagnostic/tooling regressions, without allowlists |
| Clean schema | `bash scripts/verify-clean-db.sh` on its explicit dedicated target | Existing migration/constraint gate remains passing |
| Production build | `npm run build` | One recorded build used for both starts |
| Full browser baseline | `npm run baseline -- run NEW_OUTPUT production` | Complete ordinary browser inventory, including freshness regression coverage, plus required recovery stage |
| Focused playable drill | Proposed `npm run recovery:prove` entry on explicit local test connection | New-process/target proof, state/view equality, duplicate/no-op oracle, legal next action and cleanup |
| Negative controls | New tooling/integration cases in U2/U3 | Corrupt dump and incomplete continuation fail without weakening normal assertions |

Compare failures to the preserved item #1 baseline and explain their cause. Report a genuinely unavailable runtime prerequisite as blocked, never passed. Keep native first-attempt failures and sanitized stage evidence even after a fix and successful rerun.

---

## Definition of Done

- U1 diagnostics pass their supported-history and corruption cases and explicitly name unverified scope.
- U2 refuses existing/unowned resources and survives failure/interrupt cleanup without destructive fallback.
- U3 proves restoration, fresh-process rehydration, original-command deduplication and next legal voting action on the recorded same build.
- U4 canonical CI executes and inventories the drill, and its runbook is usable without author-only state.
- Every R-ID has the linked implementation and verification evidence; all required old/new gates pass or a true blocker is reported without declaring completion.
- The final change contains no abandoned approaches, temporary application hooks, private dumps, session artifacts, or unrelated fixes. Owned processes/databases/temp files and leases are cleaned, with any cleanup failure visible.
