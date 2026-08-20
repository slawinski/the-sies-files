# The Sieś Files — Slice 4 Implementation Specification

**Title:** Investigation, Nominations, Voting, Execution & Victory  
**Status:** Canonical implementation document  
**Version:** 1.0  
**Depends on:** Slices 1–3

## 1. Slice goal

Close the full playable Trouble Brewing loop:

```text
setup
→ Operational
→ Investigation
→ nominations
→ voting
→ execution/no execution
→ victory check
→ next Operational
→ ...
→ game end
```

Physical social conversation remains outside formal app choreography. The app governs authoritative rules/bookkeeping moments.

## 2. In scope

Investigation state, day abilities, nominations, nomination eligibility/limits, Virgin interruption, vote collection/lock, ghost votes, Butler validation, Bureaucrat raw/effective vote multiplier, execution candidate tracking, execution/death pipeline, Saint, Slayer, Undertaker reference, Scarlet Woman-before-victory ordering, Mayor special win, ordinary victory, Traveller exile, next-cycle/ENDED transitions.

## 3. Out of scope

QR/clues/tasks/map/storyline, scenario inventory/progress, advanced recovery/manual patching UI, production monitoring suite, advanced offline, generic BotC scripts, extra Travellers, spectators, multiple Storytellers.

## 4. InvestigationState

```ts
interface InvestigationState {
  gameId: string;
  cycleNumber: number;
  nominationState: 'CLOSED' | 'OPEN' | 'VOTING' | 'RESOLVING';
  currentExecutionCandidatePlayerId?: string;
  currentHighEffectiveVotes?: number;
  executionOccurred: boolean;
  startedAt: string;
  completedAt?: string;
}
```

`INVESTIGATION` remains the global phase throughout nomination/voting/execution.

## 5. Free Investigation

When nominations are closed, participants converse freely, allowed day actions may be initiated, and later Slice 5 terrain is available. Do not impose a default timer.

## 6. Nominations

### Open/close
Only Storyteller opens/closes the formal window. Opening sets `nominationState=OPEN` and pauses future terrain interaction.

### Eligibility
Server enforces canonical per-cycle nomination constraints, including whether a player has already nominated and whether a living player has already been nominated where applicable. Traveller exile remains a distinct operation.

### Creation
Persist nominator, nominee, sequence number, game version and pre-trigger context transactionally. Before ordinary voting, run nomination-trigger hooks such as Virgin.

## 7. Virgin

On Virgin's first nomination:

1. consume/mark the once-only trigger according to role semantics;
2. evaluate ability functioning;
3. determine whether nominator validly registers as Townsfolk;
4. if triggered, immediately execute the nominator using execution semantics;
5. resolve death/victory consequences;
6. end ordinary vote path where appropriate.

Registration ambiguity is a bounded Storyteller decision.

## 8. Slayer

During free Investigation, a living Slayer with unspent ability may publicly choose one target. Server validates once-per-game state, evaluates functioning and Demon registration, issues `DEATH_ATTEMPT(source=SLAYER)` on success, resolves succession/victory and marks ability spent.

Public projection shows shot and observed death/no death, not hidden reasons.

## 9. Voting model

### Voting pass
Storyteller starts a vote for one nomination. UI presents Virtual Circle order. Correctness comes from server-locked vote intentions, not animation timing.

### Raw intent
Persist each player's intent.

### Validity
At lock time evaluate alive/dead eligibility, dead normal player's ghost-vote availability, Butler master condition and actor/session validity.

### Effective weight
Default valid vote = 1. If voter is current Bureaucrat-selected target, effective weight = 3. Persist raw + effective values.

### Ghost vote
Consume a dead normal player's ghost vote atomically only when their valid vote is included in the locked result. Traveller has no normal ghost vote.

### Butler
Butler's vote is valid only when the current master is also voting in the locked vote state. UI may prevent obvious invalid intent, but server is authoritative.

## 10. Execution threshold and current candidate

Calculate the canonical Trouble Brewing threshold from relevant alive normal players. Track qualification, effective total and current high candidate.

A later nomination that ties the current high total does **not** replace the candidate. A strictly higher qualifying total does.

At nomination close there is zero or one execution candidate.

## 11. Execution

