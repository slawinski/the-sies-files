---
title: Access and Secrecy Boundaries - Plan
type: fix
date: 2026-11-01
topic: access-and-secrecy-boundaries
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Access and Secrecy Boundaries - Plan

## Goal Capsule

- **Objective:** Players and Storytellers receive only authorized game information, and access loss stops further access without leaving a usable private view.
- **Authority:** The user confirmed the Product Contract below for ranked idea #4; completed baseline, reconciliation and recovery work are regression constraints.
- **Environment:** Local application and CI only; no deployed environment exists to validate.
- **Means:** Extend existing session, reconciliation and request guards, with deterministic boundary evidence (KTD1-KTD6).
- **Open blockers:** None. Planning resolves the bounded stream-revalidation and request-trust mechanisms without inventing new product behavior.
- **Stop conditions:** A contradiction of the confirmed Product Contract, an unexplained regression, or an unavailable owned verification resource blocks completion rather than weakening a gate.
- **Delivery:** Implement and verify the agreed work, review it, and open a PR with CI decided; merging remains the user's action.

---

## Product Contract

### Summary

Strengthen existing access checks and prove them with repeatable, adversarial local/CI scenarios.
Keep game membership, private disclosure, access revocation and request trust consistent across HTTP, live updates and browser state.

### Problem Frame

Ordinary game endpoints already consult persisted, game-scoped sessions.
Open event streams check access only at admission, and the current client clears private state for 401/403 but not the generic 404 used by scoped access denial.
Forwarding headers also influence origin and anonymous rate-limit decisions without an established deployment trust boundary.
These differences leave the owner unable to demonstrate that access and secrecy survive the full session lifecycle.

### Key Decisions

- **Local/CI evidence first.** (session-settled: user-directed — chosen over private or public hosted verification: the user confirmed the app is local-only and not deployed.) Governs R8.
- **Clear the private view on detected access loss.** (session-settled: user-directed — chosen over keeping a read-only copy: the user selected clearing loaded private content.) Governs R4.
- **Preserve explainable failures.** (session-settled: user-directed — chosen over skipping failures or merely recording unstable results: the established baseline must distinguish known defects from regressions.) Governs R10.

### Actors

- A1. A current player, authorized for their own role, information and permitted game actions.
- A2. A current Storyteller, authorized for their game's privileged controls and projections.
- A3. An anonymous, expired, revoked or wrong-game requester, whose attempts must not acquire membership or private information.
- A4. The maintainer, who needs repeatable local/CI evidence and an explicit future-deployment trust contract.

### Requirements

**Access and disclosure**

- R1. Apply current game and actor authorization to protected reads, mutations, assets and stream admission, while retaining uniform non-member responses that avoid revealing game existence.
- R2. Restrict each viewer's observations to the existing disclosure contract, including own-player secrets, discoveries, locked assets and privileged Storyteller information.
- R3. Revalidate active streams and stop newly unauthorized delivery when access loss is observed, with a documented finite revalidation bound and fail-closed behavior when authorization cannot be established.
- R4. On detected access loss, clear scope-private browser state and prevent further private commands, including the generic scoped 404 response; transient network/server failures remain distinct from authorization loss.

**Request trust and abuse controls**

- R5. Client-supplied forwarding headers must not establish trusted origin or anonymous caller identity by default, or allow a requester to evade the relevant abuse budget by changing those headers.
- R6. Preserve working same-origin gameplay and make malformed or disallowed origins fail predictably without turning error responses into information oracles.
- R7. Preserve legitimate joining, access recovery/reset, role reveal and authorized gameplay under the documented local limits.

**Evidence and regression control**

- R8. Report only local/CI guarantees and document the ingress/header assumptions that a future hosting environment must establish; deployed-proxy behavior remains unverified.
- R9. Add deterministic two-game, multi-actor tests and selected paired-secret checks across authorized responses, errors, protected delivery, cache boundaries and live access changes.
- R10. Retain existing baseline, freshness, recovery and gameplay assertions, explain each observed failure, and keep raw failed checks nonzero rather than suppressing them.

### Key Flows

- F1. **Membership and disclosure.** A1/A2 request their permitted data, then A3 repeats the request anonymously, with inactive credentials and from another game; outcomes follow R1–R2 without disclosing protected markers.
- F2. **Access loss with an open screen.** A1/A2 open a private view and stream, access is revoked or expires, and subsequent requests/delivery follow R3; once the browser detects the loss it disposes private state per R4.
- F3. **Hostile request metadata.** A3 changes origin and forwarding headers across repeated anonymous attempts; authorization and abuse outcomes follow R5–R7 rather than the supplied identity claim.
- F4. **Secret-independent observations.** A4 constructs paired synthetic states differing only in a protected fact and compares the observations that R2 declares secret-independent, documenting legitimate differences instead of claiming universal observational equality.

### Acceptance Examples

