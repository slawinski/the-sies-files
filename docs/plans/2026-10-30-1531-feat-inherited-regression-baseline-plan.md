---
title: Inherited Regression Baseline - Plan
type: feat
date: 2026-10-30
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Inherited Regression Baseline - Plan

## Goal Capsule

- **Objective:** Maintainers can distinguish inherited failures from regressions introduced by their next change, with reproducible evidence for each failure.
- **Means:** Extend the existing test workflow with workspace provenance, controlled test resources, deterministic fixtures and a failure ledger (KTD1–KTD5).
- **Authority:** The user's selected direction #1 and Requirements below govern scope; technical decisions govern mechanisms within that scope. The ideation document is background, not authorization for directions #2–#7.
- **Execution profile:** Characterize the inherited workspace before changing test infrastructure, then compare the same application with only baseline-tooling changes. Production behavior changes require separate work.
- **Stop conditions:** Stop attribution when source identity changes during a run, required resources cannot be isolated, or a failure remains unexplained. Preserve partial evidence and name the blocker; never relabel uncertainty as an inherited defect.
- **Completion and shipping:** A later executor implements and verifies this plan. Publication requires a scope-safe diff that does not bundle the user's pre-existing UI/package/untracked work; automatic shipping is blocked until that separation is demonstrated.

---

## Product Contract

### Summary

Establish a repeatable baseline for the actual inherited workspace using its current unit, integration and browser suites. Explain failures with evidence, stabilize faulty test setup where justified, and retain real application defects as visible failures.

### Problem Frame

The user's tests are the safety workflow for future hardening. Committed HEAD alone omits substantial inherited UI, dependency and test work, while uncontrolled databases, randomized setups and reused development servers can obscure the cause of a red run. A recorded result without its source and runtime conditions cannot reliably distinguish old failures from new ones.

### Requirements

**Preservation and identity**

- R1. Preserve all pre-existing tracked and untracked work, including UI, package, notebook and test changes, while identifying exactly which source state each run exercises.
- R2. Record reproducible workspace, dependency, build, test configuration and synthetic scenario inputs without reading or archiving secret files or assuming a production deployment.

**Coverage and repeatability**

- R3. Inherit the current unit/integration/browser suite and golden path, including relevant untracked tests, with deterministic representative setup-to-gameplay scenarios.
- R4. Provide repeatable local and CI checks using isolated disposable test resources and bounded test-setup stabilization where evidence justifies it.

**Failure accounting**

- R5. Explain every observed failure and distinguish existing, new and unexplained failures with durable per-failure evidence; a rerun passing is not an explanation.
- R6. Record genuine existing application defects without silently fixing unrelated app behavior, weakening assertions, skipping failures or requiring every test to pass.
- R7. Keep tooling, documentation and test changes small and repo-native, supporting later comparison without introducing a new testing platform.

### Key Decisions

- **Explain every failure.** (session-settled: user-directed — chosen over fixing every existing application bug first or merely snapshotting unstable results: the user explicitly selected failure explanations as the basis for future regression attribution.) Governs R5, R6.

### Acceptance Examples

- AE1. **Covers R1, R2.** Given the dirty inherited tree, a source capture includes changed manifests and untracked presentation/tests, excludes secret/generated files, and can be reconstructed in a separate directory without changing the original tree.
- AE2. **Covers R3, R4.** Given a synthetic 13-player scenario, repeated fresh runs produce the same seat-to-role arrangement and reach the same asserted gameplay transitions, or produce an explained failure at a named transition.
- AE3. **Covers R5, R6.** Given an application assertion that fails before and after tooling stabilization, the evidence identifies it as inherited relative to the captured workspace and the process remains nonzero; no expected-failure annotation masks it.
- AE4. **Covers R5.** Given a failure observed only after the new tooling, it is marked new until investigation establishes causality; absent a comparable control, it remains unexplained rather than being called inherited.

### Scope Boundaries

Include current tests that exercise security, command receipts and replay because they are already part of the suite. Their inclusion does not authorize new security, recovery or legal projects.

Exclude application fixes and directions #2–#7 from the ideation document. Existing defects discovered here become separate follow-up entries with reproductions.

Considered and not built: cross-browser expansion, randomized stress infrastructure, production inspection, physical restart/restore drills and a generalized snapshot/incident platform. Current coverage and small local tooling satisfy R7; evidence that a specific inherited failure needs a narrow diagnostic may justify that diagnostic, not a platform.

