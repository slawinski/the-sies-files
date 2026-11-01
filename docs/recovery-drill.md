# Prove playable recovery

This drill demonstrates one deterministic 13-player game interrupted after seat
0 votes, with seat 1 pending. It is not a production backup service. Run it only
on a dedicated loopback PostgreSQL **16** instance with create/drop-database
privileges. It never adopts the database named in the connection URL: that URL
provides the explicitly authorized local connection; two unpredictable names
ending `_test` are created from `template0`. A collision fails without dropping
the existing database.

## Prerequisites and invocation

- Node 24, locked `npm ci`, existing Playwright Chromium (`npx playwright install
  chromium`), and PostgreSQL 16 `psql`, `createdb`, `dropdb`, `pg_dump`, `pg_restore`
  in PATH. Wrong server/client majors fail before allocation.
- A private local cluster/account, not a production connection or the default
  developer database. For example, initialize a **new** directory with PG16
  `initdb -D "$NEW_PRIVATE_CLUSTER" --encoding=UTF8 --locale=en_US.UTF-8 -A trust`
  and start it with `pg_ctl -D "$NEW_PRIVATE_CLUSTER" -l "$NEW_PRIVATE_LOG"
  -o '-h 127.0.0.1 -p 56439' start`. Choose a free port; do not stop an existing
  listener. Trust authentication is appropriate only for this private loopback
  disposable cluster, not deployed databases.
- Supply `DATABASE_URL` through process environment, for example
  `postgresql://YOUR_LOCAL_ACCOUNT@127.0.0.1:56439/recovery_connection_test`.
  Replace the account/port with your dedicated instance. Do not copy credentials
  from an application `.env`. If `E2E_DATABASE_URL` is set it must agree exactly.
  Remote URLs, URL query/hash overrides, and names not ending `_test` are refused.
- Port 3100 must be free on IPv4 and IPv6. Never kill a listener to run the drill.

```sh
npm run recovery:prove -- --output baseline-results/recovery-NEW_ID
```

The output directory must not exist. Standalone execution captures source while
excluding dotenv/secrets, installs the lockfile and builds once in that private
capsule. Both app starts use that same output. `scripts/backup-restore.sh` is now
only a no-argument compatibility wrapper; all historical positional arguments
are refused, not reinterpreted as authorization to dump or delete a database.

For release verification use the canonical entry instead:

```sh
npm run baseline -- run baseline-results/production-NEW_ID production
```

The production baseline hands off only its port lease after awaiting its ordinary
server's exit, then passes its recorded source/build to recovery. Recovery checks
source, lockfile, schema, migrations, BUILD_ID and production artifact hashes.
It refuses a mismatch; it never rebuilds a substituted canonical specimen.
After worker completion and owned app shutdown, both modes recheck the captured
working source (including tests) and the original build identity before accepting
the receipt. Standalone checks its captured capsule, not subsequent checkout edits.
The `--build-record` option is for this source-bound capsule path, not a shortcut
for serving an arbitrary preexisting `.next` directory.

## Interpret the evidence

Read `recovery/recovery.json` in a baseline run, or `recovery.json` in a standalone
run. Exit zero requires **every** claim, the native inventory, and cleanup:

| Claim | What was actually checked |
|---|---|
| `archiveRestoration` | Source process stopped and awaited; custom archive restored with exit-on-error, no owner/ACL replay, into a different new database |
| `durableRows` | All game-owned session/roster/claim/browser-session, secrets/setup, operational/action, effect/death, investigation/nomination/vote, scenario/discovery/task/condition/scan, checkpoint/event/receipt rows match before target requests |
| `runtimeProjections` | Fresh PID, identical production artifacts; public, Storyteller and all player views, letter clues, base map DTO/asset and locked WEST_AREA denial match |
| `persistedSessions` | Original cookie jars still authorize player and Storyteller API requests and pages; pending seat and reconciled LIVE UI load without new claims |
| `duplicateEffectFree` | Seat 0's exact prior actor/command/payload/version returns its original response, with all durable gameplay rows unchanged; stale new/wrong-seat commands still fail |
| `legalContinuation` | Seat 1's new false intent adds one vote, one receipt, one version and exactly VOTE_INTENT_RECORDED + VOTE_PASS_ADVANCED, advances to seat 2, and changes no unrelated rows |

