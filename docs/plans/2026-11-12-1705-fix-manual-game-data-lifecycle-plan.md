---
title: Manual Game Data Lifecycle - Plan
type: fix
date: 2026-11-12
topic: manual-game-data-lifecycle
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Manual Game Data Lifecycle - Plan

## Goal Capsule

- **Objective:** The owner can retain a completed game's authorized history and deliberately retire that game's data without damaging other games or silently resurrecting it from an old backup.
- **Authority:** The user confirmed the manual archive/purge scope below for original item #7; the completed reliability, access, outcome and provenance work remains a regression constraint.
- **Environment:** Local application and CI, with disposable synthetic datasets for implementation verification.
- **Means:** Versioned archive command, coordinated writers, explicit offline cleanup and independently held retirement evidence (KTD1–KTD7).
- **Authority hierarchy:** Product Contract and confirmed user constraints govern product behavior; KTDs govern implementation within them. Technical defaults are labeled under Assumptions.
- **Open blockers:** None at the product-contract level. Planning resolves concrete ownership, transaction and receipt-reconciliation mechanisms.
- **Stop conditions:** Stop on invalidating evidence against a settled decision, an unclassified data owner, unsafe target/resource ownership or unexplained failed verification. Existing private-dataset cleanup requires separate explicit authority.
- **Delivery:** Implement, verify and review this work, open a PR, and merge only after terminal green checks and material feedback resolution under the user's existing grant. The parent owns the final exact-head merge.

---

## Product Contract

### Summary

Add read-only archiving for completed games and a separate manual operator workflow for permanent cleanup of a selected archived game.
Keep minimal private retirement evidence and document external-copy cleanup and pre-service restore checks.

### Problem Frame

Game information survives in more than player rows: names, roles, votes, events, command outcomes, snapshots, sessions and scenario records remain linked to a game.
Expiry of a credential or removal of a roster row does not erase that history.
The existing archive field and disposable recovery proof do not establish an operative retirement workflow or prevent an old backup from restoring previously removed data.

### Key Decisions

- **Manual retention.** (session-settled: user-directed — chosen over 30-day and 90-day retention: the user selected retaining history until explicit cleanup.) Governs R1, R4, R10.
- **Keep current authorized archive reads.** (session-settled: user-directed — chosen over Storyteller-only and operator-only history: existing viewers retain their permitted read views.) Governs R2–R3.
- **Keep minimal retirement evidence.** (session-settled: user-approved — chosen over untraceable database-only cleanup: the confirmed scope retains a pseudonymous receipt for auditing and old-backup checks.) Governs R8–R9.
- **Explain failures and preserve private-state clearing.** (session-settled: user-directed — chosen over weakened checks or a retained private view after detected access loss: inherited safety and verification contracts remain in force.) Governs R11–R13.

### Actors

- A1. Current authorized Storyteller, who can archive a completed game and read its permitted history.
- A2. Current authorized player, who retains only their existing permitted archive views.
- A3. Owner/operator with explicit local database and selected-game authority, who inspects a cleanup plan and deliberately invokes permanent cleanup.
- A4. Maintainer or backup custodian, who follows the external-copy and restore procedure using independently retained retirement evidence.

### Requirements

**Archive and retained access**

- R1. Archiving is an explicit authorized action available only for an authoritatively completed game.
- R2. Archived history remains readable under the existing game/actor authorization, links and access-recovery capabilities, without introducing global archive-owner accounts or broader permissions.
- R3. An archived game rejects new gameplay, roster, scenario and history-mutating commands while preserving validated reads of already-committed command outcomes and access management necessary for permitted history reads.
- R4. No game history is deleted automatically by age or by archiving.

**Selected-game permanent cleanup**

- R5. Before deletion, produce an inspectable cleanup plan bound to the explicit database, selected archived game, current revision, schema/data ownership policy and relevant data fingerprint, without exporting private row contents.
- R6. Permanent cleanup removes all schema-classified data owned by that selected game, including events, original command receipts, checkpoints, credentials and non-cascading presence records; other games and global rate-limit budgets remain intact.
- R7. Refuse mismatched, changed, ineligible or unowned cleanup targets and make database deletion plus zero-residue verification atomic, with explicit reconciliation of failures outside the database transaction.
- R8. Retain a minimal private pseudonymous retirement receipt containing identifiers, timestamps and verification/operator-request metadata, but no participant names, roles, votes, raw credentials or private payloads.
- R9. Provide a pre-service restore check using independently retained retirement evidence to detect retired-game data reintroduced by an older backup, and document the required reconciliation and external-copy cleanup procedure.
- R10. Permanent cleanup is a separate deliberate operator action, not an ordinary Storyteller/player hard-delete API or an unattended sweeping job.

**Privacy and regression proof**

- R11. Preserve authorization, anti-oracle denial semantics, private-state clearing, live-session revalidation and command-outcome safety throughout archive and purge lifetimes, including admitted in-flight writers.
- R12. Prove selected-game completeness, multi-game isolation, stale-plan refusal, transactional rollback, safe retry/receipt reconciliation and old-backup detection on disposable synthetic datasets.
- R13. Preserve inherited release inventories and required security, physical-recovery, compatibility and provenance gates, explaining every failed observation without skips or weaker assertions.

### Key Flows

- F1. **Archive.** A1 selects a completed game, performs the authorized versioned action, and receives an archived read-only view under R1–R4.
- F2. **Inspect and clean.** A3 selects an archived game and explicit database, inspects the R5 plan, then deliberately applies that exact selection under R6–R8 and R10; changed targets fail safely rather than becoming another selection.
- F3. **Retry an interrupted operator action.** A3 consults the private receipt and database truth, reconciles pending/committed/failed state, and never treats a missing final file as proof that no deletion occurred (R7–R8).
- F4. **Check an old restore.** A4 checks the restored staging data against independently retained retirement evidence before service, reconciles detected retired data, and accounts separately for backups/exports held elsewhere (R9).

### Acceptance Examples

