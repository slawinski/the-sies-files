---
title: Reconcile Client State Before Live - Plan
type: fix
date: 2026-10-31
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
origin: docs/ideation/2026-10-28-legacy-app-reinforcement-ideation.html
execution: code
---

# Reconcile Client State Before Live - Plan

## Goal Capsule

- **Objective:** Players and Storytellers return to a game that catches up after interrupted or missed updates, with an honest indication of whether the displayed game is ready for their next action.
- **Means:** Keep database projections authoritative and use the existing stream to accelerate reconciliation (KTD1–KTD5).
- **Authority:** User-selected ranked direction #2 and R1–R10 govern scope. Requirements govern behavior, KTDs govern mechanisms, and units implement those contracts. The other six ideation directions are not this work.
- **Starting point:** Clean branch `fix/reconcile-client-state-before-live`, based on merged PR2 commit `3a4152670b54b5cee8e17f58dfb25a75615c8677`. PR1's baseline and PR2's UI repairs are inherited requirements, not new implementation tasks.
- **Execution profile:** Small runtime reliability repair using the existing React 19.1.0 / Next 15.5.23 / Vitest / Playwright stack. Establish deterministic race specimens before changing the affected paths.
- **Completion ownership:** The parent workflow owns implementation, verification, review and shipping. This document defines the implementation work and its evidence requirements.
- **Stop conditions:** Stop for a changed authorization contract, destructive data work, or evidence that the selected outcome cannot be delivered within this scope. Preserve and explain verification failures under R10.

---

## Product Contract

### Summary

Reconcile player and Storyteller projections on connection, reconnection and foreground return before treating them as current. Prevent older responses from overwriting accepted state, and recover missed invalidations while an active page can reach the server.

### Problem Frame

The current green connection label establishes only that EventSource opened. A user can therefore see old game state after an update that preceded subscription or occurred during a disconnect. Refresh failures and overlapping responses can preserve or restore that stale screen without an honest readiness signal.

The database-backed commands already reject stale expected versions. That protection prevents certain invalid mutations, but it does not help a player understand an outdated action or a Storyteller see the current blocker.

### Key Decisions

- **Continue ranked direction #2.** (session-settled: user-directed — chosen over the other ranked directions and further baseline work: improve reliability and security without regressing the inherited game.) Governs R1–R10. See origin: `docs/ideation/2026-10-28-legacy-app-reinforcement-ideation.html#idea-2`.
- **Preserve failure evidence.** (session-settled: user-directed — chosen over skipping failures or weakening assertions: every failure must remain explainable.) Governs R10.

### Requirements

**Projection freshness**

- R1. Transport connectivity and projection freshness are separate facts; LIVE requires an open transport and a successfully applied projection satisfying the latest known game-version watermark and required reconciliation boundary.
- R2. Initial connection, every reconnect and foreground return require authoritative reconciliation, including when no subsequent invalidation arrives.
- R3. Missed invalidations must eventually be repaired while the page is visible and the authoritative API is reachable; browser suspension, server unreachability and ongoing changes preclude an unconditional convergence deadline.
- R4. No superseded request may overwrite newer accepted game state or replace its error/readiness state; protection applies to initial, manual, stream, fallback and mutation-triggered requests and to a changed game or disposed component.

**Failure and action behavior**

- R5. A failed, cancelled, malformed, wrong-scope or unapplied refresh never establishes freshness; users receive visible catch-up or failure feedback and a retry path.
- R6. Version-dependent commands are unavailable while their required projection is known stale or awaiting required reconciliation, and become available after successful catch-up subject to existing game rules and mutation busy state.
- R7. Command acknowledgement, projection-refresh success and transport reachability remain distinct outcomes; a committed command is not reported as uncommitted merely because its following refresh failed.

**Compatibility and evidence**

- R8. Preserve authorization and projection secrecy, role-reveal deep-link gating, Storyteller privacy cover, day closure, URL destinations, scanner outcomes, audit filtering/pagination and in-progress form input.
- R9. Keep the in-memory broker, existing database projections and server expected-version checks; add no durable delivery system or claim of global or linearizable client consistency.
- R10. Verify deterministic missed-update, recovery, ordering, failure and controls behavior for both pages while retaining the existing regression suite and failure evidence; do not skip, allowlist or weaken assertions to obtain a pass.

### Acceptance Examples

