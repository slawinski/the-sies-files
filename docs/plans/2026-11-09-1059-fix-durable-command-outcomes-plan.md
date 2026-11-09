---
title: Durable Command Outcomes - Plan
type: fix
date: 2026-11-09
deepened: 2026-11-09
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
origin: docs/ideation/2026-10-28-legacy-app-reinforcement-ideation.html
---

# Durable Command Outcomes - Plan

## Goal Capsule

- **Objective:** A player who loses a consequential action's response can find out what happened without causing its effects a second time.
- **Means:** Extend existing command receipts and the existing status-read pattern, with runtime contracts and a QR recovery journey (KTD1–KTD6).
- **Authority:** The item #5 brief governs product scope, followed by idea #5 in the origin document; R-IDs own behavior, KTD-IDs own implementation choices, and units implement those contracts.
- **Baseline:** `c2e00f2a9fb505b1f159476447acd880b7216dc2`, branch `fix/durable-command-outcomes`; application is local-only and not deployed.
- **Execution profile:** Five dependency-ordered units, with failing behavioral proofs before fixes and isolated PostgreSQL 16 verification during implementation.
- **Stop conditions:** Stop for an invalidated session-settled decision, an unavoidable product-scope fork, or evidence that the specified identity/privacy boundary cannot be preserved. An unsupported historical receipt is a handled outcome, not permission to repeat it.
- **Completion ownership:** This document specifies implementation and verification. The parent workflow owns PR publication and merge after terminal green checks and material feedback resolution; that grant is workflow authority, not a product assumption.

---

## Product Contract

### Summary

Make every formal command result runtime-validated on write and read, bind new receipts to their operation, actor and request, and expose a player-only read of that player's outcomes. Rescue the QR scan journey after response loss using its original command identity. Establish narrowly named cross-release compatibility evidence without turning receipts into a new event or query platform.

### Problem Frame

The existing transaction prevents the same game/command ID from applying twice, but most callers accept stored JSON through a cast. The status endpoint bypasses even the optional result schema. A committed outcome can outlive the code that understands it, and failure to decode it must not make the mutation eligible to run again.

The player page creates IDs inside action lambdas and has no outcome lookup. Losing a scan response leaves the person without a reliable acknowledgement. Separately, access reset creates a raw claim token before entering the command helper, so its duplicate path can return a token whose hash was never committed. Claim-token issuance already withholds its token on duplicate and provides the pattern to preserve.

### Actors

- A1. Player with current membership, allowed to recover only commands recorded for `player:<their playerId>`.
- A2. Storyteller with current game access, retaining the existing authorized status capability.
- A3. Successor maintainer, who needs explicit supported readers, producers and failure semantics across a release change.

### Key Decisions

- **Use local verification.** (session-settled: user-directed — chosen over hosted tests: the application is local-only and is not deployed.) Governs R10.
- **Clear private views on access loss.** (session-settled: user-directed — chosen over a retained read-only copy: losing access must remove the private browser view.) Governs R8.
- **Preserve and explain failing evidence.** (session-settled: user-directed — chosen over skipping, weakening or using unstable captures: later hardening must remain attributable.) Governs R10.

### Requirements

**Durable correctness**

- R1. Every `runCommand` producer must validate its handler's JSON result before transaction commit, including empty results.
- R2. Every receipt consumer must validate stored results against an explicitly supported operation/result version; an unreadable committed receipt produces a typed failure and never invokes the handler.
- R3. A reused command ID must not return another operation's, actor's or semantic request's result.
- R4. Receipt lookup and duplicate resolution must retain the existing game lock, duplicate-before-staleness ordering and atomic state/event/version/receipt commit.

**Recovery and privacy**

- R5. A player may look up only their own actor-bound command outcomes under current game authorization, with uniform safe responses for inaccessible and absent receipts.
- R6. A lost QR response must be recoverable by querying the original command ID, including after an ordinary same-tab reload, without automatically resubmitting the mutation.
- R7. An absent status is unresolved rather than proof of non-commit, and the recovery UI must not present it as permission to repeat the action.
- R8. Status callbacks and publications must honor the current access generation and clear private recovery state on detected access loss.
- R9. Duplicate issue/reset commands must acknowledge acceptance without inventing or persisting a replacement one-time credential.

**Compatibility and verification**

- R10. Preserve the existing release-gate assertions and report attributed local proof for the changed behavior.
- R11. Document and test a named old-writer/new-reader and new-writer/old-reader matrix using representative committed results, with unsupported paths stated explicitly.
- R12. Preserve valid existing response fields and route authorization guards while introducing the minimum additive receipt metadata needed for R2–R3.

### Acceptance Examples

- AE1. **Covers R1, R4.** A handler writes a row and an event but returns an invalid result; the command fails and the row, event, game version and receipt all remain unchanged.
- AE2. **Covers R2, R4.** A receipt exists with an unsupported result version or corrupt JSON shape; a duplicate with a stale expected version reports `COMMAND_RECEIPT_INVALID`, leaves the receipt intact and never enters its handler.
- AE3. **Covers R3.** A scan command ID is reused by another player, for another operation, or for a different QR token; it returns no original result and causes no mutation.
- AE4. **Covers R5, R8.** A player asks for another player's, a Storyteller's, or an unknown command ID; those observations match, and no private marker appears. A delayed own-result response after access loss cannot repopulate the screen.
- AE5. **Covers R6.** A QR scan commits, the HTTP response is lost, and the same player reloads; a status GET returns the validated original scan outcome, the acknowledgement becomes visible and exactly one scan, primary QR_SCANNED event and receipt exist.
- AE6. **Covers R7.** Status is `UNKNOWN` while the POST is still in flight; the UI remains unresolved, allows another status check and sends no second POST, including after the first POST later commits.
- AE7. **Covers R9, R12.** Reset succeeds once with a usable token; repeating its ID returns the original version and an accepted-but-credential-unavailable acknowledgement without a token, second revocation or token rotation.
- AE8. **Covers R11.** A committed metadata-free scan from the named old producer is readable only under the bounded legacy-read policy, while a duplicate POST refuses to guess its original request identity.
- AE9. **Covers R10–R12.** A named old reader observes the unchanged structured result fields from a new writer in a controlled fixture; the report distinguishes this observation from an unsupported operational rollback.

