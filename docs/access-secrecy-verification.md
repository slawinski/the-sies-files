# Access and secrecy verification

## Scope and source

Implementation of `docs/plans/2026-11-01-2054-fix-access-and-secrecy-boundaries-plan.md`
on base `4cf1bd3c8a184107e38ded4e918c5674e9448f0c`. Local evidence only;
there is no deployed application or hosted-production security result.

Private evidence root: `/var/folders/zl/fkgnlthd363175f4ffymzcjh0000gn/T/opencode/`.
Capsules exclude environment files and credentials without reading them. All
subprocess output is captured privately before diagnostic selection. Resources:
new UTF-8 PostgreSQL 16.15 cluster `access-secrecy-20261107-pg16`, loopback 55471,
database `access_secrecy_test`; no existing cluster or lease was taken over.

## Attempt ledger (append-only outcomes)

| Attempt | Source / artifact | Outcome and causal account |
|---|---|---|
| Original capture | `access-original-20261107/manifest.json`, source `705c5a49f5b87fa596474dd5a8f4f56629b8e24fbac116ca64e5d11658d3f933` | Exact original application plus offered plan; locked install passed. Retained for causal negative controls. |
| U1 first characterization | `access-u1-20261107/manifest.json`, source `4824e54a80bae6a3bedd2849a1caea4c4e272476a4c25f3b508274aa4f3303b8`; `access-u1-clean-db.log` | Migrations passed; 257 unit assertions passed, one new fixture failed. The database already enforces identity XOR, so constructing a dual-role row fails before lookup. This is a fixture mistake, not an application regression or a lifecycle red. Corrected test asserts database rejection, retaining revoked-session checks. Original failed receipt retained. |

| U1 corrected characterization | `access-u1-fixed-20261107/manifest.json`, source `23098beca4e81f21122318762276bd0160d02f2b0b758a0f5a105975b6bcc49e` | Clean migrations and all 258 unit assertions passed; real two-game HTTP membership case passed on unchanged production boundary code. |
| U2 actual mounted red | `access-u2-red-20261107/manifest.json`, source `921efa8914112400bbbc2205869589c9a6b02e5ff174819214cd1a3653a09068`; `access-u2-red-http.log` | Real persisted logout, restored admitted cookie and actual scoped 404: expected zero old game-name elements, observed one. Original client code retains the private view. No fabricated authorization response. |
| U2 first green attempt | `access-u2-green-20261107/manifest.json`, source `f422335c514dec68deae5049c01c36aa584257bb740dd1bc4a7b859482026049` | All 260 unit assertions passed; types failed because the new mutation access ticket was declared in the effect rather than the callback. Fixed lexical scope. Browser stage was not run after this prerequisite failure. |
| U3 original stream red | `access-u3-red-20261107/manifest.json`, source `8bbf6363210494460d8ec7aab9a9201db468f0b436e4e7643c946cc3c331bb8a`; `access-u3-red-unit.log` | Both focused checks failed: unauthorized post-admission invalidation was delivered; idle connection performed zero rechecks. Stream source is still the original admission-only implementation in this specimen. |
| U4 original trust red | `access-u4-red-20261107/manifest.json`, source `3550202ca8f36c244a70139f1ec451ce0025ed404de8cf6b6fe2052497adaa0c`; `access-u4-red-unit.log` | Eleven focused assertions failed on the original origin/limiter helpers. Forged host authority passed, non-origin forms passed with no Host, configured authority was rejected with forged forwarding metadata, and the 31st rotated-address claim budget attempt was not throttled by the real database counter. |
| Integrated first attempt | `access-integrated-1-20261107/manifest.json`, source `0c1c1b22ca936d56f36045ff19c4cbcb2d62a85c48bbce20460952c8abe6b0dc` | Unit and lint passed. Types exposed inferred NODE_ENV string in the launcher helper; explicit ProcessEnv return type fixes it. Security: 7 passed, one fixture failed: sixteen NORMAL participants exceed the established 13–15 normal-player setup rule. Fixture now designates the sixteenth participant TRAVELLER through the existing API. No budget or game rule changed. |
| Integrated second attempt | `access-integrated-2-20261107/manifest.json`, source `1f6b4c2407829b657bb476ed1abeda4190999ecbed2a100a5a4e2da79df7992f` | Fresh types, all 283 unit assertions, and all 12 real security cases passed in development. Includes held actual main/auxiliary/token responses released after same-game reauthorization. SSE elapsed: reset 33ms (reset publishes broker traffic), idle persisted expiry 10005ms, idle Storyteller logout 10004ms. These are this specimen's observations, not final production results. |