- AE1. **Covers R1, R2, R6.** A player loaded version 10, a command committed version 11 before SSE subscribed, and the stream sends hello 11. The client remains catching up until it applies a qualifying projection, then displays version-11 content and permits the relevant action.
- AE2. **Covers R2, R5, R6.** A Storyteller disconnects, another session changes the game, and the stream reconnects without another mutation. Open alone does not enable commands; a failed reconciliation leaves them blocked with a retry, and a later applied projection restores them.
- AE3. **Covers R2, R3.** A visible page misses all invalidate messages. Its active fallback discovers database truth without needing another command; a hidden page instead catches up when returned to the foreground.
- AE4. **Covers R4, R5.** After a newer request applies version 15, an older response returns version 14 or fails. Neither the display nor its freshness/error state regresses.
- AE5. **Covers R7, R8.** A successful QR scan or checkpoint command is followed by an unsuccessful projection refresh. The acknowledged outcome remains available, the refresh failure is visible, and no command is automatically repeated.

### Scope Boundaries

This work covers the two game controllers, their shared stream/refresh integration, freshness presentation and deterministic verification. Auxiliary Storyteller feeds receive request-scope and ordering protection because they share these refresh paths.

**Considered and not built:**

- Durable broker replacement and event replay: the current defect can be closed by authoritative refetching; revisit only if delivery/latency requirements exceed the conditional fallback contract.
- Cross-endpoint atomic snapshots, projection transactions and whole-game read linearizability: current loaders make multiple reads and auxiliary feeds have different contracts; this work does not promise stronger server snapshot semantics. Revisit for a separately demonstrated mixed-read rule defect.
- A generic query cache, reconciliation framework, new state library or retry platform: two page controllers need a narrow shared primitive, not an application data-layer rewrite.
- Command receipt recovery, disaster recovery, legal readiness and broad access-revocation auditing: separate ranked directions remain separate.
- Automatic command retries: freshness repair never repeats a user's game mutation.

### Sources

The origin's idea #2 supplies the scope, conditional convergence constraint and stale-response risk. Its M18 entry contributes missed-notification convergence without an unconditional guarantee. The other ranked directions and old workspace observations are historical context, not current defect assertions.

---

## Planning Contract

### Current Behavior and Evidence

The following is a source-grounded, single-pass behavior trace, not a runtime result:

| Owner / path | Trigger and state effect | Failure or ordering consequence |
|---|---|---|
| `src/components/useGameEventStream.ts` | Opens membership-scoped SSE, evaluates LIVE from readyState, debounces invalidate for 150 ms | Ignores hello data and the callback's completion; online and heartbeat OK can also restore LIVE without applying state |
| `src/app/player/page.tsx` | Initial load and retry call `apply`; stream callback discards its promise; mutations call `apply`; QR calls `fetchProjection` directly | `apply` catches errors and resolves; every fetch unconditionally sets game/state; QR refresh failure is swallowed for generic outcome wording |
| `src/app/storyteller/[gameId]/page.tsx` | Initial and mutation refresh use `load`; stream `refetchAll` starts `load` and audit; `load` starts control asynchronously | `load` catches projection errors; old data can persist, and fatal refresh errors are hidden when game exists; no request guards or game-change clearing |
| Same Storyteller page, `loadAux` / `loadAudit` | Control refresh and audit head/filter/pagination update separate state | Control retains stale data silently; audit failure flag is not cleared on success; old head/filter/page completions can overwrite or append to a different feed |
| `src/components/useVersionedMutation.ts` | Awaits command and then refresh; VERSION_CONFLICT also refreshes | A new rejecting refresh would be mistaken for a command error unless these phases are separated; a rejection inside the conflict catch can escape |
| `src/components/usePresenceHeartbeat.ts` | Presence POST on mount, every 20 seconds and online; any HTTP response dispatches heartbeat OK | Reachability is not authorization, stream health or projection freshness |
| `src/app/api/v1/games/[gameId]/events/stream/route.ts` and `src/modules/realtime/broker.ts` | Resolves membership, reads version/sequence, sends hello, then subscribes in-process | No replay from Last-Event-ID; a read-to-subscribe gap and separate processes can miss invalidations |
| `src/app/api/v1/me/route.ts`, `src/app/api/v1/games/[gameId]/storyteller/route.ts`, `src/modules/projections/load.ts` | Resolve authorized viewer and build game projections containing gameId/version | Sequential reads are not an atomic snapshot; client freshness is measured against these existing endpoint contracts |
| `src/lib/command.ts`, `runCommand` | Locks the game, checks receipt and expectedVersion, commits new version and events | Remains the final guard against concurrent stale commands |

