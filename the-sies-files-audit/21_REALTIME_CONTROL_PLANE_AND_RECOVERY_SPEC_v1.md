# The Sieś Files — Realtime Control Plane & Recovery Specification v1

**Status:** Required remediation  
**Version:** 1.0  
**Audit baseline:** `main@9099836`  
**Closes:** #10, #11, #12, #13, #26  
**Depends on:** Slice 6 Control Plane

---

## 1. Goal

Complete the control-plane promises already present in Slice 6:

- clients subscribe to server invalidations;
- operators can see connection health/presence;
- safe boundaries automatically checkpoint;
- stored events can be replayed from a checkpoint and compared;
- Storyteller access can be recovered using the configured operator secret;
- audit timeline can be filtered by canonical event categories.

PostgreSQL remains authoritative throughout.

---

## 2. Client SSE wiring

### 2.1 Shared client hook

Create a shared hook/service, e.g. `useGameEventStream(gameId)`.

It must:

- connect to the existing authenticated SSE endpoint;
- consume `invalidate` messages carrying at least version/sequence;
- refetch the current projection when the received version/sequence is newer;
- coalesce bursts so multiple events in one command do not cause an uncontrolled request storm;
- reconnect after network errors;
- close on unmount/game change/session logout.

Both Storyteller and player clients use the same transport primitive.

### 2.2 Realtime states

Expose:

```ts
type RealtimeHealth =
  | "LIVE"
  | "RECONNECTING"
  | "OFFLINE";
```

Suggested semantics:

- `LIVE`: SSE open and a projection fetch has succeeded recently;
- `RECONNECTING`: connection was live but is currently retrying;
- `OFFLINE`: browser reports offline or retry/fetch threshold exceeded.

Do not show “LIVE” merely because the page loaded once.

### 2.3 UX

Storyteller control plane must show a persistent compact state indicator.

Player UI may use a lighter indicator, but must not silently appear live while disconnected during a formal voting/action flow.

For `RECONNECTING`/`OFFLINE`:

- keep read-only cached UI visible;
- disable commands if the client cannot establish the authoritative current version safely;
- on reconnect refetch before re-enabling mutation.

---

## 3. Cross-client invalidation

A successful mutation on client A must become visible on client B without manual refresh.

Minimum covered flows:

- player action → Storyteller;
- Storyteller action resolution → player;
- nomination/vote-pass advance → all involved players;
- scenario/map unlock → players;
- game end → all clients.

SSE messages are invalidation hints, not full secret-bearing state.

---

## 4. Presence / connectivity

### 4.1 Purpose

The Storyteller needs operational awareness of participant connectivity, but presence must not become game truth.

### 4.2 Model

Implement a bounded ephemeral presence mechanism with server-visible `lastSeenAt`.

Acceptable designs:

- heartbeat endpoint + short-lived DB presence rows;
- SSE connection registry with DB heartbeat/fallback for restart visibility;
- another design that survives process restart safely and does not treat in-memory state as authoritative.

Recommended projection:

```ts
{
  playerId,
  connection: "ONLINE" | "STALE" | "OFFLINE",
  lastSeenAt
}
```

Thresholds are configuration constants and covered by tests.

### 4.3 Privacy

Presence is Storyteller/control-plane data. Do not expose other players' connectivity unless product UX explicitly requires it.

---

## 5. Automatic checkpoints

### 5.1 Required boundaries

Automatically create a checkpoint after successful completion of:

1. setup commit;
2. each Operational completion;
3. each Investigation completion;
4. game end.

Manual checkpoints remain supported.

### 5.2 Idempotency

Retries must not create duplicate automatic checkpoints.

Persist a unique boundary identity such as:

```text
(gameId, boundaryType, gameVersion)
```

or an equivalent deterministic key.

### 5.3 Transaction semantics

A checkpoint must correspond to a committed authoritative state.

Preferred options:

- write snapshot/checkpoint within the same authoritative transaction after all boundary mutations/events; or
- create it immediately after commit with a deterministic boundary key and retry until present.

Never produce a checkpoint labeled for a boundary whose state mutation later rolls back.

### 5.4 Reason codes

Use structured reason codes rather than free text for automatic checkpoints:

- `SETUP_COMMITTED`;
- `OPERATIONAL_COMPLETED`;
- `INVESTIGATION_COMPLETED`;
- `GAME_ENDED`;
- `MANUAL`.

Human notes can be a separate optional field.

---

## 6. Event replay verification

### 6.1 Objective

Given a verified checkpoint and subsequent domain events, rebuild the replayable projection and compare it with authoritative current state.

This is a **verification** mechanism, not a general event-sourcing rewrite.

### 6.2 Replay scope

At minimum replay/compare the key state promised by Slice 6:

- game status/phase/cycle/version/winner;
- player alive/ghost-vote status;
- active/completed formal process state;
- nominations/vote outcomes;
- scenario progression/map state;
- any state required for safe recovery decisions.

If current event payloads are insufficient to deterministically rebuild one of these fields, enrich **future** event payloads or add versioned replay adapters. Do not fake determinism.