Sensitive comparisons occur in the test worker's memory. A mismatch reports its
family, never a private row diff. Cookies are not saved. `recovery-native.json`
contains case IDs/statuses plus sanitized assertion locations; discovery must
match every native outcome. Missing/truncated reports and skipped/interrupted
cases fail. The parent reports UTC stages, source/build identities, actual
Node/Chromium/PG server and tool versions, distinct PIDs/databases, and cleanup.
For a built specimen, `fingerprint.complete` records the final source/build check.
A changed, missing or unreadable fingerprint fails overall completion. A sanitized
`fingerprint.failure` records that failure even when `failure` / `failureStage`
already identify an earlier cause; owned cleanup still runs. No expected identity
is regenerated to accept drift.
CI uploads only the three recovery JSON files, not capsules, archives, sessions
or raw database exports. Recovery traces/screenshots/video are disabled.

## Failure, cancellation and cleanup

- **Preflight:** correct the explicit URL, PG major, new output directory, or
  occupied lease/port; never adopt an existing resource or use reset as a fix.
- **Build/source:** start a new source-bound run. A changed lock/schema/build is
  not the recorded specimen and cannot be excused by a successful readiness URL.
- **Dump/restore:** no continuation claim is possible. Preserve the sanitized
  stage report and native failure locations. Do not restore the private archive
  elsewhere; it is deleted during cleanup.
- **Comparison/continuation:** diagnose the named family/assertion location.
  Keep the first failure report even after a fix; do not relax equality, skip a
  seat, retry commands automatically, or accept restored table counts as proof.
- **SIGINT/SIGTERM/worker exit:** the parent retains app process-group handles,
  leases and successful-create flags. It stops only its groups, then drops only
  successfully created databases while their leases still prove ownership.
  Worker death does not transfer ownership to the worker or authorize port kills.
- **Cleanup failure:** overall failure even when every claim passed. The report
  names failed resource families. Do not remove stale leases or drop a database
  based on its name alone. Verify the recorded owner PID is dead and the exact
  resource belongs to this run before a maintainer performs manual recovery.
  Lost ownership blocks destructive cleanup; do not steal another owner's token.
- **Hard parent kill/machine loss:** catchable cancellation is covered; SIGKILL
  cannot execute `finally`. Private resources may remain. This is not a daemon
  or a general stale-lease reaper. Keep the run and ownership evidence for manual
  reconciliation. Stop a private PG cluster only if you created it and verified
  no other run is using it.

The private Unix socket and archive directory have owner-only permissions. Tool
stderr/environment/connection URLs are never copied into recovery reports.
Ordinary baseline reports retain their existing separate evidence policy.

## Negative controls

From the same verified capsule, the test-only orchestrator controls
`--negative-control corrupt-archive`, `missing-continuation`, and `worker-exit`
must exit nonzero. Supply a new `--output` and the capsule's matching
`--build-record`; these are lifecycle seams, not production API endpoints.
Corruption truncates the real archive before `pg_restore`. Missing continuation
rejects completion even after physical restore and all browser assertions.
Worker-exit kills the recorded worker after the source app starts; the parent
must still clean its source and app. A failure caused only by source mismatch or
native-case omission is not evidence that either continuation control worked.
Additional bounded controls exercise a real dump-output failure (`dump-failure`),
failed app launch (`launch-failure`), readiness deadline (`readiness-failure`),
and a catchable parent SIGTERM (`parent-cancel`). These are diagnostic failure
injections, not alternate success paths; none may report an overall pass.

## What the diagnostics and drill do not prove

Replay v2 preserves the old response fields and declares `scope: PLAYER_FLAGS`.
`ok` requires both no divergences and complete verification of that scope.
Checksum, shape, membership, boundary/event/version anchors, supported flag
events and identified audited overrides are checked in one repeatable-read
snapshot. Legacy identity-less overrides, unknown events or malformed history
report explicit unverified reasons. Multiple events per version are legal;
manual and automatic checkpoints have different sequence boundaries. History is
not rewritten or guessed. Phase obligations, roles, operational effects,
scenario/access state and presence are **not reconstructed** by this verifier.

E2E-08 proves in-process consistency/bounded replay only. The System screen's
“Spójność OK” is not physical restore or playable-continuation evidence.
The drill covers this one first-cycle mid-vote specimen and current schema/build,
not arbitrary histories, unfinished registration or later-night succession,
expired sessions, other scenario stages/topologies, cross-release compatibility,
deployed recovery, production RPO/RTO, rollback or backup retention guarantees.
Presence/rate-limit transport state is re-established, not compared as durable
gameplay truth.

## Operator record

The implementation agent self-ran the drill. **No second human operator has
performed this procedure.** A successor should record their own date, source ID,
build ID, run path, each claim and cleanup outcome rather than treating this
runbook as evidence of a second operator. Local failure/verification provenance
is recorded in [recovery-verification.md](recovery-verification.md).