Player stream scope is discovered through `/api/v1/me`; Storyteller scope comes from the route. The player currently blocks only operational/voting controls when not LIVE, whereas Storyteller controls largely depend on busy/game rules. A freshness repair therefore needs page-level command guards as well as visible disabled controls.

### Key Technical Decisions

- KTD1. **Make an applied-result contract the shared boundary.** The stream's async reconciliation callback reports an accepted gameId/version, a failure, or supersession; a fulfilled fetch alone is insufficient. Initial/manual/mutation refreshes use the same page-owned application path. Readiness consumes the accepted projection state and reconciliation boundary, rather than trusting a second independent version counter. Implements R1, R4, R5.
- KTD2. **Use game version as the freshness watermark.** Validate matching gameId and finite nonnegative safe-integer version in hello/invalidate and accepted projection metadata. Keep the target monotonic within one scope and reset it only on an explicit scope change. Sequence is notification metadata, not projection freshness: player/game DTOs expose version but not eventSequence. A valid newer control response or command acknowledgement may raise the target, but only the main accepted game projection satisfies it. Implements R1, R9.
- KTD3. **Guard every application path with scope generation and request order.** Use a small shared client primitive for versioned projection acceptance and async coordination, plus feed-local tokens for audit. Reject an older request after a newer intent even if it arrives last, and reject any version below the last applied version. Commit data, accepted metadata and error clearing together through one state transition. Abort disposal where practical, but correctness must survive an ignored abort. Implements R4.
- KTD4. **Coalesce reconciliation without losing work received in flight.** Keep at most one active authoritative refresh per scope, with one pending follow-up obligation. A trigger requiring a post-trigger read cannot be satisfied by an earlier request. Re-check the current target after completion; a below-target response cannot announce LIVE. Preserve the existing invalidate debounce without trailing starvation during a continuous burst. Implements R1–R3, R5.
- KTD5. **Recover from browser lifecycle and lost notifications using HTTP truth.** Open/hello, reconnect, online, focus and visible-return feed the same scheduler. Foreground transitions invalidate the prior freshness boundary immediately. A successful heartbeat may prompt recovery after failure but never sets freshness. Active fallback and request deadlines use the bounded defaults in Assumptions. Implements R2, R3, R9.
- KTD6. **Separate command outcome from refresh outcome.** Preserve acknowledged command results and generic scan wording when needed, while recording a failed refresh as a freshness error. VERSION_CONFLICT stays visible and triggers reconciliation without automatic command replay. Explicitly consume rejected refreshes so event handlers do not produce unhandled promises. Implements R5, R7.
- KTD7. **Keep auxiliary feeds independently honest.** Main-projection freshness governs the game-ready indication; control/audit errors get their own stale/unavailable notices rather than silently certifying those panes. Control-derived command inputs require that control data's accepted scope/version be current enough; audit history is never a global readiness gate. Implements R4–R6, R8.

These are planning decisions supported by the trace, not session-settled feature architecture. The rejected bare-directive alternative—fix only hello/open without covering other page writes—fails R4 because manual and mutation fetches would still overwrite newer state. The smallest practical repair includes those writers. No costly unresolved mechanism choice survives research: a generic cache/store and a durable broker are unnecessary for this bounded change, so developing competing architectures would add work without resolving a remaining decision.

### Assumptions

These defaults are unconfirmed engineering bets for this non-interactive plan. They are explicit so implementation and review can judge them without mistaking them for prior user choices.

- A1. Use a 30-second completion-scheduled active fallback, paused while hidden and disposed on unmount/scope change. This bounds missed-notification repair to roughly one interval plus request time under a visible, reachable, otherwise stable workload. Do not suppress HTTP recovery forever solely because navigator.onLine is false.
- A2. Use a 15-second request deadline and a minimum 2-second delay before an automatic retry after a failed or below-target attempt. One pending obligation replaces unbounded retries; after a failed attempt, retry on the active schedule or a coalesced user/lifecycle trigger. Do not schedule a zero-delay loop during rapid game changes.
- A3. Display a neutral `SYNCHRONIZING` state with Polish label `AKTUALIZACJA…` when transport is open but a required reconciliation is pending or failed. Display LIVE only under R1; keep RECONNECTING and OFFLINE for transport state, with explanatory freshness/error text where necessary.
- A4. Gate version-dependent mutations by projection readiness, not by navigator.onLine or stream connectivity alone. A successful HTTP catch-up can permit commands while SSE is reconnecting, with RECONNECTING still visible. A failed refresh or a required boundary blocks them until a later accepted catch-up.
- A5. Routine periodic checks do not temporarily disable a previously ready screen merely by starting an unchanged-version check. Discovering a newer target, a failed check or a lifecycle boundary removes readiness immediately. A manual retry remains available during catch-up and coalesces with the pending work.

