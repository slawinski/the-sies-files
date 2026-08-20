# ADR-001 — Sixteenth Participant as Bureaucrat Traveller

**Status:** Accepted  
**Decision owner:** Product/Game Design  
**Applies to:** Game Engine, setup, Operational actions, voting, UI, victory evaluation  

---

## 1. Context

The application must support 13–16 participants while remaining mechanically grounded in the *Trouble Brewing* script rather than inventing a custom 16-player role distribution.

The standard 15-player setup already uses the maximum normal-player distribution needed by this project. A sixteenth participant therefore needs a mechanism compatible with Blood on the Clocktower's Traveller concept.

The implementation also needs to avoid adding the complexity of arbitrary mid-game Traveller joining/leaving during the MVP.

---

## 2. Decision

For a 16-participant session:

> **15 participants are normal Trouble Brewing players and participant 16 is the Traveller `BUREAUCRAT` (Polish presentation name: `Pełnomocnik`).**

This is the only Traveller supported in MVP.

### 2.1 Public and secret information

- The Bureaucrat character is public.
- The Bureaucrat's alignment is secret and is assigned as `GOOD` or `EVIL` by setup.
- The server is authoritative for the alignment.
- Player-facing projections must not leak the alignment to unauthorized clients.

### 2.2 Operational ability

During each Operational phase in which the Bureaucrat is active, the Bureaucrat chooses **another living player**.

The chosen player's next valid vote during the following Investigation phase counts as **three votes instead of one**.

The Bureaucrat cannot target themself.

The selection is a formal game action and therefore:

- is validated by the backend,
- is submitted once unless the Storyteller explicitly resets it,
- becomes part of the Storyteller resolution queue,
- is preserved in the event log.

The first Operational phase includes the Bureaucrat action.

### 2.3 Voting semantics

The vote multiplier is applied by the server at vote resolution/lock time.

Recommended representation:

```ts
type VoteWeight = {
  rawVotesSpent: 0 | 1;
  effectiveVotes: number;
  modifiers: Array<'BUREAUCRAT_X3'>;
};
```

A Bureaucrat-modified vote:

- still consumes only the voter's normal opportunity to vote,
- counts as three toward the nomination total,
- is visible in the authoritative vote result,
- must be auditable in the event log.

Do not implement this as three separate client-side vote submissions.

---

## 3. Exile

The Traveller is removed through a Traveller-specific **exile** operation rather than the normal execution pipeline.

Exile is deliberately modeled separately because it must not trigger rules that specifically depend on execution.

At minimum, exile:

- deactivates the Traveller's ability,
- prevents future Bureaucrat target selection,
- removes the Traveller from relevant active-player calculations,
- does **not** count as an execution,
- does **not** trigger Saint loss logic,
- does **not** create an Undertaker execution result,
- does **not** create a normal dead-player ghost-vote entitlement.

The participant may remain socially present in the physical game; exile is a game-state concept.

---

## 4. Victory and Count Semantics

The Traveller must not distort normal-player rules that rely on population counts.

Therefore:

- normal Trouble Brewing setup counts exclude the Traveller,
- the Mayor's "exactly three living players" check concerns normal players, not an active Traveller,
- generic victory checks must use explicit predicates such as `isNormalPlayer` rather than blindly counting every participant record.

The Bureaucrat's secret alignment matters when determining which side the Traveller personally wins with, but it must not replace the normal game-ending conditions.

---

## 5. Setup Contract

Canonical participant distributions:

| Total participants | Townsfolk | Outsiders | Minions | Demon | Traveller |
|---:|---:|---:|---:|---:|---:|
| 13 | 9 | 0 | 3 | 1 | 0 |
| 14 | 9 | 1 | 3 | 1 | 0 |
| 15 | 9 | 2 | 3 | 1 | 0 |
| 16 | 9 | 2 | 3 | 1 | 1 Bureaucrat |

Baron setup modification continues to apply to the **15 normal players** in a 16-person game.

---

## 6. Alternatives Rejected

### A. Invent a custom 16-player normal-role distribution

Rejected because it creates a new balance problem and moves the project away from its Trouble Brewing foundation.

### B. Support a catalogue of Travellers in MVP

Rejected because the product only needs one deterministic answer for participant 16. Additional Traveller abilities create unnecessary rules, UI, and testing surface.

### C. Allow Traveller late join / early leave in MVP

Rejected because it complicates setup commitment, projections, voting eligibility, victory counts, and recovery without being required for the planned event format.

### D. Treat exile as execution

Rejected because it would incorrectly interact with role abilities whose rules explicitly care about execution.

---

## 7. Consequences by Slice

### Slice 1

- participant model distinguishes normal player vs Traveller,
- Virtual Circle can include the Traveller as a participant without changing the 15-player normal-role distribution.

### Slice 2

- 16-player setup assigns the Bureaucrat separately,
- Traveller character is public,
- alignment remains secret,
- first Operational phase solicits the Bureaucrat target.

### Slice 3

- Bureaucrat target is a formal Operational action,
- action lifecycle and Storyteller resolution apply normally.

### Slice 4

- vote resolver applies `×3` effective weight,
- exile is a separate command/event path,
- victory/population calculations explicitly exclude Traveller where required.

### Slice 6

- Storyteller can inspect Bureaucrat target, alignment, vote modifier, and exile state,
- recovery can reset/reapply the action without corrupting vote history.

---

## 8. Acceptance Criteria

- [ ] A 16-person session contains exactly 15 normal Trouble Brewing roles plus one Bureaucrat Traveller.
- [ ] The Bureaucrat character is public while alignment remains secret.
- [ ] The Bureaucrat can choose another eligible player during Operational.
- [ ] The selected player's next valid vote resolves as 3 effective votes and 1 raw vote spent.
- [ ] The multiplier is calculated server-side and is auditable.
- [ ] Exile is not represented as execution.
- [ ] Exile cannot trigger execution-specific role effects.
- [ ] Traveller participation does not break normal-player victory/count semantics.
- [ ] No other Traveller character or dynamic Traveller lifecycle is required for MVP.
