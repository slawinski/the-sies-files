# Client reconciliation: local failure and evidence account

This work starts at merged PR2 (`3a4152670b54b5cee8e17f58dfb25a75615c8677`).
Earlier baseline counts are not this branch's denominator. All browser runs below
use mobile Chromium, one worker, no retries, and a new disposable database on an
owned PostgreSQL 16 cluster at loopback port 55447 (focused runs) or 55448
(final canonical profiles). Existing databases and secret
environment files were not inspected. Prisma's CLI prints that it loads `.env` in
the original checkout; both database URL variables were explicitly supplied and
its datasource diagnostic confirms the disposable target. Canonical baseline
profiles instead reconstruct policy-approved source without environment files.

## Failure occurrences and causal controls

Raw browser traces/error snapshots remain private under the paths below. The
first red run uses `test-results/`; later runs use distinct `baseline-results/`
directories so those traces are not overwritten. Test titles identify specimens;
fixed-seed gameplay uses `regression-baseline-v1` and records discovered roles.

| Occurrence | Observed failure and cause | Correction / distinguishing evidence |
| --- | --- | --- |
| Initial pure-test invocation | Setup rejected absent explicit disposable database URL before importing tests. | Supplied matching local `*_test` URLs. These pure tests acquire a lease but make no database connection. Not an application failure. |
| Projection proof-first red | Import of `./projection-reconciliation` failed before the new module existed. | Tests were authored first; subsequent focused runs execute their deferred-work/fake-clock assertions. This import red is not claimed as a reproduced application race. |
| Next pure-test invocation | Setup reported `Disposable resource already owned`; the earlier failed import had not reached Vitest's afterAll lease release. | Used a separate explicitly named pure-test target; no live owner was killed and no unrelated lease was removed. The stale proof-only lease is not evidence of a database run. |
| Command-phase proof-first red | Import of `@/lib/command-refresh` failed before implementation. | Added the command/refresh phase boundary. Two tests assert committed result retention, conflict retention, and exactly one command invocation despite rejected refreshes. |
| Initial E2E-10, two failures (`test-results/e2e-10-*`) | Both real pages reported LIVE after controlled open while the authoritative newer response was held. | Real database rename before hello, no subsequent command/invalidation. Applied post-open truth and neutral catch-up now pass on both pages. This is the application defect, not a fixture failure. |
| Control render red | New catch-up assertion found the raw `SYNCHRONIZING` enum rendered with danger tone. Eight inherited assertions passed. | Added Polish exhaustive connection mapping; all original privacy/closure assertions retained. |
| `reconcile-matrix-1`, 11 pass / 1 fail | Role-notice locator expected a standalone exact text element, but the status contains both a text node and retry button. Snapshot shows the notice and disabled acknowledgement. | Locate the text-bearing status rather than requiring a nonexistent wrapper element. Still asserts the actual visible notice and disabled/enabled command. |
| `reconcile-matrix-2`, native journey | Offline emulation left the already established native SSE socket open; its open count stayed one. HTTP recovery alone was insufficient evidence of native reconnect. | Finite initial SSE response with authorized endpoint metadata forces native EOF/retry; hold the second native request, mutate once, continue to the real stream. Require an increased native open count as well as caught-up content and LIVE. No EventSource shim is used in this journey. |
| `reconcile-matrix-2`, QR journey | Scanner was absent: before any scenario scan, the authorized projection legitimately contains no scenario/map. | Initialize the scenario with another player's real letter scan, then test the target player's real annex command. The command under test is still sent exactly once after fault installation. |
| `reconcile-matrix-2`, audit journey | Locator requested `Wczytaj więcej`; the existing button is named `Więcej` (snapshot confirms it). | Use its actual accessible name; retain held-pagination, changed-filter and error-clearing assertions. A real third audit event makes the held page nonempty. |
| `reconcile-matrix-3`, 4 pass / 1 fail | QR assertion omitted the generic discovery sentence. Snapshot contains `Otrzymano nowy dowód. Mapa rozszerzona odblokowana — aneks dołączony do akt.` | Assert that complete exact outcome, including generic wording when the projection refresh fails. No application wording was weakened to satisfy the assertion. |
| Root lint after retained HTML reports | ESLint scanned generated Playwright trace-viewer bundles: 254 errors / 2773 warnings, not application source. Raw output retained by the tool at `tool_193ae2a5e001VOZPIr9gQrTwSe`. | Exclude `playwright-report/**` and `test-results/**`, like existing capsule exclusions. Evidence is retained, not deleted; source lint rules are unchanged. |
| `reconcile-matrix-4`, checkpoint journey | Fault installation could catch a redundant hello-triggered follow-up before the command, leaving it disabled. | Open already establishes the required read boundary; valid hello now raises its target without inventing another same-version read. This follows the planned open/hello coalescing contract, not a longer timeout or forced click. |
| `reconcile-matrix-4`, gameplay journey | No WAITING_FOR_PLAYER action existed immediately after start: the fixed specimen starts with Storyteller-resolved actions. | Resolve the real preceding Storyteller queue using the existing API, then discover the first player action. No fabricated role/action is assumed. |
| `reconcile-matrix-5`, 1 pass / 1 fail | The old-confirmation specimen attempted rename in ACTIVE; the server correctly returned `INVALID_SESSION_STATE` (HTTP 400). | Use a legal checkpoint command to change version while the closure dialog is open. Require the old confirmation to disappear and zero close commands to be sent. Server validation is unchanged. |
| `reconcile-audit-red`, 1 fail | With the inherited `!audit && auditError` condition restored, a failed current head request hid its error/retry behind an existing snapshot. | Restore unconditional current-error notice plus pane retry. The same mounted test passes and also rejects obsolete pages and deduplicates overlapping sequences. This controlled red is intentional, not a release-profile pass. |
| Interrupted `reconcile-production` | Its retained install log records `ENOSPC`; only capsule/install log and an incomplete run record exist. | No profile pass is claimed. At continuation, the filesystem has 94 GiB available; a fresh canonical locked install completes without changing dependencies or removing evidence. |
| `reconcile-production-final` | Install, lint, fresh types, discovery and build pass, but both disposable resets fail because role `psla` does not exist in the retained cluster. Unit/browser execution is blocked, not passed. | Preserve the complete failed stage account. Stop only the owned cluster; initialize a separate private UTF-8 PG16 cluster with an explicit test account on port 55448 for new canonical profiles. An unused SQL_ASCII initialization was stopped before any run; no developer database or PG14 service was changed. |

