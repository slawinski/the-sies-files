---
title: Content Provenance and Notices - Plan
type: fix
date: 2026-11-10
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Content Provenance and Notices - Plan

## Goal Capsule

- **Objective:** The owner and release reviewer can identify what the playable release contains, distinguish documented provenance from missing permission evidence, and find the available upstream notices for that exact release.
- **Means:** A versioned content ledger, lock-bound dependency index, safe installed-notice collector, and source-bound technical check (KTD1–KTD5).
- **Authority:** The item #6 provenance brief governs scope; Product Contract requirements govern behavior; Planning Contract decisions govern implementation within those requirements. Item #6 in `docs/ideation/2026-10-28-legacy-app-reinforcement-ideation.html` supplies the original motivation.
- **Baseline:** Clean branch `fix/content-provenance-and-notices`, based on freshly fetched `origin/main` at `5c5d7696ea5c1d7020f0e4270b8fca47c914ed3f`, the item #5 merge. Earlier dossier observations were pinned to `c2e00f2a9fb505b1f159476447acd880b7216dc2`; current source observations below supersede them where stated.
- **Execution profile:** Four repository-native implementation units, local verification and existing canonical CI. This document authorizes no deployment and carries no legal representation.
- **Stop conditions:** Stop for contradictory source identity, unsafe file access, or a proposed change that requires choosing a first-party license. Missing owner facts are reported gaps, not implementation blockers.
- **Completion owner:** The implementing caller completes code, review, and the previously authorized PR/green-CI/merge workflow. The owner supplies rights evidence separately. Planning delivers this document only.

---

## Product Contract

### Summary

Establish release-linked evidence for inherited code, game content, artwork, reference material, fonts, and dependency notices. Make unknown permissions visible without inventing grants or treating a green engineering check as legal clearance.

### Problem Frame

The public source repository contains playable content and protected in-game artwork without an established first-party license or rights agreements in the inspected evidence. Import history identifies entry points, not authorship or permission. Dependency metadata describes candidates but neither proves which binaries a release contains nor preserves every upstream notice.

The owner needs an accurate account of the present release before deciding how it may be shared. A local-only application still has public source visibility. Public repository visibility, possible static delivery, and authorized in-game visibility are different facts.

### Requirements

**Content identity and permission evidence**

- R1. Maintain a versioned ledger covering all policy-included repository code and content, with explicit categories for the coverage listed below and raw-byte identities for covered files.
- R2. Record source/supplier, claimed creator, import/source reference, derivation, intended use, distribution surfaces, notice references, and permission evidence for each content entry; unavailable facts remain `OWNER_EVIDENCE_REQUIRED` or unverified.
- R3. Never infer a first-party grant from commit identity, public source visibility, package metadata, filename, appearance, transformation, or this work's merge authorization.
- R4. Keep repository publication, potential static-server distribution, and in-game visibility independent; preserve protected `WEST_AREA` delivery and existing map paths, digests, gameplay, and `productionReady: false`.
- R5. Document base PNG → public base WebP and west PNG → protected west WebP using the existing build script; mark source/master derivations unproven and compute raw-byte SHA-256 independently of filename suffixes.
- R6. Reject missing coverage, duplicate ownership of file coverage, unknown or unsafe paths, escaping links, stale identities, and permission-verification claims lacking documented, scope-bound evidence.

**Dependencies and notices**

- R7. Inventory every non-root lockfile-v3 package candidate, preserving dependency path, version, integrity/source metadata, direct/transitive relationship, and development/build/optional/platform flags without classifying them all as shipped runtime code.
- R8. Separately report observed installed packages, matching or mismatching locked identities, and available release/build-trace evidence; identify browser bundles, native/generated engines, and libvips coverage limits explicitly.
- R9. Preserve complete available upstream license and NOTICE/COPYING texts with source paths and raw-byte hashes, including both Lucide ISC and Feather MIT sections; retain embedded-notice evidence without claiming exhaustive notice fulfillment.
- R10. Treat package metadata and notice inputs as untrusted: bounded regular UTF-8 text reads stay inside approved package roots, and unsafe, binary, oversized, unreadable, or missing inputs produce explicit diagnostics rather than silently truncated evidence.

**Reporting, integration, and owner handoff**

