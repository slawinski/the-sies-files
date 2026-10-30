# F002 — Empty libpq service filename

- **Expected / actual:** explicit disposable reset succeeds; `dropdb` refused
  before mutation with `service file "" not found`.
- **Identity / evidence:** U2 tooling development, unchanged S0 application;
  [runtime envelope](README.md), private `sies_baseline_smoke_test` on 55439.
  `T/sies-db-smoke.log` preserves the failing stage. Initial U2 clean-DB reset
  showed the same diagnostic. No game/seed inputs were reached.
- **Provenance:** **new relative to S0**. **Cause:** environment/harness defect.
  The helper tried to neutralize inherited `PGSERVICEFILE` using an empty
  string; libpq interprets a set variable as a filename, even when empty.
- **Small reproduction:** invoke libpq with `PGSERVICEFILE=''` and the owned
  local connection environment. Remove service variables entirely, rather than
  interpolate credentials or change the target, then repeat.
- **Disposition / proof:** the helper deletes service/connection override
  variables. Its credential/target contract checks deletion and percent decoding.
  `T/sies-db-smoke-corrected.log` proves migrate → insert synthetic game → reset
  → empty game table. `T/sies-u2-verify.log` records 170/170 unit tests on the
  repaired fresh target. All final reset stages pass. No application repair.