- AE1. **Covers R1–R4, R11.** A completed game is archived by its current Storyteller; permitted player/Storyteller reads and validated old-command status remain available, but a new gameplay or override command causes no mutation. Archiving a live game is refused.
- AE2. **Covers R5–R7, R12.** Two games contain private history and active abuse buckets; cleaning one eligible archived game leaves no owned rows for it, preserves the other game's complete state and leaves global budgets unchanged.
- AE3. **Covers R5, R7, R12.** The selected revision, data, schema policy or archive state changes after planning; apply refuses and no rows are deleted.
- AE4. **Covers R7–R8, R12.** Database or receipt persistence fails during cleanup; the report distinguishes rollback from committed deletion with incomplete receipt finalization, and a retry reconciles the original target without deleting another game or claiming an unobserved success.
- AE5. **Covers R8–R9, R12.** An old backup contains a previously purged game; an independently held retirement record makes the restore check nonzero until the detected data is reconciled before service. The record and public reports contain no private gameplay values.
- AE6. **Covers R11–R13.** Held commands or presence/access updates cannot leave orphaned private state after cleanup, and current clients clear views when they detect membership loss while all other games' release assertions remain valid.

### Scope Boundaries

- Verification operates on disposable synthetic data, not existing private user datasets.
- Purging intentionally ends replay, checkpoint validation and original-command recovery for the selected game; those guarantees remain for retained games.
- Retirement receipts are linked metadata, not anonymous data; their private custody and manual removal are documented separately from full game history.
- Database deletion cannot erase already downloaded/remembered information, independent exports, external backups, Git history or public source assets.
- The restore check proves what it observes against the supplied independently retained records, not that all outside copies or all historical retirements are known.
- No automatic deadline, new account system, public archive index, first-party license decision, legal-compliance certificate or production backup service is introduced.

### Sources and Research

- `prisma/schema.prisma`: archive metadata, game-owned relations, restrictive history foreign keys and global rate-limit data.
- `src/lib/command.ts`, `src/lib/command-contracts.ts`, claim/session recovery and presence writers: locking, duplicate interpretation, and non-formal write seams.
- Existing player/Storyteller controllers and projection builders: actor-scoped views, read-only presentation and access-generation lifetimes.
- `docs/recovery-drill.md` and `docs/recovery-verification.md`: disposable restore proof, cleanup boundaries and explicit untested deployed guarantees.
- `docs/content-provenance.md`: source coverage and unknown owner-rights separation remain applicable to new lifecycle tooling.

---

## Planning Contract

**Product Contract preservation:** Product Contract unchanged; R1–R13, A1–A4, F1–F4, AE1–AE6 and the settled decisions retain their meanings and IDs.

### Grounded Baseline

Planning base is `6a1a2a9bd086ff0a1bd2d4779daffaf5335f85dd`, also the observed `origin/main`, on `fix/manual-game-data-lifecycle`.
Item #6 merged as PR #7; this is original lifecycle item #7, not a continuation of that PR's implementation.
The supplied current grounding and independent claims report trace the application/schema at `5c5d7696ea5c1d7020f0e4270b8fca47c914ed3f`; a fresh Git tree comparison confirms no `src/` or `prisma/` changes through the planning base.
Their tree identities are respectively `140df76712abd014d5c124cbc05539501a2cd560` and `56e0e1b74696afced4e1f2ba0cd07ac521282a9c`.
This supports reuse of those bounded source observations, not a fresh runtime or dataset inspection.

`prisma/schema.prisma` has 23 models: 22 selected-game families and the separate global limiter.
`GameSession.archivedAt` already exists and is nullable; there is no `endedAt`, and archive is not a status enum value.
The command catalog currently has 36 operations.
The source-grounded bypasses are the already-claimed same-command BrowserSession creation, Storyteller recovery session creation followed by an unversioned audit event, and the separately authenticated Presence upsert.
Existing projection access generations, exact-session SSE revalidation and duplicate/status validation are preservation seams, not mechanisms to replace.

Current manifest declarations are Prisma 6.19.3-compatible ranges, Next 15.5.23, React 19.1.0 and the existing Playwright/Vitest tooling.
Verification uses Node 24 and owned PostgreSQL 16 resources under `docs/regression-baseline.md`.
There is no new package, database product or account model in this plan.

### Assumptions

These are bounded technical defaults, not user-settled choices.

- AS1. The existing System view, Notice component and projection/reconciliation patterns can present archive state without a redesign. Exact button wording and placements remain implementation details (KTD1–KTD2).
- AS2. The Storyteller landing page should show the current archived game's acknowledgment/direct link alongside the existing new-game form, rather than unconditionally redirecting back into it. It refers only to the current cookie-bound game and conveys that replacing that cookie may require configured recovery for the prior game (KTD2).
- AS3. One small independent database retirement anchor is justified to resolve an ambiguous commit when receipt-file finalization fails. This is an additional classified model, not a new identity system or a replacement for independently held receipts (KTD6).
- AS4. Supported offline execution requires operator custody of a local PostgreSQL target and a private local journal directory with tested exclusive-create, synchronization and rename behavior. Unsupported filesystem durability, insufficient connection visibility or a non-quiescent database causes refusal, not weaker guarantees (KTD4–KTD6).
- AS5. Deterministic canonical hashing can cover the selected owned graph within a bounded transaction on the local workload. Oversize input or timeout causes a non-destructive refusal; no partial/batched purge is introduced (KTD5).

### Key Technical Decisions

- KTD1. **Archive through the existing command boundary.** For R1, R3, R4 and R11, add `archiveGame` as the 37th operation with a strict non-credential result contract and `GAME_ARCHIVED` event. Under the existing game row lock, require the current authorized Storyteller, `status: ENDED`, expected version and an unset archive marker; set `archivedAt`, append the event and commit version/sequence/receipt together. A fresh second archive command is a definite already-archived rejection without another event; a valid duplicate retains its original outcome. Do not derive eligibility from UI state or mutable `updatedAt`. Explicitly classify the event as lifecycle metadata in replay/consistency handling, with no gameplay flags/effects or historical checkpoint rewrite. Existing duplicate receipt identity/result validation and status reads stay before the fresh archive guard. Classify all 37 operations explicitly: the default for new game writes is deny while archived, with a narrow read-access-management allowlist under KTD3. This preserves the inherited command-result contract rather than adding a separate ad hoc PATCH.