- R11. Produce deterministic portable ledger/index outputs and separate ignored machine-specific installed/build evidence bound to source, lockfile, collector, and applicable build identity.
- R12. Technical validation may pass with unknown rights only when the report explicitly states `permission_not_established` and lists the outstanding gaps; never emit a misleading compliant/licensed/cleared/all-shipped-components-covered success claim.
- R13. Add a lightweight automatic technical inventory/drift and artifact-correctness check to the existing canonical baseline/CI, preserving inherited checks and Git-free reconstructed-source support.
- R14. Publish an owner-evidence checklist and truthful README position, including actual system font stacks and the absence of an established first-party grant; use nonsensitive relative evidence references without committing private contracts.
- R15. Generated provenance artifacts contain inventory metadata and appropriate public upstream notice text, never copied raw source images, private agreements, environment material, or session data.
- R16. Explain failed or incomplete verification from source-bound evidence, without skips, weaker assertions, or unstable raw captures presented as proof.

### Coverage Categories

The coverage policy must account for every included file, including newly added tooling, tests, configuration, migrations, documentation, and ledger/index files. Category overlays may reference the same code for analysis, but each file has exactly one primary coverage owner.

| Category | Present anchors | Required distinctions |
|---|---|---|
| First-party/inherited code and repository text | `src/`, `scripts/`, `tests/`, `prisma/`, root configuration, `.github/`, `.notebook/`, `docs/`, audit/spec bundles | Commit/import identity is not creator or assignment proof; new code receives no automatic verified grant. |
| Game/rules references and adapted names/prose | `src/modules/trouble-brewing/characters.ts`, `src/modules/trouble-brewing/script.ts`, `the-sies-files-docs/00_README.md` | Trouble Brewing/Blood on the Clocktower references, engine code, names, translations, and adapted/copied prose have separate evidence questions. |
| Scenario and localization | `src/modules/scenario/definition.ts`, `src/i18n/pl.ts`, `src/lib/presentation/labels.ts`, UI text | Development fixtures do not establish creator, upstream source, or permitted use. |
| Authoring art | `assets/maps/sieski/the-sies-files-map-master.png`, `assets/maps/sieski/the-sies-files-map-base.png`, `assets/maps/sieski/the-sies-files-map-west-reveal.png` | Canonical/master label does not prove source-to-master or master-to-base/reveal derivation. |
| Runtime derivatives | `public/maps/sieski/map-base-029178c4b18a.webp`, `assets/maps/sieski/map-west-reveal-3c1b1cdf7268.webp` | Public base versus protected overlay; both remain publicly visible in source history. |
| Vectors and favicon | `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`, `public/icon.svg`, `src/app/favicon.ico` | Static placement is potential distribution even without a current UI reference; template-like names prove no grant. |
| Reference-only images | `the-sies-files-docs/assets/map-reference.png`, `the-sies-files-ux-audit/ChatGPT Image 24 sie 2026, 11_14_11.png` | Public repository material, not established runtime assets; filename does not prove AI origin or terms. |
| Fonts | `src/app/globals.css`, `src/app/layout.tsx` | System stacks, no observed tracked font binaries or loader; named system fonts are not bundled redistribution evidence. |

### Key Decisions

- **Local verification context.** (session-settled: user-directed — chosen over hosted application testing: the application is local-only and the user selected local testing.) Governs R13, R16. GitHub CI still runs automatically for the PR.
- **Private-view behavior stays protected.** (session-settled: user-directed — chosen over retaining a read-only private-view copy after access loss: revoked access must clear the private view.) Governs R4. This tooling introduces no affected UI.
- **Failures require explanations.** (session-settled: user-directed — chosen over skipping, weakening checks, or relying on unstable raw captures: evidence must explain what failed.) Governs R16.

### Acceptance Examples

- AE1. **Covers R2, R6, R12.** Given complete current coverage and unknown art/code rights, a technical check succeeds, reports `permission_not_established`, and lists concrete owner gaps; it never calls the release cleared.
- AE2. **Covers R6.** Given a verified group and a newly added file, that file cannot inherit verified permission from a broad glob without evidence binding the expanded scope; uncovered or stale membership fails technical validation.
- AE3. **Covers R7–R10.** Given lock metadata saying Lucide ISC and a matching installed license containing a Feather MIT section, the collected evidence retains the full file and both terms; an uninstalled optional foreign-platform package remains only a lock candidate.
- AE4. **Covers R4, R5, R15.** Given the protected west WebP, inventory records its identity and derivation reference without copying its bytes into notice artifacts or adding a public runtime URL.
- AE5. **Covers R8, R11, R13.** Given a Git-free baseline capsule with mismatched installed package metadata, the report records mismatch, refuses matching-release attribution, and the technical evidence-integrity check fails rather than borrowing the workspace package.