### Scope Boundaries

Item #5 only. All 36 formal producers and both status/duplicate consumers receive contracts, but QR scan is the only newly rescued browser journey. Existing successful command responses, projections, CSRF/origin checks and no-automatic-replay behavior remain the baseline.

#### Deferred to Follow-Up Work

- Apply the identified-action UX to vote, nomination and other actions after the QR journey proves the mechanism; their server-side results and identity bindings are included now.
- Items #6 and #7 retain their separate provenance and lifecycle decisions. This work chooses no content rights or retention horizon.

#### Considered and Not Built

- A new event log, generalized workflow/query platform, pending-token protocol or blanket durable-JSON migration: existing receipts address the requested boundary.
- Automatic resubmission, deletion of invalid receipts, guessed backfills or credential recovery storage: these cannot establish whether effects already committed safely.
- A universal binary-upgrade platform or unknown-future-reader promise: the bounded A/B service fixture supplies specific observations at much lower cost.
- Cross-device pending-action synchronization: same-tab identity persistence satisfies the chosen representative recovery journey without storing private payloads server-side.

---

## Planning Contract

### Current Source Evidence

`src/lib/command.ts` acquires the game row lock before reading the receipt and checks expected version only when the receipt is absent. Its optional schema validates duplicates only; new handler results are cast into Prisma JSON. `CommandReceipt` has no operation, actor, request fingerprint or schema version. `DomainEvent` does carry actor, command ID and game version, but events are not a complete request history.

`src/modules/recovery/recovery.service.ts#getCommandStatus` returns unvalidated `resultJson`. Its existing GET route calls `resolveStoryteller`. Player command routes derive the actor from `resolvePlayer`, including QR scanning. `useVersionedMutation` captures access tickets and guards callbacks, while `src/app/player/page.tsx` allocates a fresh ID inside each action lambda. `api<T>` can currently treat an unreadable successful response as `null as T`, so response loss includes malformed acknowledgements, not just fetch rejection.

The following inventory is exhaustive for production `runCommand` call sites at the baseline. Results listed are persisted handler results, before service/route-added response fields. All rows need an operation descriptor, semantic input binding and result schema. S means `storyteller`; P means the authenticated `player:<id>`.

### Producer and API Consumer Inventory

All route suffixes below are relative to `src/app/api/v1/games/[gameId]/` and end in `route.ts`. The service file is `src/modules/<module>/<module>.service.ts`.

| Module / producer | Actor | Persisted result contract | API suffix / consumers |
|---|---|---|---|
| game-session / renameGame | S | empty object | root PATCH; Storyteller |
| game-session / setParticipantKind | S | empty object | `players/[playerId]/kind`; Storyteller |
| game-session / addPlayer | S | `playerId` nonempty string | `players`; Storyteller, fixtures |
| game-session / updatePlayer | S | empty object | `players/[playerId]` PATCH; Storyteller |
| game-session / removePlayer | S | empty object | `players/[playerId]` DELETE; Storyteller |
| game-session / reorderPlayers | S | empty object | `players/reorder`; Storyteller |
| game-session / issueClaimToken | S | `playerId`, `claimId`, ISO `expiresAt` | `players/[playerId]/claim-token`; Storyteller claim modal |
| setup / generateSetup | S | nonnegative integer `regenerationIndex` | `setup/generate`; Storyteller |
| setup / commitSetup | S | nonempty `setupHash` | `setup/commit`; Storyteller |
| setup / acknowledgeRole | P | empty object | `role-reveal/ack`; player |
| operational / startOperational | S | nonnegative integer `actionCount`, positive integer `cycleNumber` | `operational/start`; Storyteller |
| operational / submitAction | P | empty object | `operational/actions/[actionId]/submit`; player |
| operational / resolveAction | S | empty object on both info and kill branches | `storyteller/actions/[actionId]/resolve`; Storyteller |
| operational / completeOperational | S | empty object | `operational/complete`; Storyteller |
| investigation / openNominations | S | empty object | `investigation/nominations/open`; Storyteller |
| investigation / closeNominations | S | empty object | `investigation/nominations/close`; Storyteller |
| investigation / nominate | P | nonempty `nominationId` | `nominations`; player |
| investigation / resolveNominationTrigger | S | empty object | `nominations/[nominationId]/triggers/resolve`; Storyteller |
| investigation / voteIntent | P | empty object | `nominations/[nominationId]/votes/intent`; player |
| investigation / startVotingPass | S | empty object | `nominations/[nominationId]/voting/start`; Storyteller |
| investigation / advanceVotingPass | S | empty object | `nominations/[nominationId]/voting/advance`; Storyteller |
| investigation / lockVote | S | empty object | `nominations/[nominationId]/votes/lock`; Storyteller |
| investigation / resolveExecution | S | `winner`: GOOD / EVIL / null | `investigation/resolve-execution`; Storyteller |
| investigation / exileTraveller | S | empty object | `traveller/exile`; Storyteller |
| investigation / slayer | P | `winner`, optional boolean `decisionRequired` | `day-actions/slayer`; API/tests |
| investigation / resolveSlayerDecision | S | `winner` | `storyteller/day-actions/slayer/decide`; Storyteller |
| investigation / closeInvestigation | S | `winner` | `investigation/close`; Storyteller |
| scenario / scanQr | P | `outcome`: discoveries/tasks/conditions string arrays, nullable mapVersionId; legacy duplicate branch below | `scenario/qr/scan`; player, scan presentation |
| scenario / storytellerRevealClue | S | empty object | `storyteller/scenario/clues/[clueId]/reveal`; Storyteller |
| scenario / storytellerCompleteTask | S | empty object | `storyteller/scenario/tasks/[taskId]/complete`; Storyteller |
| scenario / storytellerSetStage | S | empty object | `storyteller/scenario/stage`; Storyteller |
| scenario / storytellerSetMap | S | empty object | `storyteller/scenario/map`; Storyteller |
| scenario / storytellerSetCondition | S | empty object | `storyteller/scenario/conditions`; Storyteller |
| recovery / createCheckpoint | S | nonempty `checkpointId` | `storyteller/checkpoints`; control panel, route adds `valid` |
| recovery / resetPlayerAccess | S | empty object | `players/[playerId]/access/reset`; reset modal, route adds one-time token |
| recovery / recoveryOverride | S | empty object | `storyteller/recovery/override`; Storyteller |

