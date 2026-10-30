# Regression baseline

The inherited source S0 was captured before baseline implementation, from authorized
commit `8251540` (including UI commit `4bfdb51`). No application changes are part of
the baseline work. Raw capsules and reports are private local artifacts, not PR attachments.

## Capture and reconstruction

On Node 24, run `npx tsx scripts/regression-baseline.mts "$PWD" "$PWD/baseline-results/s0"`.
The output must not already exist. `source/` contains reconstructable included bytes;
`manifest.json` records SHA-256 identities, permissions, link targets, tests, exclusions,
Git ancestry and observer identity. `tracked.patch` contains only included paths.
Environment files (including examples), keys, generated files and ignored outputs are
excluded without reading their bytes. Escaping symlinks are refused. Keep capsules
private: test evidence can contain synthetic session tokens.

Install and run checks only in `source/`, never in the original checkout. A source
digest identifies the ordered path/content/permission/link manifest, not Git status
or a timestamp. Planning files are listed separately. Source changes invalidate a
comparison; use a new capture rather than overwriting an earlier specimen.

## Initial capture

- S0: `8db91d641b2e5d51dad39750db9c2e1e8a91d68c294dae6e4de0d945aea5a21a`.
- Included: 270 files, 31 test/spec files.
- Capsule: `/var/folders/zl/fkgnlthd363175f4ffymzcjh0000gn/T/opencode/sies-baseline-s0/`.
- External bootstrap observer: adjacent `sies-capture.mts`; its hash is in the manifest.
- Reconstruction locked install: `npm ci --no-audit --no-fund`, 542 packages, success.
- Runtime: Node 24.8.0, npm 11.6.0, macOS arm64.

### Capture correction

The initial observer incorrectly excluded migration SQL with database dumps.
Its first characterization therefore failed 85 unit hooks and nine browser
create-game requests against an empty schema. These are observer failures, not
application findings. The failed reports remain in `sies-s0-evidence/` adjacent to
the capsule. The policy now explicitly includes Prisma migration SQL and has a
regression test. Because S0 was clean and committed, the external repair observer
reconstructed the exact authorized `8251540` tree, reading only policy-approved
blobs (never environment/secret blobs).

Corrected S0: `c3763052b52195dec90d020d7190cd571c977f063c86139b17884cabb160a50c`,
282 files, 31 test/spec files. Capsule: adjacent `sies-baseline-s0-corrected/`;
reports: `sies-s0-corrected-evidence/`. Lint, fresh types, all 156 unit tests,
all nine development browser scenarios, and production build passed. This is
observed evidence, not proof that inherited randomness cannot fail.

## Disposable resources

Set `DATABASE_URL` explicitly to a local `*_test` database; if supplied,
`E2E_DATABASE_URL` must agree. No dotenv is loaded by tests. Credentials are
decoded into libpq environment variables, never shell commands. Connection
services/options cannot redirect the resolved target. Nonlocal URLs, URL
parameters and non-test names are rejected; no destructive override exists.

`bash scripts/verify-clean-db.sh` owns a lease, recreates the explicit database,
applies migrations and runs the entire unit suite on that same target.
`bash scripts/reset-e2e-db.sh` performs only the owned reset. Direct Playwright
invocations retain their reset and teardown lease; baseline orchestration resets
before starting its server and passes a live ownership token to consumers.
Leases are atomic private files in the system temporary directory keyed by
loopback port/database (and server port for orchestration). A stale lease is a
blocker: confirm its PID is no longer active before manual removal. Never kill
an unrelated process or reset a resource to resolve contention.

Local characterization uses a newly initialized private PostgreSQL 16.15 cluster
on loopback port 55439, not the developer's existing databases. Docker was not
running; PostgreSQL 16 was installed without changing the linked PostgreSQL 14
or starting a persistent service. The original `verify-clean-db.sh` cannot use
this target safely (it hardcodes port/account), so its S0 convenience entry is
blocked; its migrate/unit operations are characterized independently instead.

The completed runtime and failure account is in [regressions/README.md](regressions/README.md).

## Scenario inputs

Ordinary browser setups and the integration golden path use
`regression-baseline-v1` through the existing setup API/service seam. Role-search
fixtures retain `e2e-seed-N` and report the accepted seed. E2E-04 requires Imp,
a legal Minion and CHEF/MONK before commit. Its cycle-two Monk and Poisoner
targets explicitly exclude the Imp: with `e2e-seed-0`, the inherited generic
first-seat choice protected the Imp and prevented the self-kill, so the invalid
successor request was legitimately accepted as a no-death resolution. The
application was not changed. The same seed passes with the corrected scenario
preconditions; invalid-successor and star-pass assertions are unchanged.

`BASELINE_SCENARIO` and `BASELINE_ACTION` lines in native reports preserve
generator/script/scenario versions, seat-normalized roles, seeds and action
choices. Claims and commit helpers return the resulting version; no mutation
retry hides a conflict, and failed votes are no longer ignored. Existing
role-acknowledgement version refresh in E2E-07 remains unchanged.

