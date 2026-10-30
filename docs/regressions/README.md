# Regression baseline account — 2026-10-30

The earlier measured S0/S1 baseline is complete. This is bounded evidence,
not a claim that arbitrary random inputs
or all future schedules pass. Earlier failures remain in their raw reports;
none is allowlisted, marked expected-failure, skipped, or overwritten.

## Source and runtime envelope

| Identity | Meaning |
|---|---|
| S0 `c3763052b52195dec90d020d7190cd571c977f063c86139b17884cabb160a50c` | Exact authorized `8251540` tree, including inherited UI `4bfdb51`; 282 included files, 31 test/spec files |
| S1 `60f542c8fb8b4601eadd242732b42093f30648e458f314e667245183c4d181d8` | Baseline code measured below; committed as `1e9920e`; 287 included files, 33 test/spec files |
| Initial invalid capture `8db91d641b2e5d51dad39750db9c2e1e8a91d68c294dae6e4de0d945aea5a21a` | Missing migration SQL; never use as application failure provenance ([F001](F001-capture-migrations.md)) |

All full S1 runs below use Node **24.8.0**, npm **11.6.0**, PostgreSQL **16.15**,
Next **15.5.23**, React **19.1.0**, Prisma **6.19.3**, Vitest **4.1.11**,
Playwright **1.62.1**, Chromium **151.0.7922.34**, TypeScript **5.9.3** and
ESLint **9.39.5** on macOS/Darwin **27.0.0 arm64**, `TZ=UTC`,
`LANG=en_US.UTF-8`. Full installed versions are in each `versions.log`.
Dependencies and lockfile are identical to S0; lock SHA-256 is
`558871d14c532929d3a5d518c9c116526f2e470bb4eefb94aabb137582cc7c7e`.

The private, newly initialized PostgreSQL cluster uses loopback port **55439**;
S0, S1, smoke and interruption databases are separately named `*_test` targets.
No original database was reset. Browser runs use port **3100**, one
mobile-Chromium worker, zero retries and fresh processes. Production uses fresh
builds; development is a distinct control, never production coverage.

Ordinary seed: `regression-baseline-v1`. Role searches: `e2e-seed-N`, including
E2E-04's accepted `e2e-seed-0`. Generator **2**, script `TROUBLE_BREWING/1`,
scenario `THE_SIES_FILES_MILLIONAIRE/1`. Native logs contain normalized seat roles
and player action choices. UUIDs, timestamps and raw candidate hashes are not
cross-run determinism evidence. Each failure entry inherits this runtime and
redacted-resource envelope unless it explicitly names a bootstrap difference.

## Measured results

`T` below means the private local evidence root
`/var/folders/zl/fkgnlthd363175f4ffymzcjh0000gn/T/opencode/`.
`B` means this checkout's ignored `baseline-results/`. These are local evidence
locations, not public URLs; preserve them until the source revisions and
sanitized reproductions provide equivalent recovery.

| Run | Evidence | Unit tests | Browser tests | Other checks |
|---|---|---:|---:|---|
| S0 development | `T/sies-s0-corrected-evidence/` | 156/156 passed | 9/9 passed | locked install, lint, fresh types, migrations, build passed |
| S0 production | same root, `browser-production-corrected.json` | unit result above | 9/9 passed | external production observer; unmodified S0 tests and build |
| S1 canonical 1 | `B/canonical-1/` | 179/179 passed | 9/9 passed | all 15 stages passed |
| S1 canonical 2 | `B/canonical-2/` | 179/179 passed | 9/9 passed | all 15 stages passed |
| S1 canonical 3 | `B/canonical-3/` | 179/179 passed | 9/9 passed | all 15 stages passed |
| S1 development | `B/development-canonical/` | 179/179 passed | 9/9 passed | all 16 stages passed, including discard of production output |

Canonical build IDs respectively:
`BxUOCf2oyp0QR0lI5AM5y`, `WtILT1Qg1m9lVd-p01Nj9`,
`fhVi652N6_DnYB4JO1NSY`. Every canonical report binds its build to S1 and
the lockfile hash. The three production runs independently install, reset,
migrate, build and start; they do not reuse `.next`, incremental types or DB data.