### High-Level Technical Design

The following tables are design sketches for the distinct ownership, protocol, state, lifecycle, decision and data-flow concerns. Product behavior remains governed by the cited requirements.

**Ownership sketch**

| Source | Directed handoff | Owner |
|---|---|---|
| SSE metadata / browser lifecycle / timer | target and reconciliation obligation | Stream hook and narrow scheduler |
| Initial load / retry / mutation completion | refresh request through the same acceptance path | Page controller |
| Authorized HTTP game projection | scoped candidate data | Acceptance primitive |
| Accepted data and metadata | one application transition | Page projection state |
| Page projection state + pending boundary + transport | freshness and connection display | Stream hook / page readiness |
| Audit/control responses | independently guarded pane state | Storyteller controller |

**Connection and reconciliation protocol sketch**

1. Open/reopen establishes transport only and starts a required catch-up boundary (R1, R2).
2. Hello/invalidate validates scope/version and raises the target (KTD2).
3. Scheduler starts a post-boundary projection read, or records one follow-up if another read predates it (KTD4).
4. Acceptance checks identity, lifetime, request order, applied version and response metadata before publishing (KTD3).
5. The current accepted result satisfies the latest target/boundary, or stays unready with a bounded follow-up (R1, R5).

**State transition sketch**

| Event | Transport | Projection freshness | Display / command consequence |
|---|---|---|---|
| Mount or game change | connecting | unverified | Loading or reconnecting; no commands |
| Open / reconnect | open | required catch-up | SYNCHRONIZING; no commands |
| Accepted post-boundary result at target | unchanged | ready | LIVE if open; A4 if transport still reconnecting |
| Newer known target / foreground return | unchanged | unverified | Catch-up indication; no commands |
| Current attempt fails / times out | unchanged | failed | Visible retry/error; never LIVE; no commands |
| Old response or old failure | unchanged | unchanged | No state transition |
| Hidden page | unchanged | convergence suspended | No fallback work; visible-return creates a new boundary |

**Lifetime sketch**

| Boundary | Invalidate / clean up | Resume behavior |
|---|---|---|
| Effect cleanup / StrictMode replay | listeners, EventSource, debounce, retry/deadline/fallback timers and generation | New effect owns a fresh generation; old callbacks are inert |
| Storyteller gameId change | prior game and auxiliary snapshots, modal/results writers and request tokens | Route's new scope starts unverified; prior private state is not rendered |
| Latest `/me` discovers another game | previous stream generation and all old player writers | Accept identity change only from current discovery intent, then reconcile the new game |
| Hidden to visible / window focus / pageshow | prior readiness boundary as needed | Coalesce overlapping signals and request post-return truth |

**Acceptance decision sketch**

Evaluate in this order: disposed/wrong scope → discard; superseded request → discard; invalid metadata → fail current attempt; version below applied → discard and retain catch-up obligation; version below current target → remain unready; otherwise publish and evaluate the current boundary. An accepted response from a request that started before a required boundary cannot complete that boundary. Duplicated or delayed lower-version SSE metadata cannot lower the target.

**Data-flow sketch**

Game endpoint → validated identity/version plus projection → request acceptance → atomic page-state publication → derived freshness → action guards and connection presentation. Control endpoint → feed acceptance → control state / optional higher target. Audit endpoint → game/filter/head-generation acceptance → replacement or cursor-bound append. Audit is not a game-version certificate.

### Flow and Edge-Case Resolutions

