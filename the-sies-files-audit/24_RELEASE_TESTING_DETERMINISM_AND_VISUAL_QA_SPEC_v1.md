# The Sieś Files — Release Testing, Determinism & Visual QA Specification v1

**Status:** Required release-hardening remediation  
**Version:** 1.0  
**Audit baseline:** `main@9099836`  
**Closes:** #16, #25, #27, #31  
**Depends on:** remediation specs 18–23

---

## 1. Goal

Turn the current “implemented slices” repository into a reproducible release gate:

- E2E runs from a clean environment and covers the full event-critical paths;
- Playwright configuration is machine-independent;
- deterministic setup randomness preserves far more state than 32 bits and remains backward compatible;
- user-facing meta typography conforms to the 13–14px visual guidance.

---

## 2. Portable Playwright database configuration

### 2.1 Remove local identity

`playwright.config.ts` must not contain a developer-specific PostgreSQL username/database URL.

Use:

```text
E2E_DATABASE_URL
```

as the explicit test database source.

A local fallback is allowed only if it is generic and clearly test-only.

### 2.2 Safety guard

Before reset/seed/destructive E2E setup:

- parse DB URL;
- reject known production environment;
- require database name to contain an explicit test marker (e.g. `_test`) or require `ALLOW_E2E_DB_RESET=1`;
- never run reset against `DATABASE_URL` accidentally because `E2E_DATABASE_URL` is missing in CI.

### 2.3 Web server

Pass the E2E database into the spawned Next server explicitly. Keep `reuseExistingServer` disabled in CI and configurable locally.

### 2.4 Scripts

Provide predictable commands, for example:

```text
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:reset
```

Exact names may follow current package conventions.

---

## 3. Playwright installation/execution gate

The static repository proves only that the full suite is absent; it cannot prove whether a developer once installed/runs browsers locally.

Make the history irrelevant by adding a reproducible gate:

- CI/clean-machine installs dependencies;
- installs Chromium with required system dependencies;
- migrates an empty test PostgreSQL database;
- seeds deterministic fixtures;
- runs E2E;
- uploads trace/screenshot/video only on failure or according to project preference.

If GitHub Actions is not the deployment CI, implement the equivalent pipeline in the actual CI; the repo must still document the command.

---

## 4. Eight required full-game E2E scenarios

Create named specs/fixtures that cover exactly these release-critical stories.

### E2E-01 — 13-player complete fixture

Covers:

- create game;
- roster/setup;
- claim representative players;
- role reveal/ack;
- at least one Operational + Investigation;
- nomination/vote/execution;
- game end through an ordinary path.

### E2E-02 — 15-player complete fixture

Same lifecycle at 15 players with composition/ordering differences and at least one poison/Drunk information path.

### E2E-03 — 16-player Traveller/Bureaucrat fixture

Covers:

- public Bureaucrat;
- secret Traveller alignment;
- target validation;
- double-vote weighting;
- exile behavior;
- no Traveller ghost vote.

### E2E-04 — Demon succession

Cover both relevant succession classes in targeted flows:

- Imp self-kill/star-pass to a legal Minion;
- Scarlet Woman succession when its separate conditions apply.

A direct invalid successor API request must also be rejected in integration tests.

### E2E-05 — Saint execution

Execute Saint under the conditions that produce the evil victory and verify:

- authoritative game result;
- player/ST terminal projection after reload.

### E2E-06 — Mayor ending

Reach the three-alive/no-execution Mayor win condition and verify persistent good result.

Also exercise Mayor night redirect in a focused flow if not already covered in E2E-02/04.

### E2E-07 — scenario QR / map unlock

Covers:

- player camera decoder adapter emits valid QR token;
- clue/task progression;
- unlock transition;
- `MAP_BASE -> MAP_EXTENDED`;
- second client sees unlock over SSE.

No physical camera dependency in CI.

### E2E-08 — restart recovery

During a formal active process (prefer vote pass or Operational action):

1. create automatic checkpoint at prior safe boundary;
2. advance state;
3. restart the app server/process;
4. reconnect clients;
5. run consistency/replay verification;
6. resume or use documented recovery;
7. complete process with no duplicate event/command.

This is the proof that no essential active state lives only in browser memory.

---

## 5. Supporting E2E fixture architecture

### 5.1 Deterministic fixture builder