## Coverage status

Additional retained attempts, after the table above:

- `access-production-1/run.json` and `access-development-1/run.json`, source
  `6a510adb5899f088db585ab3192efae4b76e51c5e9546d0b32e04ac3a42fdf10`:
  both complete, 287 units, 38 ordinary cases and 14 security cases; production
  additionally passed its one physical recovery case. These precede later tests.
- `access-security-cancel-20261107/run.json`, source
  `f7c7b9b40260c8dc09f14cd21c5e768b099c94b888cadc6b7e7f0b7e84bfbd46`:
  deliberate SIGTERM while the separately owned security server was listening.
  Exit 1, security failed with SIGTERM and incomplete inventory; all earlier
  stages (289 units, 38 ordinary cases and physical recovery) passed. Report
  remains incomplete, owned server/group and leases released, port verified free.
  `access-cancel.py` and `access-security-cancel-driver.log` retain the observer.
- `access-stream-cadence-red-20261107/manifest.json`, source
  `de6c08b6e57a4d57ceea7e4cfff08318d6341cc8d68733e3b35d8263ab90cd3f`:
  new slow-success check exposed a bound defect in the first implementation:
  completion-scheduled idle checks could add the prior query's duration to the
  nominal bound. At ten seconds after a four-second query only one check had
  started, not two. The fixed cadence counts from attempt start, with no overlapping
  query and the same five-second deadline. This is not a waived settled decision.
- `access-production-final/run.json` and `access-development-final/run.json`,
  source `2609190598e44027158ca1de48c55ff7475d5ab63a926afd9be01a5445bf9566`:
  both complete, 290 units, 38 ordinary cases, 15 enabled-limit security cases;
  production additionally passed physical recovery. Fresh types, lint, build,
  reset/migrations and cleanup passed. `access-final-clean-db.log` separately
  records `bash scripts/verify-clean-db.sh` with the entire 290-test suite.
  Production build ID `2yexkpeS0P9jG6w7aVUDf`. Later changes add HTTP assertions
  for paired errors, held audit, completed token-dialog disposal and command denial.
- `access-original-unit-discovery.log`: direct dynamic discovery failed because
  file-parallel workers each attempted the same database lease without a parent
  owner. No database was reset or unrelated owner displaced. The stale lease on
  this run's own test target was removed only after confirming its PID dead and
  its ownership record unchanged. `access-original-inventory-driver.log` records
  that confirmation. Parent-owned discovery then succeeded for original unit and
  browser inventories (`access-original-*-discovery-owned.*`).
- `access-evidence-audit-access-production-final.json`: first audit incorrectly
  collapsed duplicate original test labels into a set and counted 254. The
  corrected multiset audit retains multiplicity: all **256 original unit
  identities** and all **38 ordinary browser identities** are present, with none
  missing, in both profiles. Both audit receipts remain on disk. The audit also
  proves the four negative controls used byte-identical original target modules
  and that the complete 404-line plan was not modified.

Final captured profile results are recorded below when observed; earlier green
attempts are not substituted for those gates.
The paired-role service characterization compares complete public and own-player
DTOs with identical IDs, timestamps and version (no normalization); the intended
other player's role DTO is the positive control. Existing claim and map service
tests remain unchanged regression evidence, not new negative controls.