#### Deferred to Follow-Up Work

Application repairs, new hardening journeys and changes to UI intent require separately scoped work after the baseline establishes their evidence. No such change is an active unit here.

---

## Planning Contract

### Verified Repository Context

Source inspection only; no tests, build or runtime probes have established pass/fail counts.

| Surface | Current evidence | Planning consequence |
|---|---|---|
| Workspace | HEAD `a4f3eb18314974647ec44e08a87065e887e552d4`; dirty manifests, routes, styles, translations, notebook and E2E-07; untracked UI/presentation files and E2E-09 | HEAD is ancestry, not the inherited baseline identity |
| Package root | Root `package.json`; no workspace field; root scripts invoke Next, Vitest, Prisma and Playwright | Run from repository root with the captured lockfile |
| Versions | Lockfile entries resolve Next `15.5.23`, Playwright `1.62.1`, Vitest `4.1.11`, Prisma `6.19.3`; React manifest pins `19.1.0` | Record installed versions at execution; manifest ranges alone are insufficient |
| CI | `.github/workflows/ci.yml` uses Node 24 and PostgreSQL 16; lint, typecheck, migrate, unit/integration, browser, then build | Preserve these checks but collect independent outcomes and test the actual build |
| Vitest | `vitest.config.mts` includes `src/**/*.test.ts` and `tests/**/*.test.ts`; `tests/setup-env.ts` loads a test dotenv file; root test script disables file parallelism | Inventory both source and tests trees; set the controlled DB explicitly before importing Prisma |
| DB reset | `tests/helpers/db.ts` truncates tables; `scripts/verify-clean-db.sh` recreates a DB with a developer-specific URL but runs tests without exporting that URL | Reset and tests must resolve the same explicit database |
| E2E | `playwright.config.ts` has one mobile-Chromium project, one worker, global DB recreation, dev server on 3100 and local server reuse | Own the DB, port and server for each measured run |
| Evidence | Playwright uses list/HTML reporters and `on-first-retry` traces without a configured retry count; CI uploads reports on failure for seven days | Retain first-attempt failures and durable textual reproductions |
| Determinism | `generateAndCommitSetup` omits a seed; `generateSetupUntilRole` tries fixed seeds; `tests/release-hardening.test.ts` golden path omits a seed | Supply fixture seeds through the existing service/API seam |
| Source-supported failure lead | E2E-04 dereferences a CHEF/MONK assignment after ordinary random setup | Assert role prerequisites before commit; runtime occurrence remains unverified |

The behavior trace is: a test command starts at the root, Vitest loads test environment before Prisma, and resetDb mutates that resolved database; Playwright independently resolves its database, recreates it in global setup, and launches or reuses a server. The reset shell helper has another connection-resolution path. These paths can disagree; source does not establish that they actually disagreed in any past run.

The scenario trace is: create ordered roster → generate candidate from an optional seed → commit assignments → claim isolated player sessions → drive Operational actions → assert Investigation, voting and ending behavior. `src/modules/setup/setup.service.ts` uses `SeededRngV2` when given a seed, and the setup route accepts it. UUIDs and timestamps still vary; raw setup hashes containing player IDs are not cross-run determinism proofs.

### Assumptions

These are unconfirmed technical defaults for the non-interactive plan, not additional product requirements. Units using them cite their A-ID.

- A1. Use Node 24 and PostgreSQL 16 as the reference local/CI envelope because current CI already uses them. Record OS, architecture, exact Node/npm/PostgreSQL/browser versions and locale/timezone; do not claim byte-identical output across operating systems.
- A2. Use a fresh production build served locally as the canonical browser baseline. Retain the inherited development-server profile as a separately labeled comparison because current E2E behavior is dev-based. This does not assert anything about deployed infrastructure.
- A3. Three independently reset canonical runs, plus targeted isolated/full-suite comparisons for observed failures, are sufficient initial repeatability evidence. This is a bounded confidence check, not proof that a flake cannot recur.
- A4. Use one small TypeScript orchestration script, one shared test-DB helper, existing Vitest/Playwright reporters, a runbook and Markdown failure entries. No new dependencies are expected.
- A5. Keep source capsules and raw logs in ignored `baseline-results/`; commit sanitized summaries and failure specimens under `docs/regressions/`. Local source capsules stay available until an equivalent reconstructable source revision exists.

