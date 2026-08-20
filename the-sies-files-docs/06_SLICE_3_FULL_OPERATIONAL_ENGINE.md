# The Sieś Files — Slice 3 Implementation Specification

**Title:** Full Operational Phase Engine + Storyteller Resolution Queue  
**Status:** Canonical implementation document  
**Version:** 1.0  
**Depends on:** Slices 1–2

## 1. Slice goal

Generalize the first-cycle runner into the complete recurring Operational engine required for Trouble Brewing.

After Slice 3 the app can run any number of Operational phases with a dynamic ordered action queue, first/other-cycle occurrence rules, player/Storyteller actions, poison/Drunk malfunction, protection, Demon attacks, death attempts/redirects, night-death triggers, character changes/Demon succession, information registration choices, persisted private results and reconnect-safe progression.

Slice 3 does **not** implement nominations, voting, execution or the complete victory resolver; those belong to Slice 4.

## 2. Entry and exit

Entry:

```text
ACTIVE + transition to OPERATIONAL
```

Exit:

```text
all blocking actions resolved
→ expire/apply boundary effects
→ OPERATIONAL_COMPLETED
→ transition to INVESTIGATION
```

Use one `startOperationalPhase(gameId)` for cycle 1 and later cycles. First-cycle differences come from occurrence metadata.

## 3. OperationalPhase

```ts
interface OperationalPhase {
  id: string;
  gameId: string;
  cycleNumber: number;
  status: 'BUILDING' | 'RUNNING' | 'COMPLETED';
  startedAt: string;
  completedAt?: string;
}
```

Only one non-completed Operational phase per game.

## 4. Step definition

```ts
interface OperationalStepDefinition {
  id: string;
  characterId?: CharacterId;
  kind: string;
  occurrence:
    | 'FIRST_CYCLE_ONLY'
    | 'EACH_CYCLE'
    | 'NOT_FIRST_CYCLE'
    | 'TRIGGERED';
  order: number;
  actor: 'PLAYER' | 'STORYTELLER' | 'SYSTEM';
  targetRule?: TargetRule;
}
```

Queue building is deterministic and persisted. Never reconstruct a half-completed queue from new code without explicit migration/recovery logic.

## 5. Queue state machine

```text
PENDING
→ WAITING_FOR_PLAYER | WAITING_FOR_STORYTELLER | RESOLVING
→ RESOLVED | SKIPPED
```

Triggered actions are inserted deterministically relative to the event that created them. Example: Ravenkeeper's triggered action occurs after valid night death resolution before later informational steps.

## 6. Ability functioning

Central resolver:

```ts
getAbilityFunctionState(playerId, context):
  'FUNCTIONING' | 'MALFUNCTIONING'
```

Inputs include true character, poison effects, Drunk truth, current cycle/boundary and future standard disabling effects. Character modules do not each implement poison logic.

## 7. Effect model

Use explicit time boundaries, not ad-hoc booleans.

Minimum effects:

- `POISONED`
- `MONK_PROTECTED_FROM_DEMON`
- `BUREAUCRAT_VOTE_WEIGHT_TARGET`
- per-cycle Butler master selection.

Each effect declares source, target, start and expiry boundary. Phase transition runs deterministic expiry before building the next queue.

## 8. Poisoner

Each Operational phase:

1. choose one legal target;
2. expire the previous poison at the correct boundary;
3. if Poisoner functions, apply `POISONED` through the following Investigation;
4. target is not told by the engine;
5. target's ability is treated as malfunctioning while poison applies.

If Poisoner malfunctions, the apparent selection can still occur but produces no functional poison effect.

## 9. Drunk

Drunk remains true `DRUNK`, perceived as a Townsfolk. Queue generation creates actions appropriate to the perceived role so the player's experience remains coherent; those actions resolve as a malfunctioning ability.

Never expose `malfunctionReason: DRUNK` to the player.

## 10. Monk

On non-first Operational phases:

- choose exactly one other living player;
- if Monk functions, apply Demon-only protection for the current Operational phase;
- protection does not prevent execution/day deaths;
- central death resolver evaluates it.

## 11. Imp kill

On each non-first Operational phase, living Imp chooses a target.

Resolution:

- create `DEATH_ATTEMPT(source=DEMON)`;
- evaluate Soldier immunity, Monk protection, Mayor redirect and other legal interactions;
- if target is Imp itself and death succeeds, resolve star-pass succession to a valid living Minion selected by Storyteller;
- persist death and character change atomically.

A failed self-kill does not create succession.

## 12. Soldier