- KTD2. **Keep actor-scoped archive presentation and current re-entry seams.** For R2–R3 and R11, add an archive marker to authorized DTOs and a read-only banner to player and Storyteller views. Reuse `SystemView.tsx`, `Notice.tsx`, existing buttons and versioned mutation handling for the small completed-game archive action. Existing role, map, journal, audit and result visibility stays viewer-specific; archive never grants a player another role or the Storyteller's private projection. Current direct links and configured Storyteller recovery continue to work under existing credential validity. Apply AS2 at the current-game chooser, without adding an archive collection or claiming access survives expired credentials. UI disabling communicates the server rule; it is not the enforcement boundary.

- KTD3. **Coordinate every existing-game writer on the root lock and fresh authority.** For R3, R7 and R11, both `runCommand` and `runGameTransaction` reject fresh gameplay/history mutations on archived roots. Recheck admitted persisted session/player/claim identity inside the coordinated transaction, not solely before waiting for its lock. Move the same-command claim retry's BrowserSession creation into that boundary. Move Storyteller recovery session creation and its access audit append into one root-locked transaction; preserve its existing unversioned access-audit semantics rather than inventing a gameplay version change. Move Presence upsert under the same lock with an exact-session recheck and existence check, since Presence has no FK. Classify exceptions by explicit operation IDs in the typed catalog, not a generic caller-supplied boolean. New claim-token issuance for an existing roster member and `resetPlayerAccess` are narrow access-management exceptions under fresh persisted Storyteller authority for that game, rechecked under the root lock. They may change only credentials/access audit metadata needed to restore that existing player's permitted reads, never roster membership, role assignment or gameplay state. Session logout/revocation and configured Storyteller recovery retain their current actor policy and the same metadata-only boundary. Claim redemption/retry may restore an existing player's read access under fresh persisted claim/player checks and the root lock, but may not append roster members or modify gameplay. Presence is operational metadata and remains allowed for authorized readers. Audit appends for these allowed access operations remain permissible and are included in the cleanup fingerprint; checkpoint creation, gameplay recovery overrides (`recoveryOverride`), renaming, role changes, roster changes, scenario controls and all other gameplay/history writes are denied. Any additional writer discovered at execution must be classified before apply is usable. No untyped or request-controlled `allowArchived` escape hatch is permitted.

- KTD4. **Use an explicit offline CLI, with a narrow ownership/quiescence boundary.** For R5, R7 and R10, create one native operator entry point with plan, apply, reconcile and restore-check modes. Require an explicit loopback/local database connection, selected game, input/output plan and private receipt/journal paths as applicable; never import application DB initialization, load dotenv or fall back to `DATABASE_URL`, libpq services or ambient defaults. Reuse the established target-validation/lease principles, but keep real operator eligibility distinct from test-helper create/drop authority. Reject URL options/redirects, remote targets, unresolved identity and unsafe symlink paths. Bind database identity to the resolved local server/port, database OID/name and cluster identity where available, plus the immutable game UUID/createdAt; an unavailable strong target binding is a preflight failure. Keep credentials out of plan, journal and logs. Require an operator-confirmed stopped application, inspect actual PostgreSQL connections with sufficient visibility and reject other target-database sessions. Port checks alone are insufficient. Hold a target-specific operator lease, acquire fail-fast write-conflicting table locks in a fixed policy order, then lock/revalidate the root for selected-game work. A blocked lock, competing connection or changed ownership aborts without terminating sessions, stealing leases or force-dropping anything. Locks provide transaction fencing; common writer rechecks in KTD3 prevent admitted app requests from recreating rows afterward. Custody excludes noncooperating direct SQL writers and requires service to stay stopped through reconciliation; this is an offline protocol, not proof against a database administrator bypassing it.

- KTD5. **Bind plans to a complete classified graph and apply atomically.** For R5–R7 and R12, use a static versioned ownership policy checked against the Prisma model inventory and actual database tables/columns/FKs/migrations before any DELETE. New unclassified models, root relations, persistent app tables or divergent schema mappings fail closed. The private plan records format/policy/tool/schema identities, target binding, root UUID/createdAt, ENDED/archive timestamp, game version/event sequence, per-family counts and a deterministic whole-graph data digest. Canonical ordered hashing covers every selected row/column including same-count edits to credentials, audit events, Presence and nested JSON; raw values exist only in memory and are never printed or serialized. Do not mistake version/count equality for a complete fingerprint. Plan and apply compute the same snapshot under KTD4 locks. Apply requires the exact plan selection and digest, recomputes all bindings, deletes explicit restrictive history and Presence, deletes the root last using the declared cascades, and checks zero residue across every owned family before commit. Retain the existing Restrict constraints. Retain the pre-delete relation-key selection in memory for post-delete orphan checks on indirect children, rather than relying on joins that disappear with their parents. Zero-residue failure or any FK/query failure rolls the whole transaction back. SHA-256 digests remain pseudonymous private metadata, not anonymous or permission evidence.

- KTD6. **Use a durable pending intent plus a transactional minimal anchor.** For R7–R9 and F3, acquire the KTD4 locks and validate the KTD5 selection in one bounded database transaction, then create a private pending intent and synchronize it and its containing directory before the transaction's first DELETE. Keep those locks through deletion and commit; a failed intent write aborts the transaction without deletion. This small local persistence step is the deliberate filesystem operation inside the lock window, not a claim of cross-store atomicity. Bind a unique retirement/request identity to the exact KTD5 selection, plan digest and immutable game identity. In the same transaction as deletion/zero-residue verification, insert a minimal `GameRetirement` anchor with no FK to the removed root. It holds only the linked identity, policy/schema/tool/source digests, opaque initiator/request tag, counts, archive/retirement times and plan/intent digests. It does not copy participant identities, roles, votes, hashes of credentials, payloads or raw tokens. After observed commit, finalize the external receipt through a checked temporary regular file, file synchronization, rename and parent-directory synchronization. Use exclusive creation, private modes and no-follow/owned-parent checks; do not overwrite an unrelated existing receipt. Database and filesystem are explicitly not one atomic transaction. Commit ambiguity or finalization failure returns nonzero with a bounded diagnostic and preserves the earlier failure. A retry of the same selection compares the anchor and intent digest: an exact anchor proves committed deletion and permits finalization only; a present unchanged eligible game with no anchor permits revalidation/retry; conflicting anchor/selection refuses. Missing game with no anchor is uncertain, never inferred success. Missing/corrupt journal or anchor mismatch blocks automatic reconciliation. A later successful reconciliation records the earlier incomplete attempt without rewriting it as a clean first success. Keep anchors/receipts until separately authorized manual removal; no backfill of arbitrary historical deletions.