### Key Technical Decisions

- KTD1. **Preserve two source identities: inherited S0 and baseline-enabled S1.** Capture S0 before test/tooling edits and S1 afterward, with content hashes, tracked dirty diff, untracked-file inventory and selected source bytes under R1, R2. The capsule is a local copy, not a commit or stash. Reconstruct copies for dependency installation/builds so original ignored state and dirty files remain untouched. A digest without recoverable source bytes is not a reproducible baseline.
- KTD2. **Resolve one explicit disposable database per active lane.** Reset, migration, Prisma tests and server receive the same parsed target under R4. Refuse non-local/non-test targets for this workflow, arbitrary reset overrides and ambiguous connection selection. Use argument-safe subprocess invocation and pass credentials through process environment, never interpolated shell strings or logs. Serialize all users of the DB, keep E2E at one worker, and refuse concurrent baseline ownership of the same DB/port. These checks address the actual destructive reset/TRUNCATE paths rather than broadening app security scope.
- KTD3. **Keep fixture determinism in tests.** Under R3, explicitly seed ordinary browser setup and the integration golden path through the existing seam, with per-scenario role prerequisites. Record accepted seed, generator/script/scenario versions, ordered seat roles and action choices. Compare assignments normalized by seat, not UUID or whole-candidate hash. Do not seed application randomness globally or select a seed because it avoids a genuine app defect.
- KTD4. **Own a fresh server and distinguish runtime profiles.** Apply A2 with `reuseExistingServer` disabled for measured runs, zero retries and first-attempt failure traces. Preserve mobile-Chromium and existing serial execution. Pass test DB and current test-only rate-limit setting explicitly to the owned process; record build inputs and build ID/hash. A blocked production build leaves production E2E blocked, while the separately recorded dev profile can still supply evidence. Playwright's documented server lifecycle supports fresh-process enforcement; see Sources.
- KTD5. **Keep raw check truth separate from explanatory review.** Implement R5, R6 with native reporter files plus a manually reviewed ledger, not an allowlist that turns failures green. (session-settled: user-directed — chosen over fixing every existing application bug first or merely snapshotting unstable results: the user selected explanations while preserving real failures.) The mechanism has two independent fields: provenance and cause, defined below.
- KTD6. **Collect every applicable check before returning failure.** Under R4, R5, independent lint/type/unit/build failures must not prevent other runnable stages from producing evidence. Dependency-blocked stages are recorded with their prerequisite failure, not counted as passes or executed against stale output. Any raw check failure, blocked required stage, missing report or source mismatch yields a nonzero aggregate outcome. Human baseline completion under R6 can coexist with that red outcome.

No bake-off is needed: the local test stack and requested small repo-native scope settle the mechanism. Reusing the existing reporters avoids a consequential new storage/interface choice; choosing report filenames is reversible.

### Source Preservation and Attribution

Under KTD1, identify every inherited tracked change and untracked file before execution. The observed dirty set includes `package.json`, `package-lock.json`, `.notebook/INDEX.md`, `src/app/claim/page.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/player/page.tsx`, `src/app/storyteller/page.tsx`, `src/app/storyteller/[gameId]/page.tsx`, `src/i18n/pl.ts` and `tests/e2e/e2e-07-map-unlock.spec.ts`.

Observed untracked work includes `.notebook/ux-refactor-shells.md`, `scripts/capture-ux-screenshots.mts`, `src/app/player/_components/`, `src/app/storyteller/[gameId]/_components/`, `src/components/game/`, `src/components/ui/`, `src/components/useVersionedMutation.ts`, `src/lib/cn.ts`, `src/lib/presentation/`, `tests/e2e/e2e-09-ux-shell.spec.ts`, `the-sies-files-ux-audit/` and `docs/`. Enumerate actual files at execution; directory names are not a complete manifest.

Capture all tracked files plus reviewed relevant untracked source, tests, config, migrations, public/protected assets and documentation. Explicitly exclude environment/secret files, private keys, dependency directories, generated Next/TypeScript state, reports, dumps and the output capsule itself, including tracked exceptions if present. Record exclusions by policy without reading secret bytes. Record executable bits and symlink targets; refuse links escaping the source tree rather than copying unrelated files. Verify source hashes before and after a run and exclude only declared generated outputs from identity checks.

