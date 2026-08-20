# The Sieś Files — Canonical Documentation Set

**Status:** Source of truth for MVP implementation  
**Version:** 1.0  
**Date:** 2026-08-20  
**Language:** English  
**Product:** mobile-first PWA supporting a physical social-deduction game in Sieśki, Poland

## 1. Purpose

This directory is the canonical implementation documentation for **The Sieś Files**. It consolidates the previously agreed game-engine specification, MVP planning, technical architecture, six vertical implementation slices, visual direction, map constraints, and the final Traveller decision.

The intended standard is deliberately high: an implementation team or coding LLM should be able to build the MVP from these documents **without requiring additional product decisions**.

Where exact narrative copy, final illustrations, QR print files, or the final map artwork do not yet exist, the implementation must treat them as **versioned content assets/configuration**, not as missing product requirements.

## 2. Source-of-truth hierarchy

If two documents appear to conflict, use this precedence order:

1. `13_ADR_001_TRAVELLER_BUREAUCRAT.md` for the 16th-player Traveller decision.
2. `01_GAME_ENGINE_SPECIFICATION_v1.md` for game rules and invariant behavior.
3. `03_MVP_TECHNICAL_SPECIFICATION_v1.md` for technical contracts and architecture.
4. Slice specifications `04`–`09` for implementation sequencing and slice-local acceptance criteria.
5. `11_VISUAL_DESIGN_SYSTEM.md` and `12_MAP_ASSET_SPECIFICATION.md` for presentation rules.
6. `02_MVP_IMPLEMENTATION_BLUEPRINT_v1.md` and `10_IMPLEMENTATION_ROADMAP.md` for build order and planning.
7. `14_ACCEPTANCE_TRACEABILITY_MATRIX.md` for cross-document verification.

Earlier chat drafts are superseded by this documentation set.

## 3. Canonical product decisions

The following are hard constraints:

- The social-deduction ruleset is **Blood on the Clocktower: Trouble Brewing**, reskinned for The Sieś Files rather than redesigned into a new ruleset.
- Supported participation is **13–16 people**.
- For 13–15 players, all are normal Trouble Brewing players.
- For 16 players, the game contains **15 normal Trouble Brewing characters + one Traveller**, implemented as the public **Pełnomocnik / Bureaucrat** with secretly assigned GOOD or EVIL alignment.
- There are exactly **two global game phases**: `OPERATIONAL` and `INVESTIGATION`.
- Nominations, voting, execution, Traveller exile, public discussion, terrain activity, and day abilities occur inside `INVESTIGATION`; there is no third global “council” phase.
- Physical seating has no mechanical meaning. The app owns one stable **Virtual Circle / virtual grimoire order** used for adjacency and all order-dependent rules.
- The Virtual Circle becomes immutable once setup is committed.
- The backend is authoritative for game state, secrets, legality checks, randomization, and resolution.
- Storyteller remains a human operator and always has an auditable manual override/recovery path.
- Player-facing projections are generated server-side; the client must never receive hidden state merely to hide it in the UI.
- Formal game processes use strong consistency. Terrain/scenario updates may use soft realtime but still persist authoritatively.
- Social deduction and terrain/scenario progression are separate systems. Terrain does **not** determine the winner of the Trouble Brewing game.
- Terrain is available during `INVESTIGATION`, except while nominations are open. It is disabled during `OPERATIONAL`.
- The map begins as a visually complete right-side map. The left-side path/stream/hermitage area must not be hinted at, fogged, greyed out, or shown as locked. After the scenario unlock, the map expands/replaces itself to reveal that area.
- Visual direction is **Wiejski neo-noir / Rural Neo-Noir + Bento Grid**.
- The currently supplied map is a **reference asset only** and is explicitly not final production artwork.

## 4. Technical baseline

The canonical MVP stack is:

- Next.js (App Router), mobile-first PWA
- TypeScript with `strict: true`
- PostgreSQL
- Prisma ORM
- Zod validation at command/API boundaries
- server-authoritative command handlers
- append-only domain event log + materialized current state
- SSE for realtime projections and reconnect
- Vitest for unit/integration tests
- Playwright for end-to-end tests

A different internal library may be substituted only if it preserves all public contracts and invariants documented here. Do not split the MVP into microservices.

## 5. Directory contents

| File | Purpose |
|---|---|
| `01_GAME_ENGINE_SPECIFICATION_v1.md` | Canonical game rules and domain invariants |
| `02_MVP_IMPLEMENTATION_BLUEPRINT_v1.md` | Product/engineering decomposition and architecture plan |
| `03_MVP_TECHNICAL_SPECIFICATION_v1.md` | Concrete technical contracts, data model, APIs, events, security, tests |
| `04_SLICE_1_SESSION_ROSTER_GRIMOIRE.md` | Session, roster, player claim, virtual grimoire |
| `05_SLICE_2_SETUP_ROLE_DELIVERY_FIRST_OPERATIONAL.md` | Trouble Brewing setup, private roles, first Operational phase |
| `06_SLICE_3_FULL_OPERATIONAL_ENGINE.md` | Recurring Operational engine and resolution queue |
| `07_SLICE_4_INVESTIGATION_VOTING_EXECUTION_VICTORY.md` | Investigation, nominations, voting, execution, victory |
| `08_SLICE_5_SCENARIO_ENGINE.md` | QR, clues, tasks, map unlocks, scenario progression |
| `09_SLICE_6_CONTROL_PLANE_RECOVERY_RESILIENCE.md` | Storyteller control plane, checkpoints, recovery, resilience |
| `10_IMPLEMENTATION_ROADMAP.md` | Milestone order and TODO list, intentionally without dates |
| `11_VISUAL_DESIGN_SYSTEM.md` | Rural Neo-Noir + Bento Grid design system |
| `12_MAP_ASSET_SPECIFICATION.md` | Production requirements for the map asset |
| `13_ADR_001_TRAVELLER_BUREAUCRAT.md` | Final decision for player 16 / Traveller |
| `14_ACCEPTANCE_TRACEABILITY_MATRIX.md` | Requirement-to-slice verification matrix |
| `15_LLM_IMPLEMENTATION_HANDOFF.md` | Rules for using this documentation as an autonomous implementation brief |
| `assets/map-reference.png` | Non-final map reference supplied on 2026-08-20 |

## 6. Definition of “implementation complete”

The MVP is complete only when:

1. all Slice 1–6 acceptance criteria pass;
2. all engine invariants have automated tests;
3. a 13-player, 15-player, and 16-player happy path can be run end-to-end;
4. refresh/reconnect does not leak secrets or corrupt formal game state;
5. Storyteller can recover after backend restart and client reconnect;
6. the map unlock behaves exactly as specified without previewing the hidden extension;
7. the UI adheres to the visual design system on representative mobile widths;
8. a fresh environment can be created from migrations + seed/config without manual database edits.

## 7. Explicitly deferred beyond MVP

Unless a later ADR changes the scope, the MVP does not include:

- a generic Blood on the Clocktower platform;
- arbitrary custom scripts or arbitrary Traveller libraries;
- multiple simultaneous Storytellers;
- dynamic Traveller join/leave during an active game;
- spectators;
- advanced offline command processing;
- multi-session public matchmaking;
- push notifications as a dependency for core gameplay;
- a visual map editor;
- a scenario authoring CMS;
- automated AI Storyteller decisions;
- a full production analytics/observability product suite.