Additional receipt consumers are the duplicate branch of `runCommand`, `getCommandStatus`, its existing Storyteller GET route, and the proposed player-only GET route. `createGame`, `claimPlayer`, heartbeat, auth recovery, checkpoint validation, replay diagnostics and projections are not formal receipt producers. Their independent transaction/session semantics remain outside this codec change. Test-only direct `runCommand` invocations must adopt the required descriptor instead of receiving an unsafe default.

### Key Technical Decisions

- KTD1. **Add nullable metadata columns without wrapping `resultJson`.** Add `operation`, `actor`, `resultVersion` and `requestHash` to `CommandReceipt`, leaving pre-existing rows null and the unique game/command key intact. Existing readers expect the result object directly, so an envelope would break observed consumers. No destructive migration, data backfill or non-null default falsely assigns historical identity. Governs the implementation of R2–R4, R11–R12.
- KTD2. **Require a typed operation descriptor at every formal producer.** A small `src/lib/command-contracts.ts` catalog associates stable operation names with result version 1 and synchronous JSON-only result schemas. Infer results from the schema; remove the optional unvalidated branch. Validate and persist the parsed output, then return that same output. Strict empty-object schemas reject stray credential/private fields rather than stripping them silently. Reject undefined, non-finite numbers, Dates, bigint and non-JSON results before commit; no transforming/coercing output schemas. A deliberate legacy adapter is separate from current validation. This follows Zod's distinction between raw input and successful parsed data and Prisma's transaction rollback behavior. Implements R1–R2.
- KTD3. **Bind logical actor and canonical semantic input, not credentials or generated artifacts.** Use the existing game-scoped `storyteller` role and `player:<id>` identities, not session cookies or session-token values. Hash a deterministic, versioned canonical representation of the operation's caller intent, including URL entity IDs and parsed payload fields. Exclude command ID, expectedVersion and server-generated randomness/expiry/token hashes. Preserve array order unless the operation already treats it as irrelevant, distinguish false/null/absent, and normalize only where the producer already does. An actor mismatch returns a generic denial without the result; a same-actor operation/request mismatch uses existing `DUPLICATE_COMMAND` (409) with a non-sensitive message. Do this under the existing lock before stale-version checking. Implements R3–R4.
- KTD4. **Use one validated receipt reader for duplicate and status paths.** The reader validates metadata completeness, known operation/version, APPLIED status, safe resulting version and the operation-specific result, then applies viewer projection. Corrupt/unknown/partial metadata and unsupported historical shapes produce existing `COMMAND_RECEIPT_INVALID` (500) only after viewer eligibility has been established. Use bounded static diagnostic reasons internally, never raw JSON, hashes, input values or Zod issue dumps in HTTP/log messages. New handler-result failures use a distinct `COMMAND_RESULT_INVALID` server error so rollback is distinguishable from an already-committed unreadable receipt. Implements R1–R2, R5, R12.
- KTD5. **Keep the Storyteller route and add a separate player-owned route.** Preserve `src/app/api/v1/games/[gameId]/commands/[commandId]/route.ts` and its `resolveStoryteller` guard. Add `src/app/api/v1/games/[gameId]/me/commands/[commandId]/route.ts` with `resolvePlayer` before any receipt query. Its service query is constrained to game and command, admitting only the requesting player actor or an entirely metadata-free legacy candidate. The latter must pass the legacy event-ownership check before result decoding or diagnostics. Other actors, unsupported player operations, unproven legacy ownership and missing rows yield identical `UNKNOWN` bodies. Whitelist player operations from the inventory and project only their validated durable result. The player never receives Storyteller status, credential metadata or diagnostic detail for another actor. Preserve no-store headers and existing wrong-game/missing-game authorization equivalence. Implements R5, R8, R12.
- KTD6. **Retain QR identity before dispatch and recover through reads only.** Extend the existing mutation boundary with an identified QR-action adapter rather than replacing its lambda API for all actions. A dedicated client helper owns status decoding and minimal same-tab pending identity storage; it never owns mutation replay. On an uncertain fetch, 5xx or unreadable successful acknowledgement, offer a visible status check using that identity. Validate the POST acknowledgement and GET result at runtime before acknowledgement. An APPLIED read raises the projection's acknowledgement target from `resultingGameVersion`, refreshes through the existing coordinator and feeds the scan outcome presenter. All query starts, response publications and custom scan messages check the captured access ticket and current game/player scope. Implements R6–R8.
- KTD7. **Withhold duplicate reset credentials, following issueClaimToken.** Return the fresh token only when reset's command result says non-duplicate. On duplicate return the accepted version with `duplicate: true` and `credentialAvailable: false`; omit `claimToken`. Keep the fresh response's existing fields, and update its DTO and reset modal to handle the unavailable branch honestly. Issue-token duplicate fields remain intact; add explicit availability information if needed by its caller. Obtaining a replacement remains a separate deliberate issuance/reset with a new identity after refreshing state, never an automatic retry repair. Implements R9, R12.