- Initial player discovery occurs before its game stream exists; hello must still reconcile even when the discovered version equals its watermark, because the discovery read may predate subscription.
- Open and hello can arrive during one fetch. Coalesce them when that fetch is post-boundary; otherwise retain a follow-up. Hello is required input, not a second transport connection.
- Malformed same-stream metadata cannot establish readiness or cause an unbounded fetch storm. Mark a reconciliation obligation and recover through HTTP; valid messages for a different game are ignored.
- On background refresh failure, retain already authorized displayed data with an honest error/catch-up state. Authentication failures clear private data and follow the existing unclaimed/unauthorized flow rather than retaining secrets behind a status badge.
- Every mutation entry point checks current scope/readiness, including QR, claim-token issue, access reset, rename, checkpoint and recovery controls. UI disabling alone is insufficient for a stale dialog callback.
- Old mutation completions may not write old-game modals, notes, busy/error flags or initiate old-game refreshes into the new scope. They may finish on the server; client cancellation does not undo a committed command.
- Audit filter changes or head replacement invalidate pending page appends. A load-more result appends only to the same game, normalized filter and head generation/cursor chain, with sequence deduplication. Success clears its current error flag; stale failures do not set it.
- Control can change presence without a game-version change, so request ordering still matters at equal versions. Stale control data remains explicitly marked and cannot provide current command parameters.

### System-Wide Impact and Risks

The change affects both human game surfaces and their shared health presentation. No authorization, schema, content or command-domain changes are planned. HTTP requests keep the current no-store behavior in `src/lib/client-api.ts` and authorized projection routes.

Active fallback adds one main projection read per visible game page per interval. Avoid fetching the expensive consistency/control route or full audit history every unchanged timer tick: refresh auxiliaries on relevant invalidations, successful changed main projection, lifecycle catch-up or explicit pane retry. Initial and mutation paths must still refresh what their visible panes need.

Current server projection reads can straddle a command, and the broker has no cross-process replay. Neither version comparison nor a green badge proves a globally consistent snapshot. Server expectedVersion remains the final guard, and repeated visible reads provide conditional convergence (R3, R9).

Browser timer throttling and reachability hints are not deadlines. Tests should control the schedule and HTTP outcomes rather than treating focus or online as proof of success. Presence heartbeat behavior remains independent of freshness.

### Research Supporting the Design

- React official Effect cleanup guidance supports scope/lifetime guards and StrictMode setup/cleanup symmetry: `https://react.dev/reference/react/useEffect` and `https://react.dev/learn/synchronizing-with-effects`. Use APIs compatible with the pinned React 19.1.0; no newer hook is required.
- MDN EventSource guidance establishes named-event handling, automatic reconnection and explicit close: `https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events`. Repository source, not SSE event IDs, establishes that this server has no replay.
- MDN Page Visibility and navigator.onLine guidance informs A1/A4 and foreground reconciliation: `https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API` and `https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine`.
- Official references were retrieved with Context7. A general web-search tool was unavailable; no broader external landscape or deployed-topology validation is claimed.
- `vitest.config.mts` uses the Node environment and automatic JSX runtime, including `.test.ts` files. `src/app/storyteller/[gameId]/_components/ControlView.test.ts` uses static rendering; it does not mount effects. Use pure coordination tests in Node and actual lifecycle wiring tests in Playwright rather than adding a DOM/test library solely for this work.
- `tests/e2e/fixtures.ts`, `tests/e2e/e2e-07-map-unlock.spec.ts` and `tests/e2e/e2e-09-ux-shell.spec.ts` supply deterministic setup, map propagation and the three inherited UX scenarios. `docs/regression-baseline.md` and `docs/regressions/README.md` define evidence retention; their historical green measurements are not measurements of this branch.

---

## Implementation Units

### U1. Define and prove scoped projection acceptance

**Goal:** Every caller can distinguish applied, failed and superseded reads without stale publication.

**Requirements:** R1, R4, R5; KTD1–KTD4.

**Dependencies:** None.

**Files:** Create `src/lib/projection-reconciliation.ts` and `src/lib/projection-reconciliation.test.ts`. Modify `src/lib/client-api.ts` only if cancellation needs a narrow helper adjustment; preserve its public error contract.

**Approach:**

1. Provide the small repo-native acceptance/coordination primitive described in KTD1–KTD4, with injectable work and scheduling for deterministic Node tests.
2. Keep React page state publication outside the primitive, using a guarded commit point that couples data with accepted metadata.
3. Carry cancellation/supersession separately from user-visible network failure; the existing API helper maps aborted fetches to NETWORK, so inspect the owned signal/generation before classifying the completion.

**Patterns to follow:** Client-safe helpers in `src/lib/client-api.ts`; focused Node tests under `src/lib/presentation/`.

**Execution note:** First capture out-of-order and old-scope failures with deferred promises; avoid tests that only mirror helper branches.

**Test scenarios:**