| Requirement / example | Bounded evidence and positive controls |
|---|---|
| R1, AE1 | E2E-12 two-game membership: public/member, scoped player, Storyteller main/control/audit/consistency, command status, protected layer and stream admission; anonymous and cross-role credentials, known and nonexistent game. Cross-game add-player, player-action, reset and privileged recovery attempts preserve the target projection and event count. Expired player and revoked Storyteller HTTP denials are separate checks. |
| R2, AE2 | Complete paired-role service DTO comparison; complete paired-discoverer-clue public/own-player HTTP and anonymous error/status/cache-header comparison. Intended player and Storyteller positive controls see the changed clue; explicit public reveal then exposes it to the other player. No IDs/times/versions or secret fields are removed. Locked/unknown assets return JSON denial; authorized WEST_AREA bytes equal the protected source asset and use no-store. Map tests execute the real service-worker source and prove it does not intercept API/assets/SSE, with a working shell positive control. |
| R3, AE3 | Stream unit tests: before metadata, idle, hard expiry, coalesced bursts, timeout, rejection, abort, cancellation, already-aborted request and enqueue failure; late completion is inert and timers/subscriptions release. Real HTTP/SSE reset, expiry and logout use persisted rows. Nominal bound 15s; separately named local scheduling allowance 1500ms. |
| R4, AE3–AE4 | Real scoped-404 Storyteller clearing; main/control/audit/token-response holds across loss and same-game recovery; completed claim dialog disposal; real command-membership denial before the next poll; mounted player reset/expiry and covered reclaim. Access-lifetime publication fence and denial classification tests. Existing E2E-10 remains authoritative for temporary errors, deadlines, no command replay, identity cover, deep links, day closure, freshness/version and command-lock recovery. |
| R5–R6, AE5 | Request-trust origin forms and persisted rotating-address budget; E2E-12 actual 31st HTTP claim 429/positive Retry-After plus creation/logout 403 with unchanged game/session counts and cookie state. Configured origin is independent of supplied forwarding headers; originless API compatibility is retained. |
| R7, AE5 | Sixteen real claims (15 normal + one Traveller), role reveal/acknowledgment, reset/reclaim, valid Storyteller recovery and logout with enabled limits. Concurrent fixed-window and rollover unit checks. No allowances raised. |
| R8–R10, AE6 | Separate security profile and sanitized inventory; production/development capsules, ordinary identities and mandatory production physical recovery are required. Original failing reports remain private and nonzero; this ledger distinguishes fixture/tooling failures from application reds. |

## Configuration and operational limits

APP_ORIGIN is a complete configured HTTP(S) origin. Default is
`http://localhost:3000`; all owned 3100 servers explicitly configure
`http://localhost:3100`, including production, development and physical recovery.
Host, forwarded host/proto and forwarded addresses never establish authority.
Missing Origin remains an inherited non-browser compatibility exception;
cross-site Fetch Metadata is still forbidden. This is not a universal CSRF claim.

Anonymous requests share the stable unknown caller per existing operation.
Allowances remain claims 30/15min and token 5/5min, recovery 5/15min, logout
30/5min and create-game 10/hour. Shared exhaustion can reject legitimate callers
until rollover; there is no per-person fairness or trusted proxy identity.

SSE rechecks the captured persisted session ID, actor, game and player binding,
including null opposite-role scope. Cookies are read only at admission. Idle
checks occur at most every ten seconds with a five-second application deadline;
known expiry closes earlier. Broker bursts retain one latest metadata watermark,
not an event backlog. Database uncertainty closes silently and the interruption
path requests HTTP truth; only definite inactivity emits empty access-lost.
The application cannot cancel a database query, but late completion cannot publish.

## Intentional limits on the evidence

### Late budget-cleanup finding and causal control

`access-production-verified/run.json`, source
`79fd636fa46ee08c458697e82d36fa81ca8015b5f6242e93c8f2b0a6a3f6af66`,
is intentionally retained **incomplete / exit 1**. All other stages passed,
including 290 units, 38 ordinary cases and physical recovery. Security had
17 passes and one genuine failure: the 31st distinct-token claim returned 401,
not 429. The token-specific limiter test independently passed, so this was not
a disabled-profile result. The failed request sequence began at
18:59:32.789 UTC and lasted 94ms, excluding a fifteen-minute window rollover.

The inherited opportunistic cleanup used the current caller's window duration
to prune *all* operation buckets. Late in the anonymous fifteen-minute window,
a five-minute token check can therefore delete that still-active anonymous
bucket (and similarly an active hourly creation bucket). Each security case
has one worker and a clean starting budget; no concurrent owner reset this DB.
`access-pruning-red-20261107/manifest.json`, source
`c42d8b890be474fd8ff53e2efd5ad3d609c600e2a76ceb4b11b9e4d8f9832f29`,
deterministically reproduces the exact counter deletion with the real DB and
the pruning branch forced: 12 assertions pass, the new protection assertion
fails because attempt 31 resolves instead of throttling.