- AE1. **Covers R1–R2, R9.** A player in game A cannot fetch game B's public/member projection, private player data, Storyteller data, assets or stream, and cannot perform a privileged mutation by supplying a game/player identifier.
- AE2. **Covers R2, R9.** A synthetic role or discoverer-only clue marker is absent from another player's permitted observations before its authorized reveal; changing that secret does not change the selected secret-independent fields or errors.
- AE3. **Covers R3–R4, R9.** A player access reset invalidates a previously open session: new requests are denied, the stream stops within its declared bound, and detected access loss clears the old private view and open private dialogs.
- AE4. **Covers R1, R4, R9.** A Storyteller whose scoped session is revoked receives the existing generic 404; its old main projection, auxiliary private panes and command capability do not remain available, while a network failure alone does not masquerade as revocation.
- AE5. **Covers R5–R7, R9.** Alternating forged forwarding headers does not reset an anonymous abuse budget; valid local joining still succeeds within the documented allowance and cross-origin attempts fail without a mutation.
- AE6. **Covers R8, R10.** A release report names the tested source/runtime and local trust assumptions, preserves existing suite identities and discloses any unsupported deployment claim or failed scenario.

### Scope Boundaries

- Existing authorization, game rules and disclosure semantics remain authoritative; this is not a new account system, proxy platform or permission model.
- Previously downloaded or remembered information cannot be remotely erased; R4 concerns the application's controlled view after detection.
- Browser suspension and network reachability prevent instantaneous clearing guarantees; planning must state the R3 bound and how the client learns of access loss.
- Selected paired-state checks do not prove absence of every timing or inference channel; existing intentional version/sequence and gameplay signals require explicit treatment.
- Hosted penetration testing, proxy-vendor adoption and production configuration changes are excluded under R8.
- Durable command-result compatibility, content rights and participant-retention policy remain separate ranked directions.

### Sources and Research

- `src/lib/auth/http.ts` and `src/modules/auth/session.ts`: active game/actor lookup, denial semantics and persisted expiry/revocation.
- `src/app/api/v1/games/[gameId]/events/stream/route.ts`: stream admission and continuing invalidation delivery.
- `src/components/useProjectionReconciliation.ts` and both game controllers: private-state clearing and existing freshness/lifetime guards.
- `src/lib/rate-limit.ts` and anonymous claim/recovery/logout routes: abuse budgets and forwarded identity selection.
- `src/modules/projections/projections.ts`, protected map-layer route, `next.config.ts` and `public/sw.js`: disclosure allowlists and cache boundaries.
- `tests/security.test.ts`, `tests/projections.test.ts` and `tests/e2e/e2e-10-realtime-reconciliation.spec.ts`: current security and access-loss coverage.

---

## Planning Contract

**Product Contract preservation:** Product Contract unchanged. R1-R10, A1-A4, F1-F4 and AE1-AE6 retain their existing meaning and IDs.

### Grounded Baseline

Source baseline: `4cf1bd3c8a184107e38ded4e918c5674e9448f0c`, merged PR #4.
`package.json` pins Next.js 15.5.23 and React 19.1.0 and declares Prisma 6.19.3-compatible dependencies; no upgrade is required.
The latest production receipt in `docs/recovery-verification.md` records 256 unit tests, 38 ordinary browser cases and one separately inventoried physical recovery case.
These are historical receipts, not measurements of this change; the latest development receipt predates the final recovery-fingerprint fix.

The scoped public projection is membership-only despite its name.
`src/lib/auth/http.ts` deliberately distinguishes absent cookies (401) from present but invalid, wrong-game, expired or revoked scoped credentials (generic 404 `GAME_NOT_FOUND`).
Unscoped `/api/v1/me` instead returns 401 for inactive credentials.
`src/modules/auth/session.ts` checks persisted actor type, game, revocation and expiry.
Those lookups do not establish transaction-wide serialization against concurrent revocation.

The stream route resolves membership once and emits only game/type/version/sequence metadata.
`useGameEventStream` already requests HTTP truth after interruption, opening and foreground transitions.
`ReconciliationCoordinator` already owns one active read, intent/version publication gates, deadlines and retries.
The missing boundary is authorization lifetime: the hook clears only 401/403, auxiliary Storyteller requests swallow denial status, and mutation ownership is primarily tied to game scope.

### Key Technical Decisions

