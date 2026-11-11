# Owner evidence checklist

Current state: **`permission_not_established`**. All primary ledger categories are
**`OWNER_EVIDENCE_REQUIRED`**. A passing [technical inventory](content-provenance.md)
does not answer the questions below and does not select a first-party license.
The absence of evidence is not a finding of infringement.

## Questions for every category

1. What is the actual source, source revision/date and supplier? Who created or
   supplied each part? Repository accounts/import history are not authorship proof.
2. Was it employee, contractor, contributor, commissioned, licensed or third-party
   work? Who holds the relevant rights? What assignment, employer permission or
   contributor agreement actually covers it? Do not infer an assignment.
3. What exact grant/terms, version and effective date apply? What source paths,
   raw-byte identities and transformations does that evidence cover?
4. Does it permit the actual uses/forms: public source publication, possible
   static download, local gameplay/reveal, modification/adaptation, and any future
   private, public or commercial sharing? What future distribution is intended?
5. What attribution, license copies, notice preservation, modification notices or
   other conditions apply to those forms? Who will assess final obligations?
6. Who is the private-record custodian? What nonsensitive record ID and relative
   pointer can be recorded, along with scope, intended use, revision and review
   record, without publishing the agreement or personal contract information?

The checker validates metadata bindings, not legal truth or sufficiency. Have the
owner and, where appropriate, a qualified legal reviewer assess the actual
records. No second-human or production legal approval is asserted here.

## Category-specific follow-up

| Ledger category | Scope and additional questions |
| --- | --- |
| `repository-code-text` | Inherited application/engine code, current item #5 changes, new tooling/tests, configuration/migrations, notebook and repository docs. Identify actual writers/suppliers and rights; this work's merge authorization is not a reuse grant. Separate UI prose/adaptations from engine implementation. New code does not inherit verified permission from a path glob. |
| `inherited-specs-audits` | Original `the-sies-files-docs/`, audit and UX-audit prose. Who wrote/supplied each original specification, audit or adapted passage, under what terms? Does permission cover publishing the bundles with source? |
| `rules-names-prose` | Trouble Brewing/Blood on the Clocktower references in `src/modules/trouble-brewing/` and original specs. Separate implementation, rules references, character/game names, Polish labels/translations, copied/adapted prose and any fan-content conditions. Identify actual upstream material and adaptation permissions; do not infer clearance from references or reskinning. |
| `scenario-localization` | `src/modules/scenario/definition.ts`, `src/i18n/pl.ts`, `src/lib/presentation/labels.ts` and related UI text. Identify original and translated authors, source prose, factual inputs and permitted adaptations. Development-fixture labels do not establish approved production content or rights. |
| `authoring-art` | Master, base and west PNGs in `assets/maps/sieski/`. Obtain creator/supplier, original inputs and terms, source→master and master→base/reveal history. A canonical filename or geographic reference is not proof of input rights. |
| `runtime-derivatives` | Public base WebP and protected west WebP. Bind evidence to both input/output digests and permitted transformations/distribution forms. The existing script documents mappings, not master derivation or pixel reproduction. Protected game delivery and public repository exposure need separate answers. |
| `reference-images` | Original docs' `assets/map-reference.png` and the UX-audit PNG. Identify real source/creator, underlying inputs and terms; ask specifically whether reference-only files may be published in source. Filename/appearance does not establish AI origin or rights. |
| `vectors-favicon` | Public SVGs, custom icon and `src/app/favicon.ico`. Obtain original source and exact terms/attribution for each; template-looking names and lack of current UI references are not grants or distribution exclusions. |
| `fonts-and-layout` | Verify actual system stacks/no observed loader or tracked webfont binaries. If a future release bundles fonts, obtain exact binary/source/terms and required notices then; do not claim system family names are redistributed files. |

## Release/dependency review

* Select the actual release, source/build identities, intended distributed forms
  and target platforms. Read its generated `report.json` and `notices.json`, not
  just package metadata or an old run's inventory.
* Review direct/transitive/development/build/optional/platform candidates against
  actual installed and selected-trace observations. Missing optional packages are
  not installed/shipped evidence; matching version is not tarball verification.
* Preserve complete upstream texts and conditions. Lucide requires reading the
  ISC section **and** Feather icon list/Cole Bemis MIT section, not ISC alone.
* Resolve named missing-notice/collection-limit gaps and assess applicable
  attribution/modification requirements (including caniuse-lite and dependencies
  with NOTICE files) for the actual distributed form.
* Establish the generated/native/browser composition and upstream notices not
  proven by package scans: Prisma-generated engines, sharp/libvips, browser
  bundles and embedded/bundled upstream components. No all-shipped-components
  coverage claim is established here.
* Record who reviewed each obligation, what evidence/release it covered, any
  unresolved limitations and safe record pointers. Keep private agreements out
  of the public repository, generated artifacts and CI attachments.

The future item #7 input remains manual cleanup only: archive completed games and
keep full history until the owner explicitly selects permanent purge. This
checklist does not implement that policy or authorize deleting historical
evidence.
