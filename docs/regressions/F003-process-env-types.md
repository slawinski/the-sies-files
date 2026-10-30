# F003 — Next augments ProcessEnv with required NODE_ENV

- **Expected / actual:** pure target-resolution fixtures typecheck; five initial
  U2 diagnostics rejected partial input objects because `NODE_ENV` was required
  by the project's Next environment declaration.
- **Evidence:** initial U2 typecheck terminal output, preserved here as the
  sanitized diagnostic: `Argument of type '{ DATABASE_URL: string; }' is not
  assignable to parameter of type 'ProcessEnv'. Property 'NODE_ENV' is missing`.
  This was development validation, not an immutable measured S0/S1 report.
  [Runtime/source envelope](README.md); no DB operation or scenario was involved.
- **Provenance:** **new tooling**. **Cause:** fixture/interface typing defect,
  not an application failure. The resolver intentionally accepts partial
  explicit input, while the subprocess environment supplies a concrete mode.
- **Reproduction:** typecheck the original `ProcessEnv` argument signature with
  the existing partial target fixtures in this Next project. No dependency
  change or weakened assertion is needed to expose it.
- **Disposition / proof:** accept `Partial<NodeJS.ProcessEnv>` and construct the
  full child environment with a default test mode. Browser/build profiles set
  their explicit development/production mode. The isolated U2 typecheck passed;
  all four final full S1 typechecks and builds pass. Limitation: the first
  terminal-only failure has this durable excerpt, not a fabricated raw log.