- KTD1. **Keep existing authorization and disclosure ownership.** R1-R2 remain on the route/session guards and projection allowlists, not browser-supplied player IDs. Preserve scoped anti-oracle statuses and bodies, private asset gating, and no-store responses. Add bounded route-family coverage before changing any evidenced gap; do not replace authorization wholesale.
- KTD2. **Invalidate one private-view lifetime on access loss.** For R4, use a monotonic browser access generation shared by the main projection, auxiliary reads and command result publication. A current authoritative projection denial of 401/403 or scoped `GAME_NOT_FOUND` 404 ends that generation synchronously, clears held private values and invalidates pending publications even when the game ID stays the same. An auxiliary or command error ends it only when it identifies session/membership denial; ordinary asset 403, missing-resource 404 and domain failures do not. Transport errors, timeouts and 5xx block commands through existing freshness rules without declaring revocation. A later successful authoritative HTTP read may establish a new generation, with private reveal covered by default. (session-settled: user-directed — chosen over retaining a read-only private copy: the user explicitly selected clearing.) Governs R4.
- KTD3. **Bind each stream to its admitted persisted identity.** For R3, capture the resolved session ID, actor type and game/player binding server-side. Recheck that exact row and binding, including null opposite-role scope, revocation and expiry; never resolve later cookies as a replacement identity. Check before hello and each outbound invalidation, and while idle at most every 10 seconds. Each authorization attempt has a 5-second application deadline: an idle connection becomes closed within a nominal 15 seconds of persisted access loss under a responsive process, plus explicitly measured scheduling tolerance. Schedule earlier for known expiry. Do not enqueue while a check is pending, after an invalid result, or after its deadline. Coalesce metadata to the latest watermark during a single shared in-flight check rather than building an event backlog. A definite inactive-session result may emit a generic `access-lost` control event with no credentials or identity fields, then closes. A database failure or timeout closes without asserting access loss; the existing interruption-to-HTTP path distinguishes a denied session from temporary failure. Late query completion cannot reopen the stream. One idempotent close path removes the subscription, timers and abort listener on cancel, abort, enqueue failure, invalidation or timeout.
- KTD4. **Use a configured origin, not client-selected authority.** For R5-R6, compare a present Origin's complete HTTP(S) origin with a server-side `APP_ORIGIN`. Default to `http://localhost:3000` for the existing local development entry; every owned browser/recovery server on port 3100 explicitly sets `http://localhost:3100`. Alternate local hostnames, LAN addresses or ports require the matching process setting. Validate configuration rather than falling back to Host, request URL or forwarded headers. Reject malformed, opaque/null, multi-value or non-origin URL forms predictably with 403; retain `Sec-Fetch-Site: cross-site` rejection. Missing Origin retains the current non-browser API compatibility and does not itself authenticate anyone. This is a bounded compatibility exception, not complete CSRF protection for every originless browser. OWASP's configured-target-origin guidance supports avoiding proxy-derived authority here.
- KTD5. **Use a conservative shared anonymous budget.** For R5-R7, ignore `Forwarded`, X-Forwarded-For, X-Real-IP and X-Forwarded-Host for security decisions by default. Without an authenticated ingress identity, all anonymous requests share a stable fallback key per existing operation; do not fabricate a client IP from request headers. Preserve the DB fixed windows, hashed keys, per-claim-token budget and existing allowances: claims 30/15 minutes plus token 5/5 minutes, recovery 5/15 minutes, logout 30/5 minutes, game creation 10/hour. Sixteen joins plus a reset/reclaim fit the claim allowance in a clean window. Shared exhaustion can deny legitimate callers until rollover; document that limitation rather than trusting headers or silently raising limits. No proxy trust mode or IP parser dependency is needed for the local contract.
- KTD6. **Keep real security evidence separate from the limiter-bypassed baseline.** R8-R10 use the established production/development capture and physical recovery contracts plus a small explicitly limiter-enabled local profile. Preserve ordinary suite identities and failure behavior. Selected paired-secret comparisons declare their observable fields and normalize only justified IDs, timestamps and intentional version/sequence changes. No universal timing/noninterference claim follows. (session-settled: user-directed — chosen over skipping failures or unexplained snapshots: the baseline must preserve and explain raw failures.) Governs R8-R10.

### High-Level Technical Design

The tables describe the ownership and lifecycle boundaries; KTD1-KTD6 own the mechanisms.

**Component and data-flow map**

| Producer | Consumer | Boundary |
|---|---|---|
| Cookie-based route resolver | Persisted BrowserSession | Current game and actor, KTD1 |
| Admitted stream identity | Session revalidation owner | Exact original identity, KTD3 |
| Broker metadata | Stream owner | Revalidation before delivery, KTD3 |
| Stream interruption/control event | Reconciliation owner | HTTP truth or definite access loss, KTD2-KTD3 |
| Authoritative HTTP projection | Private-view owner | Generation plus version gate, KTD2 |
| Auxiliary/command completion | Private-view owner | Captured generation must still own publication, KTD2 |

**Access-loss protocol**

| Step | Owner | Effect |
|---|---|---|
| 1 | Reset/logout/session expiry | Persisted session becomes inactive |
| 2 | Stream revalidation | KTD3 suppresses further metadata and closes |
| 3 | Browser boundary handler | Definite control event invalidates immediately; interruption otherwise requires HTTP truth |
| 4 | Authoritative denial | KTD2 ends the current access generation |
| 5 | Main/auxiliary/command owners | Remove private values and reject held results from that generation |
| 6 | New authoritative success | Establish a clean lifetime without restoring old dialogs or private reveal state |

**Private-view state and lifecycle**

