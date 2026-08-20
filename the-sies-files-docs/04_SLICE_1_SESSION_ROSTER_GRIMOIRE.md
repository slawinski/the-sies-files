# The Sieś Files — Slice 1 Implementation Specification

**Status:** Canonical implementation document  
**Version:** 1.0  
**Parent:** MVP Technical Specification v1  
**Scope:** Session + roster + authentication + Virtual Circle / grimoire

## 1. Slice goal

Deliver the complete pre-game multiplayer foundation.

At the end of Slice 1:

- Storyteller can create and reopen a game;
- Storyteller can manage a roster of 13–16 participants;
- Storyteller can order participants in the app-owned Virtual Circle;
- one-time claim links establish player browser sessions;
- refresh/reconnect preserves identity;
- all clients receive correct role-free projections;
- state is persisted transactionally.

No Trouble Brewing character is assigned yet.

## 2. Demonstration flow

```text
Storyteller creates “The Sieś Files — 2026”
→ adds 13–16 participants
→ orders Virtual Circle
→ app generates one claim link per player
→ each participant claims identity
→ all participants see consistent public roster
→ Storyteller edits pre-lock name/order
→ clients update
→ player closes browser and returns
→ same identity is restored
```

## 3. In scope

- `GameSession` in `LOBBY` / pre-commit `SETUP` state;
- Storyteller authentication for that game;
- roster create/update/remove while unlocked;
- 13–16 readiness validation;
- contiguous `virtualSeat` values;
- reorder operation;
- one-time player claim tokens;
- browser sessions via secure cookies;
- public/player/Storyteller role-free projections;
- SSE game subscription and refetch pattern;
- base mobile PWA shell;
- event log for all slice mutations.

## 4. Explicitly out of scope

Role assignment, Trouble Brewing setup, Operational phase, death/effects, Investigation/voting, Traveller ability, QR/scenario/map, and advanced recovery checkpoints.

## 5. Domain rules

### 5.1 Roster

- Draft roster may contain 1–16 participants.
- Progressing to setup generation requires exactly 13–16.
- Display names must be non-empty after trim.
- Duplicate display names should be rejected within one game because in-person operation becomes ambiguous.

### 5.2 Virtual Circle

Store seats as contiguous integers `0..N-1`.

Reorder must atomically rewrite affected seats and emit one `VIRTUAL_CIRCLE_REORDERED` containing before/after player-ID order.

After setup commit in Slice 2, all ordinary roster reordering returns `VIRTUAL_CIRCLE_LOCKED`.

### 5.3 Claim tokens

- at least 128 bits entropy;
- store hash only;
- bound to exactly one player;
- first successful claim consumes token and creates browser session;
- reuse rejected;
- Storyteller can revoke/reset later;
- raw token never logged.

### 5.4 Storyteller session

Game creator gets a Storyteller session in an `HttpOnly` cookie. Storyteller routes require that role.

## 6. APIs

```text
POST   /api/v1/games
GET    /api/v1/games/:id/storyteller
POST   /api/v1/games/:id/players
PATCH  /api/v1/games/:id/players/:playerId
DELETE /api/v1/games/:id/players/:playerId
POST   /api/v1/games/:id/players/reorder
POST   /api/v1/games/:id/players/:playerId/claim-token
POST   /api/v1/player-claims/:token/claim
POST   /api/v1/session/logout
GET    /api/v1/games/:id/me
GET    /api/v1/games/:id/public
GET    /api/v1/games/:id/events/stream
```

All mutations use command IDs and expected game version.

## 7. Events

`GAME_CREATED`, `PLAYER_ADDED`, `PLAYER_UPDATED`, `PLAYER_REMOVED`, `VIRTUAL_CIRCLE_REORDERED`, `PLAYER_CLAIM_TOKEN_ISSUED` (without raw token), `PLAYER_CLAIMED`, `PLAYER_SESSION_REVOKED`.

## 8. Projections

### Public/player
May see game name, roster display names, Virtual Circle order and session status. No future role/alignment placeholders.

### Storyteller
Adds claim status and roster/claim controls.

## 9. UI

### Storyteller
Bento setup dashboard with game identity, participant count, reorderable Virtual Circle, per-player claim status/action, and clear “ready for setup” gate.

### Player
After claim: own identity, public roster/Virtual Circle, neutral “waiting for the case to begin” state. No fake role placeholders.

## 10. Realtime

Roster mutations emit SSE invalidation. Connected clients refetch. Missing an SSE event is harmless because refresh reads DB truth.

## 11. Tests

### Unit
Roster-size validator, contiguous reorder, token hashing/verification, projection allow-list.

### Integration
Game creation transaction, duplicate-command idempotency, stale-version conflict, one-time claim behavior, cross-player access denial.

### E2E
Create game → add 13 players → reorder → issue claim → player claims and refreshes → second browser cannot reuse token → Storyteller edit propagates.

## 12. Acceptance criteria

- [ ] Game persists across application refresh/restart.
- [ ] Exactly 13–16 participants are required to proceed.
- [ ] Virtual Circle is contiguous and unambiguous.
- [ ] Player identity survives refresh.
- [ ] Claim is one-time and raw token is not stored.
- [ ] A player cannot access another player's player projection.
- [ ] No role/secret mechanics exist yet.
- [ ] All mutations are event-audited.

## 13. Slice Definition of Done

The complete demo flow works on at least two player browsers plus Storyteller UI without manual database edits.