S1 includes all 156 inherited unit tests plus 23 tooling contracts. Discovery
and outcomes match exactly in every earlier S1 final run, including the presentation tests
and E2E-09. There are **zero failed, skipped, pending, todo or dependency-blocked
tests** in the final profiles. The release golden path reaches ROLE_REVEAL,
first Operational and cycle-one Investigation in all four final full runs.
Production/browser totals are **537/537 unit assertions and 27/27 browser
journeys** over three canonical runs, not independent coverage of new scenarios.

### Mechanical review follow-up

F012–F014 add nine boundary assertions (188 total unit assertions including the
156 inherited identities). The focused baseline-tooling file passes 23/23;
root lint and nonincremental types pass with the historical capsules retained.
These checks are distinct from the earlier 179/9 full profiles above.

The post-fix production capture uses `B/review-mechanical-final/` and includes
the five existing presentation simplifications unchanged. Its disposable
PostgreSQL 16 cluster is newly initialized at
`T/sies-review-pg16.eLxrPD/data`, loopback port **55441**, account
`baseline_review`, database `sies_review_final_test`. It is separate from the
earlier cluster on 55439 and all original databases. The caller owns any later
app-scope repairs; this run does not claim browser regressions for those findings.
The completed run exited **zero**: all **15 stages passed**, **188/188 unit
assertions** and **9/9 browser scenarios** passed, with zero failures, skips,
pending/todo, interrupted, timed-out or blocked tests. Native discovery and
outcomes agree. The independent identity audit confirms all **156 inherited
unit identities** still pass, plus **32 tooling assertions** (nine more than
earlier S1). The captured source identity is
`1ea07c124e836989a2931f218346245bc10827eda120bb73669c321193d5cf04`,
observer SHA-256 `ef44b3c126ed016e111998358b69e67de465429ae7bbd852b9fcb79296248227`,
fresh build ID `UWsicoVFBLPSNvjuw2w4q`. Lock identity is unchanged.

`run.json` records `complete=true`, `changedSource=[]`,
`originalSourceUnchanged=true` and `serverPortReleased=true`. The post-run audit
`T/sies-review-mechanical-audit.json` independently rechecks native inventories,
reconstructed source, captured simplification bytes and both released ports.
Root `npm run lint` and `npm run typecheck -- --incremental false` passed again
after retaining this new capsule; parsed TypeScript inventory contains **zero**
capsule files and ESLint reports the capsule player page ignored. The new owned
cluster is stopped; its private data/logs and all evidence remain retained.

This is **one** post-fix production run, not three repeated runs of the current
source or a new development control. This result paragraph, the root README
pointer and the corresponding runbook result note were written after measurement:
they are documentation-only additions, not bytes attributed to this captured
identity. No runtime/app/tooling/test bytes changed after the run. Hosted CI,
app-scope repairs and publication were not performed.

## Failure occurrence reconciliation

Native report identities are runner + project (browser) + file + full title.
The predicates below map **every** failed occurrence in each retained report;
they do not replace or edit the native results. A count is a denominator for
that observation, not an estimated flake rate.

The final reconciliation audit is `T/sies-final-audit.json`: it maps **106
failed native test occurrences**, confirms all 156 inherited unit identities
remain passing in each final profile, counts exactly 23 new tooling tests,
and verifies all 197 selected inherited source/asset/migration/notebook/lock/plan
files unchanged. Eleven entries also account for setup, typecheck, probe and
cleanup failures that did not produce failed native test assertions.