- KTD7. **Check staged restores against independent retirement evidence.** For R9 and F4, restore-check is read-only and requires the explicit staging target and independent journal/receipt input. Match game UUID plus immutable `createdAt`, not current archive state: an older copy may still be ACTIVE and lack both `archivedAt` and the later DB anchor. A matching committed retirement receipt blocks service; a matching pending/uncertain intent also blocks pending explicit reconciliation. Missing/malformed/incomplete supplied evidence is not a clean bill of health. Produce bounded conflict identities/counts without private rows and return nonzero while any conflict or custody/completeness uncertainty remains. The runbook keeps the staging database unserved and requires explicit operator reconciliation and recheck; it does not silently archive/purge restored ACTIVE games or relax eligibility for unselected games. Independent custody, journal completeness and external-copy location remain manual responsibilities. Explain separately how custodians account for owner-held exports/backups and manually remove records/copies when authorized. This is neither a backup service nor an all-copies-erased certificate.

- KTD8. **Make lifecycle proof an actual canonical gate.** For R11–R13, integrate a sanitized, source/build-attributed lifecycle report into the existing baseline and CI rather than leaving a manual invocation promise. The new proof uses only freshly owned synthetic resources, preserves the original playable physical-recovery case and native compatibility inventories, and adds retired-old-backup detection as a separate observation. Keep the current 22-stage floor plus the required lifecycle stage, with native identity preservation rather than counts alone. Refresh the covered provenance ledger after final source/docs/tests edits and before measurement, preserving curated metadata and all nine unknown rights groups. No green receipt from a prior source can be attributed to this work.

### Data Ownership Policy

This inventory is the implementation starting point for KTD5, not a hardcoded permission to ignore future schema changes.

| Family | Selected-game predicate | Deletion/check treatment |
| --- | --- | --- |
| GameSession | Root ID | ENDED + archived eligibility; delete last |
| DomainEvent | gameId | Explicit delete; Restrict retained |
| CommandReceipt | gameId | Explicit delete; Restrict retained |
| Checkpoint | gameId | Explicit delete; Restrict retained |
| Player | gameId | Root cascade; retain selected IDs for orphan checks |
| PlayerClaim | player.gameId | Cascade through selected players |
| PlayerSecret | player.gameId | Cascade through selected players |
| BrowserSession | player.gameId OR storytellerGameId | Union, deduplicated; include both bindings |
| SetupDraft | gameId | Root cascade |
| OperationalPhase | gameId | Root cascade; retain selected phase IDs |
| OperationalAction | operationalPhase.gameId | Phase cascade; actor scalar is not ownership |
| Effect | gameId | Root cascade |
| InvestigationState | gameId | Root cascade |
| Nomination | gameId | Root cascade; retain selected nomination IDs |
| Vote | nomination.gameId | Nomination cascade; player scalar is not ownership |
| DeathRecord | gameId | Root cascade |
| ScenarioState | gameId | Root cascade |
| QrScan | gameId | Root cascade |
| ScenarioDiscovery | gameId | Root cascade |
| TaskState | gameId | Root cascade |
| ScenarioCondition | gameId | Root cascade |
| Presence | Scalar gameId | Explicit delete and writer fence; no FK |
| RateLimitBucket | Global, not game-owned | Excluded; preserve active budgets and existing pruning policy |
| GameRetirement (new) | Independent linked retirement identity | Retained minimal anchor under KTD6; explicitly classified outside game graph |

The additive anchor makes 24 classified models after implementation: the original 22 game families, one global limiter and one independent retirement family.
Unexpected cross-game bindings or inconsistent relation ownership cause refusal; never broaden the selected deletion to satisfy a corrupt cross-game reference.

### High-Level Technical Design

These sketches expose the boundaries governed by KTD1–KTD8; prose decisions govern any disagreement.

1. **Component relationships:** Actor UI → authorized archive route → command service → locked game/receipt/event transaction; offline operator → lifecycle CLI → ownership policy + journal → same local database; backup custodian → restore-check → independently held receipt + unserved staging database.
2. **Apply protocol:** Explicit target and plan → verify custody/schema → hold table/root locks → recompute fingerprint → synchronize pending intent → delete + verify + anchor → commit observation → finalize receipt. Pending-intent persistence occurs before deletion, while the selected snapshot remains protected; no human prompt or network call occurs while holding locks.
3. **Receipt states:** Missing intent → pending → committed anchor / uncertain outcome → finalized receipt. A rollback with the original game intact remains a failed attempt; finalization failure retains pending state plus the observed anchor. Only exact selection reconciliation can move an incomplete attempt forward (KTD6).
4. **Game lifecycle:** Live/setup/reveal → ordinary completion → ENDED unarchived → archived retained read views → selected offline retirement → absent game with independent retirement evidence. Archive never directly deletes; purge ends this game's replay/outcome retention (R4, R6).
5. **Refusal decisions:** Unsafe target or custody → refuse before mutation; unknown schema → refuse before DELETE; changed selection/fingerprint → refuse with game intact; deletion/zero-residue failure → rollback; uncertain commit/file result → nonzero reconciliation; exact committed anchor → finalize only.
6. **Private-data flow:** Selected rows → in-memory canonical serialization → digest/count-only private plan → same-selection apply → minimal private retirement metadata. Public CI receives only synthetic case identities, statuses and source/build/report digests; no row snapshots or raw credentials.
7. **Mode matrix:** Plan reads an eligible game and writes an inspectable private plan; apply consumes that plan and creates intent/anchor/receipt; reconcile consumes the same selection and resolves incomplete evidence; restore-check only reads staging data and independently supplied retirement evidence. No mode discovers or deletes external copies.
8. **Archive interface:** Authorized Storyteller + ENDED + fresh expected version → one archive outcome; validated duplicate → original committed outcome; fresh archived gameplay → definite rejection; authorized historical read → current viewer projection; lost persisted identity → existing anti-oracle denial/access-loss path. New-game creation uses its existing separate root, not an archived-game mutation.