| State | Trigger | Next state / allowed publication |
|---|---|---|
| Loading | Valid current projection | Authorized and fresh |
| Authorized and fresh | Boundary or higher target | Synchronizing; commands blocked |
| Synchronizing | Current successful read | Authorized and fresh; existing version rules apply |
| Synchronizing | Transport/5xx failure | Temporarily unavailable; R4 does not imply revocation |
| Any active state | Current definitive access denial | Access lost; private state removed |
| Access lost | Held old success or command result | Remain access lost; discard result |
| Access lost | New successful authoritative read | New generation; private reveal covered |
| Any state | Scope change/unmount | Dispose old owners and resources |

**Request-trust decision map**

| Input | Origin decision | Anonymous budget identity |
|---|---|---|
| Exact configured Origin | Continue to normal auth | Shared fallback, KTD5 |
| Wrong Origin plus matching forged Host/X-Forwarded-Host | 403, no mutation | Headers cannot select a new budget |
| Malformed/null Origin | 403, no mutation | Same rule |
| Missing Origin, not cross-site | Preserve existing API behavior | Shared fallback |
| Cross-site fetch metadata | 403 | Same rule |
| Changed forwarded IP/proto/host metadata | Cannot change configured authority | Cannot change budget |

### Assumptions

- The timing constants in KTD3 are technical defaults, not a user-selected latency promise. The bound concerns the server's decision to stop delivery, not browser erasure during suspension or a network partition. Measure real local closure with a small named scheduling allowance and retain observed elapsed times.
- The canonical-origin default in KTD4 is a new configuration choice. Its local aliases are explicitly configured, never learned from request metadata. Process configuration must propagate into captured production, development and recovery servers.
- The shared-budget tradeoff in KTD5 is suitable for one local game gathering. It does not provide per-person fairness or protect availability against anonymous exhaustion.

### System-Wide Impact and Risks

- Both player and Storyteller controllers, their auxiliary requests, role reveal, map/scanner/dialog children and command-result callbacks participate in KTD2. Clearing only the main DTO or setting `ready: false` is insufficient. Clear state and refs, dispose child lifetimes, and invalidate handlers before React's next effect can permit a stale completion.
- Keep the prior freshness contract intact: HTTP success, not SSE connection health, establishes readiness. Preserve monotonic versions, coalesced reads, bounded retries, command single-send behavior, same-identity reveal preservation, private deep links, Storyteller cover and day closure.
- Per-event session checks add database reads. KTD3 coalesces bursts and forbids overlapping queries. A query deadline stops publication even if Prisma cannot cancel the underlying query; tests must prove late resolution is inert. No database cancellation API or Prisma 7 configuration is assumed.
- Existing request-time authorization is not a linearizable transaction barrier. A command authorized before a concurrent reset can finish; no command result from a lost browser generation may restore private state. Tests must prove a new request after persisted revocation is denied and separately control pre-loss in-flight completion. Transaction-level cancellation of already authorized work is not promised by R1-R4.
- Cookie security remains on the existing environment-dependent options. A future deployment must establish canonical public origin, TLS and secure-cookie behavior, ingress header stripping/overwriting and exclusion of direct untrusted ingress before any proxy identity claim is made. No hosted topology is established by `next.config.ts` or the README's template deployment link.
- Considered and not built: proxy-vendor adapters, distributed revocation push infrastructure and a new CSRF-token system. The current scoped gaps close with existing DB sessions, bounded revalidation and canonical-origin checks; an actual hosting topology or a changed originless-client contract would warrant revisiting those mechanisms.

### Dependencies and Sequencing

U1 establishes bounded fixtures and characterization evidence.
U2 and U3 extend that evidence across browser and stream lifetimes; U3 integrates the access-loss callback established by U2.
U4 fixes request trust and verifies legitimate limits.
U5 integrates limiter-enabled evidence and the unchanged baseline/recovery gates after U1-U4.
No migrations, dependencies, auth system or game-rule changes are planned.
No bake-off is needed: periodic persisted checks and configured origin authority resolve reversible local mechanisms; a new broker architecture or trusted proxy system is outside R8.

### Sources Shaping the Design

