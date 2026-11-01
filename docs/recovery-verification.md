# Recovery implementation verification ledger

Date: 2026-11-01. Base: merged PR #3, `c3830271df7ae33ffa6e3ef348227a36bba75b65`.
This is an agent self-run, not a second-human-operator record or hosted CI result.
All recovery report paths below are relative to `baseline-results/`. Evidence
directories are retained; none of the inherited evidence was deleted for space.

## Confirmed diagnostic failures before the fix

`npm test -- tests/recovery-diagnostics.test.ts` on the fresh private PG16 target
failed **6/8** cases before implementation: checksum mismatch was accepted;
override events omitted the validated player ID; deleted last checkpoint event
was accepted; checksum-valid duplicate players, wrong-game identity and missing
membership were accepted. Malformed flags and a legacy override already returned
false for this specimen (not claimed as new reds). After U1, the expanded
diagnostics plus unchanged r1/r2 tests passed **28/28**, including both automatic
and manual checkpoint conventions, exact target counters, corruption, gaps,
versions, unknown events/players and override prior-value validation. Root lint
and fresh `tsc --noEmit --incremental false` passed.

The compatibility-wrapper regression failed before replacement because the old
script attempted `pg_dump` instead of refusing its positional arguments. That
first red inadvertently attempted the old default Unix-socket connection; PG14
rejected the nonexistent `existing_database`. No database was dumped/reset or
successfully queried; the empty owned output `another_database` was removed.
This was a test-harness safety mistake, not proof that the old entry was safe.
All subsequent DB commands explicitly target private PG16 port **56439**.
Similarly the first existing reset-wrapper migration announced automatic `.env`
loading by Prisma CLI despite the explicit test URL. No environment contents were
printed or inspected by the agent, and the target was the private PG16 test DB,
but this was not the requested no-dotenv workflow. Later migrations/builds run
only in captured capsules that exclude dotenv bytes. Neither incident changed
the inherited PG14 service/configuration or its databases.

## Physical drill first attempts and corrections

| Run | Recorded source | Build | Observation / cause |
|---|---|---|---|
| `recovery-first` | `358bc6171d4f3079bd26a0151f58b927054dfcaf9b1a4167aafbb3e5b44f7c07` | `K-rcn0GoWiHXrwo-XqLy_` | Failed before dump: fixture read nonexistent `scenario.discoveries` instead of the actual player DTO's `scenario.clues`. Cleanup passed. Native inventory retained; this first observer version did not retain assertion locations. |
| `recovery-second` | `4adcbdda482f4d63caa1e94ebc84a3c2c3e6907464e50fac283eec62b3663055` | `oNLierw61ol4QOlsjrhtw` | Restored archive/rows/views, then UI assertion failed. Failure sanitizer initially discarded useful native locations; corrected to retain only source-frame locations and fixed comparison-family labels. No private diff was published. Cleanup passed. |
| `recovery-third` | `3993a5160bd7044b5692408dd4e275c33e768dab1ec8e8c2ea1577ec59e81d3a` | `zRS3bjlfa8HZLSrba9xTV` | Native frame located the LIVE assertion. The responsive shell has multiple status elements and Storyteller must open `/storyteller/GAME_ID`, not its chooser. Matched existing E2E-10's status-role locator and used the actual game page; no LIVE timing/assertion was dropped. Cleanup passed. |
| `recovery-fourth` | `ed27da7e74b4eb32f9ce9215727ac7f4354185dc0bd7a9296cff26a89583eaf9` | `4Ta5JHDpeFaJeb3yIJnm4` | All six claims and cleanup passed. Source PID 72110, target PID 72152, Chromium 151.0.7922.34, PG server/client 16.15, Node 24.8.0. |
| `recovery-u3-final` | `8f11a051144f601abe6c8249c7a179fbfb3ca2cb97dfdd4a36430707fbbf1860` | `IPu2fGPYs5DZPO6t6EfVw` | All six claims, exact native discovery/outcome and cleanup passed after adding full production artifact fingerprints. PIDs 74629/74671; distinct database names recorded. Artifact SHA-256 `7b4a84283a57c4fe6e2c8cae2014d70ddc3ea7bdaa9275ff4459304beeb32f7e`. |

These are fixture/observer failures, not inherited application-defect labels.
No game rules or authentication/projection allowlists were changed to pass them.
U1 intentionally changes recovery diagnostics and additive override audit data.
The source, lock/schema/migrations, build/artifact IDs and actual versions are
recorded per run; evidence is not attributed to a later source digest.

