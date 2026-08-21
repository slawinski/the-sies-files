# The Sieś Files — Security & Data Durability Specification v1

**Status:** Required remediation  
**Version:** 1.0  
**Audit baseline:** `main@9099836`  
**Closes:** #17, #18, #19, #28, #29  
**Related:** Storyteller recovery in spec 21

---

## 1. Goal

Close the deferred hardening items that can turn otherwise-correct game logic into an unsafe production deployment:

- Content Security Policy;
- authentication/session abuse controls;
- audit-log retention;
- runtime-safe idempotency receipt replay;
- database enforcement of the `ACTIVE => phase != null` invariant.

---

## 2. Content Security Policy

### 2.1 Requirement

Every production HTML response must carry `Content-Security-Policy`.

Keep the existing `nosniff`, referrer, frame and permissions headers.

### 2.2 Policy goals

Production policy must:

- default deny (`default-src 'self'` or stricter);
- restrict scripts to the app's required sources;
- disallow `unsafe-eval` in production;
- keep `object-src 'none'`;
- set `base-uri 'self'`;
- set `frame-ancestors 'none'` (or preserve the existing equivalent frame restriction);
- restrict `connect-src` to same-origin plus explicitly required deployment endpoints; same-origin SSE must work;
- allow only required image/data/blob sources for map/QR camera UX;
- restrict media sources appropriately;
- use `form-action 'self'`.

If Next.js runtime requires inline script allowances, prefer a nonce-based middleware/header approach. A blanket permanent `script-src 'unsafe-inline' 'unsafe-eval'` is not an acceptable production “CSP”.

### 2.3 Environment split

Development may add narrowly scoped allowances required by Next dev/HMR. Production policy must be tested independently.

### 2.4 Tests

Integration test asserts CSP presence and essential directives in production-mode response.

---

## 3. Rate limiting

### 3.1 Actual surfaces

There is no conventional login route. Protect:

- player claim / session establishment;
- Storyteller game creation/session establishment;
- logout (cheap but abuseable state mutation);
- Storyteller recovery;
- any future explicit login/re-auth endpoint.

Token issuance by an authenticated Storyteller does not need the same anonymous limit but should have abuse protection if exposed at scale.

### 3.2 Requirements

Limiter must be server-side and production-safe.

Do not rely solely on a per-process in-memory map if multiple processes/instances are possible.

For this PostgreSQL-centric MVP, a small DB-backed limiter is acceptable and avoids adding Redis solely for this feature.

### 3.3 Keys

Use combinations that limit both distributed guessing and single-token hammering without storing secrets:

- normalized client IP (respect only trusted proxy headers configured by deployment);
- endpoint/action;
- hash of claim/recovery token where appropriate;
- game ID where appropriate.

Never persist raw recovery/claim tokens in limiter logs/tables.

### 3.4 Response

On limit:

- HTTP 429;
- `Retry-After`;
- generic response that does not reveal whether token/game exists.

### 3.5 Configuration

Limits/windows are environment-backed constants with safe defaults and test overrides. Do not scatter magic numbers through routes.

### 3.6 Observability

Count/rate-limit events can be logged with redacted identifiers. Do not append every rejected anonymous request into the game domain event stream.

---

## 4. Durable audit history

### 4.1 Problem

`DomainEvent` currently cascades on `GameSession` deletion. If a hard-delete path is later introduced, it can erase the very audit trail intended for recovery/forensics.

### 4.2 Policy

Production game deletion is **soft delete/archive** by default.

Add a game lifecycle metadata field if/when deletion UI is implemented:

- `archivedAt`;
- optional `deletedAt` only if product semantics require hidden soft deletion.

Do not hard-delete game rows through ordinary app APIs.

### 4.3 Foreign key

Change durable audit relations so an accidental hard delete cannot cascade.

Preferred:

- `DomainEvent -> GameSession` uses `RESTRICT`/`NO ACTION`;
- consider the same policy for `CommandReceipt` and checkpoint data required for forensic/recovery retention.

Ephemeral child data may still cascade if explicitly classified as non-audit.