1. Newer request applies version 15, then older request returns version 14 or rejects: accepted data and error state stay at the newer result.
2. A later request returns below the applied version: it cannot regress the display or satisfy freshness.
3. A trigger raises target 11 during an in-flight version-10 read: one follow-up occurs, and readiness waits for it.
4. A required foreground boundary arrives during a read whose result reaches target: that pre-boundary read still cannot satisfy the new boundary.
5. Equal-version requests with different payloads obey request order; invalid metadata fails the current request without publishing.
6. Scope changes, disposal and aborted requests ignore all old successes/failures and release owned timers, even if the worker ignores abort.
7. Continuous invalidations and failed/below-target responses never create concurrent unbounded work or a zero-delay retry loop.

**Verification:** Deferred-promise and fake-clock tests prove state outcomes and bounded scheduling without a browser, network or database.

### U2. Reconcile stream and browser lifecycle before reporting LIVE

**Goal:** The stream reports transport honestly and drives the required authoritative catch-up work.

**Requirements:** R1–R3, R5, R9; KTD1, KTD2, KTD4, KTD5; A1–A5.

**Dependencies:** U1.

**Files:** Modify `src/components/useGameEventStream.ts`; extend `src/lib/projection-reconciliation.test.ts`; create `tests/e2e/e2e-10-realtime-reconciliation.spec.ts`. Modify `src/components/usePresenceHeartbeat.ts` only if the integration needs scope metadata on its existing window signals.

**Approach:**

1. Replace the fire-and-forget freshness assumption with KTD1's awaited outcome and accepted-projection input.
2. Handle hello/invalidate metadata and all lifecycle triggers through the coordinator, keeping transport readyState separate.
3. Own and clean up fallback, deadlines, listeners, source and pending work per effect generation; apply A1/A2 without rebuilding EventSource on every projection render.

**Patterns to follow:** Existing stream debounce and heartbeat event names, native EventSource reconnect, Effect cleanup guidance.

**Test scenarios:**

1. Covers AE1. Hold initial stream opening, change the database-backed game, release hello and send no invalidate: a qualifying fetch is requested before LIVE.
2. Covers AE2. Error/reopen with no further event forces catch-up; open and heartbeat OK cannot bypass an unresolved or rejected refresh.
3. Covers AE3. Suppress invalidations while SSE remains open: the active fallback catches up; hidden state pauses fallback and visible/focus return coalesces into recovery.
4. A target increase during the debounce or a held fetch is not lost; duplicate lower-version hello/invalidate cannot lower the target.
5. Unmount/StrictMode replay/game change closes obsolete sources and prevents old timers, callbacks and heartbeat outcomes from certifying the new scope.
6. A hung fetch reaches its deadline, releases scheduling and exposes retry; navigator.onLine hints cannot permanently prevent a successful HTTP probe.

**Verification:** Pure tests establish scheduler bounds; the U5 browser matrix proves mounted-hook wiring on both real pages.

### U3. Route both pages and mutation refreshes through guarded application

**Goal:** All game projection writers obey the same acceptance rule and preserve command outcomes.

**Requirements:** R4, R5, R7, R8; KTD1–KTD4, KTD6, KTD7.

**Dependencies:** U1, U2.

**Files:** Modify `src/app/player/page.tsx`, `src/app/storyteller/[gameId]/page.tsx`, `src/components/useVersionedMutation.ts`; create `src/components/useVersionedMutation.test.ts` using a small extracted non-React command/refresh phase helper if needed; extend `tests/e2e/e2e-10-realtime-reconciliation.spec.ts`.

**Approach:**

1. Unify player initial/apply/load/QR refresh and Storyteller initial/load/refetchAll/manual/post-mutation refresh behind the guarded application path; remove success-by-swallowed-error at the freshness boundary.
2. Guard control and audit reads independently under KTD7, including head replacement, filters, load-more and game changes. Render their current errors/stale state and clear only errors owned by a successful current request.
3. Separate command acknowledgement from refresh completion in the shared mutation wrapper and custom QR/claim/reset handlers per KTD6; feed valid returned command versions into the target.
4. Invalidate old-scope async UI writers and clear game-scoped private snapshots on scope changes, including the player discovery path. Preserve form selections across ordinary accepted refreshes unless their action identity changes.

**Patterns to follow:** Existing `ApiClientError` / localized friendlyMessage, current command IDs and expectedVersion bodies, audit category ref and URL handling, scanner outcome formatter.

**Test scenarios:**