### Scope Boundaries

- No first-party license selection, invented ownership/assignment, fan-content clearance, compatibility opinion on SPDX expressions, or legal-clearance certification.
- No content replacement, artwork regeneration, authorization/UI/gameplay changes, deployment flags, startup approval flow, database migration, or new UI.
- No new external parser, registry-query framework, SPDX resolver, or package-install behavior. Existing Node tooling suffices.
- A clearance-blocking CI mode is considered and not built: R12 requires truthful unknowns to remain usable. Revisit only after actual evidence and a requested clearance policy exist.
- Exhaustive binary composition and legal obligations analysis is not claimed: generated/native/browser evidence limits remain gaps under R8–R9, rather than being erased by a package scan.

#### Deferred to Follow-Up Work

- Item #7 retention is a separate artifact and implementation. The user's manual-cleanup-only choice remains its input; this work adds no retention policy or automatic deletion.
- Obtaining and reviewing owner agreements, grants, adaptation permissions, intended future private/public/commercial sharing, and final notice obligations requires the owner and, where needed, an appropriate legal reviewer.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Versioned JSON ledger with explicit expanded membership.** Store policy, entries, current per-file hashes, and evidence metadata in `provenance/content-ledger.json`; expose a human-oriented index at `docs/content-provenance.md`. Under R1–R6, each group has a deterministic membership digest and each evidence assertion binds paths/digests, use, and revision. Unknown groups may grow after an explicit refresh, but verified evidence never silently expands. Evidence references are relative nonsensitive record pointers; an external/private agreement is described by ID, custodian, scope, and review record, never opened or copied by the checker. Technical validation checks this record's presence and binding, not the truth or legal sufficiency of an agreement.
- KTD2. **Filesystem discovery independent of Git.** A native filesystem allowlist inventories repository source roots and explicit root files, including hidden `.github/` and `.notebook/`, with exclusions applied before reading bytes. Reconcile discovered included files against ledger membership; report new top-level paths for policy classification without traversing unknown roots. Exclude `.git`, environment/secret names, dependencies, build/test outputs, and evidence directories. Reject symlinked source files/directories rather than following them. This preserves R6 and R13 in source capsules without importing the database-owning baseline module into the collector.
- KTD3. **Separate lock candidates from installed and traced observations.** Commit `provenance/dependency-index.json`, generated solely from `package.json` and `package-lock.json`. Supplemental evidence lives in ignored `provenance-results/` or the baseline's explicitly selected provenance output directory. Use lock package paths, not package names alone, for nested versions. Installed evidence verifies package name/version, records lock integrity as declared metadata rather than proving local bytes match a tarball, and records missing/mismatched status. Optional OS/CPU restrictions and dev/build flags are facts, not shipped classifications. Read only explicit build trace manifests inside the selected build, validate referenced paths, and report trace limitations instead of guessing browser/native composition (R7–R8, R11).
- KTD4. **Complete notice evidence with bounded safe reads.** Discover conventional LICENSE/LICENCE/NOTICE/COPYING/COPYRIGHT files within each expected installed package, including bounded subdirectories for bundled notices, without walking nested dependency roots as part of that package. Reject symlinks, path escapes, nonregular files, invalid UTF-8, and binary data. Set a documented 2 MiB per-file and 16 MiB per-package text limit with an explicit incomplete diagnostic on excess; never truncate into a purported complete notice. Preserve accepted full UTF-8 bytes and hashes in a per-package evidence bundle, with a deterministic notice index. Embedded license banners in selected distributed files remain intact; index bounded observed banners without asserting a full binary audit. Lucide's complete multi-license file is the positive fixture for R9–R10.
- KTD5. **Independent technical validity and permission state.** The report has separate schema/inventory/artifact validity, permission state, gaps, and distribution-evidence limitations. Current evidence yields `permission_not_established`; missing owner facts do not fail technical checks. A stale ledger, unsafe read, missing required generated artifact, falsely verified claim, installed mismatch presented as a match, or inconsistent source/build identity fails the relevant technical check. Report package absence separately from unsafe reads; optional uninstalled candidates are not failures by themselves (R6, R8, R10–R12).
- KTD6. **One required provenance stage in the existing baseline.** Run the combined technical check after the build, using the capsule's source ID and applicable build record, and retain only R15-safe inventory/notice evidence. Add this stage to normal completion evaluation and upload explicit report/notice paths. Update baseline exclusions for `provenance-results/` before adding output there. Existing stage dependency/failure behavior remains intact; no generic CI platform is introduced (R13, R16).