| Observations / exact report selection | Mapping / disposition |
|---|---|
| All 85 failed assertions in `T/sies-s0-evidence/unit.json`; all 9 failures in its `browser-dev.json` | [F001](F001-capture-migrations.md): observer omitted migrations; corrected capture passes 156/156 + 9/9 |
| `T/sies-db-smoke.log` and initial U2 reset failure, `dropdb` before reset | [F002](F002-libpq-service-file.md): new helper's empty service filename; corrected smoke and full clean-DB run pass |
| Initial U2 typecheck diagnostics, `ProcessEnv.NODE_ENV` required | [F003](F003-process-env-types.md): new tooling input type; narrowed to partial input, all final typechecks pass |
| `T/sies-u3-browser.log`, config import failure before any browser test | [F004](F004-playwright-module-format.md): new helper's `import.meta` in CJS transform; fixed without changing package module mode |
| Sole failure E2E-04 in `T/sies-u3-final-browser.json`; sole S0 seeded diagnostic failure in `T/sies-s0-corrected-evidence/seed-control.json` | [F005](F005-succession-preconditions.md): inherited fixture precondition; same-seed control establishes mechanism; original rejection/star-pass assertions retained |
| `B/production-initial/types.log` and `build.log` TypeScript recursion diagnostics; all 9 production tests dependency-blocked by build | [F006](F006-recursive-inventory-types.md): new tooling return type, not app build defect |
| `B/production-initial/postgres-version.log`, server-version probe before DB creation | [F007](F007-version-probe-order.md): new orchestration dependency ordering |
| Sole failed assertion `a different database cannot claim an already owned port` in `B/production-initial/unit.json` (177/178 pass) | [F008](F008-port-contract-self-collision.md): new contract test reused the parent runner's reserved port |
| All 9 `Invalid URL` failures in `T/sies-s0-corrected-evidence/browser-production.json` | [F009](F009-external-config-defaults.md): external observer lost imported config defaults; corrected control passes 9/9 |
| `B/interrupted-probe/`, browser stage deliberately terminated; retained server found on port 3100 | [F010](F010-detached-server-cleanup.md): new cleanup bug; fixed probe proves port released, still returns nonzero/incomplete as cancellation requires |
| Focused port test: promise resolved instead of rejecting occupied IPv4 port | [F011](F011-dual-stack-port-probe.md): new preflight bug, IPv6 bind insufficient on macOS; real unrelated server survives corrected refusal |
| Review boundary regression: deadline and dependent both incorrectly passed after child handled SIGTERM with exit zero | [F012](F012-timeout-zero-exit.md): deadline flag and persisted diagnostic; independent stage still runs |
| Review root-tooling probe: 1,782 capsule TypeScript files and ESLint capsule exclusion false | [F013](F013-retained-capsule-tooling.md): exclude retained evidence in both root configurations, without deleting capsules |
| Review Git-free reconstruction probe: added ignored test returned no changed paths | [F014](F014-reconstructed-source-inventory.md): re-inventory policy-approved paths and compare metadata, with six mutation controls |

Intentional proof-first reds are not application observations: missing capture
and DB modules; missing succession predicate; missing stage/source/port helpers.
These failed before implementation, then passed. Expected DB constraint errors
printed inside passing `r2.test.ts` are asserted protections, not failed tests.
The controlled stage-failure, timeout, malformed-report and ownership tests
remain permanent proofs; they do not suppress suite failures.

The original S0 `verify-clean-db.sh` hardcodes another port/account and is unsafe
for this disposable target: that convenience invocation was **not run**.
Its reset/migrate/unit operations were exercised independently in S0 and the
repaired entry passed in S1. The intentionally cancelled probes have missing
browser reports and provide **no** full-suite coverage. Neither exception is
included as a pass in the final profile denominators.

## Preservation, publication and limits

S0's 282 included files still match its manifest after install/build/tests.
Every final S1 report records no reconstructed source mutation and unchanged
original source during measurement. Its S0 scope account reports **no changes
to application source, assets, migrations or dependency entries**. `package-lock.json`
and the plan body are untouched. The final reconciliation commit adds only
this ledger and runbook documentation; it is **not** silently included in the
already measured S1 identity.

The user explicitly authorized inherited commits `4bfdb51` and `8251540` for
publication after resolving the initial dirty-file blocker. The baseline diff
is scoped against `8251540`, not against an ancestry state that omits the UI.
No uncommitted inherited work was absorbed. The caller owns review, PR and
hosted CI; **no hosted CI run is claimed here**. Actionlint validates the CI
definition, and local runs execute the same entry point and stage/report schema.

Docker was unavailable. Installing PostgreSQL 16 recovered the prerequisite;
Homebrew emitted an outdated Command Line Tools warning but successfully
installed the bottle. Existing linked PostgreSQL 14 and its databases were not
used for measurement. The owned private cluster is stopped after verification.
Raw reports/source capsules remain private. No environment or secret file was
read or archived; synthetic secret fixtures verify exclusion policy.

Later review identified app-scope findings #1, #2 and #6 (privacy cover,
no-execution investigation closure and deep-linked reveal gating). They are
outside these mechanical fixes and remain with the caller for separate scope;
the earlier green baseline does not disprove them. The five existing uncommitted
presentation simplifications are preserved, not repaired or reverted here.
Future changes should use the [runbook](../regression-baseline.md), repeat paired profiles and diagnose
new failures; a successful rerun or different seed is never sufficient cause.
