# Durable command outcome compatibility

This is a local, synthetic service-level compatibility check, not a deployment
or a general binary-upgrade promise. A is Git commit
`c2e00f2a9fb505b1f159476447acd880b7216dc2`. B is the full captured source SHA-256
identity in `run.json` and `compatibility/compatibility.json`, with selected
service/schema hashes recorded alongside it. Package version `0.1.0` does not
identify either implementation.

## How evidence is produced

Before entering the history-free baseline capsule, the parent reads A's exact
Git objects through an explicit source/config/test/migration allowlist. It never
copies dotenv files, Git history, credentials or generated clients. Missing A
is a hard failure; CI fetches complete history so the object is available.

A and B have separate generated Prisma clients and separate processes. All
workers inherit the same live disposable-database lease, execute sequentially,
and reset only that target. A first commits real `addPlayer`, manual checkpoint
and meaningful QR scan results against A's schema. B applies its additive
migration and reads those preserved rows. A then commits another specimen
against the expanded schema (new metadata remains null), and B writes its own
fully identified receipts. Synthetic receipt/event specimens are generated from
these committed rows; no handwritten fixture is called an actual A result.
Raw credentials and request hashes are not exported in the specimens or logs.

Every status and duplicate observation fingerprints the complete authoritative
game/receipt state and effect counts before and after, refusing any change.
The report also discovers A's and B's test identities and requires all original
292 unit/integration, 38 ordinary browser, 18 enabled-security and one physical
recovery identities to remain present. Discovery is not a replacement for the
baseline's actual B test executions.

## Supported observations

| Writer / reader | Observation |
|---|---|
| A before additive migration → B | Three original committed rows survive and pass bounded status reads |
| A on expanded schema → B | Three metadata-free committed formats pass bounded status reads |
| A → B duplicate POST | All three refuse with `COMMAND_RECEIPT_INVALID`; no effects repeat |
| B → B | Selected service duplicate/status paths validate identified results; all 36 producers are additionally contract-audited and tested |
| B → actual A | Actual A status and same-intent addPlayer/checkpoint/scan duplicate services observe unchanged result fields without another effect |

Legacy status requires a single primary event, matching actor/version across
the entire command group, validated payload and matching result IDs. Only full
meaningful scans are supported. A duplicate-only scan, ambiguous events, null
JSON, partial metadata and unknown versions fail closed. Player ownership is
established before decoding; another actor sees the same `UNKNOWN` body as an
absent command. `resultVersion: 0` explicitly labels the bounded historical
adapter; it is not a backfill or inferred current identity.

## Unsupported paths

**This is not safe operational rollback to A.** A ignores receipt identity
metadata, retains unsafe casts for corrupt results, and can fabricate a raw
reset token on duplicate. Cross-actor/request replay and reset replay through A
are not supported. No future reader is promised. Use a forward fix; do not drop
metadata or delete invalid receipts to make old code rerun commands.

An APPLIED receipt proves a commit, not current projection freshness and not
availability of a one-time credential. Duplicate issue/reset returns the
original version with `credentialAvailable: false`, without issuing a token or
revoking reclaimed access. New issuance is a separate deliberate command.

QR recovery stores only a format version, operation, game/player IDs and the
original command ID in same-tab storage. It never persists a token, result,
role or payload. A storage-blocked browser retains in-memory recovery but
cannot recover across reload. UNKNOWN is unresolved, never permission to POST
again. Current access-generation checks guard all private callbacks.

The production baseline requires compatibility, original ordinary/security
checks, and the existing create-only physical recovery proof. Its reports keep
source/build attribution and failed evidence. No retention or content-rights
policy is introduced by this work.

## Initial-denial cleanup verification (2026-11-09)