## Tooling reds and regression gates

The port-handoff test failed because `releasePort` did not exist. Its passing
replacement proves wrong tokens fail, another runner cannot steal the port,
handoff admits a new port owner, and the original database lease remains held.
The recovery-inventory test likewise failed before implementation and now
rejects missing, truncated and omitted/empty outcomes. The focused tooling suite
passed **41/41** tests (database leases, baseline inventory/stages and recovery
entry/lifecycle primitives). Collision tests used real CREATE/failed-CREATE/
SELECT/DROP on a newly named private PG16 database and showed cleanup did not
drop an uncreated collision target. Existing baseline timeout/independent-stage
and unrelated-listener tests were used unchanged.

The full current suite and canonical production profile are authoritative only
when their own retained native inventories and cleanup reports pass. Refer to
the next recorded run receipts rather than extrapolating old counts. The item
#1 baseline remains preserved (179/9 initially, 188/9 after its review fixes);
PR #3's later suite supplies the current pre-recovery baseline. Recovery must
add one separately inventoried browser case without removing its ordinary cases.

## Completed canonical and standalone receipts

The final measured implementation source is
`fa810041f8f1a02e691fde29453ce0a24e10a8e52f6ba529819b0a60e5e67bd1`.
This ledger's receipt section was appended **after** those measurements; it does
not attribute the later documentation bytes to the measured source. No behavior
or test/configuration changed after these final profiles.

| Run | Result | Build |
|---|---|---|
| `recovery-production-1` | First canonical integration passed 241/241 unit tests, all 38 ordinary browser cases and the separate recovery case; all 16 stages, all claims and cleanup passed | `N_-qoPGpmcVdlg9T-3P1A`, source `36903ab5643770431832b373e78bd9eea11e01dc596a764b2f43b4f4f3e9d8b5` |
| `recovery-production-final` | **243/243** unit/integration tests, **38/38** ordinary browser cases, **1/1** separately discovered physical recovery case, **16/16** stages; zero retries/skips/failures, unchanged original/capsule source, cleanup passed | `hELxzqHFZHz6IEXUhA1nN` |
| `recovery-development-final` | **243/243**, **38/38**, **16/16** stages; recovery explicitly **not-applicable**; zero retries/skips/failures, unchanged original/capsule source, cleanup passed | `0SqpLt6u0w_uD2x4ZHcew` (production output then deliberately removed for dev) |
| `recovery-standalone-final` | Fresh locked install and one fresh production build; all six recovery claims, native case and cleanup passed | `M4CDtotdssLdaaWw5pdpm`, source is the same final measured implementation |

Production artifact SHA-256:
`4b09b40b36ac4523683381fb7de96aff79491c113b95ea3c1e32e824058b247f`.
Standalone artifact SHA-256:
`8f1c86300956c8bacf59bfba4ea5c536711e497931266102f514b2dd026e07f4`.
Both use lock hash `558871d14c532929d3a5d518c9c116526f2e470bb4eefb94aabb137582cc7c7e`,
schema hash `b9ccbfef14ac54289642f8c164e3f9ce64282386562ab59dd3e805a7e7ebd76b`,
and migration-set hash `d8a4ef009b590f89c1634e928157216026f375ba99cf0cee5c746da435dd92b6`.
Production source/target PIDs **5915/5989**, standalone **24518/24560**; database
identities differ in each report. Actual runtime: Node **24.8.0**, Chromium
**151.0.7922.34**, PostgreSQL server/tools **16.15**.

An independent native evidence audit compared every prior **212** unit test
identity and all **38** browser identities against both final profiles: all are
preserved, with **31** new unit tests and one separately inventoried recovery
browser case. The audit also required exactly one first-attempt browser result
per ordinary case, every stage passed, matching canonical/recovery build objects,
and zero source drift. Its local script/report are retained under the approved
temporary work directory as `recovery-evidence-audit.mts` / `.json`.

Additional checks passed:

- Root `npm test`: 243/243, 30 test files.
- Root `npm run lint`, `npm run typecheck -- --incremental false`, and
  `git diff --check`.
- Existing clean-schema entry `bash scripts/verify-clean-db.sh`, run from the
  final dotenv-free production capsule against newly created
  `recovery_clean_test`: all 12 migrations and 243/243 tests passed.