These choices follow the requested repository-native approach. A new compliance service or SPDX framework would add a different ownership boundary without resolving missing owner facts, so no consequential mechanism choice remains for a bake-off.

### High-Level Technical Design

**Evidence flow:** The ledger and filesystem inventory feed content validation; manifests and lockfile feed the portable dependency index; installed packages and an optional recorded build feed supplemental notice/distribution observations. A combined report binds their digests and feeds the baseline stage, which publishes only the permitted artifact subset. This separates portable source facts from machine-specific observations at every boundary.

**Invocation protocol:** First validate input/output roots and load policy. Next inventory source and compare expanded memberships and raw hashes. Then compare the portable dependency index with lock candidates, inspect allowed installed notices and selected trace manifests, and render reports. Finally validate report completeness and source/build binding before returning technical success or failure. Generation and checking must not depend on Git metadata.

**Decision matrix:**

| Input condition | Technical result | Permission/distribution interpretation |
|---|---|---|
| Current hashes, complete coverage, owner evidence missing | Pass | `permission_not_established`; owner gaps nonempty |
| Verified claim with no scoped evidence record | Fail | Unsupported assertion; never approval |
| Changed asset bytes or newly unowned included file | Fail | Refresh and classify explicitly |
| Matching installed version with complete notice file | Pass for that evidence | Observed package notice, not proof of all shipped components |
| Optional candidate absent on this platform | Pass if accurately labeled | Not observed installed; no current-platform shipped claim |
| Installed version differs from locked candidate | Fail identity check | Mismatch recorded; no matching-release notice attribution |
| Unsafe/binary/oversized notice file | Fail safe collection check | Incomplete collection; no copied unsafe bytes |
| Build trace absent or not exhaustive | Pass if accurately labeled | Distribution coverage unverified; explicit gap |

**Report lifecycle:** Portable artifacts have only deterministic source-derived content. A supplemental run starts incomplete, becomes technically valid only after required sections and identity checks complete, and remains failed/incomplete on interruption or malformed output. Permission state changes only through new documented evidence, independently of this lifecycle. The checker must reject a success-shaped truncated report.

### Assumptions

- Proposed script/file names and the JSON organization are implementation choices, not owner-confirmed rights facts. They may be adjusted coherently while preserving the contracts and test coverage.
- A metadata-only ledger plus full public upstream notice evidence is sufficient for this engineering handoff; it is not assumed sufficient for any future distribution's legal obligations.
- No installed package evidence beyond the expressly observed samples has been established during planning. Exact installed/platform/build contents are implementation-time observations.

### Research and Existing Patterns

- `scripts/build-map-assets.mjs` maps base/west PNG inputs to their distinct runtime outputs. Its `hashOf` hashes textual `shasum` output, not raw WebP bytes directly; do not repeat the filename-prefix claim as a raw-byte identity.
- `src/modules/map/assets.ts` stores the protected west file outside `public/`; `src/content/manifest.ts` exposes only the authorized layer route and retains `productionReady: false`. The inventory records this delivery distinction without modifying it.
- `src/app/globals.css` defines system sans/monospace stacks; `src/app/layout.tsx` has no font loader. `README.md` still claims Geist/`next/font`; correct only that factual claim and add the provenance position/link.
- `package-lock.json` is v3, unchanged by item #5. The earlier pinned dossier counted 542 non-root candidate entries; implementation must derive the current count rather than hardcode it. The root manifest has no first-party license field, and `package.json`'s private flag is not repository visibility.
- Observed `node_modules/lucide-react/package.json` identifies version `1.34.0`, matching the lockfile. Its full `LICENSE` contains ISC terms, a Feather-derived icon list, and Cole Bemis MIT terms. This is supplemental installed evidence, not a Git-pinned first-party grant.
- `scripts/regression-baseline.mts` captures source before reconstruction, then runs isolated stages in a capsule without Git metadata. Its `verifySource` discovers additions via filesystem traversal; output exclusions and identity-bound evidence are useful patterns. Do not reuse its database imports for pure provenance tests.
- `tests/regression-baseline-tooling.test.ts` is the integration-test location for capture/exclusion/stage behavior. `docs/regression-baseline.md` documents retained evidence and independent gate failure reporting.
- Diff review from `c2e00f2a9fb505b1f159476447acd880b7216dc2` to the stated baseline confirms package manifests, map build script, map assets/constants/manifest, font configuration, and README unchanged. Item #5 did add/change code; the ledger must cover that current code rather than reuse old code hashes.
- Original item #6: `docs/ideation/2026-10-28-legacy-app-reinforcement-ideation.html`, section `idea-6`. Its source/rights/distributed-dependency distinctions govern the category coverage above.

