# Regression baseline

The inherited source S0 was captured before baseline implementation, from authorized
commit `8251540` (including UI commit `4bfdb51`). No application changes are part of
the baseline work. Raw capsules and reports are private local artifacts, not PR attachments.

## Capture and reconstruction

On Node 24, run `node scripts/regression-baseline.mts "$PWD" "$PWD/baseline-results/s0"`.
The output must not already exist. `source/` contains reconstructable included bytes;
`manifest.json` records SHA-256 identities, permissions, link targets, tests, exclusions,
Git ancestry and observer identity. `tracked.patch` contains only included paths.
Environment files (including examples), keys, generated files and ignored outputs are
excluded without reading their bytes. Escaping symlinks are refused. Keep capsules
private: test evidence can contain synthetic session tokens.

Install and run checks only in `source/`, never in the original checkout. A source
digest identifies the ordered path/content/permission/link manifest, not Git status
or a timestamp. Planning files are listed separately. Source changes invalidate a
comparison; use a new capture rather than overwriting an earlier specimen.

## Initial capture

- S0: `8db91d641b2e5d51dad39750db9c2e1e8a91d68c294dae6e4de0d945aea5a21a`.
- Included: 270 files, 31 test/spec files.
- Capsule: `/var/folders/zl/fkgnlthd363175f4ffymzcjh0000gn/T/opencode/sies-baseline-s0/`.
- External bootstrap observer: adjacent `sies-capture.mts`; its hash is in the manifest.
- Reconstruction locked install: `npm ci --no-audit --no-fund`, 542 packages, success.
- Runtime: Node 24.8.0, npm 11.6.0, macOS arm64.

This is not yet a completed runtime baseline. Completion requires all profiles and
failure reconciliation described by the implementation plan.
