# The Sieś Files — MVP Technical Specification v1

**Status:** Implementation-ready / canonical  
**Version:** 1.0  
**Date:** 2026-08-20  
**Client:** mobile-first PWA  
**Ruleset:** Trouble Brewing  
**Participants:** 13–16  
**Operator:** one human Storyteller

---

## 1. Scope

This document translates the Game Engine Specification into concrete implementation contracts.

MVP supports one game session record, 13–15 normal Trouble Brewing players, optional 16th Bureaucrat Traveller, setup/private role delivery, first and recurring Operational phases, Investigation/nominations/voting/execution/victory, QR/clue/task/map scenario layer, Storyteller recovery/checkpoints/overrides, and refresh/reconnect-safe player sessions.

## 2. Canonical stack

- Next.js App Router
- TypeScript `strict: true`
- PostgreSQL
- Prisma
- Zod
- SSE
- Vitest
- Playwright
- PWA manifest + service-worker/app-shell caching

Client local storage is never the source of truth for game state.

## 3. Architecture

```text
HTTP / UI
   ↓
Application Commands + Queries
   ↓
Domain Engine
   ↓
Repositories / Transaction Boundary
   ↓
PostgreSQL
```

After commit:

```text
DomainEvent → SSE publisher / projection invalidation / audit view
```

Minimum modules:

`session`, `auth`, `players`, `grimoire`, `script`, `setup`, `roles`, `operational`, `effects`, `death`, `investigation`, `nomination`, `voting`, `victory`, `traveller`, `scenario`, `projection`, `events`, `recovery`.

Role modules must not depend directly on Prisma/UI.

## 4. IDs and versions

Use opaque UUIDs. Every `GameSession` has monotonic `version`. Formal commands include `expectedVersion`.

```ts
interface CommandEnvelope<T> {
  commandId: string;
  gameId: string;
  expectedVersion: number;
  payload: T;
}
```

## 5. Logical persistence model

Exact Prisma naming may differ; semantics may not.

### `GameSession`
`id`, `name`, `status`, `phase?`, `cycleNumber`, `version`, `scriptId`, `scriptVersion`, `scenarioId?`, `scenarioVersion?`, timestamps, `winner?`, `winReason?`.

### `Player`
`id`, `gameId`, `displayName`, `virtualSeat`, `participantKind=NORMAL|TRAVELLER`, `alive`, `ghostVoteAvailable`, timestamps. Unique `(gameId, virtualSeat)`.

### `PlayerSecret`
`playerId`, `trueCharacterId?`, `perceivedCharacterId?`, `trueAlignment?`, `abilityStateJson`.

### `PlayerClaim`
`id`, `playerId`, `tokenHash`, `expiresAt`, `claimedAt?`, `revokedAt?`.

### `BrowserSession`
`id`, `playerId?`, `storytellerGameId?`, `sessionTokenHash`, timestamps, `revokedAt?`.

### `SetupDraft`
`gameId`, `generatorVersion`, secret seed material, `candidateJson`, `regenerationIndex`, `committedAt?`, `setupHash?`.

### `OperationalPhase`
`id`, `gameId`, `cycleNumber`, `status`, timestamps.

### `OperationalAction`
`id`, `operationalPhaseId`, `orderIndex`, `kind`, `actorPlayerId?`, `status`, public metadata, secret payload, resolution, timestamps.

### `Effect`
`id`, `gameId`, `effectType`, `sourcePlayerId?`, `targetPlayerId`, start/expiry boundary, `active`, metadata.

### `DeathRecord`
`id`, `gameId`, `playerId`, `cycleNumber`, `phase`, `source`, `causedByPlayerId?`, `executed`, timestamp.

### `InvestigationState`
`gameId`, `cycleNumber`, `nominationState`, current execution candidate/high vote, `executionOccurred`, timestamps.

### `Nomination`
`id`, `gameId`, `cycleNumber`, nominator, nominee, status, sequence, raw/effective total, qualification flag, timestamps.

### `Vote`
`id`, `nominationId`, `playerId`, `rawIntent`, `valid`, `effectiveWeight`, `ghostVoteConsumed`, `invalidReason?`, `lockedAt`. Unique `(nominationId, playerId)`.

### `ScenarioState`
`gameId`, `scenarioId`, `scenarioVersion`, `stageId`, `mapVersionId`, `stateJson`.

### `ScenarioDiscovery`
`id`, `gameId`, `playerId?`, `objectId`, `objectType`, `discoveredAt`, `sourceQrId?`, `visibilityScope`, content snapshot/reference.

### `QrScan`
`id`, `gameId`, `playerId`, `qrTokenId`, `commandId`, outcome, timestamp.