### System-Wide Impact and Risks

- **Command/replay boundary:** KTD1 changes operation discovery, errors, DTOs and event classification. Update the exhaustive catalogs and actual replay handling, not only route coverage. Old duplicates remain validated under inherited contracts; no automatic command replay is added.
- **Access boundary:** KTD3 touches existing access recovery and presence behavior even when no game version changes. A fresh plan after legitimate access metadata changes is expected. Root deletion invalidates future admissions; remote/offline clients clear only when they detect loss, not instantaneously.
- **Storage boundary:** KTD5–KTD6 add private linked metadata outside the original game graph. The schema policy and runbook must distinguish this deliberate residue from undeleted private gameplay history. Pending intent and DB anchor are small required mechanisms for R7–R9, not a general workflow engine.
- **Database/file failure boundary:** Filesystem synchronization is OS/device-specific. KTD6 refuses an unsupported durability preflight and records uncertainty instead of claiming atomic DB/file commit. Finite lock/transaction deadlines prevent a hung offline tool from becoming a service.
- **Backup boundary:** KTD7 depends on truthful independent custody. A missing retirement history cannot prove no prior retirement; manual custodian attestation and independently held receipt collection are part of the documented pre-service procedure.
- **Source-rights boundary:** The plan itself changes covered membership and makes the current ledger stale. KTD8's intentional refresh is required at execution; stale hashes cannot be waived because this is privacy work. Package/app-source public rights remain `permission_not_established`.

**Considered and not built:** No automatic age retention, external filesystem sweeper, archive-account index, automatic restore purge or full export engine is needed by R1–R13. Broader deployment orchestration would need a separate deployed-service requirement; this local offline protocol does not invent one. No redundant `endedAt` migration is needed because authoritative ENDED plus archive time satisfies eligibility.

**Deferred execution details:** Resolve exact helper names, canonical scalar/JSON encoding, bounded transaction limits and test hooks while implementing, using actual installed Prisma 6 types and the Node 24 runtime. The repository currently declares `@types/node` 20; stay within available types/native APIs rather than upgrading dependencies for convenience. Unknown outside-copy custodians, locations, retention horizons and content-rights evidence remain unknown, not assumptions of absence or permission.

### Sources and Design Rationale

