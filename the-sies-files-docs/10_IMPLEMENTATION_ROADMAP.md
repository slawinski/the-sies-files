# The Sieś Files — Implementation Roadmap

**Status:** Canonical execution order  
**Scheduling:** intentionally no dates or estimates

## How to use this roadmap

Implement milestones in order. Do not start a later slice by bypassing failing acceptance criteria from an earlier one. A milestone is complete only when its vertical demo, migrations, projections and automated tests work.

## Milestone 0 — Repository and engineering guardrails

- [ ] Create Next.js + TypeScript strict project.
- [ ] Configure PostgreSQL + Prisma migrations.
- [ ] Add Zod request validation.
- [ ] Add Vitest and Playwright.
- [ ] Add lint/typecheck/test CI.
- [ ] Establish module boundaries from the technical spec.
- [ ] Add injectable Clock, RNG and ID generators.
- [ ] Add command envelope/idempotency utility.
- [ ] Add `DomainEvent` persistence and game-version transaction helper.
- [ ] Add server-side projection pattern.
- [ ] Add mobile PWA shell and base visual tokens.

**Exit gate:** one trivial command mutates a game transactionally, appends an event, increments version and updates an authenticated projection.

## Milestone 1 — Slice 1: Session, roster, claim, Virtual Circle

- [ ] Game creation and Storyteller session.
- [ ] Roster CRUD.
- [ ] 13–16 readiness validation.
- [ ] Virtual Circle reorder.
- [ ] Player claim/session.
- [ ] Public/player/Storyteller role-free projections.
- [ ] SSE invalidation/refetch.
- [ ] Storyteller setup UI.
- [ ] Player waiting UI.
- [ ] Slice 1 unit/integration/E2E tests.

**Exit gate:** complete Slice 1 demo with browser refresh/reconnect.

## Milestone 2 — Slice 2: Setup, role delivery, First Operational

- [ ] Versioned Trouble Brewing catalog.
- [ ] Setup count engine for 13/14/15 normal players.
- [ ] 16th participant Traveller per ADR-001.
- [ ] Baron modifier.
- [ ] Drunk true/perceived role.
- [ ] Fortune Teller red herring.
- [ ] Deterministic setup seed/version/hash.
- [ ] Storyteller review/regenerate/commit.
- [ ] Lock roster and Virtual Circle on commit.
- [ ] Private role reveal/acknowledgement.
- [ ] Evil team knowledge + Demon bluffs.
- [ ] First Operational queue/action contracts.
- [ ] First-cycle information resolver.
- [ ] Transition to Investigation cycle 1.
- [ ] Slice 2 tests.

**Exit gate:** claimed roster reaches first Investigation without manual role distribution.

## Milestone 3 — Slice 3: Full Operational engine

- [ ] Generalize to occurrence-based queue builder.
- [ ] Persist queue/cursor.
- [ ] Central ability-function resolver.
- [ ] Effect lifecycle/expiry.
- [ ] Poisoner.
- [ ] Drunk perceived-role queue behavior.
- [ ] Monk.
- [ ] Imp kill.
- [ ] Soldier immunity.
- [ ] Mayor night redirect.
- [ ] Ravenkeeper trigger.
- [ ] Recluse/Spy registration resolver.
- [ ] Imp self-kill/star-pass.
- [ ] Scarlet Woman succession.
- [ ] Character-change infrastructure.
- [ ] Recurring Operational UI/Storyteller queue.
- [ ] Restart/reconnect queue tests.

**Exit gate:** multiple Operational cycles run with core effects/death interactions.

## Milestone 4 — Slice 4: Investigation, voting and victory

- [ ] Investigation state model.
- [ ] Day action framework + Slayer.
- [ ] Nomination open/close.
- [ ] Nomination per-cycle eligibility.
- [ ] Virgin trigger.
- [ ] Vote-intent model.
- [ ] Vote lock in Virtual Circle order.
- [ ] Ghost vote consumption.
- [ ] Butler constraint.
- [ ] Bureaucrat ×3 effective vote.
- [ ] Candidate threshold/tie behavior.
- [ ] Execution resolver integration.
- [ ] Saint execution win.
- [ ] Undertaker previous-execution reference.
- [ ] Scarlet Woman-before-victory ordering.
- [ ] Mayor no-execution win.
- [ ] Ordinary victory resolver.
- [ ] Traveller exile.
- [ ] End-game UI.
- [ ] Full-game E2E tests.