1. Covers AE4. Hold an old manual/QR/stream refresh, apply a newer mutation refresh, then release the old success or failure: neither page regresses or displays an old error.
2. Covers AE5. Command succeeds but its refresh fails: preserve acknowledged result, show refresh failure, block stale commands and never replay the command.
3. VERSION_CONFLICT followed by refresh failure preserves the conflict and exposes catch-up failure without an unhandled promise or false refreshed claim.
4. Navigate Storyteller A to B, then finish A's game/control/audit/mutation requests: no A data, modal token or error appears in B.
5. Current `/me` discovery changes game identity while an older request remains pending: only the latest accepted identity owns stream and state.
6. Change audit filter or refresh its head during load-more: old pages do not append; duplicate sequences are removed; later current success clears auditError.
7. Control failure retains visibly stale prior data without certifying current control inputs; an equal-version later success is not overwritten by an older response.
8. QR generic outcome wording, role acknowledgement, claim/reset one-time results and checkpoint notices retain their existing successful flows.

**Verification:** Browser assertions exercise actual page fetch paths and error presentation; phase-helper tests distinguish command and refresh outcomes where extraction is justified.

### U4. Expose catch-up and guard commands consistently

**Goal:** Users can read, navigate and retry while commands wait for their required state.

**Requirements:** R1, R5–R8; KTD6, KTD7; A3–A5.

**Dependencies:** U2, U3.

**Files:** Modify `src/components/ui/ConnectionStatus.tsx`, `src/app/player/page.tsx`, `src/app/player/_components/PlayerCaseView.tsx`, `src/app/player/_components/PlayerMapView.tsx`, `src/app/storyteller/[gameId]/page.tsx`, `src/app/storyteller/[gameId]/_components/ControlView.tsx`, `src/app/storyteller/[gameId]/_components/SystemView.tsx`; extend `src/app/storyteller/[gameId]/_components/ControlView.test.ts` and `tests/e2e/e2e-10-realtime-reconciliation.spec.ts`. Adjust other existing command-bearing child props only where the page's busy/disabled propagation is insufficient.

**Approach:**

1. Update every exhaustive RealtimeHealth display, including Control/System maps, for A3. Use existing text-bearing status/Notice components and keep retry available independently of mutation busy state.
2. Derive projectionReady independently of transport and mutation busy. Apply it at every page command entry point and pass disabled state to command controls without disabling navigation, privacy cover, role inspection or form editing.
3. Ensure an already-open confirmation uses current guarded execution and cannot send a captured old-version command after catch-up. Require renewed confirmation when its underlying action identity/version changes.
4. Keep privacy cover and deliberate reveal gates above freshness notices that might otherwise expose private game content; avoid misleading “view refreshed” wording when refresh failed.

**Patterns to follow:** Existing `ConnectionStatus` role=status, `Notice`, private reveal flow, Control confirmation Dialog, current game-rule disabled conditions.

**Test scenarios:**

1. Catch-up renders `AKTUALIZACJA…` instead of LIVE, and action submission/vote/nominate/scan/Storyteller mutation controls are disabled until an accepted result.
2. Failed refresh keeps commands blocked and retry enabled; successful retry enables only commands legal in the new projection.
3. A routine unchanged-version fallback does not flicker controls, reset forms or show a blocking loading screen.
4. An old confirmation cannot invoke its stale closure after a newer projection or game change; current navigation and privacy controls remain usable.
5. Projection caught up over HTTP with SSE unavailable follows A4, visibly keeps RECONNECTING and retains server conflict protection.
6. Existing Control privacy/no-execution closure render assertions remain unchanged in strength; all three E2E-09 cases still pass with the new catch-up behavior.

**Verification:** Static rendering covers status/control presentation where useful; mounted browser tests verify true enabled/disabled behavior and command request counts.

### U5. Prove disruption recovery and preserve release evidence

**Goal:** Demonstrate convergence and race safety through the real pages without relying on another notification or weakening inherited checks.

**Requirements:** R1–R10; AE1–AE5.

**Dependencies:** U1–U4.

**Files:** Complete `tests/e2e/e2e-10-realtime-reconciliation.spec.ts`; extend `tests/e2e/fixtures.ts` only for reusable deterministic fixtures. Update the missed-event comment in `tests/e2e/e2e-07-map-unlock.spec.ts` when its replacement proof exists. Update `docs/regression-baseline.md` or add a focused entry under `docs/regressions/` only for actual new evidence/failures.

**Approach:**

