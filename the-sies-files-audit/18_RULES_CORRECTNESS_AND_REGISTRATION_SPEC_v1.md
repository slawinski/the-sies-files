# The Sieś Files — Rules Correctness & Registration Specification v1

**Status:** Required remediation  
**Version:** 1.0  
**Audit baseline:** `main@9099836`  
**Closes:** #1, #4, #5, #6, #8 and audit finding X2  
**Depends on:** Game Engine Spec v1, Slice 3, Slice 4, ADR-001

---

## 1. Goal

Replace ad-hoc true-character checks and generic target writes with shared rule primitives that correctly model:

- alive → dead transitions and ghost-vote entitlement;
- functioning vs. malfunctioning abilities;
- Recluse/Spy registration ambiguity;
- Virgin and Slayer;
- role-specific target constraints for Butler and Bureaucrat;
- same-game membership and action target cardinality.

The result must be impossible to bypass by calling HTTP endpoints directly.

---

## 2. Current-state defects

### 2.1 Ghost votes

`Player.ghostVoteAvailable` defaults to `false`. The current normal death paths set `alive = false` but do not grant the vote. Voting code already knows how to consume a dead normal player's ghost vote, so the entitlement lifecycle is incomplete rather than the tally itself.

### 2.2 Registration/functioning

Virgin and Slayer currently inspect true character/category directly. That bypasses:

- poison/Drunk malfunction;
- Spy registration as good / Townsfolk / Outsider when relevant;
- Recluse registration as evil / Minion / Demon when relevant;
- explicit Storyteller adjudication where multiple registrations are legal.

A free-form Storyteller answer override is not a substitute for a bounded registration decision because it does not record which legal registration was used to resolve a rule.

### 2.3 Target validation

`submitAction` accepts target IDs and `applyChoiceEffect` uses the first target without a role-level contract. The validator must own:

- target count;
- same-game membership;
- whether self-target is legal;
- whether target must be alive;
- any character-specific eligibility.

---

## 3. Shared death transition

Introduce one domain primitive and route all normal-player deaths through it.

Recommended interface:

```ts
type DeathSource =
  | "DEMON"
  | "EXECUTION"
  | "VIRGIN"
  | "SLAYER"
  | "OTHER";

markPlayerDead(tx, {
  gameId,
  playerId,
  source,
  cycleNumber,
  executionId?,
}): Promise<DeathTransition>
```

### 3.1 Rules

For a player whose participant kind is `NORMAL`:

- if `alive === true`, transition to:
  - `alive = false`;
  - `ghostVoteAvailable = true`.
- if already dead, the helper is idempotent:
  - does not recreate a ghost vote;
  - does not emit a second semantic death.
- the first death creates/updates the required `DeathRecord` semantics and emits `PLAYER_DIED`.
- a consumed ghost vote remains consumed forever; calling the death helper again must never reset it to true.

For a `TRAVELLER`:

- Traveller exile remains a separate path;
- exile does **not** grant a ghost vote;
- exile does not create an Undertaker execution fact.

### 3.2 Required call-site migration

At minimum migrate:

- Demon/Imp kill resolution;
- execution resolution;
- Virgin-triggered execution;
- Slayer kill;
- any recovery/admin path that semantically applies a new death.

The recovery override that explicitly restores a ghost vote remains an exceptional audited override and must not be folded into the ordinary death helper.

### 3.3 Invariants

- `alive = true` implies ordinary vote eligibility according to current rules.
- `alive = false && participantKind = NORMAL` may have `ghostVoteAvailable = true|false`.
- `participantKind = TRAVELLER` must never acquire a normal ghost vote.
- one death does not imply one vote *cast*; the vote is only consumed when a locked nomination includes that dead player's valid intent.

---

## 4. Ability functioning service

Retain `getAbilityFunctionState`, but make its use mandatory at every ability boundary.

Add a small shared result:

```ts
type AbilityContext = {
  actorPlayerId: string;
  functioning: "FUNCTIONING" | "MALFUNCTIONING";
  reasons: Array<"POISONED" | "DRUNK" | "OTHER">;
};
```

The reasons are Storyteller/control-plane data only and must not leak to the affected player's projection unless the game rules explicitly reveal them.

### Required rule

