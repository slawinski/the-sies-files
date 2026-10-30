# F012 — A deadline could pass after graceful shutdown

- **Expected / actual:** a stage that reaches its deadline must fail, even if
  its SIGTERM handler exits zero. The pre-fix boundary regression observed
  `passed, passed, passed` for the deadline, dependent and independent stages,
  instead of `failed, blocked, passed`.
- **Evidence:** `deadline fails a graceful zero exit, persists the reason and
  only blocks dependents` in `tests/regression-baseline-tooling.test.ts` uses a
  real Node child, a 500ms deadline and a SIGTERM handler that logs shutdown
  then exits zero. The focused pre-fix run had three failures and 20 passes;
  its other two failures are [F013](F013-retained-capsule-tooling.md) and
  [F014](F014-reconstructed-source-inventory.md). This was terminal evidence,
  not a fabricated native baseline report; no database or app behavior involved.
- **Provenance / cause:** new observer tooling. The timer sent SIGTERM but the
  close handler checked only exit status and interruption, not deadline expiry.
- **Disposition / controls:** set `timedOut` before sending the signal, require
  no timeout for success, and persist `timeout after 500ms` in `stages.json`.
  The same test now proves exit zero is still failed, its dependent is blocked,
  the independent stage passes, and shutdown output and diagnostics survive.
  All 23 tests in the focused baseline-tooling file pass after the fixes.

Full post-fix production evidence is recorded separately in the ledger index;
earlier S1 runs do not measure this fix.
