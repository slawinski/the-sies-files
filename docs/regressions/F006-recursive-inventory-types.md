# F006 — Recursive inventory function lacked a return type

- **Expected / actual:** new reporting code typechecks/builds; initial measured
  S1 failed TS7023 in `browserInventory`, cascading TS7006 implicit-any errors.
  Production browser coverage was correctly blocked by the failed build.
- **Identity / evidence:** `B/production-initial/`, source `b9bbf175…`;
  `types.log`, `build.log`, `stages.json`, `run.json`.
  [Runtime/source envelope](README.md). No browser scenario inputs executed;
  unit execution remained independent (its separate failure is F008).
- **Provenance:** **new relative to S0**. **Cause:** tooling typing defect;
  TypeScript cannot infer the recursive array return in this declaration.
  Source diagnostic, not a flaky build or inherited application type error.
- **Reproduction:** typecheck that captured source or build its isolated copy;
  the exact files remain in its private capsule. The smallest check is `npm run typecheck`.
- **Disposition / controls:** annotate the native browser inventory entry and
  recursive return type. All final type/build stages pass 4/4. Initial browser
  stage remains blocked, never run against stale `.next`; missing browser
  report remains recorded as incomplete, not a pass. No app change.