The fix retains globally pruned buckets for twice the longest supported
operation window (one hour), or longer if the current caller's window requires
it. It changes cleanup retention only, not budgets, key identity or rollover.
`access-pruning-green-20261107/manifest.json`, source
`6acb32d080417c3c9417f2f559f0d601ffdf4705c7c555b3554fadfb8e8d6a25`,
passes all 14 focused assertions, including active claim and hourly creation
protection. No random retry, failure allowlist or raised allowance hides the
original HTTP failure. Both failed receipts remain private and nonzero.

### Claim boundaries

`access-production-pruning-final/run.json` and
`access-development-pruning-final/run.json` both passed on source
`70533684b4b33f646b7672fba0064ce9d8dc7d91439cb963047d3ff87bd1ac71`:
292 units, all 38 ordinary cases and all 18 enabled-limit security cases.
Production additionally passed the mandatory physical recovery case, build ID
`Ac8oNkDmynKYGP5hna0kZ`. Both reports have unchanged reconstructed source,
unchanged originating source, successful port reacquisition and released owned
resources. `access-pruning-final-clean-db.log` independently passes all migrations
and all 292 units. The multiset audit confirms original 256/38 identities with
none missing. Real closure elapsed production reset/expiry/logout: 8/10010/10004ms;
development: 31/10004/10003ms, against nominal 15000ms plus named 1500ms allowance.

Those mounted security tests explicitly created default desktop contexts
(1280×720), irrespective of the project's mobile label. The final test-only
adjustment uses Playwright's project-owned context for each mounted private
screen, so the Pixel 7 configuration actually applies, and asserts the configured
viewport in the real scoped-404 scenario. Earlier desktop observations remain
valid for the same application code; they are not mislabeled as mobile evidence.

This is a bounded route-family matrix, not exhaustive testing of every route,
every inference channel or every transaction interleaving. Player-role pairs
cover an uninvolved good-role viewer, not intentionally shared evil-team knowledge.
Clue pairs compare full selected DTOs and generic anonymous errors; they do not
prove timing equality. Session rechecks are not a serializable barrier against a
command already authorized before revocation. The browser generation fence
prevents that command's held result from restoring a lost controlled view.
Only mobile Chromium is automated in the canonical profiles; there is no hosted
ingress/proxy validation, universal browser-erasure promise or production claim.
The caller still owns standalone simplification, code review and publication.

## Final implementation verification

Measured application/test/tooling source:
`256a4465df5b7874bda803b59e6336080dd1857bb196fee0bb5e0ac0631962f3`.
Node 24.8.0, npm 11.6.0, private UTF-8 PostgreSQL 16.15; dependencies and
migrations unchanged. Plan SHA-256:
`0e9da130f663e70d726594ccf24a00cfb117606565fefa7201148cecbbedbf27`.

| Final receipt, relative to private evidence root | Observed result |
|---|---|
| `access-production-mobile-final/run.json` | Complete, all 19 stages passed: lint, fresh nonincremental types, 292 units, build, 38 ordinary mobile-Chromium cases, one separately inventoried physical recovery case, and 18 enabled-limit security cases. Build `eTEuDjG8gP_FHEneKqXri`. |
| `access-development-mobile-final/run.json` | Complete, all 19 stages passed: same 292/38/18 inventories; fresh development server, production output deliberately discarded; physical recovery explicitly not applicable to this runtime, not optional in production. |
| `access-mobile-final-clean-db.log` | Independent `bash scripts/verify-clean-db.sh` passed: owned database recreation, all migrations, all 292 unit assertions. |
| `access-evidence-audit-access-production-mobile-final-multiset.json` | All 256 original unit identities and 38 original ordinary browser identities retained in both runtimes, none missing. Original negative-control target bytes match; plan unchanged. Both final capsules and originating source unchanged during measurement; owned server/DB/port leases released and security port reacquired. |
| `access-actual-child-control.log`, `access-actual-next-child.jsonl` | Independent direct invocation of the existing owned `serve production security` launcher, not the Playwright webServer environment: inherited limiter bypass 1 and wrong origin. A preload observer records only the actual Next child's two public configuration values: limiter 0 and canonical 3100 origin. Canonical creation returned 201; distinct-token claim 31 returned 429. Owned launcher/server stopped and port/leases released. No credentials or full process environment captured. |

