# The Sieś Files — Slice 2 Implementation Specification

**Title:** Trouble Brewing Setup + Role Delivery + First Operational  
**Status:** Canonical implementation document  
**Version:** 1.0  
**Depends on:** Slice 1

## 1. Slice goal

Slice 2 is the first point where the app starts an actual game.

```text
READY_FOR_SETUP
→ generate legal Trouble Brewing setup
→ Storyteller review/regenerate
→ commit setup
→ assign characters
→ players privately reveal/acknowledge roles
→ FIRST OPERATIONAL
→ resolve all first-cycle actions/information
→ enter INVESTIGATION cycle 1
```

Implement a narrow first-cycle runner using the same contracts Slice 3 will generalize.

## 2. In scope

- versioned `TROUBLE_BREWING` ScriptDefinition;
- all Trouble Brewing characters;
- 13–15 normal-player setup composition;
- 16 participants = 15 normal + Bureaucrat Traveller;
- Baron modifier;
- Drunk true/perceived role;
- Fortune Teller red herring;
- deterministic setup RNG;
- setup review/regeneration before commit;
- immutable setup commit;
- private role reveal/acknowledgement;
- public Traveller character + secret alignment;
- Minion/Demon team knowledge;
- Demon bluffs/not-in-play roles;
- first-cycle action queue;
- first-cycle player actions + Storyteller information decisions;
- transition to Investigation cycle 1.

## 3. Out of scope

Reusable recurring Operational engine, later-cycle Demon kill/protection/death triggers, nominations/voting/execution, full victory resolver, QR/map/scenario, advanced recovery.

## 4. Setup algorithm

### Step 1 — Normal count

```ts
normalCount = participantCount === 16 ? 15 : participantCount;
```

### Step 2 — Base counts

| normalCount | Townsfolk | Outsiders | Minions | Demon |
|---:|---:|---:|---:|---:|
| 13 | 9 | 0 | 3 | 1 |
| 14 | 9 | 1 | 3 | 1 |
| 15 | 9 | 2 | 3 | 1 |

### Step 3 — Select unique characters

Select one Imp and required unique Minions/Outsiders/Townsfolk.

### Step 4 — Baron

If Baron is selected, final category counts become `Townsfolk - 2`, `Outsiders + 2`. Total stays constant. Generator output must be valid and deterministic.

### Step 5 — Drunk

If Drunk is selected, choose a Townsfolk not truly in play as `perceivedCharacter`. Player role reveal shows that Townsfolk. Storyteller grimoire clearly shows `DRUNK → thinks <role>`.

### Step 6 — Fortune Teller red herring

If Fortune Teller is in play, choose one valid good normal player and store secretly.

### Step 7 — Assign across Virtual Circle

Shuffle normal role assignments deterministically across normal players. Traveller stays Traveller.

### Step 8 — Evil knowledge

Generate private setup knowledge: Minions learn Demon/fellow Minions, Demon learns Minions, Demon gets three legal not-in-play bluff characters.

### Step 9 — Traveller alignment

If participant 16 exists, assign GOOD/EVIL alignment in the setup flow. Character remains publicly Bureaucrat; alignment remains secret.

## 5. Setup review

Storyteller sees Virtual Circle, true/perceived roles, alignments, category counts, Fortune Teller red herring, Demon bluffs and Traveller alignment.

Normal path is regenerate-whole-candidate before commit. Ad-hoc role editing is not required for MVP unless implemented as an audited recovery override.

## 6. Commit semantics

`POST /setup/commit` atomically verifies roster and candidate validity, writes assignments, locks roster/order, stores setup hash, moves to `ROLE_REVEAL`, emits `SETUP_COMMITTED`.

After commit, ordinary reorder/regenerate operations fail.

## 7. Private role reveal

Use an explicit privacy gate:

```text
Private information ahead
→ deliberate reveal action
→ show perceived role card
→ show permitted private setup knowledge
→ acknowledge
```

Do not send other players' secrets. Drunk receives only the perceived Townsfolk experience.

## 8. First Operational runner

Queue includes setup-information steps, Poisoner first-cycle choice if present, first-cycle information roles, roles acting every Operational phase such as Empath/Fortune Teller/Butler/Spy, Bureaucrat selection if present, and any script-defined setup steps.

Exact order comes from `ScriptDefinition.firstOperationalOrder`.

## 9. Action contract

```ts
interface PlayerActionRequest {
  actionId: string;
  targetPlayerIds?: string[];
  choiceId?: string;
}
```

Server validates actor ownership, active action, target count/type/restrictions and idempotency. Delivered private information is persisted so reconnect never regenerates a different answer.

## 10. Storyteller decisions

Ambiguous registration and malfunctioning information use `WAITING_FOR_STORYTELLER` queue items showing truth, ability-function state, legal response controls and player-facing preview.

## 11. APIs

```text
POST /api/v1/games/:id/setup/generate
GET  /api/v1/games/:id/storyteller/setup
POST /api/v1/games/:id/setup/commit
POST /api/v1/games/:id/role-reveal/ack
POST /api/v1/games/:id/operational/start
POST /api/v1/games/:id/operational/actions/:actionId/submit
POST /api/v1/games/:id/storyteller/actions/:actionId/resolve
POST /api/v1/games/:id/operational/complete
```

## 12. Events

`SETUP_GENERATED`, `SETUP_COMMITTED`, `ROLE_REVEALED_TO_PLAYER`, `TRAVELLER_ALIGNMENT_ASSIGNED`, `OPERATIONAL_STARTED`, `ACTION_QUEUE_BUILT`, `PLAYER_ACTION_SUBMITTED`, `STORYTELLER_DECISION_RECORDED`, `PRIVATE_INFORMATION_DELIVERED`, `OPERATIONAL_COMPLETED`, `INVESTIGATION_STARTED`.

## 13. UI

Storyteller: bento setup summary, grimoire, special setup facts, commit/regenerate, Operational queue and progress.

Player: deliberate role reveal, one active task at a time, safe waiting state, persisted private result, first Investigation landing state.

## 14. Tests

### Unit
Counts for 13/14/15, 16→15+Traveller, Baron transform, no duplicate roles, Drunk perceived role not truly in play, FT red herring, deterministic seed, Demon bluffs exclude in-play characters.

### Integration
Regenerate doesn't mutate committed setup; commit locks order; projection secrecy; queue resumes after refresh; duplicate submit is idempotent.

### E2E
13-player setup/first Operational; 15-player Baron+Drunk; 16-participant Traveller; private reveal across browsers; Storyteller resolves one ambiguous/malfunctioning info action.

## 15. Acceptance criteria

- [ ] Every supported participant count produces a legal setup.
- [ ] Storyteller can inspect/regenerate before commit.
- [ ] Commit permanently locks Virtual Circle through ordinary APIs.
- [ ] No player can learn another player's secret role.
- [ ] Drunk does not learn they are Drunk.
- [ ] First Operational is fully completable.
- [ ] Private results survive reconnect.
- [ ] Completion transitions to Investigation cycle 1.

## 16. Slice Definition of Done

A claimed roster can reach first real Investigation using only the app and Storyteller UI, with no manual role distribution or external bookkeeping.