### Risks and Deferred Evidence

Owner facts remain unavailable for inherited code/specs/audits, rules/name/prose adaptations, scenario/localization, master/input art, references, vectors, and favicon. Each checklist entry asks for the actual source, creator/supplier, contributor/employer/contractor rights, exact grant/terms and date, covered uses/forms, required notices, and a safe evidence-record reference. Future private/public/commercial distribution intent must also be obtained rather than inferred from local execution.

Prisma-generated engines, sharp/libvips, browser bundling, and upstream embedded notices may have obligations not visible in package-level license fields. Reports must name what was and was not inspected. The owner's later legal assessment is outside the technical pass/fail contract.

---

## Implementation Units

### U1. Source/content ledger and coverage validation

**Goal:** Give the owner a complete, byte-bound source/content account with honest unknowns.

**Requirements:** R1–R6, R11–R12, AE1, AE2, AE4.

**Dependencies:** None.

**Files:** Create `provenance/content-ledger.json`, `scripts/provenance/content.mts`, `scripts/provenance/safe-files.mts`, `tests/provenance-content.test.ts`, and `tests/fixtures/provenance/` content fixtures.

**Approach:**
1. Implement the allowlisted source discovery and safe file policy in KTD2, with a separately callable validator and deterministic refresh behavior.
2. Populate current category membership and raw-byte hashes per KTD1, including inherited item #5 code and the new provenance files; keep evidence assertions independent from discovery rules.
3. Record R5 lineage, distribution axes, unknown creator/grant records, font observations, and safe evidence references in the ledger.
4. Avoid self-referential hashes: exclude the ledger's own serialized bytes from its member digests, identify it via the report's ledger digest, and cover its category/schema explicitly. Generated index artifacts use the same explicit self-reference rule.

**Patterns to follow:** Native hashing, exclusions-before-read, and discovered-addition checks in `scripts/regression-baseline.mts`; fixture-driven tooling tests rather than application/database setup.

**Test scenarios:**
1. Covers AE1. Complete coverage with unknown rights passes technical validation and retains named owner gaps and the required permission state.
2. Omitting a runtime map, reference image, newly added script, or policy-included root file fails coverage; two primary group owners for one path fail duplication checks.
3. Changing asset bytes under the same filename fails stale-digest validation; filesystem discovery without `.git` still detects the change and additions.
4. Covers AE2. A new file matching a verified group's discovery pattern cannot acquire the old verified evidence; wrong membership/source/use binding or absent evidence fails.
5. Absolute, traversal, unknown-root, duplicate-normalized, symlinked-parent, and escaping-file paths are refused before content reads; secret/generated roots are excluded without reading their bytes.
6. Covers AE4. West-layer metadata preserves its protected route and output path; the report contains no image bytes or inferred master derivation.
7. Repeated refresh/check cycles are stable, including the explicit ledger self-reference exception and new unknown tooling membership.

**Verification:** The current repository validates without app/DB access; a fixture omission and a stale hash fail for the intended reasons. Every required category has an accountable primary coverage entry.

### U2. Lock candidate index and safe upstream notice evidence

**Goal:** Preserve actual notice evidence without overstating installed or distributed coverage.

**Requirements:** R7–R11, R15, AE3, AE5.

**Dependencies:** U1 safe filesystem primitives.