1. Use existing authenticated fixtures and real database projections. Install a test-only controllable EventSource shim before page code to hold open/hello, drop invalidations and emit reconnect; fetch hello metadata from the real authorized stream or authoritative endpoint. Do not add production test endpoints.
2. Use route interception to hold and reorder actual game/control/audit responses and to inject specific HTTP failures. Assert meaningful visible content and outgoing commands, not a fabricated success callback.
3. Use controlled browser time for the active fallback and explicit visibility/focus transitions for lifecycle tests; include one native EventSource disconnect/reconnect journey to prove the shim is not the sole evidence for browser wiring.
4. Reuse fixed seeds and discovered roles, retain traces/native reports, and compare actual source/test inventories using the established baseline entry point.

**Test scenarios:**

1. Covers AE1. For player and Storyteller, hold stream establishment after old initial projection, mutate through another authorized session, release stream hello and assert new game content before LIVE; no post-hello mutation is allowed.
2. Covers AE2. For both pages, disconnect, mutate, reconnect with no extra invalidate, hold then fail refresh and finally retry successfully. Assert command controls stay blocked until applied state.
3. Covers AE3. For both pages, foreground after hidden mutation with no notification and recover; separately drop all invalidations on an open stream and advance one active fallback interval to observe database truth.
4. Covers AE4. Reorder main/manual/post-mutation reads and inject obsolete failures, then assert content, badge, error and command state remain current.
5. Switch games and audit filters while requests are held, then release them and verify scoped data, feed ordering and disposal.
6. Covers AE5. Preserve a committed command's result after refresh failure and verify a retry fetch never sends the command again.
7. Run the inherited map propagation and all three E2E-09 scenarios without reducing their original assertions or suppressing failures.

**Verification:** Each disruption has an explicit precondition, controlled release and observable endpoint/UI outcome. Failure reports identify seed, page role, response ordering and exact missing result.

---

## Verification Contract

Planning performs no tests or application execution. The following gates belong to implementation and use repository-owned disposable database handling.

| Gate | Repository entry / evidence | Completion signal |
|---|---|---|
| Coordination and phase outcomes | New `.test.ts` files through the existing Vitest configuration | Deterministic deferred-promise/fake-clock scenarios pass without hidden pending work |
| Existing unit/integration coverage | `npm test` | Native inventory retained; new tests add coverage and inherited identities remain exercised |
| Lint | `npm run lint` | No new diagnostics |
| Fresh type checking | `npm run typecheck -- --incremental false` | Includes all RealtimeHealth consumers and page callback contracts |
| Focused browser behavior | E2E-10 plus E2E-07 and all three E2E-09 cases through existing Playwright setup | Actual mounted player/Storyteller flows meet AE1–AE5; native stream coverage included |
| Full production release profile | Canonical `npm run baseline` entry, options and ownership prerequisites from `docs/regression-baseline.md` | Fresh build, full browser inventory, DB isolation, native outcomes and source identity recorded |
| Development comparison | Development profile of the same baseline entry | Kept distinct from production evidence and used for StrictMode/lifecycle validation |
| Failure accounting | Existing regression ledger convention | Every failing occurrence is explained with retained raw evidence; no pass-by-rerun or assertion weakening |

`package.json` also has `verify:release`; the baseline entry is the evidence-bearing end-to-end path here because it includes identity, browser and cleanup accounting. There is no `release:validate` script to invoke. Obtain exact baseline options from its runbook rather than inventing command choreography.

Do not treat the historical 188-unit/9-browser account as the current test denominator: PR2 added render coverage and expanded E2E-09 to three cases. Discover current identities during implementation and retain them. Do not read secret environment files to prepare a run.

---

## Definition of Done

- U1 acceptance/coordination tests establish order, identity, boundary and cancellation behavior.
- U2 reports LIVE only under R1 and exercises all required lifecycle triggers with bounded scheduling.
- U3 routes every identified projection writer through guarded application and distinguishes acknowledged mutations from refresh failures.
- U4 exposes catch-up/failure and enforces readiness in both presentation and command entry points, preserving R8.
- U5 proves the real disruption scenarios on both pages and retains the inherited regression assertions.
- Verification Contract gates pass or their exact blockers and failures remain visible; no skipped or weakened assertions substitute for evidence.
- No abandoned experimental implementation, unused timers/listeners or accidental library additions remain in the diff.
- No stronger consistency, production-topology, recovery or legal claims are added beyond R3/R9.