### 4.4 Purge

If hard purge is ever legally/operationally required, implement a separate operator/offline retention procedure with:

- explicit retention policy;
- export/archive option;
- audit of who initiated purge;
- no ordinary Storyteller UI affordance.

---

## 5. Runtime-validated CommandReceipt replay

### 5.1 Problem

On duplicate command replay the command runner currently casts persisted `resultJson` with `as T`. TypeScript does not validate database JSON.

### 5.2 Contract

Every idempotent command that returns data must provide a runtime result codec/schema.

Example:

```ts
runCommand({
  ...,
  resultSchema: z.object({
    playerId: z.string(),
    ...
  }),
  handler
})
```

On first execution:

- optionally parse handler result before persistence;
- persist validated JSON.

On duplicate execution:

- parse `CommandReceipt.resultJson` through the same schema;
- return parsed value only on success.

### 5.3 Failure

If a stored receipt is incompatible/corrupt:

- do not call the handler again automatically;
- do not cast through;
- return controlled `COMMAND_RECEIPT_INVALID` / 500-class domain diagnostic;
- surface it to Storyteller consistency/control plane;
- log command ID/game ID without leaking secret payloads.

### 5.4 Versioning

If command result schemas can evolve incompatibly, add a `resultSchemaVersion` or command-type discriminator to receipts before such an evolution occurs.

For v1 remediation, route-level schema identity plus tests may be sufficient if all currently stored result shapes are stable.

---

## 6. Database CHECK: active session must have phase

### 6.1 Invariant

Database must enforce:

```text
GameSession.status == ACTIVE  =>  GameSession.phase IS NOT NULL
```

Domain code enforcement remains, but is no longer the sole guard.

### 6.2 Migration

Add a forward migration with an explicit PostgreSQL CHECK, conceptually:

```sql
ALTER TABLE "game_sessions"
ADD CONSTRAINT "game_sessions_active_requires_phase"
CHECK ("status" <> 'ACTIVE' OR "phase" IS NOT NULL);
```

Use exact generated table/enum names from the current schema.

### 6.3 Preflight

Before applying to an existing environment:

```sql
SELECT id
FROM game_sessions
WHERE status = 'ACTIVE' AND phase IS NULL;
```

Migration/release process must fail and require repair if invalid rows exist. Do not silently guess a phase.

### 6.4 Test

A DB-level integration test attempts an invalid direct write and proves PostgreSQL rejects it.

---

## 7. Additional typed-boundary rule

The audit also found Storyteller action resolution accepting `z.unknown()` and casting. That specific endpoint is remediated in spec 19, but establish the general security rule here:

> External JSON is never trusted solely because a TypeScript type assertion exists.

Every route boundary that affects secret/game state must runtime-parse its complete payload.

---

## 8. Migration strategy

Recommended order:

1. add/check runtime schemas and tests;
2. add DB invariant migration;
3. change audit FK retention behavior in a dedicated migration;
4. add rate-limit storage if DB-backed;
5. add CSP after camera/SSE source requirements are known, but before production release.

Migrations are forward-only; do not edit already-applied migration files.

---

## 9. Security tests

- CSP present in production response;
- no `unsafe-eval` production directive;
- same-origin SSE still connects under CSP;
- player claim exceeds limit → 429 + Retry-After;
- recovery secret exceeds limit → 429;
- rate-limit keys do not store raw token;
- direct game hard delete is rejected while durable audit exists;
- soft archive preserves events;
- corrupt receipt fails closed without re-running mutation;
- DB rejects `ACTIVE` with null phase;
- malformed Storyteller resolution fails runtime parsing (cross-spec regression).

---

## 10. Acceptance criteria

Done means:

- CSP is emitted and production-tested;
- anonymous/session-establishing auth surfaces are rate-limited with shared production-safe state;
- normal application behavior cannot cascade-delete the event audit history;
- command replay returns only runtime-validated receipt data;
- corrupted receipt cannot silently become a typed result;
- PostgreSQL itself enforces `ACTIVE => phase != null`;
- security controls do not leak raw tokens or secret game data.