Any role resolver that can change state or trigger an execution must call the functioning service before applying the ability.

For malfunctioning abilities:

- choices may still be collected if the character normally chooses;
- no mechanical effect is applied unless the specific game rule says otherwise;
- information roles may receive false information selected by the Storyteller under spec 19.

---

## 5. Registration resolver

Create a first-class domain service, e.g. `src/modules/trouble-brewing/registration.ts`.

### 5.1 Concepts

Separate:

- **true identity** — authoritative character/alignment in `PlayerSecret`;
- **possible registration** — legal identities/categories an observer/ability may treat that player as for one ruling;
- **chosen registration** — the Storyteller's bounded decision when more than one legal answer affects the outcome.

Recommended query shape:

```ts
type RegistrationPredicate =
  | { kind: "CATEGORY"; category: CharacterCategory }
  | { kind: "ALIGNMENT"; alignment: Alignment }
  | { kind: "CHARACTER"; characterId: CharacterId };

getRegistrationOptions({
  subject,
  predicate,
  context,
}): RegistrationOption[]
```

### 5.2 Base behavior

Ordinary characters register as their true character, category and alignment.

### 5.3 Recluse

When functioning according to the rules context, Recluse may register as:

- evil;
- Minion;
- Demon;
- a specific evil character when a specific-character registration is required and the engine permits it for that ruling.

Recluse does not become that character; this is a local adjudication fact.

### 5.4 Spy

When functioning according to the rules context, Spy may register as:

- good;
- Townsfolk;
- Outsider;
- a specific good character when a specific-character registration is required and the engine permits it for that ruling.

### 5.5 Bounded Storyteller decision

If the outcome is identical for all legal registration options, resolve automatically.

If legal options can change the outcome:

1. persist a `RegistrationDecision` (or equivalent structured decision attached to the active action/nomination);
2. expose only legal choices to the Storyteller;
3. require one choice before the parent rule can resolve;
4. append `REGISTRATION_DECISION_RECORDED` with:
   - subject player ID;
   - rule context;
   - chosen registration;
   - parent action/nomination ID;
5. do **not** put hidden true-role information in public event payloads/projections.

A generic arbitrary `resolution` JSON field is not sufficient.

### 5.6 Contexts required in this remediation

At minimum:

- `VIRGIN_NOMINATOR_TOWNSFOLK`;
- `SLAYER_TARGET_DEMON`;
- `UNDERTAKER_EXECUTED_CHARACTER` (spec 19);
- future information resolvers that ask character/category/alignment questions.

---

## 6. Virgin

### 6.1 Trigger lifecycle

Virgin is checked during `DAY_TRIGGER_RESOLUTION`, before normal voting begins.

A Virgin trigger can fire only if:

- the nominated player is truly the Virgin;
- the Virgin's once-only nomination trigger has not already been spent;
- the Virgin's ability is `FUNCTIONING`;
- the nominator legally registers as Townsfolk for this ruling.

### 6.2 Once-only semantics

The first nomination of the Virgin consumes the ability's trigger opportunity according to canonical Trouble Brewing semantics, regardless of whether the nominator satisfies the Townsfolk condition. Persist an explicit usage marker/event so retries cannot re-trigger it.

### 6.3 Registration flow

If nominator registration is unambiguous, resolve automatically.

If the nominator is Spy and can legally register as Townsfolk for the ruling, create a bounded Storyteller registration decision.

Do not read `trueCharacter.category` as the final answer.

### 6.4 Triggered execution

If the condition resolves true:

- execute the nominator immediately through the common execution/death path;
- record the execution as an execution for win checks and Undertaker semantics where canonical rules require it;
- resolve the nomination without opening a normal vote;
- run Saint/Demon/succession/victory hooks exactly as for any other execution, as applicable.

If the Virgin is malfunctioning, no Virgin-caused execution occurs.

---

## 7. Slayer

### 7.1 Preconditions

- actor is alive;
- actor's true character is Slayer;
- Slayer ability has not already been used;
- action occurs in an allowed Investigation window;
- selected target is a player in the same game;
- actor functioning is evaluated at resolution time.

### 7.2 Resolution

If Slayer is malfunctioning:

- consume the once-per-game Slayer use;
- no death occurs.

If functioning:

