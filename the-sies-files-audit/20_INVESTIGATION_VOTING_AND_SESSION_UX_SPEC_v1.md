# The Sieś Files — Investigation, Voting & Session UX Specification v1

**Status:** Required remediation  
**Version:** 1.0  
**Audit baseline:** `main@9099836`  
**Closes:** #14, #15, #24, #30  
**Depends on:** Slice 1, Slice 4, Rules Correctness & Registration Spec v1

---

## 1. Goal

Make the Investigation formal process match the canonical model:

- nomination is created before day-trigger resolution;
- Virgin/other nomination triggers resolve before voting;
- voting is presented as a sequential Virtual-Circle pass;
- game-end result survives reload through projections;
- Storyteller can rename a game through an audited command.

---

## 2. Nomination lifecycle

### 2.1 Required states

Extend the nomination lifecycle to:

```text
CREATED
  -> DAY_TRIGGER_RESOLUTION
  -> VOTING
  -> LOCKED
  -> RESOLVED
```

Allowed alternate terminal path:

```text
CREATED
  -> DAY_TRIGGER_RESOLUTION
  -> RESOLVED
```

for a nomination that ends through a day trigger such as Virgin execution and therefore never opens a normal vote.

### 2.2 State meanings

**CREATED**
- nomination record exists;
- nominator/nominee legality already passed;
- no vote is open.

**DAY_TRIGGER_RESOLUTION**
- nomination-trigger hooks are being evaluated;
- if a bounded Storyteller registration choice is needed, the nomination waits here;
- vote intents are rejected.

**VOTING**
- trigger phase is complete and no trigger ended the nomination;
- vote pass can start/continue.

**LOCKED**
- voting pass is complete/closed;
- vote intents are immutable;
- tally is computed from locked authoritative data.

**RESOLVED**
- outcome is final; execution/no-execution consequences have been applied.

### 2.3 Command boundaries

Recommended commands:

- `POST /nominations` → creates nomination and enters `DAY_TRIGGER_RESOLUTION`;
- internal/Storyteller trigger decision commands resolve any pending registration;
- `POST /nominations/:id/voting/start` → only legal when trigger resolution completed without terminal outcome;
- existing lock/resolve commands retain version/idempotency requirements.

Do not transition directly to `VOTING` inside nomination creation.

---

## 3. Day-trigger hook contract

Create a hook pipeline:

```ts
resolveNominationTriggers(nominationId)
```

Each hook returns one of:

- `CONTINUE`;
- `WAITING_FOR_STORYTELLER`;
- `TERMINAL_OUTCOME`.

Initial registered hook: Virgin.

Future day triggers can be added without modifying nomination state logic.

The hook pipeline is persistent and idempotent: retry/reconnect cannot run the same once-only trigger twice.

---

## 4. Virtual-Circle voting pass

### 4.1 Principle

The pass is an explicit interaction model over the immutable Virtual Circle order.

Correctness still comes from server-locked vote intentions and eligibility, not animation timing. The pass state exists so all clients agree whose voting moment is currently active.

### 4.2 Persistent voting-pass state

Persist enough state to reconstruct a vote after reload:

- `passStatus`: `READY | RUNNING | COMPLETE`;
- `currentVirtualSeat` (nullable when not running);
- `startedAt`;
- `completedAt`;
- optional pass revision/version if needed.

This may be columns on `Nomination` or a dedicated `VotingPass` model. Prefer the smallest schema that keeps state explicit and replayable.

### 4.3 Order

Use the game's canonical `virtualSeat` ordering only. Physical seating/location never affects the pass.

The implementation must define one deterministic start seat and document it in code/tests. If the existing canonical engine specification already defines the start position, use it. Otherwise use one explicit engine constant/rule rather than Storyteller/browser guesswork.

### 4.4 Interaction

When pass is `RUNNING`:

- all clients can see the current player's display name/seat;
- only the current eligible player's voting control is active for ordinary self-service input;
- Storyteller can advance the pass;
- a current player can set yes/no according to the chosen interaction model;
- dead normal players with an available ghost vote can vote during their turn;
- dead players without a ghost vote cannot;
- Traveller eligibility follows the current rules;
- Butler/Bureaucrat weighting/constraints are applied at lock, not cosmetically in the UI.

No client may submit a vote for a different seat by forging the request; server validates voter vs. current pass state unless the endpoint is an explicit Storyteller override.

### 4.5 Reconnect

On reload/reconnect, the projection restores:

