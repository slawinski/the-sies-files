# F014 — Source verification missed additions

- **Expected / actual:** added, removed or changed policy-approved source paths
  must invalidate a measurement. Before the fix an added `ignored-added.test.ts`
  in a Git-free reconstruction returned `[]`, not the new path.
- **Evidence:** parameterized boundary regression `reconstructed source detects
  %s paths without Git` captures a synthetic repository, then mutates only its
  reconstruction. The addition is deliberately covered by a copied `.gitignore`:
  source added by a check must not escape verification through Git-ignore rules.
  The pre-fix focused run failed the addition case; deletion, content, mode,
  symlink-target and file-to-symlink cases already passed and remain controls.
- **Provenance / cause:** new observer tooling. Verification iterated only the
  captured entries; recapturing the separate original checkout did not detect
  newly introduced reconstructed source.
- **Disposition / controls:** recursively re-inventory policy-approved paths
  without Git, never follow directory symlinks, compare path sets and file/link
  metadata, and return sorted additions/deletions/changes. Retain the original
  manifest unchanged. Only the declared `excluded()` secret/generated/output
  policy is applied, not arbitrary copied ignore rules. A generated-output
  control includes an unreadable/dangling link beneath `node_modules` and a
  generated `next-env.d.ts`, proving excluded trees are not traversed.
  All six mutation cases and the generated-output control pass after the fix.

The capture policy itself is unchanged: initial capture uses Git to select
tracked and nonignored untracked source and records ignored exclusions without
reading their bytes. The post-run reconstructed inventory is deliberately
stricter about newly introduced paths. Full production controls are in the index.

An ad-hoc resource-preflight invocation using `tsx -e` initially failed while
transforming this ESM observer's top-level await as CommonJS. It did not start
or modify any database. Running the same port check with
`node --import tsx --input-type=module` passed; no production code was changed
for this probe invocation error.
