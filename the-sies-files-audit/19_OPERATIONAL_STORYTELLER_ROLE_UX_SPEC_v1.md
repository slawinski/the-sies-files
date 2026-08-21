# The Sieś Files — Operational Storyteller & Role UX Specification v1

**Status:** Required remediation  
**Version:** 1.0  
**Audit baseline:** `main@9099836`  
**Closes:** #2, #3, #7 and audit finding X1  
**Depends on:** Rules Correctness & Registration Spec v1, Slice 3, Slice 4

---

## 1. Goal

Make Storyteller-only Operational decisions explicit, typed, safe, and usable from the control UI.

This spec covers:

- Mayor night-death redirect;
- Imp self-kill/star-pass successor choice;
- malfunctioning information visibility;
- Undertaker;
- typed action-resolution schemas and current-game eligibility validation.

---

## 2. Current-state defects

The backend currently accepts optional `redirectToPlayerId` and `successionPlayerId` during `IMP_KILL`, but the Storyteller UI sends the default unwrapped secret and exposes no decision controls.

The same route accepts `resolution` as `z.unknown()` and casts it to `InfoResult`. The service then trusts optional player IDs too deeply:

- Mayor redirect IDs are not constrained to current-game membership/eligible target state before the player mutation;
- custom succession IDs are not proven to be living Minions in the current game;
- fallback succession is conflated with a Scarlet Woman lookup.

Separately, Operational actions store `{ info, functioning }`, but the Storyteller UI unwraps only `info`, hiding the fact that an information ability is malfunctioning.

Undertaker exists in the character catalog, but no recurring Operational action delivers the prior execution's character information.

---

## 3. Typed resolution contract

Replace the single untyped `resolution` boundary with a discriminated Storyteller resolution contract.

Recommended shape:

```ts
type StorytellerActionResolution =
  | { kind: "INFO"; value: InfoResult }
  | {
      kind: "IMP_KILL";
      mayorRedirectToPlayerId?: string;
      starPassSuccessorPlayerId?: string;
    }
  | {
      kind: "REGISTRATION";
      decisionId: string;
      optionId: string;
    };
```

The HTTP route must parse the exact union with Zod (or an equivalent runtime schema). No `z.unknown()` + `as InfoResult` is allowed at the domain boundary.

Unexpected fields should be rejected.

---

## 4. Mayor redirect

### 4.1 When the choice is offered

Offer a redirect control only when all are true:

- active action is `IMP_KILL`;
- the Demon selected the Mayor;
- Mayor is alive at target resolution;
- Mayor ability is functioning;
- the incoming death is a night death that can trigger Mayor redirection.

If Mayor is malfunctioning, do not offer the redirect as a functioning ability.

### 4.2 Storyteller UI

The active-action card must show:

- original target;
- clear “Mayor redirect available” decision;
- `No redirect` option;
- eligible redirect targets from the current game only.

Do not expose raw IDs.

### 4.3 Server validation

If `mayorRedirectToPlayerId` is supplied:

- original target must be a functioning Mayor in this action;
- redirect target must exist in the same game;
- redirect target must be a valid participant for this death;
- reject impossible/stale choices with `INVALID_TARGET` / `INVALID_ACTION_RESOLUTION`.

Never mutate a player looked up only by globally unique ID without `gameId` eligibility proof.

### 4.4 Event

Append `DEATH_REDIRECTED` with IDs only in the authorized domain event stream. Public projections reveal death outcomes only according to existing visibility rules.

---

## 5. Imp self-kill / star-pass

### 5.1 Separate star-pass from Scarlet Woman

Imp star-pass and Scarlet Woman Demon succession are different mechanics and must not be represented as the same fallback.

For **Imp self-kill**:

- Storyteller selects one legal living Minion to become the Imp when the rules require a Minion successor.
- eligible list is computed server-side from the current game.
- the chosen successor must be revalidated at command execution.
- if there is exactly one legal successor the UI may preselect it, but the server still validates.
- if there are multiple, Storyteller must explicitly choose.
- if there is no legal successor, resolve according to the canonical no-successor game outcome/rule rather than silently selecting an unrelated character.

For **Scarlet Woman** succession after a Demon death:

- keep it in the Demon-death/succession resolver;
- apply its own functioning/alive-count conditions;
- do not use Scarlet Woman merely because the Imp self-killed.

### 5.2 Security/integrity

`starPassSuccessorPlayerId` must satisfy:

- player belongs to current game;
- player is alive;
- player's true role is a Minion eligible for star-pass at that moment;
- player is not the dying Imp;
- command is resolving the active `IMP_KILL` self-kill.

A direct API request with another game's player ID must fail before any mutation.

### 5.3 UI

When the Imp chose self and successor choice is required, `Zatwierdź` is disabled until a valid successor is selected.

The UI must show display names; secret character data remains Storyteller-only.

---

## 6. Storyteller malfunction visibility

### 6.1 Projection contract

Do not flatten away `functioning`.

For every Storyteller-visible Operational action expose:

```ts
{
  ...
  functioning: "FUNCTIONING" | "MALFUNCTIONING";
  info: InfoResult | null;
  requiresFalseInformation: boolean;
}
```

`requiresFalseInformation` is true only for an information-delivery ability whose malfunction requires the Storyteller to provide false/misleading information under the game rules.

