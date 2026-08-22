# E2E Serial Suite Flakes
> Pre-existing Playwright flakiness, unrelated to map work

Suite: `tests/e2e/` — 1 worker, shared test DB, dev server on :3100.

- e2e-04: `generateAndCommitSetup` commits the FIRST random 13-player setup;
  test then requires a CHEF or MONK townsfolk. 7 townsfolk drawn from 13 →
  ~19% of candidates lack both → `assignments.find(...)!` crashes.
  (e2e-05/06 use `generateSetupUntilRole` and don't have this bug.)
- e2e-02/e2e-08 occasionally fail on nomination/vote API calls in full-suite
  runs but pass in isolation — suspected version/compile-timing jitter on the
  cold dev server; not reproduced deterministically.
- Pattern for UI tests needing realtime: wait for the LIVE indicator before
  triggering the mutation (cold route compile delays the SSE open).

Updated: 2026-08-22