Prepare S0 in an isolated reconstruction; dependency installation uses its lockfile without changing the original workspace. Create S1 as S0 plus only intended baseline changes. The S0→S1 manifest must show that application source, assets and inherited package dependency entries are identical. Add npm scripts surgically if useful. A clean-HEAD run is optional context and never substitutes for S0.

Before publication, produce a scoped diff relative to S0. A clean branch containing only baseline changes may be prepared from HEAD where those changes are independent; if it cannot reproduce S0-dependent tests without including the UI work, stop shipping and report that dependency. Keep S0-dependent evidence labeled as such. Never use blanket staging, cleanup, reset or stash operations to manufacture a clean tree.

### High-Level Technical Design

The following process sketch defines stage ownership and data flow for KTD1–KTD6.

| Stage | Input | Owner and output | Next stage |
|---|---|---|---|
| Capture | Original dirty source | Baseline script → S0 capsule and manifest | Isolated reconstruction |
| Characterize | S0 + explicit test resources | Existing checks → raw inherited observations | Tooling-only edits |
| Stabilize | S0 + justified test/config changes | Executor → S1 and scoped delta | Canonical checks |
| Measure | S1 + reset resources + runtime profile | Existing runners → reports and build identity | Classification |
| Explain | Paired observations and minimal specimens | Maintainer → per-failure ledger | Baseline review |
| Compare later | S1 reference + one future change | Same checks → new/existing/unexplained evidence | Next scoped work |

The outcome decision sketch keeps failed prerequisites distinct from assertion failures.

| Condition | Evidence state | Next action |
|---|---|---|
| Source changed during measurement | Invalid comparison | Capture a new identity before attribution |
| Install, DB, server or build prerequisite failed | Stage blocked | Preserve prerequisite logs; run only independent checks |
| Same failure in comparable S0 and S1 | Existing relative to S0 | Establish cause; retain assertion failure |
| Failure only in S1 with a comparable S0 control | New observation | Investigate tooling delta; do not infer root cause from timing alone |
| Missing control or mismatched inputs | Unexplained provenance | Obtain control or report incomplete attribution |
| Intermittent failure | Unresolved until causal evidence exists | Preserve both passes and failures; passing rerun does not close it |
| All failures explained, including real app defects | Baseline review complete | Keep raw exits red as applicable |

The runtime-profile sketch applies A2 without conflating builds.

| Profile | Server and preparation | Evidence claim |
|---|---|---|
| Inherited development | Fresh dev process in S0 reconstruction, same current test flags | Observed inherited development behavior |
| Stabilized development | Fresh dev process in S1 reconstruction, seeded fixtures | Tooling comparison in the inherited runtime mode |
| Canonical production | Fresh build and start process from the measured source and lockfile | Local production-build behavior only |
| Canonical build blocked | No start against old `.next` output | Production browser coverage unavailable, with named cause |

### Failure Evidence Contract

KTD5 uses a stable ID per distinct failure fingerprint, with every failed test/stage occurrence linked to an entry. Group duplicate occurrences only when the shared cause is established; otherwise preserve separate entries. Test identity is runner, project, file and full title. Keep discovered, executed, passed, failed, skipped and dependency-blocked inventories so omitted tests cannot disappear from the account.

Each durable entry in `docs/regressions/` contains:

1. Failure ID, exact assertion/stage, expected versus actual result, first failing transition and impacted journey.
2. S0/S1 source IDs, run/profile IDs, exact tool versions, redacted configuration, seed/role prerequisites and content/generator versions.
3. Reproduction from a fresh disposable setup, smallest useful existing test selection, action sequence and repetition results with denominators.
4. Raw report/log/trace references and sanitized diagnostic excerpts, including HTTP status/domain error and expected/actual version when relevant.
5. **Provenance:** existing relative to S0, new relative to S0, or unexplained. Cite the paired control runs and relevant source delta; do not infer whether a dirty UI defect existed at HEAD.
6. **Cause:** application defect, fixture/assertion defect, environment/harness defect, or unresolved. State causal evidence, competing explanations ruled out and any remaining limitation.
7. Disposition: test-setup fix with before/after proof, or application follow-up left failing. Include narrow specimen, severity/impact and reference for later work.