Storyteller resolves final candidate through central death pipeline with execution source. Persist executed-player reference for next Operational Undertaker information.

Execution may immediately trigger Saint evil victory, Scarlet Woman succession, Demon-death good victory, and other valid role consequences.

## 12. Saint

If a functioning Saint dies **by execution**, evil wins immediately after death resolution. Non-execution death does not trigger this condition.

## 13. Scarlet Woman and Demon execution

If Imp dies by execution, succession resolver runs first. If legal Scarlet Woman succession occurs, do not declare good victory; otherwise normal Demon-death good victory may resolve.

## 14. Mayor

When Investigation closes with no execution, if exactly three relevant normal players are alive and a living functioning Mayor meets its condition, good wins. Traveller is excluded from that count.

## 15. Ordinary victory

At each relevant death/phase boundary:

1. resolve pending triggered role changes;
2. resolve immediate role-specific wins/losses;
3. determine whether a living Demon remains;
4. determine normal living-player terminal condition;
5. if winner exists, emit `GAME_ENDED` once.

Victory resolver is idempotent.

## 16. Traveller exile

For Bureaucrat:

- use `EXILE`, not execution;
- do not fire “dies by execution” effects;
- deactivate Traveller ability/future selections;
- participant remains socially/in-app present in exiled state;
- emit `TRAVELLER_EXILED`.

See ADR-001.

## 17. APIs

```text
POST /api/v1/games/:id/investigation/nominations/open
POST /api/v1/games/:id/investigation/nominations/close
POST /api/v1/games/:id/nominations
POST /api/v1/games/:id/nominations/:nominationId/voting/start
POST /api/v1/games/:id/nominations/:nominationId/votes/intent
POST /api/v1/games/:id/nominations/:nominationId/votes/lock
POST /api/v1/games/:id/investigation/resolve-execution
POST /api/v1/games/:id/day-actions/slayer
POST /api/v1/games/:id/traveller/exile
POST /api/v1/games/:id/investigation/close
```

## 18. Events

`INVESTIGATION_STARTED`, `NOMINATIONS_OPENED`, `NOMINATION_CREATED`, `VIRGIN_TRIGGER_RESOLVED`, `SLAYER_USED`, `VOTING_STARTED`, `VOTE_INTENT_RECORDED`, `VOTE_LOCKED`, `GHOST_VOTE_CONSUMED`, `NOMINATION_RESOLVED`, `PLAYER_EXECUTED`, `TRAVELLER_EXILED`, `NOMINATIONS_CLOSED`, `INVESTIGATION_COMPLETED`, `GAME_ENDED`.

## 19. UI

### Player/public
Free Investigation shows phase/free-play/day ability where eligible. Formal nomination mode suppresses terrain, shows nominator/nominee/current block, vote controls and ghost-vote status.

### Storyteller
Bento dashboard with nomination controls, current candidate/block, Virtual Circle voting pass, raw/effective breakdown, role-trigger warnings, resolve-execution/no-execution controls and victory reason.

## 20. Tests

### Unit
Nomination limits, Virgin, Slayer, threshold, tie behavior, ghost vote, Butler, Bureaucrat ×3, Saint execution-only win, Scarlet succession ordering, Mayor condition, Traveller excluded from normal count.

### Integration
Concurrent vote/version safety, duplicate vote idempotency, execution+Undertaker reference transaction, one `GAME_ENDED`, cannot submit another player's vote.

### E2E
Nomination→vote→execution; tie then higher candidate; dead ghost vote; Butler; Bureaucrat triple vote; Virgin; Saint win; Imp execution→Scarlet succession; Mayor win; ordinary Demon-death good win; evil terminal win.

## 21. Acceptance criteria

- [ ] Complete Trouble Brewing Investigation/day loop works without external vote bookkeeping.
- [ ] Nominations are subprocesses inside Investigation.
- [ ] Formal voting is deterministic and auditable.
- [ ] Ghost vote/special constraints are server-enforced.
- [ ] Execution source is preserved.
- [ ] Victory priority is correct.
- [ ] A full game can reach `ENDED` with scenario disabled.

## 22. Slice Definition of Done

The Sieś Files is mechanically playable as a complete Trouble Brewing game from setup to winner even with QR/map/storyline disabled.