**Files:** Create `provenance/dependency-index.json`, `scripts/provenance/dependencies.mts`, `scripts/provenance/notices.mts`, `tests/provenance-dependencies.test.ts`, `tests/provenance-notices.test.ts`, and dependency/notice fixtures under `tests/fixtures/provenance/`.

**Approach:**
1. Generate the portable candidate index from the exact package/lock manifests per KTD3, including nested package identities and overlapping flags.
2. Inspect only expected package locations inside the selected repository's dependency root; distinguish missing candidates and mismatches from evidence for matching installations.
3. Collect full texts and bounded embedded-notice observations under KTD4, recording source, version, hash, and collection limits in machine-specific evidence.
4. Attach safe selected-build trace observations without following arbitrary traced paths or promoting a server trace to proof of complete browser/native composition.

**Execution note:** Prove unsafe-input refusal and complete Lucide/Feather text preservation with isolated fixtures before scanning the real dependency tree.

**Patterns to follow:** Existing lockfile and Node filesystem/crypto use; preserve upstream terms verbatim rather than summarizing them.

**Test scenarios:**
1. All fixture lock candidates, including nested duplicates, direct/transitive/dev/build/optional/platform variants, retain distinct paths and flags; root metadata is not a dependency grant.
2. Covers AE3. A Lucide-style fixture retains the entire ISC section, Feather icon list, MIT condition, and disclaimer with an equal raw-byte hash; no metadata-only shortcut passes.
3. Covers AE3. An absent foreign-platform optional candidate is not labeled installed or shipped, and a dev-only package is not labeled runtime from its presence alone.
4. Covers AE5. A different installed name/version is reported as mismatch, fails identity validation, and is never attributed as notice evidence for the locked identity.
5. Unsafe package keys, notice traversal, symlinked package roots/files, nonregular files, binary text, invalid UTF-8, and oversized files fail safely without reading or copying outside approved roots.
6. Missing notice files remain explicit gaps; multiple complete LICENSE/NOTICE/COPYING files retain their separate hashes and full content.
7. Missing or partial build traces remain unverified distribution coverage; selected native/engine evidence is labeled observed, not universally complete.
8. Repeated scans of identical fixture inputs produce the same portable output; OS-specific installed results never alter the committed candidate index.

**Verification:** Current locked candidate output is reproducible, and a real installed scan identifies Lucide `1.34.0` and its complete terms when still present and matching. All other packages receive evidence-backed observed/missing/mismatch labels.

### U3. Combined report and automatic technical gate

**Goal:** Make provenance drift and artifact failures visible in the existing release workflow.

**Requirements:** R6, R8, R11–R13, R15–R16, AE1, AE5.

**Dependencies:** U1, U2.

**Files:** Create `scripts/provenance.mts` and `tests/provenance-report.test.ts`; modify `package.json`, `.gitignore`, `scripts/regression-baseline.mts`, `tests/regression-baseline-tooling.test.ts`, `.github/workflows/ci.yml`, and `docs/regression-baseline.md`.

**Approach:**
1. Expose an explicit refresh action for portable artifacts and a read-only check/report action through the existing `tsx` pattern; check never repairs stale data silently.
2. Implement KTD5 report validity and permission separation, binding source/ledger/lock/collector digests and applicable build identity. A standalone run may report no build evidence explicitly.
3. Add KTD6's required stage and its report ingestion/completeness checks. A missing, truncated, mismatched, or failed report cannot complete the baseline.
4. Ignore machine-specific outputs in Git and baseline source discovery; upload only explicit sanitized reports and allowed public upstream notice evidence under R15.

**Patterns to follow:** Stage dependency/results handling, `metadata.complete`, source/build linkage, and explicit artifact upload paths in existing baseline/CI. Keep permission state independent of the baseline's technical completion boolean.

**Test scenarios:**
1. Covers AE1. Unknown owner rights with valid inventory yields exit success for the technical check and a report with nonempty gaps and `permission_not_established`.
2. Stale portable output, falsely verified evidence, tampered report digest, missing required section, and incomplete report fail ingestion rather than producing success.
3. Covers AE5. A capsule without Git metadata checks successfully using only allowed source and its supplied source identity; a build/source mismatch fails attribution.
4. Output directories stay excluded from source capture/reverification; source/assets/new tools remain included and existing exclusions do not become broader.
5. Report/notice artifact inventory contains no raw image, private-contract, environment, session, or security-private bytes, including on failure.
6. Provenance-stage failure remains visible without suppressing independent inherited stages or weakening baseline completion requirements.