Provide helpers for 13/15/16-player rosters and fixed setup seeds/generator versions.

Tests should not depend on random assignment luck.

### 5.2 API + browser mix

It is acceptable to use authenticated API helpers for repetitive setup while browser interactions cover the UX under test.

Do not bypass the exact domain command that a scenario is intended to verify.

### 5.3 IDs

Tests discover IDs from responses/projections; no hard-coded production-like UUIDs.

### 5.4 Isolation

Each test owns a game/session namespace or resets DB safely. Parallel execution is enabled only after isolation is proven.

---

## 6. Deterministic RNG v2

### 6.1 Problem

Current setup seeds are 128-bit strings, but the seeded RNG hashes them into a 32-bit xorshift state. That collapses the effective deterministic state space to roughly 2^32.

### 6.2 Requirement

Introduce generator/RNG version 2 with at least 128 bits of effective deterministic state.

Prefer a simple, reviewable counter-based construction using platform cryptography rather than hand-rolling a novel PRNG.

Example design:

```text
seed bytes (128+ bits)
+ monotonically increasing 64-bit counter
-> HMAC-SHA-256 / SHA-256 block
-> rejection-sampled integers
```

This preserves seed entropy and avoids modulo bias.

### 6.3 API

RNG interface remains deterministic:

```ts
interface SeededRng {
  bytes(n): Uint8Array;
  int(maxExclusive): number;
  shuffle<T>(items: readonly T[]): T[];
}
```

`int` uses rejection sampling; do not use `% max` over an arbitrary block if it creates bias.

### 6.4 Generator version compatibility

This is critical.

- existing `generatorVersion = 1` setups continue to use the legacy xorshift32 implementation;
- new setup drafts use generator version 2;
- committing/replaying an existing v1 draft produces exactly its original arrangement;
- never silently rerun a stored seed under v2.

Keep v1 code as compatibility code until no persisted/replayable v1 setups exist under retention policy.

### 6.5 Test vectors

Commit stable test vectors:

- known seed → first N integers;
- known seed → known player/role arrangement;
- same seed/version is stable across process restarts;
- v1 vectors remain unchanged;
- v1 and v2 deliberately differ for at least one vector.

---

## 7. Meta typography sweep

### 7.1 Rule

User-facing meta text follows the established visual spec:

- **13–14px**;
- critical body text remains at least 16px where specified.

Tailwind `text-xs` commonly resolves to 12px and must not be the default metadata token.

### 7.2 Token

Define one semantic utility/token, e.g.:

```css
.text-meta {
  font-size: 0.8125rem; /* 13px */
  line-height: 1.25rem;
}
```

or the equivalent Tailwind theme token.

Do not fix the audit by scattered arbitrary `[13px]` values.

### 7.3 Sweep

Inspect:

- Storyteller header/meta labels;
- player header/meta labels;
- bento/card eyebrow labels;
- timestamps;
- audit timeline metadata;
- realtime state;
- map/scanner helper text;
- role/scenario metadata.

Decorative microcopy can be exempt only when explicitly justified and still accessible.

### 7.4 Accessibility

Font-size change must preserve:

- WCAG contrast already achieved;
- browser zoom;
- no clipped text at 200% zoom;
- Polish diacritics/long labels.

---

## 8. Test layers / release command

Recommended release gate order:

1. format/lint;
2. TypeScript;
3. unit;
4. integration/database;
5. migration from empty DB;
6. migration/preflight against representative existing DB fixture;
7. E2E Chromium;
8. production build;
9. optional bundle/security header checks.

Expose one command/documented CI job such as `npm run verify:release` that orchestrates or clearly references these steps.

---

## 9. CI failure artifacts

On E2E failure retain enough evidence to debug:

- Playwright trace;
- screenshot;
- server logs with secrets redacted;
- test name/seed/generator version;
- game ID if using isolated ephemeral DB.

Never archive raw claim/recovery/session tokens.

---

## 10. Acceptance criteria

Done means:

- Playwright config contains no developer-specific DB account;
- E2E can start from a clean test database on another machine/CI;
- browser installation is part of the reproducible pipeline;
- all eight required full-game scenarios pass;
- restart recovery is proven by automated E2E;
- new setup randomness has >=128-bit effective deterministic state;
- v1 saved setups remain reproducible;
- user-facing meta typography uses the 13–14px semantic token across audited surfaces.