- nomination stage;
- pass status;
- current seat;
- this player's current intent if visible to them;
- whether their vote control is currently actionable.

No manual “remember where we were” operation is required.

### 4.6 Completion and lock

After the last seat:

- mark pass `COMPLETE`;
- no further ordinary vote changes;
- Storyteller may lock;
- lock atomically:
  - revalidates vote eligibility;
  - consumes ghost votes actually counted;
  - computes Bureaucrat weight;
  - applies Butler constraint;
  - writes final tally;
  - transitions to `LOCKED`.

---

## 5. Winner projection persistence

### 5.1 Correction to reported gap

`GameSession` already persists:

- `winner`;
- `winReason`.

Do not add duplicate winner storage.

### 5.2 Projection contract

Add terminal fields to the normal game projection used after reload:

```ts
result: null | {
  winner: "GOOD" | "EVIL";
  reason: string;
  endedAt?: string;
}
```

or equivalent typed fields.

Every Storyteller and player projection for an ended game must derive the result from authoritative `GameSession` state.

### 5.3 UI

For `status === ENDED`:

- render a persistent terminal result panel;
- do not rely on the mutation response that happened to end the game;
- hide/disable commands that are illegal after end;
- after hard refresh, result must still be present.

The UI may show different detail levels by audience, but winner must not disappear.

---

## 6. Game rename

### 6.1 Command

Add an audited, version-checked command:

```ts
renameGame({
  gameId,
  commandId,
  expectedVersion,
  name
})
```

Normalize/validate using the same game-name rules as creation.

Recommended initial limits:

- trimmed non-empty string;
- explicit max length (choose one product constant and use it for create + rename);
- reject control characters.

### 6.2 Authorization/status

Storyteller only.

Allow rename in `LOBBY` and `SETUP` at minimum (the Slice 1 editing window). If product policy later allows rename during an active game, expand deliberately; do not make active-session rename a side effect of this remediation.

### 6.3 API

Add a typed Storyteller route, e.g. `PATCH /api/v1/games/:gameId`, using the standard command envelope.

### 6.4 Event

Add `GAME_RENAMED`:

```json
{
  "before": "...",
  "after": "..."
}
```

The audit event must not be skipped on rename.

### 6.5 UI

Storyteller setup header provides an edit action. Success updates through the normal projection/SSE invalidation path.

---

## 7. Schema changes

Minimum expected changes:

- nomination enum gains `DAY_TRIGGER_RESOLUTION`;
- persistent vote-pass fields/table;
- no new winner storage;
- no schema required for rename beyond existing `GameSession.name`.

Migration must handle existing `VOTING` nominations without ambiguity:

- existing rows remain `VOTING`;
- new lifecycle applies to nominations created after deployment;
- do not retroactively reopen trigger resolution for already-active historical rows.

---

## 8. Events

Add/standardize:

- `NOMINATION_CREATED`;
- `DAY_TRIGGER_RESOLUTION_STARTED`;
- `DAY_TRIGGER_RESOLUTION_COMPLETED`;
- `VOTING_STARTED`;
- `VOTE_PASS_ADVANCED`;
- `VOTE_PASS_COMPLETED`;
- existing vote lock/resolution events;
- `GAME_RENAMED`;
- game-ended event already used for winner persistence.

Avoid one event per animation frame; emit only meaningful persistent pass transitions.

---

## 9. Tests

### Unit/integration

- nomination creation never writes `VOTING` directly;
- Virgin ambiguity holds nomination in trigger-resolution state;
- Virgin terminal execution never opens vote;
- vote intent rejected before `VOTING`;
- pass cursor follows Virtual Circle order;
- forged voter ID outside current seat rejected;
- reconnect projection returns current pass seat;
- last seat completes pass;
- lock consumes ghost vote only if counted;
- winner remains in projection after fresh read;
- rename validation matches create validation;
- rename unauthorized as player;
- rename blocked outside permitted status.

### E2E

- nomination → trigger resolution → sequential vote → lock → execution;
- reload mid-pass continues at same seat;
- second device receives current-seat changes over SSE;
- game ends, browser hard refresh still shows winner;
- rename in setup appears on player/public views after invalidation.

---

## 10. Acceptance criteria

Done means:

- nomination has an explicit trigger-resolution stage;
- no vote opens before nomination triggers are resolved;
- Virtual-Circle voting is a persistent sequential pass, not free-form collection;
- server validates current voting turn;
- reload can resume an in-progress pass;
- winner/reason are rendered from the persisted projection after reload;
- rename is an audited Storyteller command, not a local UI edit.