Measured SSE closure milliseconds (real clock):

| Profile | Player reset (broker traffic) | Idle player expiry | Idle Storyteller logout | Bound |
|---|---:|---:|---:|---|
| Production | 7 | 10009 | 10006 | Nominal 15000ms plus separately named 1500ms scheduling allowance |
| Development | 31 | 10006 | 10009 | Same bound |

Every final native outcome passed without retries, skips or a failure allowlist.
The final mounted screens use the actual Pixel 7 context and validate the
configured viewport; the preceding 18-case receipt additionally covers desktop
contexts against byte-identical application code. No visual styling changed.

### Unit evidence receipts

| Unit | Behavior / inspected proof / resulting evidence |
|---|---|
| U1 | Characterization, no application boundary rewritten. Inspected security, projections, claim and map suites plus protected route guards. Added paired complete-role DTOs with own-role positive control, expired/reset/replay claims, executable service-worker exclusion checks and shared HTTP fixtures. U1 original-application 258-unit/HTTP characterization passed; final 292 units and E2E-12 route/secret/cache matrix passed. No artificial red claimed for already-correct boundaries. Commit `0d02ff9`. |
| U2 | Changed browser lifetime ownership. Inspected coordinator, mutation refresh and E2E-10 freshness/cover/deep-link/day-closure tests, all retained unchanged. Added access-lifetime unit checks and actual mounted loss, completed private-dialog, command-denial, held main/control/audit/token and same-game covered recovery assertions. Real original 404 retention red is retained above; final production/development HTTP/browser evidence is green. Commit `aaaafba`. |
| U3 | Changed persisted stream ownership. Inspected admission resolver, broker cleanup and interruption-to-HTTP behavior. Added stream checks for revocation, idle, deadlines/uncertainty, late completion, coalescing, hard expiry, abort/cancel/enqueue failure, exact session binding and slow prior-query cadence. Original admission-only and later cadence reds are retained; final units and measured real SSE cases pass. Commit `0f5ab31`. |
| U4 | Changed origin/anonymous authority and corrected evidenced cross-window cleanup. Inspected common guards, all anonymous callers and existing fixed-window persistence. Added origin matrices, real DB concurrency/rollover/pruning controls and HTTP no-mutation/real-budget/16-join recovery evidence. Original forwarded-budget/origin reds and later active-bucket deletion red retained. All final evidence passes without changing allowances. Commits `1e75cb6`, `6cc832e`. |
| U5 | Changed verification launch purpose, port handoff and mandatory sanitized inventory. Inspected all baseline/database/recovery tooling tests and CI entry. Added actual child environment selection, lease reacquisition, mandatory native inventory and private-diagnostic containment tests; actual inherited-bypass child control and real cancellation receipt supplement the full canonical profiles. Existing ordinary/recovery inventories retained. No artificial pre-fix failure is claimed for this integration unit; prior tooling characterization and full runtime/cancellation evidence replace one. Final commit records the named integration paths and this ledger. |

Only this receipt text was added after the measured source above. Final
reconciliation checks compare every policy-approved path against that manifest,
with this ledger as the sole documentation delta, and rerun root lint, fresh
types and the complete clean-database unit entry in a dotenv-free final capsule.
The runtime/build receipts are attributed to their actual source identity, not
retroactively to this documentation addition. Hosted CI is configured to run
the same production entry and retain sanitized security summaries, but has not
run for these local commits. Shipping/review remain caller-owned.

## Trust and claim limits

Future hosting must establish configured canonical public origin, TLS, secure
cookie behavior, ingress header stripping/overwriting and exclusion of direct
untrusted ingress. No such topology has been validated. Selected paired-state
checks do not establish timing noninterference or universal secrecy. Downloaded
or remembered information cannot be erased; browser suspension and disconnected
clients preclude instantaneous view-clearing guarantees.
