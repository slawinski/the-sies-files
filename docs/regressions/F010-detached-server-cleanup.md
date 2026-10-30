# F010 — Interrupted Playwright left a detached Next process

- **Expected / actual:** cancelling an owned measured run stops its server and
  preserves partial reports. The first real interruption probe returned exit 1
  and incomplete reports as expected, but port 3100 still listened afterward.
- **Identity / evidence:** `B/interrupted-probe/`, source `d5c7b288…`;
  `T/sies-interrupt-probe.mts` drives SIGTERM after port readiness. Terminal
  process evidence: Next PID 54786, parent/group 54752, cwd exactly
  `baseline-results/interrupted-probe/capsule/source`. Only that proven owned
  group was manually terminated; no unrelated server was killed.
  [Runtime/source envelope](README.md). Cancellation occurred before complete
  browser execution, so no full-suite browser denominator applies.
- **Provenance:** **new baseline tooling defect**. **Cause:** environment/harness
  lifecycle ownership gap. Killing the npm/Playwright group does not necessarily
  kill Playwright's separately detached webServer group. The original cleanup
  string overclaimed completion; this entry corrects that historical receipt.
- **Small reproduction:** start the production baseline, signal its controller
  after the owned port listens, then probe port 3100 and the recorded cwd.
  The external driver performs this, not a mocked child-process assertion.
- **Disposition / proof:** the baseline server wrapper records its own spawned
  group PID under the live DB lease. The controller gracefully stops only that
  owned group, escalates if required, and verifies the port is released before
  reporting complete. `B/interrupted-probe-fixed/` and the external probe return
  `signalled:true`, exit 1, `portStillListening:false`: 1/1 corrected real
  cancellation. Partial logs and missing native-report status survive. The
  final three production runs plus development also prove normal teardown.
  Impact: local resource leak, repaired without production behavior changes.
