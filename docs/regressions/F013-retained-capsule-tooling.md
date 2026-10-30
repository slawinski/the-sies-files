# F013 — Root checks traversed historical source capsules

- **Expected / actual:** retained `baseline-results/` evidence must not enter
  ordinary root lint/type checks. Before the fix ESLint's `isPathIgnored` was
  false for a capsule player page; TypeScript's parsed root project included
  **1,782** capsule files. The new boundary test observed `[false, false]`
  rather than `[true, false]` for capsule/current-source lint inclusion.
- **Evidence:** `root tooling excludes retained capsules while still including
  current source` creates a private, temporary capsule TypeScript file with an
  intentional type error. It queries real ESLint and TypeScript configuration,
  checks exclusion and positive current-source inclusion, then removes only its
  own fixture. The separate pre-fix TypeScript inventory probe above used the
  existing retained capsules. Both observations were terminal-only.
- **Provenance / cause:** new baseline workflow/configuration defect. Git ignore
  does not configure ESLint or TypeScript; broad root includes reached capsules.
- **Disposition / controls:** add `baseline-results/**` to the existing ESLint
  global-ignore object and `baseline-results` to TypeScript's excludes. No
  evidence was deleted and no application check was suppressed. After the fix,
  the boundary test, root `npm run lint` and root
  `npm run typecheck -- --incremental false` pass with historical capsules still
  present. No explicit CSS content scanner includes capsules.

See the ledger index for the full post-fix run and repeated root checks.