Seven intermediate source lint warnings (callback dependencies and an unused
setter) were corrected before source verification. No suite failures were
skipped, allowlisted, retried automatically, or fixed by increasing timeouts.

## Focused outcomes

- `reconcile-focused-1`: both initial missed-update cases pass.
- `reconcile-focused-2`: six cases pass: E2E-07, all three E2E-09 cases, both
  initial missed-update cases. Inherited assertions are unchanged.
- `reconcile-matrix-3`: native reconnect, audit, player identity change and
  Storyteller game change pass; the QR wording failure above is retained.
- `reconcile-matrix-5`: checkpoint acknowledgement passes; illegal rename
  precondition failure above is retained.
- `reconcile-matrix-6`: all twenty E2E-10 cases pass on the then-current source.
- `reconcile-matrix-7`: five strengthened cases pass, including HTTP recovery
  despite a false online hint, QR/checkpoint acknowledgement and overlapping
  audit-page deduplication.
- Latest focused pure/render verification: 23 assertions across four files,
  including eleven acceptance/scheduler assertions and two command-phase cases.
  Root lint and fresh nonincremental types pass with retained evidence present.

The matrix deliberately tests native EOF/retry separately from the controllable
stream. Storyteller game switching uses actual document navigation to another
authorized game with old game/control/audit/claim responses held. Player scope
switching happens in the mounted `/player` controller through current `/me`
discovery; it asserts obsolete-source closure and rejection of the old response.
This is local single-process evidence, not a deployment-topology or global
consistency claim. The caller still owns external review, browser QA and shipping.

## Canonical production and development verification

The continuation completed the repository's canonical entry point on Node
24.8.0 / npm 11.6.0 with a new disposable database per profile, explicit matching
database URL variables, and the private UTF-8 PostgreSQL 16 cluster on loopback
port 55448. Both successful profiles captured the identical source manifest:
`d7980f8712240ca34cfebacd2d18ebdb82bfebfd8c8e7c8c011dd68a2f1c415e`.

| Profile / retained directory | Native outcomes | Stages / build |
| --- | --- | --- |
| Production: `baseline-results/reconcile-production-final-2/` | 212/212 unit assertions; 31/31 mobile Chromium scenarios | 15/15 stages passed; fresh BUILD_ID `uofpMyFbG73Ha7rWNRe_k` |
| Development: `baseline-results/reconcile-development-final/` | 212/212 unit assertions; 31/31 mobile Chromium scenarios | 16/16 stages passed, including fresh dev output; browser uses a separate dev server, not the production build |

Each run records `complete: true`, `changedSource: []`,
`originalSourceUnchanged: true`, `serverPortReleased: true`, and released leases
and owned subprocesses. Native discoveries match all executed identities;
all failed, pending, skipped, todo, timed-out, interrupted and blocked counts are
zero. Each has `run.json`, `stages.json`, native unit/browser reports, discovery
inventories, stage logs and retained browser artifacts. No automatic retry or
failure allowlist was used. The 31 browser cases include the eleven inherited
cases and twenty new reconciliation cases, including actual native EventSource
EOF/reconnect. E2E-09 is unchanged; E2E-07 changes only its missed-event comment,
not assertions. Dependencies and lockfile are unchanged from PR2.

The earlier `reconcile-production` and `reconcile-production-final` failures
remain failures as explained above; the successful profiles do not erase them.
This evidence section was appended after both successful measurements. Their
full manifest digest therefore identifies the pre-append documentation bytes,
not the final documentation-only update; application and test bytes are the
measured bytes. Both owned clusters used during continuation were stopped;
source capsules, cluster directories and raw reports are retained. The original
PostgreSQL 14 service was left untouched.