### Request Binding Coverage

The operation descriptor's semantic input is supplied in the service where all intent is visible, not reconstructed from domain events. Every producer must appear in an implementation-time binding table and contract test, even when it has an empty result.

| Producer group | Fields bound in addition to operation and actor |
|---|---|
| Roster / game | normalized name or displayName; target playerId and participantKind; orderedPlayerIds; no payload for commands with no additional intent |
| Issue / reset | target playerId only; tokenHash and generated expiresAt are deliberately excluded |
| Setup | explicit seed or an explicit omitted-seed marker for generate; no extra input for commit/ack |
| Operational | actionId and ordered targetPlayerIds for submit; actionId and supplied resolution or omitted marker for resolve; no extra input for start/complete |
| Investigation | nomineeId for nominate; nominationId and optionId for trigger; nominationId and intent for vote; nominationId for pass start/advance/lock; target playerId for exile; Slayer target or slayerPlayerId/optionId for decision; no extra input for phase-only commands |
| Scenario | QR token's semantic input digest, never a persisted raw token; clueId and optional targetPlayerId; taskId; stageId; mapVersionId; conditionId and active |
| Recovery | reason with the producer's existing normalization and an absent marker for checkpoint; structured override payload and trimmed reason |

The hash is not an authorization mechanism and is never published. This plan does not add a key-management or secret-hash protocol; claim/session/recovery credentials do not enter these identities at all.

### Legacy Read Policy

Null metadata means historical, not implicitly version 1. Do not infer identity from result shape alone. Bound legacy reads to the documented event/result formats observed for three named producers in baseline A: `addPlayer`, `createCheckpoint`, and full meaningful `scanQr`. Runtime recognition proves format and actor eligibility, not which release actually wrote a metadata-free row; only the A/B fixture has source-attributed producer evidence. Require a matching game/command event group whose events all have the receipt's resulting version and the same non-null actor, with exactly one primary `PLAYER_ADDED`, `CHECKPOINT_CREATED` or `QR_SCANNED` event identifying that operation. Reject contradictory primary evidence and nonmatching result IDs. Require the expected actor kind and validate both the primary payload and result with an explicit legacy schema.

For scans, `QR_SCANNED` must carry the requesting player's ID and its recorded actor must match; validate the full discoveries/tasks/conditions/mapVersionId result. Do not use mutable live scenario definitions to invent old discoveries. A historical `{ outcome: { duplicate: true } }` is unsupported for recovery: that branch returns without events in the current scan handler and cannot establish the required meaningful outcome. Missing events, null/mixed actors, partial metadata, absent primary evidence, unknown historical shapes and null resultJson are unsupported. The Storyteller receives the typed invalid diagnostic; a player receives `UNKNOWN` until ownership is proven, then the same safe typed unreadable-outcome failure for their own record.

All metadata-free duplicate POSTs fail closed with `COMMAND_RECEIPT_INVALID`, including those eligible for a legacy status read. Historical events cannot reconstruct every original input, so returning their result as a matching request would violate R3. No handler runs, receipt changes, deletion or guessed backfill follows that failure. The compatibility contract supports bounded interpretation, not safe arbitrary legacy command replay.

### Status and Client State Design

The existing authorized status fields remain `status`, `commandId`, `resultingGameVersion` and `result` for valid records. New responses can add operation/result-version metadata; they do not embed a second envelope in resultJson. `UNKNOWN` remains the existing minimal body. APPLIED means the mutation committed, not that a one-time credential is recoverable or the current projection is fresh. For issue/reset records, status contains only their validated durable result and an explicit unavailable-credential indication.

The pending QR record stores only a storage-format version, gameId, playerId, operation and commandId. It stores no QR token, input payload, result, role, clue text, credential or cookie. Keep a single outstanding QR identity per game/player in sessionStorage, with strict parsing and no automatic POST reconstruction. Write it before the initial POST; storage failure leaves in-memory recovery usable and explains that reload recovery is unavailable. Hydrate only after an authorized player projection establishes the current scope. Detected access loss/logout or a different actor/game clears or discards the record before any status query; a response from an older access generation cannot restore it.

Directional state table for R6–R8:

| Current state | Event | Next state / visible behavior | Network action |
|---|---|---|---|
| Ready | user scans | Sending; identity retained | one POST |
| Sending | valid success | Applied; show validated outcome | existing projection refresh |
| Sending | network/5xx/invalid success | Unresolved; offer check | no POST replay |
| Unresolved | check or authorized reload hydration | Checking | one status GET |
| Checking | APPLIED + valid result | Applied; acknowledge version, show original outcome | projection refresh |
| Checking | UNKNOWN / read transport failure | Unresolved; explain uncertainty | user may check again |
| Checking | own unreadable receipt | Accepted outcome unreadable; no replay guidance | no mutation |
| Any | access lost / scope changed | cleared private UI and pending identity | suppress obsolete work |

Do not let a second scan create a new ID while this QR identity is unresolved. Continue ordinary read-only navigation and status checks. After a valid APPLIED acknowledgement, clear pending identity; a definitively rejected non-committing 4xx may clear it, except an identity collision or unreadable committed receipt remains unresolved. A successful authoritative projection by itself is not proof of this command's outcome. There is no dismiss-and-auto-retry path.

### High-Level Technical Design

Directional data-flow sketch for R1–R5: authenticated route → service intent descriptor → game-row-locked transaction → receipt identity check → shared validated reader on duplicate, or handler and validated output on absence → atomic state/events/version/receipt commit → existing invalidation publication. Stored-read validation failure terminates on the duplicate side; it cannot fall through to the handler side.

Directional protocol sketch for R6: player scan UI → identified mutation boundary → QR POST → committed receipt; on lost response, the boundary → player-only status route → shared receipt reader → guarded acknowledgement → projection coordinator → scan outcome presentation. The callback lifetime and access ticket apply to every arrow returning to the browser.