- Current source seams and limitations are established by the supplied source-grounded reports and the unchanged tree identities above. Repository paths cited in the Product Contract remain the execution-time starting points; proposed paths below are marked new.
- `the-sies-files-audit/22_SECURITY_AND_DATA_DURABILITY_SPEC_v1.md` requires a separate operator/offline procedure; its historical cascade description is superseded by current Restrict relationships. KTD4 preserves that boundary rather than inventing an ordinary web purge endpoint.
- [Prisma 6 transactions](https://github.com/prisma/web/blob/v6/content/200-orm/200-prisma-client/100-queries/058-transactions.mdx) supports interactive transactions with finite wait/timeout and rollback. KTD5 uses one database transaction and parameterized values, with no filesystem-atomicity claim.
- [PostgreSQL 16 explicit locking](https://www.postgresql.org/docs/16/explicit-locking.html) and [LOCK](https://www.postgresql.org/docs/16/sql-lock.html) establish write-conflicting table locks and consistent lock order. KTD4 uses them alongside root rechecks and actual connection inspection, rather than treating a port probe as quiescence.
- [Node 24 filesystem API](https://nodejs.org/docs/latest-v24.x/api/fs.html) documents synchronization and rename with OS/device caveats. KTD6 keeps a transactionally committed anchor because filesystem finalization cannot share the database transaction.
- `docs/recovery-drill.md`, `docs/recovery-verification.md`, `docs/regression-baseline.md` and `docs/content-provenance.md` own inherited resource/evidence contracts. KTD7–KTD8 add lifecycle observations without rewriting those guarantees.
- No bake-off is needed: the rejected DB-only receipt cannot detect resurrection from older backups, and file-only finalization cannot conclusively resolve an ambiguous commit with an absent game. The minimal intent/anchor/final-file combination closes those concrete gaps without developing competing storage systems.

---

## Implementation Units

### U1. Enforce archive semantics and coordinate existing writers

**Goal:** A completed game can be archived through the authoritative service while all fresh mutations and admitted writer races obey the lifecycle boundary.

**Requirements:** R1, R3–R4, R11; A1–A2; F1; AE1, AE6. Decisions: KTD1, KTD3.

**Dependencies:** None.

**Files:** Modify `src/lib/command.ts`, `src/lib/command-contracts.ts`, `src/lib/errors.ts`, `src/modules/game-session/game-session.service.ts`, `src/modules/recovery/recovery.service.ts`, `src/modules/auth/session.ts`, `src/app/api/v1/storyteller/recover/route.ts`, `src/app/api/v1/games/[gameId]/presence/heartbeat/route.ts` and affected existing access writers. Create `src/app/api/v1/games/[gameId]/archive/route.ts` and `tests/game-lifecycle.test.ts`; extend `tests/command.test.ts`, `tests/command-contracts.test.ts`, `tests/command-status.test.ts`, `tests/claim.test.ts`, `tests/recovery-diagnostics.test.ts` and `tests/access-lifetime.test.ts` as needed.

**Approach:**
1. Enumerate the existing operation/writer seams against KTD1/KTD3, including every unversioned writer and access audit append.
2. Add archive producer/contract/route and explicit replay classification using the current lock/receipt/event patterns.
3. Move the three bypass writers into coordinated transactions and apply exact persisted identity checks after lock acquisition.

**Execution note:** Start with failing service/route cases for eligibility, old duplicate recovery and the admitted writer races, then implement the boundary.

**Patterns to follow:** `runCommand`, `runGameTransaction`, current session revalidation and existing strict command result schemas. Read actual implementation at execution before editing; the planning tree pin is not a substitute for investigating a newly discovered writer.

**Test scenarios:**
1. Covers F1 / AE1. Current Storyteller archives ENDED once, producing the expected event/version/sequence/receipt and timestamp; player, wrong-game, missing-session and non-ENDED requests mutate nothing.
2. Covers AE1. A validated pre-archive gameplay-command duplicate and old status read return their unchanged authorized result after archive, while a fresh gameplay command with the same operation is rejected. Invalid identity/result receipts still fail closed before any handler runs.
3. Explicit gameplay operation classifications reject fresh gameplay, role/roster changes, rename, scenario, checkpoint and gameplay recovery overrides (`recoveryOverride`) without event/effect changes. All 37 producers have explicit contracts and operation-ID archive classifications; credential reset is tested separately as an access-management exception under KTD3.
4. Covers AE6. Hold claim retry/recovery/heartbeat after initial admission, retire/delete the root through the coordinated seam, then release the writer: no session, audit row or scalar Presence is recreated.
5. On an archived game, new claim-token issuance for an existing roster member and `resetPlayerAccess` succeed only for the game's freshly revalidated persisted Storyteller under the root lock, changing only KTD3 credential/access-audit metadata. Missing, wrong-game, revoked or replaced Storyteller authority is refused; no new player, role or gameplay change occurs. Redeeming/retrying an existing player's valid claim restores only their permitted reads under fresh persisted claim/player checks and the root lock, without appending roster members. Other allowed access operations preserve their current actor policy; gameplay recovery overrides disguised as access management remain refused.
6. Replay/consistency processing recognizes `GAME_ARCHIVED` without applying gameplay flags or corrupting prior checkpoints; fresh archive repeat is non-mutating and an exact duplicate remains recoverable.

**Verification:** Existing command/security assertions and the new failing-first cases pass against actual services, including both transaction entry points and the three bypass paths.

### U2. Present authorized retained history and usable re-entry

**Goal:** Players and Storytellers can identify read-only history and the current Storyteller can start a new game without losing the meaning of archive access.

**Requirements:** R1–R3, R11; A1–A2; F1; AE1, AE6. Decisions: KTD1–KTD2; AS1–AS2.

**Dependencies:** U1.

**Files:** Modify `src/modules/projections/projections.ts`, `src/modules/projections/load.ts`, `src/lib/client-api.ts`, `src/app/storyteller/[gameId]/page.tsx`, `src/app/storyteller/[gameId]/_components/SystemView.tsx`, `src/app/storyteller/[gameId]/_components/StorytellerShell.tsx`, `src/app/storyteller/page.tsx`, `src/app/player/page.tsx` and affected mutation controls. Reuse `src/components/ui/Notice.tsx`. Create `tests/e2e/e2e-14-game-lifecycle.spec.ts`; extend `tests/projections.test.ts` and relevant existing access/outcome browser cases without removing identities.

**Approach:**
1. Carry authorized archive state through DTOs and existing reconciliation without changing viewer disclosure.
2. Add the small System archive action, archived banner and read-only controls through current mutation/error patterns. Inspect the existing ended-mode role-view path and preserve permitted private-role inspection without role acknowledgment or another gameplay mutation; reuse that path if it already satisfies the read outcome, adding only a minimal read-only adjustment if needed.
3. Adjust the current-game chooser under AS2 and preserve direct links/configured recovery.

**Patterns to follow:** Existing System buttons/Notice, actor-specific projections, identity-keyed private tree and pending-command recovery.

**Test scenarios:**
1. Covers AE1. In a real browser, archive an ENDED game as Storyteller, then view it as Storyteller and two differently assigned players: each can inspect exactly their own permitted history/role and read-only outcomes without issuing role acknowledgment or another gameplay mutation, with no newly disclosed role or private Storyteller data. Reuse the existing ended-mode role view where it meets this outcome.
2. Refresh/re-enter through existing links and configured Storyteller recovery; expired/invalid credentials retain current denial semantics rather than an archive access exemption.
3. Current archived-game chooser offers its current direct link and the existing new-game creation path without a redirect loop or cross-game index; cookie replacement does not imply authority over the previous game.
4. A stale page's attempted gameplay command is server-rejected; an ambiguous archive response uses existing status reconciliation rather than generating/replaying another mutation.
5. Covers AE6. After synthetic purge/restart, fresh admissions deny missing keys and an already-open client's detected session loss clears projection, pending identity and private dialogs despite delayed responses/SSE delivery.

**Verification:** Mobile-Chromium lifecycle flow passes in the actual built app; projection/service assertions prove the same server authorization independent of disabled controls.

### U3. Build selected-game planning, atomic apply and receipt reconciliation

**Goal:** An operator can inspect and deliberately apply one exact archived-game cleanup with complete ownership coverage and recoverable evidence.

**Requirements:** R5–R8, R10–R12; A3; F2–F3; AE2–AE4, AE6. Decisions: KTD3–KTD6; AS3–AS5.

**Dependencies:** U1.

**Files:** Create `scripts/game-data-lifecycle.mts`, `scripts/game-data-policy.mts`, `scripts/game-data-journal.mts`, `tests/game-data-lifecycle-tooling.test.ts` and `tests/game-data-lifecycle.test.ts`. Modify `prisma/schema.prisma` with one additive no-FK retirement anchor, add a new migration under `prisma/migrations/`, and add a native entry point in `package.json`. Use the target/ownership patterns of `scripts/test-database.mts` without inheriting its reset/drop operations. Additional helper splitting is optional only if needed to keep these responsibilities clear.

**Approach:**
1. Implement the full model/table/FK policy and target/journal validation before destructive apply exists.
2. Add the minimal anchor and exact plan/fingerprint binding, then the KTD5 transaction and zero-residue checks.
3. Implement KTD6 pending/finalization/reconcile behavior and bounded sanitized failure reports through actual stages.

**Execution note:** Build failure-path and full-graph fixtures before destructive behavior, using only newly owned disposable local databases and private directories.

**Patterns to follow:** Explicit resource leases and safe target parsing in existing tooling, parameterized Prisma raw-query conventions, native filesystem APIs and the current migration workflow. No raw private graph is placed in reports.

**Test scenarios:**
1. Covers F2 / AE2. Populate two synthetic games across all 22 owned families, including event/receipt/checkpoint snapshots, both BrowserSession bindings, claims, scenario records and scalar Presence. Plan then apply one archived game through the real CLI; every selected family is empty, the other game's canonical full state is byte-equivalent, and global buckets are byte-equivalent with no reset.
2. Covers AE3. Independently change version, event sequence, archive marker, same-count private values, access audit, session, Presence, schema classification or digest after planning; apply refuses without deletion or committed anchor.
3. Unknown model/table/root FK, corrupt cross-game binding, mismatched database/cluster/game/createdAt, live/unarchived target and changed policy/source identity each refuse before DELETE.
4. Unsafe plan/receipt symlink, unsafe parent, collision, remote/ambient target, competing database connection, insufficient visibility, held lock and unowned lease each refuse without touching another target or killing a process.
5. Covers AE4. Force an actual restrictive-FK failure after deletion has started and a separate zero-residue failure: all selected rows/credentials/events return by rollback, no committed anchor appears, and failed evidence remains.
6. Covers F3 / AE4. Inject failure at pending persistence, transaction/commit observation, final-file write, rename and sync. Pending failure deletes nothing; committed anchor plus failed file is nonzero; an exact retry finalizes without another deletion; absent game/no anchor, missing journal and mismatched intent stay uncertain/refused.
7. Covers AE6. First hold an actual claim/recovery/heartbeat database session and observe that offline apply refuses on connection/lock preflight. Separately pause each real service path after admission but before its coordinated transaction, drain/disconnect the proof-owned app sessions, perform actual offline apply, then resume the admitted path with a fresh connection. Its KTD3 root/session recheck must refuse, leaving no session, audit or Presence orphan. Keep these two observations distinct; do not bypass the CLI's quiescence check to manufacture concurrent apply success. New concurrent operator work refuses on lease/locks.
8. Inspect plan/anchor/journal/report fields and failure logs for the KTD6 minimal-field policy using sentinel synthetic secrets; no raw values or credential hashes leak, including in digest-error diagnostics.
9. Additive migration preserves existing roots/constraints and classifies exactly 24 models. An interrupted retry does not create a legacy-retirement backfill or accept a different game selection.

**Verification:** Actual plan/apply/reconcile integration proves deletion, rollback and exact-target idempotency. Pure policy/path tests complement those observations; mocked deletes alone are insufficient.

### U4. Block retired-data restores and document manual custody

**Goal:** A custodian can detect retired identities in an unserved old restore and account honestly for independently held copies.

**Requirements:** R4, R8–R10, R12; A3–A4; F3–F4; AE4–AE5. Decisions: KTD6–KTD7.

**Dependencies:** U3.

**Files:** Extend `scripts/game-data-lifecycle.mts` and the U3 test paths; create `docs/game-data-lifecycle.md`, `scripts/game-data-lifecycle-proof.mts` and `tests/game-data-lifecycle-proof.test.ts`. Update `docs/recovery-drill.md` and `docs/recovery-verification.md` with the new separate restore check and original-case preservation.

**Approach:**
1. Add read-only restore-check using independent evidence, with explicit staged-target binding and blocking outcomes from KTD7.
2. Extend the owned physical-proof pattern with an older synthetic backup that predates archive/retirement, without replacing playable recovery.
3. Write the operator/custodian procedure, including explicit selection, evidence states, pre-service reconciliation and manual copy/receipt custody.

**Test scenarios:**
1. Covers F4 / AE5. Physically back up the selected synthetic game while ACTIVE, then complete/archive/purge it in the source and retain the receipt independently. Restore the old backup into another newly owned staging database; restore-check blocks on UUID/createdAt despite ACTIVE state and absent retirement anchor.
2. A clean staging target with complete supplied evidence has no conflicts; another unselected game remains intact. A mismatched immutable identity is reported without turning into deletion eligibility, and pending/missing/corrupt evidence cannot produce a success claim.
3. Manual reconciliation is explicit and scoped to the unserved staging target; a subsequent check observes the resolution. The ordinary apply mode still refuses an unarchived/unselected live game.
4. Covers AE4. Backup/restore/proof/cleanup interruption preserves failed reports and nonzero status; cleanup touches only owned disposable resources, not inherited clusters, copies or journals.
5. The runbook's retention table distinguishes credentials/session expiry, browser cache/pending identity, Presence, CI artifacts, source history and external backups from physical erasure. It identifies known current purposes/expiry and unknown deployment/custody facts rather than inventing deadlines.

**Verification:** Actual PG16 dump/restore observation detects the retired identity using the independent receipt. Existing playable-recovery proof remains a separate passing gate; documentation does not claim deployed backup service, legal certification or universal erasure.

### U5. Integrate canonical lifecycle evidence and refresh final provenance

**Goal:** The exact final source/build has enforceable CI lifecycle proof and retains every inherited release observation.

**Requirements:** R11–R13; AE1–AE6. Decisions: KTD8.

**Dependencies:** U1–U4.

**Files:** Modify `scripts/regression-baseline.mts`, `.github/workflows/ci.yml`, `package.json`, `tests/regression-baseline-tooling.test.ts`, `tests/helpers/recovery-virtual.ts` if actual module loading requires it, `docs/regression-baseline.md`, `docs/content-provenance.md` and `README.md`. Refresh `provenance/content-ledger.json` and `provenance/dependency-index.json` through the existing metadata-preserving refresher after all included edits. The index may remain byte-unchanged. Extend U4's actual lifecycle proof tests to enforce report completeness, sanitation and failure propagation.

**Approach:**
1. Wire the lifecycle proof into the canonical production runner with resource ownership, independent stage accounting and exact source/build attribution.
2. Require its complete sanitized report in CI through an explicit file allowlist; preserve existing security/provenance artifact restrictions.
3. Finish all covered edits, refresh/check provenance intentionally, then capture and measure final source. Any later covered change requires a new refresh/check and new measurement.

**Test scenarios:**
1. Missing, failed, skipped, truncated or source/build-mismatched lifecycle evidence makes the canonical run and hosted check fail; a successful unrelated stage cannot mask it.
2. Held writer, rollback, receipt-failure/retry and old-backup cases originate in actual proof stages, with native identities and failure attribution, not fabricated summary booleans.
3. Native inventory comparison retains all current 410 unit, 50 ordinary browser, 19 security, one playable physical-recovery and 21 actual A/B compatibility observations plus all 22 inherited stages; new cases/stage are additive.
4. Provenance refresh preserves owner-curated fields and all nine unknown groups across new lifecycle paths. Strict check fails on stale membership/hashes and passes only after an intentional refresh; no self-hash loop or invented verified grant appears.
5. Public artifacts contain only sanitized synthetic statuses/identities and public source/build evidence. Raw participant rows, credentials, backup files, private journals and rights documents stay outside CI upload paths.

**Verification:** The final canonical production gate and hosted required checks are terminal green for the exact reviewed head. Earlier failures remain source-attributed and explained; native identities, required artifacts and resource cleanup are audited, not inferred from aggregate counts.

---

## Verification Contract

### Execution and Evidence Rules

No runtime verification is claimed by this plan.
At implementation, use the existing canonical disposable capsule workflow under `docs/regression-baseline.md`, fresh generated Prisma clients, Node 24 and explicitly owned local PostgreSQL 16 resources.
Never run a plan/apply/restore exercise against an existing private dataset or read dotenv to discover a target.
Proof-created resources require explicit ownership before cleanup; no force drop, broad process termination or lease theft is allowed.

| Gate | Native entry point / owning reference | Required result |
| --- | --- | --- |
| Fresh lint/types/unit/build | `lint`, `typecheck`, `test`, `build` scripts; `verify:release` | All assertions pass on the final capsule, including clean-database repeat; no stale generated-client workaround |
| Archive/read/privacy browser flows | `test:e2e`; new E2E-14 plus current access/outcome cases | Actual production build, current actor disclosure, retained outcomes, no gameplay writes, purge/restart denial and clearing |
| Limiter-enabled security | `test:security`; `docs/access-secrecy-verification.md` | Current enabled-limit profile, no removed identities/assertions or broadened anti-oracle responses |
| Playable physical recovery | `recovery:prove`; `docs/recovery-drill.md` | Original playable case and all its claims remain mandatory |
| Actual A/B compatibility | `scripts/command-receipt-compatibility.mts`; `docs/command-outcome-compatibility.md` | All 21 actual observations retained; selected compatibility is not a safe rollback guarantee |
| Lifecycle proof (new) | Proposed `game-data:prove` script, U3–U4 actual modules | Complete deletion/isolation, refusal, rollback, journal reconciliation, writer races and independent old-backup detection |
| Provenance | `provenance:refresh` then `provenance:check`; `test:provenance` | Intentional final refresh preserves metadata; strict source/build-bound technical check, explicit rights gaps |
| Canonical release/hosted CI | `baseline` production profile; `.github/workflows/ci.yml` | Current 22-stage floor plus required lifecycle stage; source-before/after equality and complete artifact allowlist |

Command names above identify repository entry points, not permission to execute them during planning.
Use actual manifest/runner options at execution, not guessed shell recipes.

### Required Report Semantics

Lifecycle evidence distinguishes attempted, refused, rolled back, committed-but-unfinalized, uncertain and reconciled outcomes under KTD6.
Each real failure retains its original cause/exit and source identity; cleanup/finalization failures cannot replace it with success.
The canonical inventory compares stable native identities as a multiset against current merged evidence, retaining older identity contracts as well as the latest floors.
No skipped cases, lower denominators, retries hiding first failures, test weakening or manual-only promises satisfy R12–R13.

The lifecycle report binds the proof implementation, schema policy, synthetic fixture identity, selected source, actual production build and observed stage outcomes.
Exact private selection receipts remain in the private proof directory; public summaries use only bounded synthetic identifiers and digests.
Provenance reports retain their existing explicit two-file upload contract; no source capsule, journal directory, private backup or broad wildcard becomes an upload artifact.

---

## Definition of Done

- U1 is complete when server-side archive eligibility, old-outcome preservation, explicit replay classification and coordinated writer race proofs pass.
- U2 is complete when actual actor-specific archive views, read-only controls, re-entry/new-game navigation and detected-loss clearing pass in the built app.
- U3 is complete when actual selected-game plan/apply removes all 22 owned families, preserves the other game/global budgets byte-for-byte, rolls back forced failures and reconciles exact-target receipt interruption safely.
- U4 is complete when an actual older physical restore is blocked using independent retirement evidence, the original playable proof still passes and the manual custody/reconciliation runbook states its limits.
- U5 is complete when the final canonical and hosted gates require the new proof, preserve all inherited identities/stages, and bind final source/build/provenance with no unaccounted mutation.
- Every R1–R13 outcome and AE1–AE6 is covered by observed evidence for the final reviewed source. All failed observations are explained and retained, material review findings resolved, and only owned disposable resources cleaned up.
- The final diff contains no abandoned implementation experiments or incidental redesign/dependency upgrades. Private data/rights documents are absent from public artifacts, unknown permissions remain unknown, and the intentional ledger refresh is included with covered changes.
- Parent shipping is complete only after the authorized exact-head PR has terminal green required checks and material feedback resolution, then the parent performs the merge and verifies resulting main. This plan grants no existing-private-dataset purge authority.