- Installed `actionlint` **1.7.12** accepted `.github/workflows/ci.yml`.
  Hosted GitHub CI has **not** been run by this implementation worker; the
  caller owns publication and hosted checks.

## Recorded-build negative controls and resource audit

All `recovery-final-control-*` runs consumed the final production source/build
record rather than rebuilding, and exited nonzero with successful owned cleanup:

| Control | Actual failure boundary / retained evidence |
|---|---|
| `corrupt-archive` | Real truncated archive; `pg_restore failed (exit 1)` at `restore`; native case present and failed, not omitted |
| `missing-continuation` | Real restore, fresh target process and assertions reached `continuation`; `Missing required continuation evidence`; native case present and failed |
| `worker-exit` | Recorded worker forcibly terminated after owned source app started; parent retained and cleaned app/database ownership |
| `dump-failure` | Real `pg_dump` refused a directory as its archive output; exit 1 at `dump`; no restore/app substitution |
| `launch-failure` | Owned Next process exited on invalid port; failure before readiness |
| `readiness-failure` | Actual owned app never satisfied the deliberately invalid readiness URL; bounded deadline failed |
| `parent-cancel` | Catchable parent SIGTERM after source app started; `cancelled: true`, nonzero, cleanup passed |

The first shell loop stopped after corrupt-archive because zsh reserves the name
`status`. This was an invocation typo, not a drill/application failure. The other
controls used `result_code`; `recovery-final-control2-corrupt-archive` separately
confirmed the drill's exact exit code **1**, with its own immutable report. The
earlier `recovery-corrupt-control`, `recovery-missing-control` and
`recovery-worker-exit-control` reports are also retained under their older source
identities; they are not substituted for final implementation evidence.

`recovery-build-mismatch-control` deliberately passed the canonical record to the
separately built standalone capsule with identical source but different build
artifacts. It exited **1** at `build` with **Recorded build mismatch**, before
creating a database or starting an app; cleanup passed. This tests the artifact
guard, not merely a changed-source rejection.

Real database collision and ownership-loss unit tests establish that an existing
collision is never dropped and a changed lease token prevents cleanup. The
ownership-loss test restores its original token only in the test fixture's
`finally` to clean its own allocation; production does not steal ownership or
silently clear a failure. The final full suites include both regressions.

Before cluster shutdown, the audit observed port **3100 free**, no private drill
archive/socket directories, no leases for the recorded drill or verification
targets, and **no recovery source/target databases**. Only the four explicitly
created verification databases remained. They were then dropped individually;
PG16 reported **0** non-template/non-postgres databases, and the owned cluster at
`sies-recovery-20261101-pg16` was stopped successfully. Its log and all evidence
capsules/reports are retained; inherited directories were not deleted. The
inherited PG14 service and all its data were not changed (the initial rejected
connection mistake is disclosed above).

## Review finding #1: final specimen check

The review of HEAD `3eb9e7eef9a249afaed751b233ce009bb8dde56d` identified
a conditional late-drift false pass, not measured production incidence. The fix
retains the original manifest/build identity and rechecks the actual working
capsule after worker/app shutdown, before accepting/writing the receipt. Existing
source exclusions and build-artifact/lock/schema/migration contracts are unchanged.
An additional sanitized `fingerprint` result preserves an earlier primary failure.

Actual-source virtual regressions execute the entire current recovery and baseline
modules with virtual OS adapters; capture, source verification and build hashing
are real code, not mocked successful comparisons. No real DB/process/port or
other capsule is mutated. `recovery-fingerprint-red-2/unit.json` records nine
late-drift cases falsely passing before the fix (compiled artifact in both modes,
standalone source/test, recorded lock/schema/migration, missing/unreadable artifact).
`recovery-fingerprint-red-2/dump.json` separately confirms an earlier dump error
was preserved but the additional fingerprint failure was absent before the fix.
The initial `recovery-fingerprint-red` run failed on the VM's top-level-await
wrapper, not the defect. The first green attempt exposed version probes being
counted as drops in the test adapter; that accounting bug was corrected, without
weakening cleanup assertions. `recovery-fingerprint-green-2/unit.json` then passed
all 13 selected new cases, including normal passes and captured-source versus
checkout independence. Nine old tests were deliberately unselected in this
virtual-only run, not removed; full-suite receipts below are authoritative.

