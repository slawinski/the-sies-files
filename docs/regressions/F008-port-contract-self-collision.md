# F008 — Contract test reused its parent's reserved server port

- **Expected / actual:** the synthetic first owner acquires a port and a second
  owner is refused; under baseline orchestration the first owner was already
  refused, because the test itself hardcoded parent-owned port 3100.
- **Identity / evidence:** S1 `b9bbf175…`,
  `B/production-initial/unit.json` and `unit.log`, exact title
  `a different database cannot claim an already owned port` in
  `tests/test-database-tooling.test.ts`. 177/178 assertions passed in that run.
  [Runtime/source envelope](README.md); scenario seeds do not apply.
- **Provenance:** **new tooling fixture defect**. **Cause:** fixture/assertion
  resource collision, not an application failure. Focused execution without a
  parent lease passed; full orchestration reserved 3100 before tests, exposing
  the test's invalid independence assumption.
- **Reproduction:** reserve 3100 through the baseline owner and run that
  original focused test. The first acquisition fails before any DB reset.
- **Disposition / controls:** use a separate synthetic lease-only port key
  derived from the worker PID. This test never binds or resets the parent's
  resources. All 179 assertions pass in every final full run, while the
  second-owner rejection assertion is unchanged. No bypass of ownership.