### 6.3 Versioning

Introduce a replay schema/projector version.

Checkpoint metadata records the compatible replay version.

Do not silently reinterpret old event payloads after their meaning changes.

### 6.4 Comparison result

Return a structured diagnostic:

```ts
{
  ok: boolean,
  checkpointId,
  fromSequence,
  throughSequence,
  replayVersion,
  divergences: [
    { path, expected, actual, eventSequence? }
  ]
}
```

No secret values are returned to unauthorized callers.

### 6.5 Control-plane endpoint

Storyteller-only, e.g.:

`POST /api/v1/games/:gameId/storyteller/consistency/replay`

The current consistency check may invoke it or expose it as a separate “deep verification” action.

---

## 7. Storyteller access recovery

### 7.1 Threat model

The existing Storyteller browser session can be lost while the game still exists. The operator-held `STORYTELLER_RECOVERY_SECRET` is intended to restore Storyteller access without modifying game state.

### 7.2 Route

Add a route that does **not** require an existing Storyteller session, e.g.:

`POST /api/v1/storyteller/recover`

Request:

```json
{
  "gameId": "...",
  "recoverySecret": "..."
}
```

### 7.3 Validation

- assert same-origin for browser use;
- apply strict rate limiting from spec 22;
- compare the configured secret in constant-time (compare fixed-length hashes rather than raw variable-length strings);
- if secret is missing in production, recovery endpoint is disabled and health/config check fails loudly;
- do not log raw secret;
- return generic failure text that does not create a useful game-ID/secret oracle.

### 7.4 Result

On success:

- create a fresh Storyteller `BrowserSession` for that game;
- set the standard secure Storyteller cookie;
- append an access/recovery audit event;
- do **not** mutate game version/phase merely because access was restored unless browser-session events are intentionally part of game command versioning.

### 7.5 UI

Storyteller landing/error state provides a discreet “Recover Storyteller access” flow.

Do not expose the recovery secret in HTML/env client bundles.

---

## 8. Audit category filters

### 8.1 Canonical categories

Support at least the Slice 6 set:

- `GAME_ENGINE`;
- `OPERATIONAL`;
- `INVESTIGATION_VOTING`;
- `SCENARIO`;
- `ACCESS_SESSION`;
- `RECOVERY`.

### 8.2 Classification

Maintain one server-side event-type → category map.

Unknown future event types fall into `GAME_ENGINE` or `OTHER` according to a documented safe default; they must not disappear.

### 8.3 API

Extend audit query:

```text
GET .../storyteller/audit?categories=OPERATIONAL,RECOVERY&cursor=...&limit=...
```

Requirements:

- validate categories;
- bounded limit;
- stable pagination by sequence/cursor;
- newest-first or oldest-first is explicit and consistent;
- filters are applied in the database query where practical.

### 8.4 UI

Category chips/multi-select show active filters. A “All” reset is available.

Filter state may be URL/query-state so reload/back-navigation preserves it.

---

## 9. Broker/process considerations

The current in-process broker is acceptable only as an invalidation transport for a single app instance.

If production deployment can run multiple app instances:

- add a shared transport (e.g. Postgres `LISTEN/NOTIFY` or equivalent) or
- document/enforce single-instance deployment for the event.

Regardless, clients must always refetch PostgreSQL projection after reconnect, so missing an in-memory invalidation does not corrupt truth.

---

## 10. Tests

### Realtime

- Storyteller and player connected simultaneously;
- mutation on one invalidates/refetches the other;
- duplicate/burst invalidations are coalesced;
- connection loss transitions `LIVE -> RECONNECTING -> LIVE`;
- offline threshold produces `OFFLINE`;
- reconnect refetches before command controls re-enable.

### Presence

- heartbeat updates `lastSeenAt`;
- stale/offline thresholds deterministic with fake clock;
- process/client disconnect does not alter game mechanics.

### Checkpoints

- automatic checkpoint at all four boundaries;
- retry does not duplicate boundary checkpoint;
- snapshot checksum validates;
- manual checkpoints still work.

### Replay

- checkpoint + events reproduce known fixture;
- deliberate DB/event divergence is detected with path-level diagnostic;
- old replay version remains readable or fails with explicit incompatibility.

### Storyteller recovery

- correct secret restores session;
- wrong secret produces generic rejection;
- no secret in prod disables flow;
- player cannot elevate to Storyteller without secret;
- success is audited;
- rate limit enforced.

### Audit filters

- every current event type classifies;
- each category query returns only expected events;
- pagination stable across >200 events.

---

## 11. Acceptance criteria

Done means:

- no client requires manual refresh for cross-client changes;
- Storyteller sees `LIVE/RECONNECTING/OFFLINE`;
- participant connectivity is visible as operational presence;
- automatic checkpoints exist at every canonical safe boundary;
- a replay verifier can rebuild from a checkpoint and report equality/divergence;
- lost Storyteller access can be recovered using the operator secret without changing game state;
- audit timeline supports the required category filters and pagination;
- none of these mechanisms make browser/in-memory state authoritative.