Post-fix production/standalone receipts are recorded separately below; the earlier
243/38 receipts above describe only their original pre-fix specimens. Development
behavior is unchanged; its prior 243/38 run is not relabeled as post-fix evidence.

### Post-fix measured receipts

Both runs measured source
`59f794b3d93b0d7a217270dcdb2a9e8516dc94bc1f70fb161bd0cb1ae760cb13`
on reviewed HEAD plus the uncommitted finding-1 fix. This receipt subsection was
appended afterward; its documentation bytes are not attributed to that digest.

| Run | Actual outcome | Build / artifact SHA-256 |
|---|---|---|
| `recovery-fingerprint-production` | **256/256** unit tests, **38/38** ordinary browser cases, **1/1** separate physical recovery case, **16/16** canonical stages; no skips/failures/retries, original/capsule source unchanged, all claims/final fingerprint/cleanup passed | `7z1uKJYWAa7mHxxvp-Mtb` / `a11b2ea4e93f8e955a20fcaf93cd652ac5e90003855944f52ae12b755983de06` |
| `recovery-fingerprint-standalone` | Fresh locked install/build; **1/1** physical recovery case, all six claims, final fingerprint and cleanup passed | `xOqHqt6OcZtk3ynjCkr14` / `b095649fe36425b57e7ce281932d975cf642eca35078e3e88badd7106b0d17ff` |

The production `run.json`, `unit.json`, `browser.json` and
`recovery/{recovery,recovery-discovery,recovery-native}.json`, plus the standalone
three recovery JSON files, retain their native inventories. The audit at
`recovery-fingerprint-green-2/evidence-audit.json` compared every prior **243**
unit identity and **38** browser identities: all preserved, exactly **13** new unit
cases, and one separately inventoried recovery case. It also rehashed both retained
capsules and artifacts after the runs; both matched their original records.
The focused entire recovery-tooling file passed **22/22** from the dotenv-free
production capsule (`recovery-fingerprint-green-2/tooling-unit.json`). Targeted
ESLint with zero warnings, fresh nonincremental root types and `git diff --check`
also passed; the canonical capsule independently passed full lint/types/unit gates.

Production source/target PIDs were **23092/23150**, standalone **25423/25452**;
each report records distinct owned databases. Node **24.8.0**, Chromium
**151.0.7922.34**, PostgreSQL server/tools **16.15**. Lock/schema/migration hashes
remain the same as the earlier receipts. These runs used a new owned private PG16
cluster `sies-fingerprint-20261101-pg16` on **56439**, with explicit URLs and
dotenv-free capsules; the original PG14 and retained older clusters were untouched.

The resource audit observed port **3100 free**, no drill databases, no private
archive/socket directories, and released leases. Only the explicitly created
`fingerprint_canonical_test` verification database remained before final cluster
cleanup. The final cleanup receipt and documentation-only source delta are retained
alongside the audit. No physical concurrent artifact mutation was attempted: the
late-drift negatives are actual-source virtual tests, not measured live incidence.
No hosted CI or second-human operator is claimed; development was not rerun.

## Requirement coverage and limits

- **R1–R3 / AE1:** final physical native case, distinct target/PID and identical
  build fingerprints, full durable/view equality, persisted sessions, original
  stale-envelope duplicate, exact legal next-vote delta.
- **R4–R6 / AE2:** diagnostics/r1/r2 and concurrent target checks; explicit
  player-flag scope, checksum/shape/membership/sequence/version validation,
  before/after override replay, legacy/unknown/malformed unverified reasons.
- **R7 / AE3:** real create collisions, changed ownership, unrelated-port/lease
  regressions, physical failure/cancellation controls and native cleanup audit.
- **R8:** canonical required stage plus separate discovered/outcome inventory,
  negative controls, PG16 selection and recovery JSON-only CI upload paths.
- **R9:** successor runbook, prerequisites, interpretation, failure/cleanup and
  exclusions; agent self-run only, **no second-human claim**.
- **R10:** all prior 212/38 identities preserved, all new and old assertions pass,
  causal fixture/observer failure accounts retained; no skips, allowlists,
  weakened application assertions, new dependencies, migrations or game rules.

This evidence covers the plan's one interrupted first-cycle voting specimen and
declared bounded diagnostics, not arbitrary-history event sourcing, deployed
recovery, cross-release retry compatibility, RPO/RTO or every unfinished state.