A functioning Soldier targeted by Demon-source death does not die. Record attempted/prevented death in Storyteller audit without leaking hidden reasons publicly.

## 13. Mayor redirect

If a functioning Mayor would die during Operational, create a Storyteller resolution step allowing legal redirect to another target. The choice is explicit/audited, and redirected death passes through the standard death resolver.

## 14. Ravenkeeper

When Ravenkeeper actually dies during Operational and functions:

- insert a triggered private action;
- Ravenkeeper chooses one player;
- information resolver/Storyteller returns a legal character registration;
- persist result;
- continue queue.

If ability malfunctions, resolve through the malfunctioning-information contract.

## 15. Scarlet Woman

On Demon death, before generic good-victory declaration:

1. evaluate Scarlet Woman alive/functioning state;
2. evaluate required alive-player threshold at the correct rule moment;
3. if legal, change Scarlet Woman to Imp;
4. emit `CHARACTER_CHANGED` / succession event;
5. continue game.

Slice 3 implements succession mechanics; Slice 4 finalizes victory.

## 16. Information resolver

```ts
resolveInformation(request, truthContext):
  AutomaticInformation | StorytellerDecisionRequired
```

Supports deterministic truth, Fortune Teller red herring, Recluse/Spy registration flexibility, poisoned/Drunk misinformation, target restrictions and persisted final output.

Already delivered information is never recomputed on reconnect.

## 17. Registration decisions

Where original rules allow flexible registration, create a bounded Storyteller decision containing queried ability, target truth, allowed registrations and final chosen registration. Persist/audit it as part of action resolution.

## 18. Character changes

Use a domain operation:

```ts
changeCharacter({ playerId, from, to, reason })
```

Preserve player ID, seat, alive state, alignment unless the rule changes it, and historical audit. Initialize new ability state correctly.

## 19. APIs

```text
POST /api/v1/games/:id/operational/start
GET  /api/v1/games/:id/storyteller/operational
POST /api/v1/games/:id/operational/actions/:actionId/submit
POST /api/v1/games/:id/storyteller/actions/:actionId/resolve
POST /api/v1/games/:id/operational/complete
```

Do not expose generic ordinary-UI endpoints such as “set poisoned”, “kill player”, or “set role”.

## 20. Events

`OPERATIONAL_STARTED`, `ACTION_QUEUE_BUILT`, `ACTION_ACTIVATED`, `PLAYER_ACTION_SUBMITTED`, `STORYTELLER_DECISION_RECORDED`, `INFORMATION_DELIVERED`, `EFFECT_APPLIED`, `EFFECT_EXPIRED`, `DEATH_ATTEMPTED`, `DEATH_PREVENTED`, `DEATH_REDIRECTED`, `PLAYER_DIED`, `TRIGGERED_ACTION_CREATED`, `CHARACTER_CHANGED`, `DEMON_SUCCESSION_RESOLVED`, `OPERATIONAL_COMPLETED`.

## 21. UI

### Player
Full-screen/private active action; Virtual Circle target picker; confirmation before irreversible submit; safe waiting state; persisted own private results.

### Storyteller
Bento layout with current action as largest card, queue timeline, grimoire, active effects, pending decisions and recent event log. It must be obvious **why** the engine is waiting.

## 22. Reconnect

Player reconnect shows the same unresolved action or persisted result. Storyteller reconnect shows persisted queue cursor. No action auto-skips. Duplicate submissions are idempotent.

## 23. Tests

### Unit
Occurrence filtering, deterministic ordering, poison boundaries, Monk protection, Soldier immunity, Mayor redirect, Ravenkeeper trigger, Imp self-kill condition, Scarlet Woman succession, registration cases, role-change initialization.

### Integration
Queue survives process restart; death+trigger+events share transaction; duplicate action doesn't apply twice; secrets absent from other player's DTO.

### E2E
Two consecutive Operational cycles; poisoned info role; Monk-protected target; Ravenkeeper death/action; Imp star-pass; Scarlet Woman succession.

## 24. Acceptance criteria

- [ ] One engine handles first and later cycles.
- [ ] Queue is deterministic, persisted and reconnect-safe.
- [ ] Poison/Drunk semantics are centralized.
- [ ] All deaths use one resolver.
- [ ] Protection/redirect/trigger ordering is tested.
- [ ] Role changes are auditable.
- [ ] Private information is persisted and securely projected.
- [ ] Slice exits ready for Slice 4.

## 25. Non-goals

Nominations, voting, executions, final winner declaration, terrain/QR/scenario, production recovery control plane.