Directional ownership sketch: the route owns current viewer authorization; the service owns operation and semantic intent; the command helper owns atomicity and identity binding; the shared reader owns supported result interpretation; the existing browser mutation boundary owns access-generation publication. The contract catalog imports neither services nor Prisma and may supply client-safe QR schemas without bringing server modules into the browser.

Directional receipt decision sketch: no row → normal stale check and handler; complete known metadata → check identity then decode; entirely absent metadata → legacy ownership/evidence gate for status only; partial metadata → refuse; unsupported schema/result → typed refusal after eligibility. None of the refusal branches leads to a handler.

The state table above supplies the client lifecycle sketch; the compatibility matrix below supplies the reader/writer mode sketch. Alongside the four sketches here, these cover the six distinct categories of component ownership, protocol sequencing, data flow, lifecycle, branching and version combinations without introducing a new coordinator platform.

### Compatibility and Rollback Matrix

Name A as `c2e00f2a9fb505b1f159476447acd880b7216dc2` and B as the exact implementation source fingerprint, later its final PR SHA. Versions of the application package alone are insufficient because it remains `0.1.0`. Keep resultJson shapes stable for every inventory row; metadata remains outside that field.

| Producer → reader | Supported claim | Required observation / limitation |
|---|---|---|
| A → B, bounded legacy status | Supported for the three named legacy producers | Real committed A results plus event evidence pass B's legacy reader; actor filtering still applies |
| A → B, duplicate POST | Unsupported by design | typed refusal even when status-readable; handler count stays zero |
| B → B | Supported for all formal producers | mandatory schemas, metadata, request binding and same-identity duplicate/status behavior |
| B → A, selected result reads | Shape compatibility observation only | A's actual getCommandStatus and same-intent addPlayer/scan/checkpoint service duplicate paths consume B results without a second effect |
| B → A, cross-actor/request duplicates or corrupt results | Unsupported operational behavior | A ignores binding metadata and retains unsafe casts; a successful shape read cannot certify rollback safety |
| A or B token reset through A | Unsupported safe credential replay | A reset can fabricate an uncommitted raw token on duplicate; never call this a working rollback path |
| B → future / unknown versions | Unsupported until specified and tested | unknown versions fail closed; no speculative future compatibility |

The additive schema allows A to run against the expanded database in a controlled fixture and to create rows with null new columns. It does not make A a safe supported operational rollback: downgrading would restore the known unsafe identity and token behavior. Prefer a forward fix for operational recovery. Never drop metadata or purge receipts as a rollback procedure. A full old-binary deployment/upgrade is not part of these service-level observations.

### Assumptions

- The QR journey is the representative UX default because it already returns a meaningful structured outcome and has a dedicated presenter; the user allowed vote and/or QR but did not settle this particular selection.
- Same-tab reload recovery uses minimal sessionStorage identity, rather than cross-device persistence. Browser-storage denial is an explicit degradation, not assumed impossible.
- No deployed receipt population needs migration inspection. Supported historical evidence is synthetic and tied to A; unobserved earlier writers remain unsupported.
- Five units are expected to remain sufficient. An integration need that expands into a general status platform or broad auth-policy change returns to scope review.

These are unconfirmed planning defaults, not session-settled product decisions.

### Alternatives and Risks

An envelope inside resultJson was rejected because old readers consume the current object directly. An entirely separate outcome/event system was rejected because the existing receipt and route already supply the required identity. These alternatives did not survive the source evidence, so no consequential mechanism needs a bake-off before implementation.

Legacy event inference cannot establish request equivalence; the explicit refusal for legacy POST duplicates closes that gap at the cost of narrower historical replay support. Nullable metadata enables additive migration but requires a partial-metadata negative case. Result-schema tightening can reject an unobserved old shape; the supported set is deliberately narrow and the receipt survives refusal.

Status reads add small database work. Current receipts use the existing unique game/command index; metadata matching remains a filtered unique lookup. Legacy reads use the existing commandId index plus game/version filtering and reject inconsistent evidence. No new full-history replay or background scan is required.

### System-Wide Impact

Players gain only their own outcome reads. Storytellers retain their existing route, while reset consumers must handle a committed-but-unavailable token. Service tests and any direct helper callers must migrate together when the descriptor becomes required. The global client fetch helper need not become a generic response-schema system: typed acknowledgement validation is local to the rescued QR adapter.

Database schema additions require Prisma client regeneration during implementation. Installed generated types currently read `resultJson` as `Prisma.JsonValue | null` and accept `NullableJsonNullValueInput | InputJsonValue` on create; neither type validates runtime shape. All current results are objects, so new results have no top-level JSON/SQL null representation. Keep explicit tests for both historical null forms rather than using `?? {}`. Node 24, Prisma 6.19.3, Zod 4.4.3 and the existing Next 15.5.23 remain the baseline.

---

## Implementation Units

### U1. Validate and bind all formal command outcomes

**Goal:** Make the existing transaction boundary enforce R1–R4 for every formal producer.

**Requirements:** R1–R4, R9, R12; AE1–AE3.

**Dependencies:** None.

**Files:** `src/lib/command.ts`, new `src/lib/command-contracts.ts`, `src/lib/errors.ts`, `prisma/schema.prisma`, new additive `prisma/migrations/<implementation-timestamp>_command_receipt_metadata/migration.sql`; all six service files in the inventory; `tests/command.test.ts`, new `tests/command-contracts.test.ts`, existing direct command-helper tests found by typechecking.

**Approach:**

