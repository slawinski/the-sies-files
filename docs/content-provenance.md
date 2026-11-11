# Content provenance and upstream notices

## What a technical pass means

The [content ledger](../provenance/content-ledger.json) records expanded primary
membership, raw-byte SHA-256 identities, source/creator questions, intended use,
distribution distinctions and permission-evidence metadata. The
[dependency index](../provenance/dependency-index.json) records every non-root
lockfile-v3 candidate, including nested versions and overlapping development,
optional, installation, engine and platform flags.

These are engineering inventories, not legal clearance. The current permission
state is **`permission_not_established`**. Each content category remains
**`OWNER_EVIDENCE_REQUIRED`**. Missing rights evidence does not make the technical
check fail; stale hashes, missing coverage, duplicate ownership, unsafe reads,
unsupported verified assertions, mismatched installed identities or incomplete
required artifacts do. Neither a pass nor a gap is an infringement finding.

No first-party license or reuse grant is established by this work. Public source
visibility is not a grant. The repository is public according to the supplied
repository research; `package.json`'s `private` flag concerns package publishing,
not repository access. Local-only application execution, public repository
material, possible static delivery and authorized in-game visibility are separate
facts. Owner-supplied agreements and future distribution intent are still needed.

## Coverage and identities

The ledger's fixed source policy covers `src/`, `scripts/`, `tests/`, `prisma/`,
`public/`, `assets/`, `.github/`, `.notebook/`, `docs/`, the three original
specification/audit bundles, `provenance/`, and explicit root configuration files.
Discovery uses the filesystem, not Git, so it works in canonical reconstructed
capsules. Unknown top-level paths require policy classification without traversal.
Excluded environment/secret, dependency, generated and evidence roots are filtered
before content reads. Source symlinks, traversal, absolute paths, noncanonical
spellings and duplicate ownership are refused. New included files cannot hide
behind `.gitignore` or silently inherit a verified grant.

Each included file has exactly one primary category. Rules/name/prose, scenario
and localization, authoring art, runtime derivatives, reference images,
vectors/favicon, inherited specs/audits, fonts/layout and other repository
code/text are distinguished. UI prose within the code/text group still needs
separate source/adaptation questions; primary ownership is not proof of a shared
creator. See the [owner checklist](provenance-owner-evidence.md) for all categories.

Membership digests bind expanded path/hash lists. Ledger and generated index
serialized bytes are deliberately excluded from their own membership hashes:
their paths are still covered, their schemas are validated, and the combined
report binds their actual bytes separately. This avoids an impossible hash fixed
point. A `verified` metadata assertion requires a nonsensitive record ID,
custodian, review record, exact membership digest/revision and intended-use binding.
The checker cannot establish that the underlying claim is true or legally
sufficient. Refresh refuses to change verified membership; new evidence must be
recorded deliberately rather than acquired through a future-file glob.

## Artwork, reference content and fonts

[`build-map-assets.mjs`](../scripts/build-map-assets.mjs) documents base PNG →
public base WebP and west PNG → protected west WebP:

| Input | Runtime derivative | Delivery |
| --- | --- | --- |
| `assets/maps/sieski/the-sies-files-map-base.png` | `public/maps/sieski/map-base-029178c4b18a.webp` | Public static base |
| `assets/maps/sieski/the-sies-files-map-west-reveal.png` | `assets/maps/sieski/map-west-reveal-3c1b1cdf7268.webp` | Protected authorized layer route, outside `public/` |

Source-to-master and master-to-input derivations remain unproven. This work did
not regenerate assets or establish pixel reproduction. Filename suffixes come
from hashing textual `shasum` output in the historical script; the ledger instead
computes SHA-256 over each file's raw bytes. Protected `WEST_AREA` delivery,
paths/API authorization and `productionReady: false` remain unchanged. Protected
in-game delivery does not make artwork private in public source history.

