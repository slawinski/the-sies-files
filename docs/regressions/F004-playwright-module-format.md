# F004 — import.meta in Playwright's CommonJS transform

- **Expected / actual:** Playwright loads configuration and discovers nine
  scenarios; U3's initial invocation stopped before discovery with
  `SyntaxError: Cannot use 'import.meta' outside a module` in the new DB helper.
- **Identity / evidence:** U3 development capture `b13f5136…`, unchanged app;
  [runtime envelope](README.md). `T/sies-u3-browser.log` has the stack and no
  native browser report. This provides **zero executed browser coverage**.
  Seed/version inputs were not reached.
- **Provenance:** **new relative to S0**. **Cause:** environment/harness module
  compatibility defect: this package has no ESM package mode; Playwright's
  config loader transformed the imported helper to CommonJS, retaining the
  CLI-only `import.meta` expression.
- **Reproduction:** use that helper from `playwright.config.ts` with the
  inherited package mode. Merely rerunning or changing timeouts cannot fix a
  parser failure.
- **Disposition / controls:** remove `import.meta` from the shared helper;
  recognize its CLI entry by the script basename. No package/module-mode or
  application change was made. Subsequent nine-scenario discovery and the
  final development + three production suites pass, preserving assertions.