1. Add the nullable metadata and operation/result catalog from KTD1–KTD3, with strict output shapes from the inventory.
2. Supply each service's semantic input descriptor and explicit actor; retain existing handler/body logic and result fields.
3. Replace duplicate casts with KTD4's reader and classify metadata-free duplicate POSTs under the legacy refusal policy.
4. Validate fresh results inside the transaction and persist only the parsed result; map fresh-result failure separately from stored-receipt failure.
5. Preserve scanQr's existing no-event guard: its inner duplicate-only branch must not be made committable by appending a synthetic event. A qrScan without a corresponding receipt is an inconsistent state to refuse, not a reason to reconstruct an outcome.

**Patterns to follow:** Existing `lockAndRead`, event append counts, `commitVersion`, `CommandResult.duplicate`, and `DomainError` HTTP mapping.

**Execution note:** First demonstrate the unvalidated fresh result, corrupt duplicate and identity-collision failures with transaction-backed tests, then change the boundary and migrate the whole producer inventory together.

**Test scenarios:**

1. Covers AE1. Invalid meaningful result after a row/event write rolls back all four authoritative changes and leaves no receipt.
2. Covers AE2. Corrupt shape, unknown operation/version, partial metadata and invalid status/version refuse without handler entry, even with stale expectedVersion.
3. Covers AE3. Same game/ID with changed actor, operation, entity ID or payload fails safely; same normalized intent with reordered object keys succeeds as a duplicate.
4. Concurrent identical commands serialize to one effect/event/version/receipt; a new ID with stale expectedVersion still conflicts.
5. Each of the 36 descriptors rejects an invalid result and accepts every current branch shape, including winner null, Slayer decisionRequired and structured scan arrays.
6. Empty results reject extra secret-marker keys; undefined, non-finite and non-JSON results cannot be silently stored or stripped.
7. Token issuance/reset bind the target player while excluding regenerated hashes/expiries; changing the player fails without result disclosure.
8. A legacy receipt and both JSON-null/SQL-null fixtures fail closed on POST; no receipt update/deletion or secondary event is observed.

**Verification:** No optional output-validation/cast fallback remains in the formal helper, every production producer is represented in the catalog/binding audit, and transaction tests prove R4.

### U2. Add validated actor-scoped outcome reads

**Goal:** Recover safe outcomes through existing receipt infrastructure under R2, R5 and R12.

**Requirements:** R2, R5, R8, R11–R12; AE2–AE4, AE8.

**Dependencies:** U1.

**Files:** `src/lib/command-contracts.ts`, `src/modules/recovery/recovery.service.ts`, existing `src/app/api/v1/games/[gameId]/commands/[commandId]/route.ts`, new `src/app/api/v1/games/[gameId]/me/commands/[commandId]/route.ts`, `src/lib/client-api.ts`; new `tests/command-status.test.ts`, `tests/slice6.test.ts`, `tests/e2e/e2e-12-access-boundaries.spec.ts`, `tests/e2e/security-fixtures.ts` where its read inventory needs the new route.

**Approach:**

1. Make status service entry points require explicit authorized viewer context, using KTD4–KTD5 and the shared reader from U1.
2. Add only the three legacy primary-event resolvers specified above; compare evidence/result IDs where available.
3. Keep Storyteller status response fields, define narrow client status DTOs and add the player route without weakening the existing guard.
4. Extend the real-boundary privacy inventory to include known/unknown own, other-player and Storyteller command IDs.

**Patterns to follow:** `resolvePlayer`, `resolveStoryteller`, `jsonOk`/`jsonError` no-store behavior and existing paired-state access tests.

**Execution note:** Characterize existing Storyteller response fields before changing the service, and add a failing player privacy/status proof before exposing the route.

**Test scenarios:**

1. Own current QR, nomination, vote, role-ack, action-submit and Slayer receipt reads pass their operation schemas; successful Storyteller reads retain all existing valid fields.
2. Covers AE4. Missing, other-player, other-game and Storyteller receipts are indistinguishable to a player at the appropriate authorization boundary, including error body and cache headers.
3. Own corrupt receipt returns typed unreadable-outcome failure with no JSON/Zod/private marker leak; the same corrupt receipt remains `UNKNOWN` to another player.
4. Covers AE8. The three supported legacy event/result pairs decode; absent/mixed/null actor, duplicate primary event, wrong version, contradictory event, null result and duplicate-only scan result refuse without mutation.
5. Anonymous, revoked and expired sessions fail before receipt service invocation; both present and absent wrong games retain existing 401/404 equivalence.
6. Issue/reset status never contains raw tokens, token hashes or session material; unknown operations are not projected to players.

**Verification:** Both status routes go through validated readers, player authorization precedes query, and the enabled-security suite exercises the new read surface.

### U3. Make duplicate credential acknowledgements honest

**Goal:** Close the reset token fabrication path without persisting secrets.

**Requirements:** R9, R12; AE7.

**Dependencies:** U1–U2.

**Files:** `src/modules/recovery/recovery.service.ts`, `src/modules/game-session/game-session.service.ts` if availability typing needs alignment, `src/app/api/v1/games/[gameId]/players/[playerId]/access/reset/route.ts`, `src/app/api/v1/games/[gameId]/players/[playerId]/claim-token/route.ts`, `src/lib/client-api.ts`, `src/app/storyteller/[gameId]/page.tsx`; `tests/claim.test.ts`, `tests/slice6.test.ts`, new `tests/credential-command-outcomes.test.ts`, `tests/e2e/e2e-12-access-boundaries.spec.ts`.

**Approach:** Implement KTD7 across the service, route and discriminated client DTO, and render accepted-but-unavailable feedback in both relevant modals. Preserve first-success token behavior and the existing explicit reset confirmation.

**Patterns to follow:** Existing issueClaimToken `duplicate` handling and Storyteller modal access-ticket checks.

**Test scenarios:**

1. Covers AE7. First reset token works for claim; duplicate reset omits it, does not rotate the committed hash and does not revoke newly established access again.
2. Duplicate issue preserves claimId/expiry/version and omits token; changed player with the same ID is denied under R3.
3. A first reset response lost after commit is distinguishable from reset rejection through status; no automatic replacement is issued.
4. Reset/issue accepted-unavailable UI has no token copy field and gives no false failure or automatic retry instruction.
5. Delayed reset/status responses after Storyteller access loss cannot reopen token/private modals; receipts/events/errors contain no synthetic raw credential marker.