The additional unseeded service calls in `slice2.test.ts` and `r1.test.ts` are
seeded because they drive gameplay queues. The Drunk search uses bounded
`drunk-fixture-N` inputs. Generator count/distribution tests intentionally vary
their explicit seeds and remain unchanged; UUID/session/command IDs still vary
and are not role-determinism proofs. E2E-01/02/07/09 require no call-site edits:
their shared helper now supplies the fixed seed. No application assertions or
LIVE/readiness expectations were weakened.

## Routine baseline entry point

After `npm ci`, install the existing Chromium browser with
`npx playwright install chromium` (CI uses `--with-deps`) and make PostgreSQL
client tools available in PATH. Supply the explicit disposable local database
through process environment; do not create or load an environment file.

```
npm run baseline -- run baseline-results/run-1 production
npm run baseline -- run baseline-results/dev-control development
```

Use a new output directory each time. Optionally append the absolute path to an
S0 `manifest.json` for the application/assets/dependency-delta check. The command
captures and reconstructs source, performs a locked install there, collects
versions, independent lint/types/unit/build results and native test discoveries,
then resets again and runs a fresh one-worker mobile-Chromium server. Production
browser checks require that run's successful build and record its BUILD_ID;
development controls discard production `.next` output before starting dev.
No generated Next types or configuration are written in the original checkout.

Each run stores `stages.json`, `run.json`, native `unit.json`/`browser.json`, both
discovery inventories, ordinary stage logs and first-attempt traces in
`browser-artifacts/`. Missing/truncated or incomplete reports, failed/blocked
stages, changed source or raw failed assertions produce a nonzero result.
Deadline expiry is a failure even when graceful SIGTERM shutdown exits zero;
the timeout diagnostic is retained and independent stages still run. Final
source verification re-inventories policy-approved reconstructed paths without
Git, detecting additions as well as content, mode, link changes and deletions.
Copied Git-ignore rules cannot hide new source. Declared secret/generated/output
exclusions still apply. Retained `baseline-results/` capsules are excluded from
root ESLint and TypeScript checks; do not delete evidence to make checks pass.
There is no failure allowlist and no automatic inherited-defect classification.
Review provenance **and** cause manually under `docs/regressions/`. A green rerun
does not explain an earlier failure. Keep raw reports private.

CI calls this same production entry point and always uploads the report/log
paths, not source capsules, even on failure. A raw failure remains a failing CI
step. Three independently reset canonical runs establish the initial local
baseline; routine CI runs one complete canonical profile per commit.

## Completed reference and later comparisons

Measured S1 is `60f542c8fb8b4601eadd242732b42093f30648e458f314e667245183c4d181d8`
(baseline code commit `1e9920e`, before documentation-only reconciliation).
`baseline-results/canonical-{1,2,3}/` each records 179/179 unit assertions,
9/9 mobile browser scenarios, 15 successful stages, a distinct fresh build ID,
unchanged original and reconstructed source, and released owned resources.
`baseline-results/development-canonical/` passes the same assertions under a
separate fresh dev server. Initial S0 production and dev controls also pass.

The [failure ledger](regressions/README.md) explains the earlier observer,
fixture and tooling failures with source/runtime provenance, original report
references and causal controls. A real interruption probe established that
Playwright can leave a detached server when its runner is terminated. The
owned wrapper now records its spawned process group under the lease; controller
cleanup stops that group and verifies the port is free. Failed or cancelled
runs remain nonzero and retain incomplete/missing-report evidence.

For a future change:

1. Keep the reference capsule/manifests and original reports. Check out its
   equivalent committed source only in a separately chosen disposable copy;
   never reset the user's working tree to manufacture a control.
2. Capture the proposed source and run the same production/development profiles
   with explicit disposable resources and the same content versions and seeds.
3. Compare the actual path/content delta, lock/dependency identity, runtime
   envelope, build identity and discovered/executed/skipped/blocked inventories.
   Do not compare a dev failure to a production pass as if the profiles matched.
4. Reproduce each failure with the smallest existing test selection and a
   full-suite control. Preserve HTTP/domain/version diagnostics, traces and
   both passing/failing observations; explain a causal trigger before grouping.
5. Record provenance and cause separately. An unmatched source/profile or
   missing report is incomplete evidence, not an inherited-defect label.

The earlier ledger/runbook reconciliation was documentation-only and had a
different full source digest from measured S1. The three 179/9 production runs
remain valid for that earlier S1, not the later simplifications or review fixes.
The subsequent mechanical review fixes are documented in F012–F014; their new
tests change the unit denominator. Post-fix production evidence is listed in
the ledger separately, by its own captured source identity. No runtime evidence
is attributed to documentation that did not exist during a run. Hosted CI
execution, app-scope findings, review and publication belong to the caller.

One later production run, `baseline-results/review-mechanical-final/`, measures
the mechanical fixes and preserved presentation simplifications: **188/188 unit
assertions**, **9/9 browser scenarios**, all **15 stages passed**, exit zero.
Its source identity is
`1ea07c124e836989a2931f218346245bc10827eda120bb73669c321193d5cf04`.
The ledger records the native-inventory/identity audit, fresh build and isolated
PG16 cluster cleanup. Root lint and nonincremental typechecking also pass with
capsules retained. This note was added after the run; it is not evidence of
three repetitions, a later development profile, or hosted CI for the final tree.