### `DomainEvent`
`id`, `gameId`, `sequence`, `gameVersion`, `eventType`, actor, `commandId?`, `payloadJson`, timestamp. Unique `(gameId, sequence)`.

### `Checkpoint`
`id`, `gameId`, `gameVersion`, `lastEventSequence`, `snapshotJson`, `checksum`, timestamp, reason.

## 6. ScriptDefinition

```ts
interface ScriptDefinition {
  id: 'TROUBLE_BREWING';
  version: 1;
  characters: CharacterDefinition[];
  setupRules: SetupRuleSet;
  firstOperationalOrder: OperationalStepTemplate[];
  otherOperationalOrder: OperationalStepTemplate[];
  victoryRules: VictoryRuleDefinition[];
}
```

A game persists its exact script version.

## 7. ScenarioDefinition

```ts
interface ScenarioDefinition {
  id: string;
  version: number;
  stages: ScenarioStageDefinition[];
  qrTokens: QrTokenDefinition[];
  clues: ClueDefinition[];
  tasks: TaskDefinition[];
  mapVersions: MapVersionDefinition[];
  transitions: ScenarioTransitionDefinition[];
}
```

Active-game scenario definitions are immutable by version.

## 8. API convention

Prefix `/api/v1`.

Queries:

```text
GET /api/v1/games/:gameId/public
GET /api/v1/games/:gameId/me
GET /api/v1/games/:gameId/storyteller
GET /api/v1/games/:gameId/events/stream
GET /api/v1/games/:gameId/storyteller/audit
```

Representative commands:

```text
POST /api/v1/games
POST /api/v1/games/:id/players
POST /api/v1/games/:id/setup/generate
POST /api/v1/games/:id/setup/commit
POST /api/v1/games/:id/role-reveal/ack
POST /api/v1/games/:id/operational/start
POST /api/v1/games/:id/operational/actions/:actionId/submit
POST /api/v1/games/:id/storyteller/actions/:actionId/resolve
POST /api/v1/games/:id/investigation/nominations/open
POST /api/v1/games/:id/nominations
POST /api/v1/games/:id/nominations/:nominationId/votes/intent
POST /api/v1/games/:id/nominations/:nominationId/votes/lock
POST /api/v1/games/:id/investigation/resolve-execution
POST /api/v1/games/:id/investigation/close
POST /api/v1/games/:id/traveller/exile
POST /api/v1/games/:id/scenario/qr/scan
POST /api/v1/games/:id/storyteller/checkpoints
POST /api/v1/games/:id/storyteller/recovery/override
```

Formal mutations carry `commandId` and `expectedVersion`. Soft scenario ingestion remains idempotent.

## 9. Typed domain errors

At minimum:

```ts
type DomainErrorCode =
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'GAME_NOT_FOUND'
  | 'INVALID_SESSION_STATE' | 'INVALID_PHASE' | 'VERSION_CONFLICT'
  | 'DUPLICATE_COMMAND' | 'ROSTER_SIZE_INVALID' | 'VIRTUAL_CIRCLE_LOCKED'
  | 'SETUP_NOT_COMMITTED' | 'ACTION_NOT_ACTIVE' | 'INVALID_TARGET'
  | 'ABILITY_SPENT' | 'PLAYER_DEAD' | 'PLAYER_ALREADY_NOMINATED_TODAY'
  | 'VOTE_LOCKED' | 'GHOST_VOTE_ALREADY_USED' | 'BUTLER_MASTER_NOT_VOTING'
  | 'TERRAIN_UNAVAILABLE' | 'QR_UNKNOWN' | 'QR_NOT_ACTIVE'
  | 'QR_ALREADY_CONSUMED' | 'RECOVERY_CHECK_FAILED';
```

UI maps codes to localized copy.

## 10. Event families

### Session/roster
`GAME_CREATED`, `PLAYER_ADDED`, `PLAYER_UPDATED`, `PLAYER_REMOVED`, `VIRTUAL_CIRCLE_REORDERED`, `PLAYER_CLAIMED`.

### Setup/roles
`SETUP_GENERATED`, `SETUP_COMMITTED`, `ROLE_REVEALED_TO_PLAYER`, `TRAVELLER_ALIGNMENT_ASSIGNED`.

### Operational
`OPERATIONAL_STARTED`, `ACTION_QUEUE_BUILT`, `PLAYER_ACTION_SUBMITTED`, `STORYTELLER_DECISION_RECORDED`, `EFFECT_APPLIED`, `EFFECT_EXPIRED`, `DEATH_ATTEMPTED`, `PLAYER_DIED`, `CHARACTER_CHANGED`, `OPERATIONAL_COMPLETED`.