An explained environmental blocker can close its ledger entry but cannot establish coverage for tests it prevented. An explained intermittent issue requires a reproducible causal trigger or equivalent source-and-runtime evidence; elapsed time, a larger timeout or a successful rerun alone does not qualify. Unresolved cause or provenance prevents a claim that the entire baseline is complete.

### Sequencing and System-Wide Impact

U1 captures source before repository mutations; U2 establishes resource ownership and collects inherited observations before U3 changes fixtures. U4 integrates repeatable collection and U5 reconciles all observations. U2–U4 may share files but keep their evidence attributable.

This changes developer and CI workflow, not game rules or UI. PostgreSQL recreation/TRUNCATE, server lifecycle, generated build/type files and package scripts cross execution boundaries. Existing E2E-07 and E2E-09 are user work, so edits there must be limited to demonstrated fixture/readiness defects. No schema migration or production environment access is planned.

### Risks and Deferred Execution Facts

- Exact failures, pass counts and installed runtime versions are execution-time facts. Notebook timing reports and E2E-04's source-supported role assumption are leads, not measured outcomes.
- An inherited dependency/install or build defect may block a profile. Record it and collect independent evidence; R6 permits known red results, not unsupported coverage claims.
- A fixed seed may still depend on roster order or target choices. KTD3 captures those inputs and requires normalized assignment comparison.
- Raw browser traces may contain synthetic session credentials. Keep capsules/raw artifacts private and publish sanitized reproductions rather than cookies, request authorization or full environment dumps.
- Source capsules are local until a scoped source revision can reproduce them. CI on a clean commit must name that different source identity and cannot attest to omitted dirty files.

### Sources