**Verification:** A current source-bound report can be regenerated and validated, mutated fixture reports fail, and the canonical baseline retains all inherited checks plus the new required stage.

### U4. Owner checklist and truthful repository position

**Goal:** Turn remaining rights gaps into concrete owner questions linked to the technical evidence.

**Requirements:** R2–R5, R12, R14–R16.

**Dependencies:** U1–U3 artifact names and report contract.

**Files:** Create `docs/content-provenance.md`, `docs/provenance-owner-evidence.md`; modify `README.md`; refresh ledger membership/identities for the final source tree.

**Approach:**
1. Document how to read technical validity, permission state, candidate/installed/traced labels, and full notice bundles, with links to the versioned ledger/index.
2. Write the concrete category-specific owner checklist from Risks and Deferred Evidence, separating factual creator/source/grant questions from future intended-use decisions.
3. Explain relative evidence references and private-record custody without publishing contract contents; state that no first-party license/grant is established by this work.
4. Correct the stale README font sentence using the actual system stacks and link the new documentation. Preserve the content-readiness and map boundaries in R4.

**Test expectation:** No new prose-only tests. Reuse U1/U3 link/reference, coverage, and final identity checks; manually inspect the README and checklist against actual source and generated report.

**Verification:** A reader can find every category's unresolved owner question, the exact technical evidence, and full available notices without mistaking a passing check for permission or an infringement finding.

---

## Verification Contract

### Focused Implementation Proof

Use the repository's existing lint, fresh typechecking, and Vitest entry points for the named tooling tests. These are implementation-time checks, not planning results. No app server, database migration, asset rebuild, or dependency installation is needed to prove pure fixture-based tooling behavior.

Verify the real repository ledger and portable index, then inspect the actual installed-package report and available notices. Compare two identical-input generations for deterministic output and manually confirm the complete Lucide/Feather text. Retain explicit incomplete diagnostics wherever actual evidence is unavailable. Confirm that unknown rights do not become a technical failure or an approval claim.

### Release Integration Proof

Because U3 changes shared baseline integration, the implementing caller must run the existing isolated canonical production baseline and all mandatory CI checks for the final captured source. Inherit item #5's reported reference inventory: 379 unit assertions, 50 ordinary browser cases, 19 security cases, one physical-recovery case, 21 actual A/B compatibility observations, and 21 production stages. These are prior reported results, not newly observed results from planning.

Compare native discovered/executed identities, not only totals; new tooling tests increase the unit denominator and the provenance stage increases the production-stage denominator. Preserve every inherited identity and required stage, including physical recovery and A/B compatibility. Attribute the new provenance report to the same capsule source/build and retain source-before/after equality. Do not label the final source green using an earlier source's result.

Existing CI automatically runs the canonical entry point on the PR. No extra ad hoc browser expansion is required for this tooling-only change beyond the inherited canonical gates. If an inherited or new gate fails, retain its source-bound failure and explain its cause under R16 before retrying; do not skip or weaken it.

### Artifact Inspection

Validate the uploaded artifact allowlist against R15 on success and failure. Portable files must not contain absolute workstation paths, timestamps, OS-specific installed lists, or self-referential hashes. Supplemental evidence may identify the inspected platform and build but must not contain private local-path leakage or sensitive content. Package copyright names and upstream notice text are public evidence, not participant data.

---

## Definition of Done

- U1 provides complete categorized current source coverage with stable identities and rejects coverage/evidence defects.
- U2 separates all lock candidates from actual observations and retains complete available upstream terms safely.
- U3 produces validated source/build-bound reports and a required automatic technical stage without changing the permission-state meaning.
- U4 gives the owner actionable evidence questions and corrects the README's font/license position.
- All fixture, real-inventory, installed-report, lint/type, and inherited canonical CI evidence required above is retained and attributed to its actual source.
- Remaining rights and distribution-evidence gaps are explicit; engineering completion does not assert legal clearance.
- No abandoned experimental code, unrelated cleanup, content substitutions, item #7 changes, private agreements, or machine-specific generated noise remain in the diff.