**Verification:** No duplicate can return an uncommitted generated credential, and first-success response/claim tests remain valid.

### U4. Recover an uncertain QR scan using its original identity

**Goal:** Deliver the bounded browser journey in R6–R8.

**Requirements:** R5–R8, R10, R12; AE4–AE6.

**Dependencies:** U2.

**Files:** `src/app/player/page.tsx` including its `describeScanOutcome` presenter, `src/components/useVersionedMutation.ts`, new `src/lib/command-outcome.ts`, `src/lib/client-api.ts`, localized copy in `src/i18n/pl.ts` as required; new `tests/command-outcome.test.ts`, `src/components/useVersionedMutation.test.ts`, new `tests/e2e/e2e-13-command-outcomes.spec.ts`, `tests/e2e/e2e-12-access-boundaries.spec.ts`.

**Approach:**

1. Add the identified QR adapter and minimal identity storage under KTD6; leave other action lambdas on their current contract.
2. Decode initial acknowledgements and status replies locally, distinguishing committed receipt version from the current game version.
3. Render unresolved/checking/applied/unreadable states from the state table and integrate successful results with the existing scan presenter and projection acknowledgement.
4. Hydrate minimal pending identity after current authorization and wire access-loss, scope-change and logout cleanup without storing private payloads.

**Patterns to follow:** `useVersionedMutation` lifetime/valid guards, `projection.captureAccess`/`ownsAccess`/`denyAccess`, `projection.acknowledge`, `describeScanOutcome`, existing response-loss browser routing patterns in `tests/e2e/e2e-10-realtime-reconciliation.spec.ts`.

**Execution note:** Begin with a browser case that lets the real POST commit before dropping its response; a mocked success fixture alone does not prove this flow.

**Test scenarios:**

1. Covers AE5. Intercept the real scan request, await the server's committed response, drop delivery, reload and resolve by the original ID; assert meaningful outcome presentation and one authoritative scan/primary event/receipt/version increment.
2. Covers AE6. UNKNOWN while the original request is delayed remains unresolved; a later status check settles its commit with no second POST or new command ID.
3. A successful but malformed/null POST acknowledgement enters recovery; malformed status cannot acknowledge a version or display discoveries.
4. APPLIED followed by projection refresh failure remains acknowledged and never reruns the command; displayed current-state freshness follows the existing coordinator.
5. Covers AE4. Revoke access while status is held, trigger access-loss handling, then release the old response; private messages and pending storage stay cleared, and no obsolete query is started.
6. Reload under another player/game discards old identity before querying; corrupt storage and denied storage degrade safely with explicit reload limitations.
7. Repeated clicks during unresolved/checking states cannot produce another QR mutation; ordinary non-QR commands retain command/refresh separation.

**Verification:** The browser recovers a real committed structured result after HTTP loss and reload, and false paths prove privacy and non-replay.

### U5. Prove named producer-reader compatibility and release preservation

**Goal:** Supply bounded cross-release evidence for R10–R11 and explain its limits.

**Requirements:** R1–R12; AE8–AE9.

**Dependencies:** U1–U4.

**Files:** new `tests/command-compatibility.test.ts`, new `tests/fixtures/command-receipts/` synthetic specimens plus producer/version manifest, new `scripts/command-receipt-compatibility.mts`, `scripts/regression-baseline.mts`, `.github/workflows/ci.yml`, `tests/regression-baseline-tooling.test.ts`, `docs/regression-baseline.md`, new `docs/command-outcome-compatibility.md`; `tests/e2e/e2e-11-playable-recovery.spec.ts` only if restored-receipt assertions are added, without replacing its existing case.

**Approach:**

1. Materialize a dotenv-free, allowlisted A source tree from the exact pinned Git object before entering the baseline capsule, which has no Git history. Ensure CI checkout history contains that object; refuse absent or mismatching A instead of substituting current code. Produce synthetic committed addPlayer, checkpoint and meaningful QR receipts using actual A service functions in a separate process under the existing database lease. Capture only synthetic receipt/event specimens with A SHA and source hashes; do not hand-author a purported A producer output.
2. Run B readers against A's records, then B producers against the expanded schema and actual A getCommandStatus/same-intent duplicate service paths. Use separate generated Prisma clients for A and B, with no mutation of the active workspace's generated client during the comparison.
3. Record the matrix's pass/refusal observations in a structured `compatibility.json` report with exact A/B source identities, migration state, tested operations and unchanged effect counts. Validate its required observations in baseline completion and include it explicitly in the CI artifact upload. Keep portable negative fixtures for unsupported metadata, corrupt results and ambiguous legacy evidence.
4. Integrate the bounded compatibility check with the existing isolated baseline so CI actually executes it. Prepare and fingerprint A alongside B, pass the live lease to sequential child workers instead of acquiring it twice, and reset only owned test resources between lanes. Use existing evidence stages; the new helper has no arbitrary revision runner or separate orchestration service.
5. Document supported specimen reads, unsupported operational rollback and one-time credential limitations. Preserve current create-only physical recovery resources and source/build fingerprints; a compatibility fixture does not replace playable recovery.

**Patterns to follow:** Existing source fingerprint and isolated-child patterns in `scripts/regression-baseline.mts`, database leasing in `scripts/test-database.mts`, and the physical recovery evidence contract in `docs/recovery-verification.md`.

**Execution note:** Keep failing compatibility specimens and attributed red/green evidence. Verify selected A/B service behavior first, then complete the unchanged production release baseline.

**Test scenarios:**