- evaluate `SLAYER_TARGET_DEMON` through the registration resolver.
- a true Demon satisfies automatically.
- a functioning Recluse can produce a bounded Storyteller decision allowing Demon registration.
- ordinary non-Demons cannot be promoted into a legal target by arbitrary override.

If target registers as Demon for this resolution:

- apply death through the shared death helper;
- run Demon death/succession/victory hooks.

### 7.3 Audit

Append a Slayer action event without exposing target secret registration details to unauthorized projections. The Storyteller audit can show the adjudication.

---

## 8. Operational target contracts

Create a declarative target contract keyed by action kind.

Example:

```ts
type TargetRule = {
  min: number;
  max: number;
  self: "ALLOW" | "FORBID";
  membership: "SAME_GAME";
  alive?: "REQUIRED" | "ANY";
};
```

Minimum contracts:

| Action | Count | Self | Alive |
|---|---:|---|---|
| `BUTLER_CHOOSE` | 1 | **FORBID** | use canonical Butler target rule; do not invent a generic alive requirement |
| `BUREAUCRAT_CHOOSE` | 1 | **FORBID** | **REQUIRED** |
| `POISONER_CHOOSE` | 1 | according to canonical script | according to canonical script |
| `MONK_CHOOSE` | 1 | according to canonical script | according to canonical script |
| `IMP_CHOOSE` | 1 | **ALLOW** (star-pass) | target must be an eligible current-game participant |

### Required validation order

1. action belongs to current game;
2. action belongs to current actor;
3. action is active;
4. target count is valid;
5. every target belongs to current game;
6. role-specific self/alive constraints pass;
7. only then record choice/apply effect.

Invalid targets return a domain error such as `INVALID_TARGET`; they must never rely on Prisma foreign-key errors.

---

## 9. API and projection impact

No endpoint may accept a target ID and assume the UI already validated it.

Where registration decisions are needed, expose a typed Storyteller-only projection:

```ts
{
  decisionId,
  context,
  subjectPlayerId,
  legalOptions: [...],
  parentType,
  parentId
}
```

Player/public projections must expose only “waiting for Storyteller” state, not the secret options.

---

## 10. Events

Add/standardize:

- `GHOST_VOTE_GRANTED`
- `REGISTRATION_DECISION_REQUIRED`
- `REGISTRATION_DECISION_RECORDED`
- `VIRGIN_TRIGGER_CONSUMED`
- existing `PLAYER_DIED`
- existing Slayer/nomination events as appropriate

Do not create duplicate events on command replay.

---

## 11. Tests

### 11.1 Unit

- normal player death grants exactly one ghost vote;
- repeated death does not restore a consumed ghost vote;
- Traveller exile never grants ghost vote;
- poisoned Virgin never executes nominator;
- Virgin first nomination usage is idempotent;
- ordinary Townsfolk nomination triggers functioning Virgin;
- Spy nominator can be adjudicated Townsfolk/non-Townsfolk only through legal options;
- poisoned Slayer consumes use but kills nobody;
- functioning Slayer kills Imp;
- functioning Slayer may kill Recluse only if Storyteller selects legal Demon registration;
- arbitrary non-Demon cannot be marked Demon;
- Bureaucrat self-target rejected;
- Bureaucrat dead target rejected;
- Butler self-target rejected;
- cross-game target rejected for every action kind;
- missing/extra targets rejected.

### 11.2 Integration

- direct HTTP request cannot bypass the target contract;
- registration decision survives reload/retry;
- concurrent duplicate command does not duplicate death/ghost vote/once-only trigger.

### 11.3 Regression

Existing happy-path Operational and voting tests must continue to pass.

---

## 12. Acceptance criteria

This spec is done when:

- every ordinary death path grants one ghost vote atomically;
- no Traveller gets a ghost vote through ordinary exile;
- Virgin/Slayer never make outcome-sensitive decisions from raw true category/character alone;
- poison/Drunk malfunction suppresses Virgin/Slayer effects;
- Recluse/Spy ambiguity is represented as a bounded Storyteller choice, not free-form JSON;
- Butler and Bureaucrat cannot select themselves;
- Bureaucrat target must be another living current-game player;
- all Operational targets are cardinality- and same-game-validated server-side;
- API-level tests prove invalid/cross-game target IDs cannot mutate state.