- `src/lib/projection-reconciliation.ts`, `src/components/useVersionedMutation.ts`, `src/components/useGameEventStream.ts`: reuse their ownership, freshness and interruption patterns, adding authorization lifetime rather than competing refresh coordinators.
- `tests/e2e/fixtures.ts` and `tests/e2e/e2e-10-realtime-reconciliation.spec.ts`: deterministic seeds, current HTTP versions, held-response races and mounted-page assertions.
- `playwright.config.ts` explicitly sets `RATE_LIMIT_DISABLED=1`; its ordinary results cannot prove R5's budget behavior.
- `docs/regression-baseline.md`, `docs/recovery-drill.md`, `docs/recovery-verification.md` and `.github/workflows/ci.yml`: resource ownership, source/runtime identity, native inventories, physical production drill and nonzero failures.
- [Next.js 15 route handlers](https://nextjs.org/docs/15/app/api-reference/file-conventions/route) and [Next.js 15 asynchronous request APIs](https://nextjs.org/docs/15/app/guides/upgrading/version-15): retain asynchronous cookies/params at admission and Node Web-stream responses; do not read request-scoped cookies inside later timers.
- [React effect synchronization](https://react.dev/learn/synchronizing-with-effects): cleanup must invalidate asynchronous publication as well as abort fetches; KTD2 extends that pattern to same-scope authorization changes using React 19.1-compatible primitives.
- [OWASP target-origin verification](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html#identifying-the-target-origin): KTD4 uses configured authority. Its missing-Origin exception is inherited compatibility, not adoption of OWASP's stricter missing-source-origin recommendation.

---

## Implementation Units

### U1. Characterize membership and protected observations

**Goal:** Establish repeatable allowed and denied observations before changing boundary mechanisms.

**Requirements:** R1-R2, R9-R10; A1-A4; F1/F4; AE1-AE2.

**Dependencies:** None.

**Files:** Extend `tests/security.test.ts`, `tests/projections.test.ts`, `tests/claim.test.ts` and `tests/map-system.test.ts`; add `tests/e2e/e2e-12-access-boundaries.spec.ts` and a small `tests/e2e/security-fixtures.ts` helper. Inspect the corresponding routes under `src/app/api/v1/games/[gameId]` and `src/modules/projections/projections.ts`; modify only an evidenced contract violation.

**Approach:**
1. Use two synthetic games with distinct markers and current player/Storyteller credentials, plus anonymous, wrong-game, expired and revoked variants. Reuse existing setup and disposable-DB seams; fixtures may change session dates/rows directly in tests without adding runtime test endpoints.
2. Enumerate route families actually tested: member public, scoped/unscoped player, Storyteller projection/control/audit, representative player and Storyteller mutations, claim/reset/replay, protected map asset and stream admission. Follow KTD1 for responses and record unauthorized mutations' unchanged persisted state.
3. Define paired specimens differing in another player's role or discoverer-only clue. List observable fields expected equal before comparison; include authorized positive controls showing the marker exists and becomes visible only to its intended audience. Keep UUID/time/version normalization explicit and narrow per KTD6.

**Patterns to follow:** Seeded setup and version-returning helpers in `tests/e2e/fixtures.ts`; projection field allowlists; persisted session tests in `tests/security.test.ts`.

**Test scenarios:**
1. Covers F1 / AE1. Repeat each protected read family with game A's credentials targeting game B and a nonexistent game: generic scoped denial has the same safe status/body and no protected marker. No-cookie requests retain 401.
2. Current player sees only own private role/data and allowed discoveries; current Storyteller sees its permitted privileged views. Expired/revoked and cross-role credentials cannot acquire those privileges.
3. Covers F4 / AE2. Change only a protected role/clue fact: declared secret-independent public/player/error observations remain equal, while the authorized positive control changes.
4. Cross-game player/action identifiers and privileged mutation attempts do not alter protected rows, versions or event history.
5. Claim consumption, same-command replay, different-command reuse, expired token, reset and old-token replay obey the existing service contract and do not disclose private credentials in errors.
6. Locked and unknown map layers return their existing denials without asset bytes; authorized unlock delivers the correct asset. Verify no-store on success/errors and stream admission, and that the service worker excludes API caching.

**Execution note:** Establish characterization first. Preserve passing boundaries; capture genuine pre-fix reds for the known lifecycle/header gaps in their owning units rather than manufacturing failure in already-correct routes.

**Verification:** The matrix records tested endpoint/actor/observation combinations and their positive controls. Real HTTP evidence complements service tests; no fixture or normalization removes an asserted secret field to obtain equality.

### U2. Clear the whole private view and reject old completions

**Goal:** Make detected access loss dispose private state throughout a mounted player or Storyteller screen.

**Requirements:** R3-R4, R9-R10; A1-A3; F2; AE3-AE4; KTD2.

**Dependencies:** U1.

**Files:** `src/components/useProjectionReconciliation.ts`, `src/lib/projection-reconciliation.ts`, `src/components/useVersionedMutation.ts`, `src/app/player/page.tsx`, `src/app/storyteller/[gameId]/page.tsx`; affected private children under `src/app/player/_components` and `src/app/storyteller/[gameId]/_components` as identified by their state ownership. Add `tests/access-lifetime.test.ts`; extend `tests/e2e/e2e-10-realtime-reconciliation.spec.ts` and `tests/e2e/e2e-12-access-boundaries.spec.ts`.

**Approach:**
1. Give all private owners a shared current access-generation check per KTD2. Invalidate the current generation immediately on a current authoritative denial, including the scoped 404 that the hook currently misses.
2. Route session-denial errors from auxiliary reads and mutations into that boundary instead of swallowing them. Preserve ordinary resource/domain errors and stale-version handling.
3. Clear main projection, control/audit DTOs and refs/cursors, claim/reset modal tokens and links, role reveal, player selections/scanner messages, private dialogs and callback-held values. Audit child mount lifetimes so a recovered same-game view cannot revive old state.
4. Require the captured generation for every read, error, command acknowledgment and result publication. Abort/dispose work where possible; publication guards remain necessary when transport cancellation loses the race.

**Patterns to follow:** `ProjectionGate`, coordinator disposal, mutation lifetime lock cleanup, existing private identity-switch and held-response browser tests. Add the smallest shared ownership primitive rather than a second application-wide state framework.

**Test scenarios:**
1. Covers AE4. Load Storyteller main/control/audit and a claim or reset dialog, revoke its real session through logout in another request context sharing the credential, then refresh: actual scoped 404 removes all private content and dialogs and blocks commands.
2. Covers AE3. Reset a player's access through the existing Storyteller API while its role/map/scanner view is open: actual `/api/v1/me` 401 clears the view and private child state. Test persisted expiry as a separate trigger.
3. Hold a real pre-loss successful main read, auxiliary read and token-bearing command response; establish loss, then release them. None republishes private values or acknowledgment. Repeat after new valid same-game access to prove generation ownership rather than game-ID equality.
4. A mutation is denied for inactive membership before the next projection poll: its error ends access promptly. A locked-asset 403, nonexistent child-resource 404 or normal gameplay conflict does not erase otherwise valid membership.
5. Network failure, read deadline and 5xx leave the existing stale/error behavior with commands disabled; they do not show a false revoked-session state. Later current HTTP success restores readiness without resending a command.
6. Preserve same-identity deliberate role reveal on an ordinary version update, cover it on identity/access-generation change, and retain deep-link, Storyteller cover, day-closure and command-lock recovery assertions in E2E-10.

**Verification:** Real mounted-screen access-loss tests fail on the original 404/private-state path and pass after the fix. Deterministic held-completion tests establish that same-game reauthorization cannot admit old results.

### U3. Revalidate active streams without changing identity

**Goal:** Stop ongoing metadata delivery when the admitted session loses authorization, including an otherwise idle stream.

**Requirements:** R1, R3-R4, R9; A1-A3; F2; AE3-AE4; KTD2-KTD3.

**Dependencies:** U1-U2.

**Files:** `src/modules/auth/session.ts`, `src/app/api/v1/games/[gameId]/events/stream/route.ts`, `src/components/useGameEventStream.ts`, `src/modules/realtime/broker.ts` only if cleanup visibility requires a small seam; add `tests/stream-authorization.test.ts`; extend `tests/e2e/e2e-12-access-boundaries.spec.ts`.

**Approach:**
1. Add a narrowly scoped persisted-session recheck for the captured Viewer and use it at the KTD3 boundaries. Keep request-cookie resolution at admission.
2. Put timer, check ownership, metadata coalescing and idempotent cleanup under the existing stream owner. Check closed/generation state again after awaited authorization and immediately before enqueue.
3. Teach the browser stream hook to handle the generic definite-loss control event through U2, while normal error/closure continues to require HTTP truth. Do not send session identifiers, tokens, role details or failure diagnostics in events or logs.

**Patterns to follow:** Existing metadata envelope, no-store/no-transform headers, broker unsubscribe callback and reconciliation boundary on stream interruption.

**Test scenarios:**
1. Covers AE3. Open a real player stream, reset that player's access, then trigger a broker event through an authorized mutation: it cannot deliver the post-check invalidation; new admission is denied. Repeat without any broker traffic to prove the idle bound.
2. Player and Storyteller logout/expiry after admission close their original connections. A different valid cookie introduced meanwhile does not transfer ownership to that identity.
3. Database rejection or a check hanging beyond KTD3's deadline closes the stream without an auth-loss assertion; a late success cannot deliver queued metadata. Fake-clock unit tests prove timing, while a real local SSE test records elapsed closure independently of browser clock mocking.
4. Concurrent broker bursts and timer expiry share one revalidation attempt and retain at most the newest metadata watermark. Authorization failure suppresses pending delivery.
5. Abort, reader cancellation, already-aborted admission and enqueue failure each release subscription, timers and listeners exactly once, including during an outstanding check; no later publication or resubscription occurs.
6. Anonymous/wrong-game/expired/revoked admission preserves KTD1 responses. Allowed hello/invalidate events retain only the established metadata fields; the control event contains no identity or secret marker.

**Verification:** Known admission-only code fails continued-delivery/idle checks. The fixed route meets KTD3 with the declared runtime tolerance, and a mounted browser naturally reaches the U2 cleared view after real persisted loss without fabricated auth responses.

### U4. Remove forwarded-header authority and prove usable limits

**Goal:** Make origin and anonymous-budget decisions independent of requester-supplied forwarding metadata.

**Requirements:** R5-R8, R9; A1-A4; F3; AE5; KTD4-KTD5.

**Dependencies:** U1.

**Files:** `src/lib/auth/http.ts`, `src/lib/rate-limit.ts`, the anonymous callers `src/app/api/v1/games/route.ts`, `src/app/api/v1/player-claims/claim/route.ts`, `src/app/api/v1/storyteller/recover/route.ts`, `src/app/api/v1/session/logout/route.ts` as needed; add `tests/request-trust.test.ts`; extend `tests/security.test.ts` and `tests/e2e/e2e-12-access-boundaries.spec.ts`.

**Approach:**
1. Apply KTD4 at the existing common guard, with one validated server configuration source. Wire it into the in-scope state-changing entry points that currently omit it, specifically game creation and logout, before their state changes. Keep parse failures inside predictable forbidden responses and keep the originless API compatibility path.
2. Replace forwarded-IP selection with KTD5's stable fallback and retain operation/token hashing and fixed-window behavior. A new per-browser cookie is not a trusted replacement identity.
3. Exercise legitimate 13-16-player joins and reset/reclaim under enabled limits before considering any limit change. Document shared exhaustion and recovery/create allowances.

**Patterns to follow:** Existing `DomainError`/`jsonError`, DB upsert counter and `Retry-After`, per-token claim hashing.

**Test scenarios:**
1. Covers F3 / AE5. Alternating X-Forwarded-For, X-Real-IP and Forwarded values consumes the same real claim budget and eventually returns 429 with a positive Retry-After; token-specific throttling remains independent.
2. Wrong Origin plus matching forged Host/X-Forwarded-Host cannot pass KTD4. Also test wrong scheme/port, null, malformed/multiple origins, URL userinfo/path/query, and missing authority: predictable 403, no mutation or private marker. Include game creation and logout: denied requests create no game/session, set no session cookie, revoke no session and clear no cookie.
3. Exact configured local Origin succeeds with forged forwarding metadata ignored. Authenticated no-Origin requests preserve their current allowed flow; `Sec-Fetch-Site: cross-site` remains rejected even without Origin.
4. Covers AE5. In clean limiter windows, sixteen players claim distinct issued tokens, perform role reveal and permitted gameplay, and one reset/reclaim succeeds within the existing budget. One valid Storyteller recovery and ordinary logout work within their separate allowances.
5. Fixed-window rollover restores allowance; concurrent attempts cannot exceed the DB counter threshold unnoticed. Keys never store raw claim tokens. Enabled-limit tests explicitly reject a disabled server profile.

**Verification:** Forged-header bypass controls are red on original code and green after the common-helper fix. Valid gameplay and recovery remain functional with limits enabled, independently of the ordinary bypassed browser profile.

### U5. Integrate local security evidence with release gates

**Goal:** Make the bounded security proof repeatable and keep existing regression/recovery evidence authoritative.

**Requirements:** R7-R10; A4; F1-F4; AE1-AE6; KTD6.

**Dependencies:** U1-U4.

**Files:** `playwright.config.ts`, new `playwright.security.config.ts`, `playwright.recovery.config.ts`, `scripts/regression-baseline.mts`, `scripts/test-database.mts`, `scripts/playable-recovery.mts` for required launch-purpose/config propagation; `package.json`, `.github/workflows/ci.yml`; extend `tests/test-database-tooling.test.ts`, `tests/regression-baseline-tooling.test.ts` and `tests/playable-recovery-tooling.test.ts` where orchestration behavior changes; new `docs/access-secrecy-verification.md`, update `docs/regression-baseline.md` and `docs/recovery-drill.md` with invocation/configuration deltas.

**Approach:**
1. Introduce a small named `test:security` entry using `playwright.security.config.ts` for the new real HTTP/SSE/mounted-browser scenarios. It selects E2E-12 with `RATE_LIMIT_DISABLED=0`, explicit `APP_ORIGIN`, one worker, zero retries and fresh owned resources. Ordinary config excludes only this new profile-specific spec, preserving all existing identities; security discovery/outcomes are recorded separately.
2. Reuse existing source capture, DB/port leases, dotenv-free execution and evidence inventory helpers. Extend the existing owned-server launcher with a narrow verification-purpose selection independent of production/development runtime: security must force enabled limits inside the child environment instead of inheriting the current hardcoded bypass. Preserve the ordinary/recovery bypasses. Run security against the recorded production capsule/build after ordinary/recovery servers release the port, reacquiring the port lease while retaining the parent DB ownership; add the same security selection to the development control. Avoid a parallel test platform or another general-purpose runner.
3. Propagate canonical origin into all existing owned servers without changing physical recovery requirements. Make absent/incomplete security inventory or failure a nonzero release outcome. CI always retains sanitized security summaries alongside existing evidence, even when a prior stage fails and prerequisites prevent security execution.
4. Keep raw token-bearing bodies, cookies and traces private. Sanitize dedicated security output before CI upload; do not add its raw traces to the ordinary browser-artifact upload glob.
5. Record source/build/runtime/DB/profile identity, matrix coverage, negative controls, measured stream timing and each failure's cause in the verification ledger. State future ingress assumptions and all limits on the claim under R8.

**Patterns to follow:** `docs/regression-baseline.md`'s separate production/development inventories, required recovery stage, sanitized native recovery evidence and existing ownership/fingerprint helpers.

**Test scenarios:**
1. Covers AE6. Security profile starts an owned server with real limits and the expected canonical origin; an inherited `RATE_LIMIT_DISABLED=1` cannot silently turn the profile into bypassed evidence. Assert the actual child launch environment, not just the Playwright configuration, and then observe real budget exhaustion over HTTP.
2. Security discovery, native outcome or server prerequisites missing/truncated/failed yields an explicit failed/blocked stage and nonzero result. A later passing attempt cannot erase that receipt.
3. Original 256 unit identities and 38 ordinary browser identities remain represented after additions; the physical recovery case is still separately discovered and required for production.
4. New profile integration reacquires its port lease after ordinary/recovery shutdown and releases only its owned server/DB/port resources on success, failure and cancellation; source/build fingerprint validation and parent DB ownership remain in force. Test the launcher-purpose selection and lease handoff in `tests/test-database-tooling.test.ts` alongside the baseline orchestration tests.
5. Published security summaries contain no raw token, cookie, private marker value or session ID. Marker checks record labeled boolean outcomes, not secret-bearing response dumps.

**Verification:** Final captured production and development profiles pass all applicable gates with new security inventories. Production additionally passes the unchanged physical recovery drill. CI invokes the production security stage rather than merely listing a local command.

---

## Verification Contract

All runtime verification below is implementation work, using explicitly owned local test resources and dotenv-free captured source as defined in `docs/regression-baseline.md`.
No application tests, builds or live endpoint probes were executed to produce this plan.

| Gate / entry | Applicability | Required evidence |
|---|---|---|
| `npm run lint` | Final source | Existing lint rules pass |
| `npm run typecheck -- --incremental false` | Final source | Fresh types, including access/stream ownership changes |
| `npm test` | U1-U4 and final source | Existing 256 identities retained plus meaningful boundary/ownership tests |
| `bash scripts/verify-clean-db.sh` | Final captured source, explicit disposable DB | Migrations and entire unit suite on the owned target |
| `npm run build` | Final production specimen | Successful build with recorded identity |
| `npm run baseline` production profile | Final security changes | Source/runtime identities, ordinary 38-case inventory plus required physical recovery and security inventories |
| `npm run baseline` development profile | Final security changes | Same applicable ordinary/security assertions; physical production recovery explicitly not applicable |
| Planned `npm run test:security` | Enabled-limit profile | Native E2E-12 inventory, actual HTTP/SSE/browser outcomes, limiter-active proof, timing and cleanup |
| CI production entry in `.github/workflows/ci.yml` | PR publication | Applicable stages decided, sanitized evidence retained, raw failures nonzero |

### Proof Boundaries

- Use real API and SSE responses for admission and continued authorization; mounted browser tests must revoke/reset/logout/expire real persisted sessions. Interception is reserved for controlling already-fetched in-flight completion, server/network failure distinctions and existing regression scenarios.
- Negative controls on a separately captured original specimen should demonstrate the actual 404-retention, admission-only streaming and forged-header-budget gaps. Record which assertions genuinely fail before the fix; do not claim a preexisting passing boundary as a new red.
- Capture the R1-R10/AE1-AE6 coverage matrix with exact tested route families and declared paired-state observables. Absence of a marker in one observation is not proof of all channels; intentional gameplay counters remain outside equality unless specifically justified.
- Compare native test identities rather than totals alone. Preserve original failures and explain cause with matched source/profile controls under R10. No skips, allowlists, weakened assertions or unexplained snapshots can turn a failed gate green.
- End-to-end stream timing uses a real clock and records the KTD3 scheduling allowance separately from the nominal bound. Browser suspended/offline periods are excluded from a clearing deadline, not mislabeled as successful immediate clearing.

---

## Definition of Done

- U1-U5 verification outcomes hold and each R1-R10 and AE1-AE6 has a concrete evidence reference.
- Access loss clears controlled private state and invalidates old same-scope completions; ordinary temporary failures remain distinguishable.
- Active streams revalidate the original identity, stop delivery per KTD3 and release resources on every tested terminal path.
- Origin and limiter authority follows KTD4-KTD5, with legitimate joins/recovery demonstrated under real enabled limits.
- Final production and development evidence preserves all existing test identities, the mandatory production physical drill and explainable nonzero failures.
- The ledger reports only local/CI results actually observed and names future ingress/TLS/cookie assumptions without a deployment assurance claim.
- Review covers the changed authorization, publication, stream lifecycle, request trust and evidence paths; all material findings are resolved before release completion.
- Remove abandoned experimental code and unused test mechanisms from the final diff. Retain required private evidence and release only resources owned by this verification run.