- `docs/ideation/2026-10-28-legacy-app-reinforcement-ideation.html`, idea #1 only: background and scope motivation.
- `package.json`, `package-lock.json`, `.github/workflows/ci.yml`, `vitest.config.mts`, `playwright.config.ts`, `next.config.ts`, `tsconfig.json`, `.gitignore`: workflow and configuration evidence.
- `tests/setup-env.ts`, `tests/helpers/db.ts`, `tests/e2e/global-setup.ts`, `scripts/reset-e2e-db.sh`, `scripts/verify-clean-db.sh`: DB ownership and destructive reset paths.
- `tests/release-hardening.test.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/e2e-01-13-player.spec.ts`, `tests/e2e/e2e-04-succession.spec.ts`, `tests/e2e/e2e-07-map-unlock.spec.ts`, `tests/e2e/e2e-09-ux-shell.spec.ts`: inherited scenarios and failure leads.
- `src/modules/setup/setup.service.ts`, `src/app/api/v1/games/[gameId]/setup/generate/route.ts`: existing seeded setup mechanism.
- [Playwright test configuration](https://playwright.dev/docs/api/class-testconfig#test-config-web-server) and [trace recording](https://playwright.dev/docs/trace-viewer-intro): official guidance checked through Context7; KTD4 follows documented fresh-server enforcement and avoids relying on a retry that never occurs.

---

## Implementation Units

### U1. Preserve the exact inherited source

**Goal:** Make S0 reconstructable before baseline implementation changes the workspace.

**Requirements:** R1, R2, R3, R5; Covers AE1.

**Dependencies:** None.

**Files:** Create `scripts/regression-baseline.mts`, `tests/regression-baseline-tooling.test.ts`, `docs/regression-baseline.md`; update `.gitignore` for `baseline-results/`. Keep the capture script outside the S0 reconstruction and identify it as the observer.

**Approach:**
1. Prepare the initial read-only capture observer outside the original workspace and capture S0 before adding the planned script, tests or ignore rules. Identify planning documents and observer artifacts separately from inherited user work.
2. Add the capture portion under KTD1 and A4–A5; its manifest inventories actual files and test discovery, not only directory names.
3. Reconstruct S0 and install its locked dependencies with recorded tools, leaving the user's workspace untouched. Hand the reconstruction to U2 for characterization.

**Patterns to follow:** Existing TypeScript scripts and npm tooling; test the capture behavior with temporary synthetic trees rather than the real dirty tree.

**Execution note:** The bootstrap capture precedes repository edits. Developing the observer externally does not add it to S0; record the observer's own identity so it cannot be mistaken for inherited application source.

**Test scenarios:**
1. Covers AE1. A tracked edit and relevant untracked file survive reconstruction byte-for-byte, with matching executable/symlink metadata.
2. Environment files, generated output and secret-key fixtures are excluded without reading them, including a tracked secret-file fixture.
3. Output inside the workspace is excluded from its own manifest; a later source edit changes identity and invalidates a run.
4. A symlink escaping the source root is refused without traversing its target.
5. Reconstruction and capture leave a synthetic original tree unchanged.

**Verification:** S0 is recoverable, full included/excluded manifests exist, and original workspace hashes match.

### U2. Make test resources explicit and disposable

**Goal:** Ensure reset, migration, tests and the owned server all operate on the same isolated target.

**Requirements:** R2, R4, R5.

**Dependencies:** U1.

**Files:** Create `scripts/test-database.mts`, `tests/test-database-tooling.test.ts`; modify `scripts/verify-clean-db.sh`, `scripts/reset-e2e-db.sh`, `tests/e2e/global-setup.ts`, `tests/setup-env.ts`, `playwright.config.ts`, `scripts/regression-baseline.mts`. Verify against `tests/helpers/db.ts` without broadening its app-facing responsibilities.

**Approach:**
1. Consolidate connection resolution/reset for baseline entry points under KTD2; existing convenience commands delegate to it.
2. Make explicit baseline process configuration take precedence over dotenv defaults before Prisma loads. Verify the parsed target agreement without logging credentials.
3. Place resource ownership before every destructive operation. Baseline orchestration owns the reset; direct Playwright invocation retains a safe reset path without double-resetting a live server.
4. Use the preflight as an identified external observer to characterize the S0 reconstruction with its unmodified suites and fresh development server. Record every independent existing check, including build, without relying on the short-circuit release command. Preserve original reset behavior in this profile where safely possible; when it cannot target the owned disposable resource, record that stage as blocked rather than modifying S0 invisibly.

**Patterns to follow:** Current global setup's libpq environment approach and serial DB tests; avoid the shell interpolation in current reset paths.

**Test scenarios:**
1. An explicit local disposable target reaches reset, migrate and test subprocesses identically despite conflicting fallback configuration.
2. Non-test, non-local, malformed or ambiguous targets fail before any reset/TRUNCATE subprocess begins.
3. Encoded/special-character credentials are passed correctly through environment and do not appear in emitted metadata or errors.
4. A second owner of the same DB/port is rejected without resetting or killing the first owner's resources.
5. A disposable PostgreSQL smoke run migrates, creates a synthetic game, resets and starts the next run without retaining that game.

**Verification:** The fresh-DB path is portable under A1, source/runtime target agreement is recorded, and S0 characterization accounts for all checks without modifying S0 test files.

### U3. Stabilize inherited scenario inputs without changing app behavior

**Goal:** Remove test setup luck while preserving the assertions and current journeys.

**Requirements:** R3, R4, R5, R6; Covers AE2.

**Dependencies:** U1, U2 including S0 characterization.

**Files:** Modify `tests/e2e/fixtures.ts`, `tests/e2e/e2e-04-succession.spec.ts`, `tests/release-hardening.test.ts`; inspect and narrowly adjust seeded call sites in `tests/e2e/e2e-01-13-player.spec.ts`, `tests/e2e/e2e-02-15-player.spec.ts`, `tests/e2e/e2e-03-16-player-bureaucrat.spec.ts`, `tests/e2e/e2e-05-saint.spec.ts`, `tests/e2e/e2e-06-mayor.spec.ts`, `tests/e2e/e2e-07-map-unlock.spec.ts`, `tests/e2e/e2e-08-restart-recovery.spec.ts`, `tests/e2e/e2e-09-ux-shell.spec.ts`; add meaningful fixture contract coverage to `tests/regression-baseline-tooling.test.ts` where pure validation is factored.

**Approach:**
1. Apply KTD3 through existing helpers; retain fixed-seed role search where needed, recording the accepted seed and explicit prerequisites before commit.
2. For E2E-04 validate IMP, a legal Minion and CHEF/MONK preconditions, then preserve invalid-successor rejection and star-pass assertions.
3. Verify helper version propagation after commit, claim and role acknowledgement. Add status/domain-error diagnostics at the first failed command; no blind expectedVersion retry or ignored failed vote.
4. Use observed readiness and web assertions for fixture coordination. Existing LIVE waits can be preserved for the connected-stream path, but cannot establish catch-up correctness or excuse a stale UI defect.
5. Record any remaining random setup call affecting the inherited suite. Seed it only where it causes scenario variability; leave tests explicitly testing randomness intact and identify them in the inventory.

**Patterns to follow:** `generateSetupUntilRole`, ordered virtual seats, existing per-player browser contexts and the release-hardening golden path.

**Test scenarios:**
1. Covers AE2. The 13-player golden path reaches ROLE_REVEAL, first Operational and cycle-1 Investigation under one recorded seed in independent resets.
2. E2E-04 never dereferences a missing prerequisite; bounded seed search reports a fixture error if no valid candidate exists, while invalid successor behavior remains asserted.
3. Identical seed/roster inputs yield identical normalized seat roles despite different UUIDs; a changed seed/content version is recorded as a different specimen.
4. A failed setup/vote/phase response produces its own status/error evidence instead of cascading into undefined version state.
5. Claim and UI acknowledgement version changes are respected without automatic mutation retries.

**Verification:** Scenario inputs and assertions are traceable, all removed variability has a test-setup explanation, and no app source or genuine failure expectation changed.

### U4. Collect comparable local and CI evidence

**Goal:** Run the inherited checks reproducibly and retain their true outcomes.

**Requirements:** R2, R3, R4, R5, R6, R7; Covers AE3, AE4.

**Dependencies:** U2, U3.

**Files:** Extend `scripts/regression-baseline.mts`, `tests/regression-baseline-tooling.test.ts`, `playwright.config.ts`, `docs/regression-baseline.md`; surgically update `package.json` scripts and `.github/workflows/ci.yml`. Preserve inherited dependency entries and lockfile unless a demonstrated test-tooling prerequisite requires an explicitly reviewed change.

**Approach:**
1. Integrate KTD4 and KTD6 using native Vitest and Playwright machine reports plus ordinary logs. Keep dev and production artifacts distinct and use run-specific output paths.
2. Build in an isolated reconstruction and bind production browser checks to that build. Do not reuse `.next` or TypeScript incremental output between profiles or source identities.
3. Emit run metadata, test discovery/outcome inventories and stage exit statuses before returning the aggregate outcome.
4. Make CI invoke the same baseline entry point after environment installation and publish reports even when a preceding check fails. Preserve a final nonzero gate for any raw failure or incomplete required stage.
5. Complete cleanup of only owned processes/resources, including interrupted runs, and retain their partial reports.

**Patterns to follow:** Current npm scripts, one-worker mobile-Chromium configuration, GitHub artifact upload and existing report directories; A1–A5 define the reference envelope.

**Test scenarios:**
1. Covers AE3. A failing unit stage still allows independent build/browser stages where prerequisites hold, and the final process remains nonzero.
2. A build failure marks production browser coverage blocked; no stale build runs, while independent unit and dev evidence remains available.
3. An occupied port refuses reuse without killing the unrelated server; an interrupted owned server is cleaned up and reports survive.
4. A first-attempt browser failure with zero retries retains trace and reporter evidence; missing/truncated reporter output is detected as incomplete.
5. Covers AE4. A changed source hash or mismatched runtime profile prevents automatic inherited attribution.
6. Local and CI runs emit the same metadata fields and stage/test identities; all current tests, including inherited untracked presentation tests and E2E-09, are accounted for in S0/S1.

**Verification:** A single documented local/CI entry point returns truthful aggregate status, every discovered test has an outcome, and production evidence identifies its actual build.

### U5. Reconcile every failure and publish the baseline account

**Goal:** Deliver an honest comparison point that another maintainer can reproduce.

**Requirements:** R1–R7; Covers AE3, AE4.

**Dependencies:** U1–U4.

**Files:** Finalize `docs/regression-baseline.md`; create `docs/regressions/README.md` and one `docs/regressions/<failure-id>.md` per distinct explained failure. Link evidence from existing test files rather than creating a second application test suite.

**Approach:**
1. Apply the Failure Evidence Contract to S0, S1 and the repeated checks under A3. Preserve all observations, including setup failures repaired during U2/U3.
2. Diagnose intermittence with the smallest existing test selection and a full-suite control under the same inputs. Establish mechanism before assigning a cause.
3. Record real app defects and separate follow-up scope without editing app behavior. Account explicitly for pre-existing skips and dependency-blocked tests.
4. Verify original workspace preservation and prepare the scoped publication account under KTD1. Document reconstruction, routine checks and future before/after comparison procedures in the runbook.

**Test expectation:** None — this unit reconciles existing runtime evidence and writes documentation; it adds no executable behavior.

**Verification:** Every failed occurrence maps to a reviewed entry, no unexplained classification remains in a claimed complete baseline, and scope-safe publication is either demonstrated or reported blocked.

---

## Verification Contract

The following are checks for the later executor; none have been run to author this plan. The runbook will supply exact command syntax after the entry point exists. Existing command names below identify the checks, not a shell execution recipe.

| Check | Existing entry point or files | Required evidence |
|---|---|---|
| Source/install | `package.json`, `package-lock.json`, source capsule | S0/S1 manifests, locked install, actual runtime/dependency versions, source hashes unchanged |
| Lint | `npm run lint` | Complete exit/log, separately attributable to S0 or S1 |
| Types | `npm run typecheck` | Fresh generated-type/build context recorded; no inherited incremental output |
| Unit/integration | `npm test`; both Vitest include roots | Native report, all discovered tests accounted, serialized DB use |
| Empty DB | Repaired `scripts/verify-clean-db.sh`, migrations | Same target used by reset/migrate/tests and fresh schema proof |
| Golden path | `tests/release-hardening.test.ts` | Fixed-seed 13-player setup → Operational → Investigation result |
| Full browser suite | `npm run test:e2e`; E2E-01 through E2E-09 | Profile/seed/role/build metadata, native report and first-failure artifacts |
| Production build | `npm run build`, followed by owned `npm run start` server | Fresh source-bound build and full browser coverage, or named prerequisite blocker |
| New tooling contracts | `tests/regression-baseline-tooling.test.ts`, `tests/test-database-tooling.test.ts` | Preservation, resource ownership and truthful aggregate-status behavior |
| CI parity | `.github/workflows/ci.yml` | Same stage inventory/entry point, artifacts on failure and truthful final gate |
| Repeatability/attribution | S0/S1 paired profiles and A3 repetitions | Per-failure causal and provenance evidence, denominators and scope-safe diff |

Representative scenario inventory is inherited rather than newly ranked:

| Existing scenario | Retained proof |
|---|---|
| Release-hardening + E2E-01 | 13-player golden path and ordinary complete lifecycle |
| E2E-02 | 15-player ordinary lifecycle |
| E2E-03 | 16-player Bureaucrat Traveller path |
| E2E-04 | Invalid successor rejection and legal Imp star-pass |
| E2E-05 / E2E-06 | Saint execution / Mayor three-alive no-execution endings |
| E2E-07 | QR unlock, authorized map asset and rendered western layer |
| E2E-08 | Existing mid-vote consistency/replay check; no physical restart claim |
| E2E-09 | Inherited private reveal gate, navigation, journal and scanner sheet |

Under A3, measure the canonical S1 profile three times from independent resource resets. Pair S0/S1 development profiles for tooling attribution; where canonical failures need provenance, collect a comparable S0 production control with the external observer rather than assuming a dev failure proves it. Preserve the exact application assertion and both reports for any seed change that exposes or removes a failure. Missing prerequisites and unexplained failures are explicit incompleteness, never green status.

---

## Definition of Done

- U1: The inherited source can be reconstructed, including relevant untracked files, without secret/generated state or mutation of the original workspace.
- U2: All destructive test operations and consumers agree on owned disposable resources.
- U3: Representative scenarios have recorded deterministic inputs and preserve their application assertions.
- U4: Every applicable stage produces evidence, first failures survive, and aggregate exit status remains truthful locally and in CI.
- U5: The failure ledger reconciles every observed failure and the runbook enables reproduction and later regression attribution.
- R5/R6 govern completion: explained existing app defects may remain red; unexplained failures or uncovered required profiles must be reported as incomplete with their blocker.
- The S0→S1 scope account and original-source hash check show preservation of user work. Shipping does not include pre-existing changes merely because tests depend on them.
- Abandoned experimental tooling is removed from the intended diff without deleting user work. No application behavior change, failure suppression, new platform or direction #2–#7 implementation is included.
