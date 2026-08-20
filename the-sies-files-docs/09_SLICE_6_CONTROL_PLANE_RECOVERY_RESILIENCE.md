# The Sieś Files — Slice 6 Implementation Specification

**Title:** Storyteller Control Plane, Recovery & Resilience  
**Status:** Canonical implementation document  
**Version:** 1.0  
**Depends on:** Slices 1–5

## 1. Slice goal

Make a real weekend game operationally safe.

Storyteller must be able to continue after SSE disconnect, page/browser crash, lost player device, Storyteller device switch, application/backend restart, deploy, uncertain command outcome, or a recoverable operator mistake.

Slice 6 adds no new game/scenario mechanics. It is the control/recovery layer over completed engines.

## 2. Failure model

PostgreSQL is durable authority. Application memory, SSE connections and browser state may disappear at any time.

No correct transition may depend solely on React state, an open connection, local storage, in-memory queue cursor or Storyteller memory.

## 3. Control-plane dashboard

One Storyteller home view answers:

- game/version;
- current phase/cycle;
- current blocking action/vote;
- player connectivity status;
- last committed event;
- scenario health;
- latest checkpoint;
- recovery warnings.

Use bento cards with the active blocker dominant.

## 4. Durable command receipts

```ts
interface CommandReceipt {
  commandId: string;
  accepted: boolean;
  resultingGameVersion: number;
  eventSequenceRange?: [number, number];
  domainResult?: unknown;
}
```

If client times out after submit, query status before retrying:

```text
GET /api/v1/games/:id/commands/:commandId
```

Duplicate retries return the original logical result.

## 5. Checkpoints

### Purpose
A checkpoint is a validated recovery snapshot, not the only history.

Create automatically at safe boundaries such as setup commit, Operational completion, Investigation completion and game end; allow manual Storyteller checkpoint; optionally create before risky override.

### Snapshot content
Session/phase/cycle/version, roster/Virtual Circle, roles/alignments, ability/effects, active queue, Investigation/nominations/votes, ghost votes, Traveller, scenario/map/clues/tasks/conditions and last event sequence.

Checkpoint contains full secrets and must be protected accordingly.

### Integrity
Store checksum over canonical serialized snapshot + metadata. Validate before recovery.

## 6. Startup recovery

Application startup reads current DB state; no in-memory restore is required.

Provide consistency diagnostics comparing materialized version, latest domain event, latest checkpoint and active phase/queue invariants.

If inconsistent, Storyteller sees a blocking recovery banner instead of silent guessing.

## 7. Event replay verification

Implement an internal/test projector able to rebuild key state from checkpoint + subsequent events and compare against materialized state.

Full event-sourcing read model is not required, but replay verification is the recovery safety net.

## 8. Reconnect protocol

### Player
On resume: cookie identifies player → fetch fresh player projection → resume SSE cursor if possible → if cursor too old use fresh state → never auto-submit stale local action.

### Storyteller
Same plus control-plane health and unresolved actions.

## 9. Lost player device / claim reset

Storyteller can revoke player's browser sessions and issue a fresh claim token.

Requirements:

- same player identity/role/seat;
- old sessions invalid;
- `PLAYER_ACCESS_RESET` event;
- raw new claim token shown once.

## 10. Storyteller access recovery

Provide a secure deployment-specific recovery mechanism that cannot elevate a normal player. An operator-held recovery secret/bootstrap route is acceptable for MVP if documented and protected.

## 11. Audited manual overrides

Recovery-only bounded overrides may:

- resolve/skip a stuck Operational action with reason;
- correct role/effect after confirmed operator mistake;
- correct alive/dead state;
- restore ghost vote;
- correct nomination/vote resolution;
- adjust phase/cycle through validated recovery transition;
- correct scenario clue/task/stage/map/condition.

Each requires explicit confirmation, free-text reason, before/after state, `RECOVERY_OVERRIDE_APPLIED` event and checkpoint around risky change where practical.

Do not expose arbitrary SQL/JSON editing.

## 12. Safe vs dangerous recovery

### Safe
Refetch projection, replay missed SSE, reset claim, recreate checkpoint, reopen UI around already-persisted current action.

### Dangerous / confirm
Change phase, role/alignment, alive/dead, locked vote, execution result, or scenario map/stage retrospectively.

Visually separate dangerous controls.

## 13. Audit timeline

Storyteller can filter chronological events by game engine, Operational, Investigation/voting, scenario, access/session and recovery.

Each row includes sequence, timestamp, actor, event type, concise description, game version and expandable safe payload. Secret payload remains Storyteller-only.

## 14. Consistency checks

At minimum verify:

- contiguous unique Virtual Circle;
- one current Demon where expected;
- no duplicate active Operational phase;
- valid queue cursor;
- nomination state matches active nomination;
- ghost vote consumed at most once;
- Traveller not counted as normal role;
- active scenario map exists in scenario version;
- materialized version matches latest event;
- ended game has winner + reason.

Run on control-plane load, after recovery override and optionally checkpoint creation.

## 15. SSE health

UI states:

- `LIVE`
- `RECONNECTING`
- `OFFLINE`

SSE disconnect is connectivity degradation, not game-state failure.

## 16. APIs

```text
GET  /api/v1/games/:id/storyteller/control
GET  /api/v1/games/:id/storyteller/audit
GET  /api/v1/games/:id/storyteller/consistency
GET  /api/v1/games/:id/commands/:commandId
POST /api/v1/games/:id/storyteller/checkpoints
GET  /api/v1/games/:id/storyteller/checkpoints
POST /api/v1/games/:id/storyteller/recovery/validate
POST /api/v1/games/:id/storyteller/recovery/override
POST /api/v1/games/:id/players/:playerId/access/reset
```

## 17. Events

`CHECKPOINT_CREATED`, `PLAYER_ACCESS_RESET`, `RECOVERY_STARTED`, `RECOVERY_VALIDATED`, `RECOVERY_OVERRIDE_APPLIED`, `RECOVERY_COMPLETED`.

## 18. Backup/deployment runbook requirements

Document DB backup, restore into validation DB, migration strategy that preserves active-game state, retention of active script/scenario versions across deploys, and rollback considerations.

No deploy may depend on ephemeral app memory for live game continuity.

## 19. Tests

### Integration
Command timeout→status lookup; duplicate retry no double mutation; checkpoint checksum; corrupted checkpoint rejection; materialized/event mismatch detection; access reset revokes old browser; override logs before/after.

### Restart harness
Restart during player action, Storyteller decision, vote intents before lock, vote lock before execution, and immediately after map unlock. All resume from PostgreSQL.

### E2E
Lost device→reset→same identity reclaim; Storyteller refresh mid-Operational; SSE disconnect/reconnect; safe recovery correction→consistency passes→continue.

## 20. Acceptance criteria

- [ ] No active truth depends on process/browser memory.
- [ ] Command uncertainty is resolvable by command ID.
- [ ] Player access can be recovered without identity change.
- [ ] Checkpoints exist at major safe boundaries.
- [ ] Diagnostics detect corrupted test state.
- [ ] Overrides are bounded, confirmed and audited.
- [ ] Server restart during formal processes does not corrupt state.
- [ ] SSE loss is not treated as data loss.

## 21. Slice Definition of Done

Storyteller can run the full multi-day game without shell/SQL access for ordinary refresh, reconnect, device loss or recoverable operator mistakes.