1. Covers AE8. Actual A receipts pass B's bounded status readers and are refused by B's legacy duplicate POST without another effect.
2. Covers AE9. Actual A status and same-intent service duplicate paths read B's unchanged meaningful result fields; metadata columns remain intact and no handler effect repeats.
3. Missing/partial metadata, unknown operation/version, null results, invalid meaningful result, wrong actor/game and ambiguous primary events all take the documented refusal path non-destructively.
4. Old-writer rows created after the additive migration remain metadata-free and follow the same legacy policy; fresh B writers always populate complete metadata.
5. Compatibility tooling rejects an unknown A revision and reports source identity mismatch rather than silently using current producers for both sides.
6. Baseline tooling discovers and executes the compatibility stage, rejects missing/truncated/failed compatibility reports, retains its report through CI artifact collection, and preserves the existing ordinary/security/physical-recovery stages and fingerprint guarantees.

**Verification:** The report names actual producers/readers and observations, states unsupported rollback paths, and the final production baseline includes compatibility evidence and all original gates.

---

## Verification Contract

No implementation verification is claimed by this plan. The following gates belong to implementation, using dotenv-free isolated PostgreSQL 16 clusters and the existing limiter-owned CI child.

| Gate | Required outcome |
|---|---|
| Targeted unit/integration proof | Each U-ID's named behavioral cases has attributed failing-then-passing evidence; no direct runCommand caller remains on an unchecked fallback |
| Migration / generated-client proof | Additive migration accepts A and B writes; old rows are preserved; B generated types match the expanded schema |
| Named A/B producer-reader check | The compatibility matrix records actual source fingerprints, selected operations, validated/refused results and unchanged effect counts |
| Browser proof | Real committed scan plus lost response and reload resolves by original command ID; UNKNOWN, malformed response and access-loss cases remain safe |
| Enabled security proof | Existing 18 scenarios remain, with added outcome actor/privacy cases under the limiter-enabled server, not the ordinary disabled-limiter child |
| Production baseline | `npm run baseline` production profile retains lint, typecheck, unit/integration, clean-database verification, build, ordinary browser, enabled security and mandatory physical recovery, plus compatibility |
| Final release attribution | Exact final source/build fingerprints and test identities are recorded after all changes, with failed evidence retained and no raw secrets or dumps published |

Baseline preservation floor from merged PR #5: 292 unit/integration tests, 38 ordinary browser scenarios, 18 enabled-security scenarios and one physical recovery case. Add coverage above that floor and preserve original assertions; compare discovered identities rather than relying on counts alone. Preserve APP_ORIGIN, security-purpose limiter ownership, create-only recovery resources and existing no-reuse process isolation. Package scripts `lint`, `typecheck`, `test`, `verify:release`, `test:e2e`, `test:security` and `recovery:prove` retain their current roles; the canonical baseline remains the release aggregation authority.

Implementation evidence must explain whether a failure is inherited, introduced or unresolved. A source-only or fixture-only observation is not a full binary upgrade or production recovery claim.

---

## Definition of Done

- U1: All 36 formal producers use validated JSON output contracts and complete new receipt identity metadata, with R4 proven under duplicate concurrency and rollback.
- U2: No status/duplicate path returns unchecked JSON, and current player authorization plus ownership filtering precede disclosure.
- U3: Duplicate issue/reset acknowledgements never fabricate a credential; first-success behavior and valid existing response fields remain covered.
- U4: A real lost QR response is recoverable by the original identity after reload, with private-state clearing and no automatic mutation replay.
- U5: Named A/B committed-result evidence and explicit unsupported paths are documented and run in the release baseline.
- All R-IDs have corresponding acceptance and implementation proof, material review findings are resolved, and abandoned/experimental code is removed from the diff.
- The parent receives final source-attributed results and decides publication/merge only after terminal green checks. No item #6/#7 policy is silently bundled into this work.

---

## Sources and Research

- Origin: `docs/ideation/2026-10-28-legacy-app-reinforcement-ideation.html`, idea #5 and the narrowed M10/M21/X02 context. The origin's other ranked directions remain separate.
- Transaction and consumers: `src/lib/command.ts`, `src/modules/recovery/recovery.service.ts`, `src/app/api/v1/games/[gameId]/commands/[commandId]/route.ts`, the six service files and route inventory above.
- Authorization and browser lifetime: `src/lib/auth/http.ts`, `src/components/useVersionedMutation.ts`, `src/lib/projection-reconciliation.ts`, `src/app/player/page.tsx`, `src/app/storyteller/[gameId]/page.tsx`.
- Schema/types: `prisma/schema.prisma`, installed `node_modules/.prisma/client/index.d.ts` CommandReceipt payload/create types, `package-lock.json` pins for Prisma/client 6.19.3 and Zod 4.4.3.
- Existing verification: `tests/command.test.ts`, `tests/slice6.test.ts`, `tests/e2e/e2e-12-access-boundaries.spec.ts`, `playwright.security.config.ts`, `.github/workflows/ci.yml`.
- Zod 4 guidance fetched through Context7 from `/colinhacks/zod/v4.3.6`: [safeParse and parsed data](https://github.com/colinhacks/zod/blob/v4.3.6/packages/docs/content/basics.mdx), [avoiding input disclosure in errors](https://github.com/colinhacks/zod/blob/v4.3.6/packages/docs/content/error-customization.mdx). This is a nearby versioned documentation reference, not a claim that installed 4.4.3 was executed; retain installed versions and verify their types during implementation.
- Prisma 6 guidance fetched through Context7 from `/prisma/web/__branch__v6`: [interactive transactions and rollback](https://github.com/prisma/web/blob/v6/content/200-orm/200-prisma-client/100-queries/058-transactions.mdx), [JSON null semantics](https://github.com/prisma/web/blob/v6/content/200-orm/200-prisma-client/200-special-fields-and-types/100-working-with-json-fields.mdx). These support KTD2 and the null-fixture distinction; generated types establish the local API surface.
