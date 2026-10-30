# F011 — IPv6 bind did not detect an IPv4 listener on macOS

- **Expected / actual:** an occupied IPv4 port is refused; the first focused
  preflight contract observed a resolved promise instead of rejection.
- **Evidence:** proof test `occupied port is rejected without terminating its
  server` in `tests/regression-baseline-tooling.test.ts`; sanitized original
  diagnostic: `promise resolved "undefined" instead of rejecting`.
  [Runtime/source envelope](README.md), no DB or scenario input involved.
- **Provenance:** **new tooling**, not an inherited application failure.
  **Cause:** environment/harness socket-family assumption. A wildcard IPv6 bind
  can coexist with a specific IPv4 bind on this host; it is not a sufficient
  contention check. The test's real HTTP server remained alive.
- **Small reproduction:** listen on an ephemeral `127.0.0.1` port, then attempt
  the original wildcard bind and observe it succeeds. This rules out a
  transient unrelated listener as the reason for the failed proof.
- **Disposition / controls:** probe both loopback families explicitly. The
  contract then verifies rejection and successfully fetches `unrelated` from
  the original server, proving refusal does not kill it. All 23 tooling
  contracts pass in all four final full-suite profiles. The initial focused
  failure was terminal-only; this excerpt is retained rather than inventing
  a native report for it.