### Investigation
`INVESTIGATION_STARTED`, `NOMINATIONS_OPENED`, `NOMINATION_CREATED`, `DAY_ABILITY_USED`, `VOTE_INTENT_RECORDED`, `VOTE_LOCKED`, `NOMINATION_RESOLVED`, `PLAYER_EXECUTED`, `TRAVELLER_EXILED`, `NOMINATIONS_CLOSED`, `INVESTIGATION_COMPLETED`, `GAME_ENDED`.

### Scenario
`QR_SCANNED`, `CLUE_DISCOVERED`, `TASK_STARTED`, `TASK_COMPLETED`, `SCENARIO_STAGE_CHANGED`, `MAP_UNLOCKED`, `SCENARIO_CONDITION_APPLIED`, `SCENARIO_CONDITION_CLEARED`.

### Recovery
`CHECKPOINT_CREATED`, `RECOVERY_STARTED`, `RECOVERY_VALIDATED`, `RECOVERY_OVERRIDE_APPLIED`, `RECOVERY_COMPLETED`.

## 11. Projection contracts

### Public
May include session name, phase/cycle, public roster in Virtual Circle order, alive/dead state, public Traveller character, public nomination/vote state, globally unlocked map version and public scenario notices. No secret roles/alignments/effects.

### Player
Adds only own perceived role, own active action, private information already delivered, own clue/task inventory, own scenario conditions, own vote controls/eligibility and ghost-vote state. The Drunk DTO never contains a hidden `isDrunk` signal.

### Storyteller
Contains all true/perceived roles, alignments, effects, pending decisions, registration choices, full grimoire, queue, nominations/votes raw/effective, scenario state and audit/checkpoint health.

## 12. Operational action engine

Queue builder takes immutable script version, cycle, current characters, alive/dead state, ability state, effects and triggers. Output is persisted and deterministic for the same authoritative state.

Player action submission does not imply effect success; Storyteller resolution may still be required.

Central ability state:

```ts
type AbilityFunctionState = 'FUNCTIONING' | 'MALFUNCTIONING';
```

Poison/Drunk behavior must route through this shared concept.

## 13. Death and role change

All deaths use one resolver:

```ts
resolveDeathAttempt(input): DeathResolution
```

It evaluates source, protection, immunity, redirect, triggers, succession and resulting victory checks. Character modules never directly set `alive=false`.

Role change preserves player identity/seat/history and emits explicit events.

## 14. Nomination/voting

Nomination lifecycle:

```text
CREATED → DAY_TRIGGER_RESOLUTION → VOTING → LOCKED → RESOLVED
```

Vote intention is locked against one authoritative snapshot. Persist raw/effective contributions. Dead normal players have one ghost vote until a valid locked vote consumes it. Butler validity and Bureaucrat weight are server-side.

## 15. Traveller

See ADR-001. Public Bureaucrat has secret alignment and per-cycle selected boosted voter. Valid raw vote becomes effective weight 3. Exile is distinct from execution.

## 16. Scenario contract

Scenario transitions are declarative conditions/actions, not page-component logic. Example:

```ts
{
  id: 'unlock-annex-13b',
  when: { allOf: ['clue-a-found', 'task-b-complete'] },
  actions: [
    { type: 'SET_STAGE', stageId: 'annex-13b' },
    { type: 'SET_MAP_VERSION', mapVersionId: 'extended-left-area' }
  ]
}
```

## 17. PWA/offline boundary

MVP supports installable shell, cached static assets, reconnect, and safe display of the latest fetched projection. It does **not** support authoritative offline mutations. Actions, votes, QR submissions and Storyteller commands require server acknowledgement.

Never cache secret API responses in a shared service-worker cache.

## 18. Observability

Minimum: structured server logs with `gameId`, `commandId`, event sequence/error code; health endpoint; Storyteller connectivity status; audit timeline; recovery consistency/checksum reporting.

Never log raw claim/session tokens, full hidden projections or setup seed.

## 19. Security tests

Automated tests assert player A cannot fetch player B secrets; public projection contains no hidden roles; Drunk truth is absent from player projection; Traveller alignment is not public; expired/replayed claims fail; stale commands cannot overwrite formal state; event stream is membership-scoped.

## 20. Technical Definition of Done

A feature is not done until migration/domain code/validation/authorization/events/projections/error UI/tests/reconnect handling all exist.

## 21. MVP non-goals

- generic BotC platform;
- arbitrary custom roles/scripts;
- offline voting/QR acceptance;
- dynamic Traveller join/leave;
- Voudon/Bone Collector or other Travellers;
- multiple Storytellers;
- multi-region distributed consistency;
- final artwork generation at runtime.
