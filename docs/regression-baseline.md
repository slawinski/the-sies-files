# Regression baseline

The inherited source S0 was captured before baseline implementation, from authorized
commit `8251540` (including UI commit `4bfdb51`). No application changes are part of
the baseline work. Raw capsules and reports are private local artifacts, not PR attachments.

## Capture and reconstruction

On Node 24, run `node scripts/regression-baseline.mts "$PWD" "$PWD/baseline-results/s0"`.
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

This is not yet a completed runtime baseline. Completion requires S1 profiles
and final failure reconciliation.