The original reference map and UX-audit image are reference-only observations,
not established runtime assets. Their filenames do not establish AI origin,
creator, source inputs or terms. Public SVGs and the favicon need source and grant
evidence even if not referenced in current UI code.

[`globals.css`](../src/app/globals.css) declares system sans and monospace stacks;
[`layout.tsx`](../src/app/layout.tsx) has no webfont loader. No tracked webfont
binaries were observed. Named system fonts are not evidence of bundled font
redistribution or a font license grant.

## Generate, check and inspect

```sh
npm run provenance:refresh     # explicit intentional ledger/index update
npm run provenance:check       # never repairs portable artifacts
npm run test:provenance        # pure tooling fixtures; no app/DB/dotenv setup
```

Finish edits to included documentation/tooling before refresh and measurement.
Refresh/check on unchanged inputs is deterministic. Portable files contain no
timestamps, workstation paths or machine-installed list. Commit the refreshed
ledger/index with their source changes. A commit itself does not change source
bytes, so the checkout check still passes afterward.

Standalone supplemental outputs are ignored under `provenance-results/current/`:

* `report.json`: technical validity, permission state, exact source fingerprint,
  collector/ledger/index/lock digests, explicit gaps, selected-build identity or
  `null`, and the notice artifact digest plus report digest.
* `notices.json`: one observation for every expected lock candidate, full accepted
  UTF-8 notice text with relative source path and raw-byte hash, and bounded
  embedded-banner observations with source hashes. Package copyright names and
  public notice terms are public upstream evidence, not participant data.

The [canonical baseline](regression-baseline.md) supplies its capsule source ID
and recorded build. Its required post-build stage writes the same two artifacts
under the selected run's `provenance/`, validates their completeness and digests,
and reconciles the actual source/build fingerprint. Final baseline metadata
retains source-before/after equality. CI uploads these two exact paths, never a
provenance directory wildcard. Authoritative results belong to those generated
source-bound reports, not hardcoded counts or an earlier source's green receipt.

## Candidates are not installed or shipped components

`not_observed_installed` means the expected package location was absent; an
optional foreign-platform candidate need not be installed. `observed_matching`
means installed name/version matched that locked location. It does not establish
local package bytes equal a registry tarball, despite declared lock integrity.
`identity_mismatch` refuses matching-release notice attribution and fails the
technical gate. Unsafe/malformed/binary/oversized inputs are explicitly incomplete.
Development, build, optional and platform metadata never become an all-shipped
classification.

Collection checks regular UTF-8 LICENSE/LICENCE/NOTICE/COPYING/COPYRIGHT inputs
through bounded package subdirectories, excluding nested dependency roots and
secret names. Limits: **2 MiB per file, 16 MiB accepted text per package, five
subdirectory levels and 30,000 discovered entries**. A notice directory, unsafe
link, invalid text or exceeded read limit fails collection; accepted notices are
never silently truncated. Deeper uninspected contents are diagnosed. Up to eight
selected JavaScript entry points provide bounded public license-banner
observations (64 KiB per banner); these are not whole source exports. Non-JS or
oversized selected banner sources remain explicit uninspected observations.

Lucide's complete LICENSE includes both ISC terms and the Feather-derived icon
list/Cole Bemis MIT terms. The collector retains the whole accepted file, not
just the package's ISC metadata. Other available full notices stay separate.
Absent conventional notice files remain named gaps, not invented notice texts.

Only two selected server NFT manifests are observed. Trace paths are checked
against the chosen build/dependency roots and are metadata only: traced image,
environment, private-record and session bytes are not exported. Server traces do
not prove complete browser bundling or native/generated binary composition.
**Prisma engines, sharp/libvips, browser bundles and embedded upstream notices
remain distribution-review gaps.** Full binary composition and legal obligations
analysis are not claimed by this inventory.

Private rights documents must stay with their custodian. Use nonsensitive record
pointers and scope/review metadata, never upload agreements to these artifacts.
This work adds no item #7 retention code, automatic deletion, content replacement,
deployment approval or first-party grant.