### 6.2 UI treatment

For malfunctioning Storyteller-resolved information:

- show a prominent, non-color-only status: **“NIE DZIAŁA — podaj nieprawdziwą informację”** (final localized copy may come from spec 23);
- do not display the truthful computed result as the default value where doing so could cause accidental disclosure;
- show the legal input control needed to supply the false answer;
- require explicit Storyteller confirmation.

For functioning information:

- show the computed/canonical result and normal confirmation path.

### 6.3 Player secrecy

The player receiving the information must not see `functioning`, poison/Drunk reason, or a “false info” marker.

---

## 7. Undertaker

### 7.1 Queue

Add `UNDERTAKER_INFO` to recurring Operational ordering for cycles after an Investigation in which an execution result exists.

Do not create the action for:

- first cycle before any execution;
- a day with no execution;
- Traveller exile;
- deaths that are not executions.

### 7.2 Source of truth

Use `DeathRecord` / execution reference from the immediately preceding Investigation cycle.

Do not infer “who was executed” from `alive` changes.

### 7.3 Functioning

Resolve Undertaker functioning at the time the info action is resolved.

If functioning:

- determine the character the executed player may register as for Undertaker information;
- ordinary characters produce deterministic information;
- Recluse/Spy ambiguity uses the bounded registration resolver from spec 18.

If malfunctioning:

- Storyteller must supply false information through the typed UI;
- player is not told they were malfunctioning.

### 7.4 No-execution result

Do not fabricate Undertaker info when nobody was executed. Prefer omitting the action over creating a meaningless “none” secret unless canonical engine docs explicitly require a no-execution notification.

### 7.5 Persistence

Store the delivered info in the Operational action resolution so:

- reconnect/reload shows exactly what was delivered;
- event replay can verify it;
- idempotent command retry does not generate a different answer.

---

## 8. Storyteller action-card state machine

Recommended UI states:

```text
WAITING_FOR_STORYTELLER
  ├─ deterministic functioning info -> REVIEW -> CONFIRM
  ├─ malfunctioning info -> ENTER_FALSE_INFO -> CONFIRM
  ├─ registration ambiguity -> CHOOSE_REGISTRATION -> CONFIRM
  ├─ Mayor redirect -> CHOOSE_REDIRECT/NO_REDIRECT -> CONFIRM
  └─ Imp self-kill -> CHOOSE_SUCCESSOR -> CONFIRM
RESOLVED
```

No branch should require the operator to know or type a player UUID.

---

## 9. API behavior

Use action-specific runtime schemas.

Example response for a pending `IMP_KILL` Storyteller decision:

```json
{
  "kind": "IMP_KILL",
  "originalTarget": {"playerId": "...", "displayName": "..."},
  "mayorRedirect": {
    "available": true,
    "eligibleTargets": [{"playerId": "...", "displayName": "..."}]
  },
  "starPass": {
    "required": false,
    "eligibleSuccessors": []
  }
}
```

The server must derive this projection; the browser must not reconstruct eligibility from secrets it should not own.

---

## 10. Events and audit

At minimum record:

- Storyteller decision requested (if existing event model needs it);
- `STORYTELLER_DECISION_RECORDED`;
- `DEATH_REDIRECTED`;
- `CHARACTER_CHANGED` for succession;
- private info delivered;
- registration decision event from spec 18.

Event payloads must distinguish `STAR_PASS` from `SCARLET_WOMAN_SUCCESSION`.

---

## 11. Tests

### Unit

- Mayor redirect eligibility only when Mayor functioning;
- poisoned Mayor does not expose redirect;
- redirect target outside game rejected;
- stale/dead/ineligible redirect rejected according to canonical rule;
- self-kill exposes all and only legal living Minion successors;
- arbitrary Townsfolk/Outsider/other-game player cannot become Imp;
- star-pass works with non-Scarlet-Woman Minion;
- Scarlet Woman succession remains independent;
- malfunction flag survives Storyteller projection mapping;
- player projection never contains malfunction flag;
- Undertaker absent after no-execution day;
- Undertaker reports prior executed character;
- Undertaker registration ambiguity invokes bounded resolver;
- poisoned/Drunk Undertaker requires Storyteller false info.

### Integration

- malformed `resolution` JSON receives 400/domain validation error;
- unknown extra shape cannot reach service cast;
- valid Mayor/star-pass commands are idempotent;
- reload during each pending Storyteller choice reconstructs the same legal options.

### E2E

- Imp self-kill with at least two Minions requires explicit successor choice;
- Mayor target presents redirect choice and result is visible cross-client;
- poisoned information role displays malfunction warning to Storyteller only;
- Undertaker receives prior execution information next Operational.

---

## 12. Acceptance criteria

Done means:

- every Storyteller action resolution is runtime-validated;
- Mayor redirect and star-pass are fully operable without raw IDs;
- custom player IDs cannot cross game boundaries;
- star-pass successor is always a validated living eligible Minion;
- Scarlet Woman succession is not used as the generic star-pass default;
- malfunctioning information cannot be accidentally treated as functioning by the Storyteller UI;
- Undertaker works across execution → next Operational, including registration and malfunction cases;
- reconnect/reload preserves unresolved and delivered Storyteller decisions.