**Exit gate:** complete Trouble Brewing game playable from creation to winner with scenario disabled.

## Milestone 5 — Slice 5: Scenario Engine

- [ ] Versioned scenario schema.
- [ ] QR token strategy.
- [ ] QR scan endpoint + repeat/idempotency.
- [ ] Terrain availability guard.
- [ ] Clue model + visibility scopes.
- [ ] Task state machine.
- [ ] Scenario-only injury/first-aid.
- [ ] Declarative transition evaluator + loop protection.
- [ ] Base/extended map state IDs.
- [ ] Authoritative map unlock.
- [ ] Evidence/tasks/scanner/map player UI.
- [ ] Storyteller scenario dashboard/overrides.
- [ ] Scenario security/race tests.

**Exit gate:** scenario progression reveals extended map without changing Trouble Brewing state.

## Milestone 6 — Slice 6: Control plane and recovery

- [ ] Durable command receipts/status lookup.
- [ ] Storyteller control overview.
- [ ] Automatic/manual checkpoints.
- [ ] Snapshot checksum validation.
- [ ] State consistency checker.
- [ ] Event replay verification.
- [ ] Player access reset/reclaim.
- [ ] Bounded recovery overrides.
- [ ] Recovery audit UX.
- [ ] SSE connectivity/reconnect states.
- [ ] Restart tests at critical formal states.
- [ ] Backup/restore/deploy runbook.

**Exit gate:** simulated weekend game survives intentional client/server interruptions without DB surgery.

## Milestone 7 — Visual integration and interaction pass

The visual system should be applied progressively from Milestone 0; this is a consistency pass, not a late reskin.

- [x] Apply final Rural Neo-Noir tokens across player/Storyteller shells (incl. contrast pass).
- [x] Verify Bento Grid hierarchy at mobile and Storyteller desktop widths.
- [ ] Replace development map with production base/extended assets when ready (blocked: final artwork pending; swap-in contract + server-side coordinates ready).
- [x] Verify base map has no hidden-area hint.
- [x] Add restrained transitions for role reveal, phase change, clue acquisition and map expansion.
- [x] Accessibility contrast/focus/tap-target audit.
- [ ] Performance check on target phones (blocked: requires physical devices).

**Exit gate:** representative screens are coherent and functional state does not depend on decoration.

## Milestone 8 — Release candidate hardening

- [x] Run all tests from a clean DB (`scripts/verify-clean-db.sh` — 81 tests green).
- [x] Test 13-, 15- and 16-participant fixtures (automated; 16-player Bureaucrat covered in Slice 2 tests).
- [ ] Full manual Storyteller rehearsal (manual — requires the human Storyteller + devices).
- [x] Secret-leak inspection (automated projection tests assert absence of secret fields; manual HTTP payload review still advised).
- [ ] Simulate network loss/backend restart (manual drill — state is PostgreSQL-authoritative by design).
- [ ] Validate PWA install/update (manifest validated programmatically; real-device install is a manual check).
- [x] Validate DB backup/restore (`scripts/backup-restore.sh` verified).
- [ ] Print/test QR tokens using production format (physical — manual).
- [x] Validate all scenario content IDs (release-hardening test).
- [x] Confirm active script/scenario versions are immutable (version-resolution tests; games persist scriptId/version at commit).
- [x] Tag release candidate.

**Exit gate:** every row in `14_ACCEPTANCE_TRACEABILITY_MATRIX.md` passes.

## Do not implement before MVP acceptance

- [ ] Generic custom-script editor.
- [ ] More Travellers.
- [ ] Dynamic Traveller join/leave.
- [ ] Spectator mode.
- [ ] Multiple Storytellers.
- [ ] Offline authoritative commands.
- [ ] GPS/geofencing.
- [ ] AI Storyteller.
- [ ] Scenario CMS.
- [ ] Microservices split.
- [ ] Internationalization (i18n) — user-facing content/copy ships in **Polish** (primary) with **English** optional; the locale/string-externalization framework is a deferred post-MVP pass. Temporary hard-coded English UI strings are acceptable placeholders until then. Code, comments and documentation remain English.