`PlayerAccessBoundary` now clears the pending identity on authoritative denial
using the existing access-denial predicate, without requiring hydrated game or
player IDs. The unbound inner component mounts, but its null-scope hydration
effect returns before registering cleanup. Boundary cleanup covers that gap;
the existing generation/scope cleanup and status-request guards remain intact.
Loading, transient network/5xx errors and deadlines are not access denials.
This enforces the existing R8 lifecycle, not a new retention policy or a fix for
session-token leakage: pending storage contains only IDs and format/operation
metadata, not private payloads or credentials.

Private local evidence is retained under
`/var/folders/zl/fkgnlthd363175f4ffymzcjh0000gn/T/opencode/`:

- `denial-red-r2/browser.json`, `browser.log` and `artifacts/`: the pre-fix real
  browser regression failed specifically because pending storage survived a
  genuine initial `/api/v1/me` 401 after persisted-session revocation. Its scan
  POST actually committed (including receipt), then its response was dropped.
  Denied/unclaimed UI appeared, private scan UI/result stayed absent, and there
  were zero status GETs and zero additional scan POSTs. The initial-loading
  retention assertion, transient initial 503 and unchanged valid same-player
  reload case passed. No fabricated authentication response was used.
- `denial-green/browser.json`: all 12 focused cases passed after the code fix.
  The red/green source manifests differ only in `src/app/player/page.tsx`;
  this is a causal fix, not a pass obtained by rerunning unchanged source.
- `denial-canonical/run.json`: the existing canonical production entry completed
  all 21 stages, including lint, fresh nonincremental types, clean-database
  checks, production build, A/B compatibility, ordinary browser, physical
  recovery and enabled security. Native source-bound discovery/outcome counts
  are **379 unit/integration, 50 ordinary (48 existing + 2 new), 19 security,
  1 physical recovery**, with **21/21 compatibility observations** passing.
  No tests were skipped, retried or allowlisted; existing assertions and
  timeout limits were unchanged. Lint has the same four existing warnings and
  no errors. The new revocation timestamp is fixed, not part of a dynamic title.

Canonical B source SHA-256 is
`eff0957b27b819e064229c33f52d7bdfedcc3a444a3b96025e652cc36742e523`;
Next build ID is `cG1dUxGwFbeI3DozbTpRP`, with build artifact SHA-256
`a3d6aa18a88d3074c80e80e9cdb45b74a4d0d9394754d9b0579f78aead293354`.
The focused-green and canonical source manifests match. This evidence section
was added after that run; `denial-final-audit.json` records that documentation-
only delta, preserved comment-only simplifications, unchanged old test source
outside the inserted cases, and the untouched plan. It does not attribute the
later documentation bytes to the earlier build.

Runtime: macOS/Darwin 27.0.0 arm64, Node 24.8.0, npm 11.6.0, PostgreSQL 16.15,
Next 15.5.23, React 19.1.0, Prisma 6.19.3, TypeScript 5.9.3, Vitest 4.1.11,
Playwright 1.62.1 and Chromium 151.0.7922.34; one worker, zero retries, UTC.
The run used its own dotenv-free capsule and explicit local disposable PG16
resources, not the original PG14 database or dependency tree. Pinned A
`c2e00f2a9fb505b1f159476447acd880b7216dc2` was materialized from history before
capturing B, with source identity
`1f3fda4b0d0c017c1107d0acc6b25c31a76c616274bdf11dd3570ada6919e354`,
separate generated clients and separate workers. Details and unchanged-state
fingerprints are in `denial-canonical/compatibility/compatibility.json`.

The earlier `denial-red` attempt was infrastructure-blocked before browser
execution: parent and sanitized child resolved different temporary lease
directories. It is retained, not counted as the behavioral red; explicitly
aligning the owned runner's TMPDIR produced `denial-red-r2`. No application
change was made for that infrastructure correction. Raw diagnostics remain
private and were not uploaded. Owned servers and leases were released; no
inherited evidence or dependencies were deleted. These are local synthetic
results, not production-incidence measurements or an operational rollback
guarantee to A. The unsupported paths above still apply.
