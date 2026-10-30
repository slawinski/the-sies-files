# F005 — First-seat protection prevents the intended Imp self-kill

- **Expected / actual:** E2E-04 expects its invalid non-Minion successor request
  to fail, then a legal Minion to become Imp. With `e2e-seed-0`, the invalid
  request returned HTTP 200; `expect(invalid.ok(), "invalid successor rejected").toBeFalsy()`
  received `true`. First failed transition: cycle-two IMP_KILL resolution.
- **Identity:** S0 `c3763052…` under the external seeded production observer;
  early stabilized development `b16a3a69…`; corrected S1 `60f542c8…`.
  [Exact runtime/source envelope](README.md). Generator 2, TB/1, TSF/1,
  ordered 13-player roster. Imp seat 0, Monk 4, Poisoner 8, Scarlet Woman 5,
  Spy 10; a legal Minion and MONK prerequisite are present.
- **Evidence:** `T/sies-u3-final-browser.{json,log}` and its retained trace under
  `T/sies-u3-final/source/test-results/`; S0
  `T/sies-s0-corrected-evidence/seed-control.{json,log}` and
  `seed-control-artifacts/…/trace.zip`. Corrected same-seed reports:
  `T/sies-u3-fixed-browser.json`, `B/canonical-{1,2,3}/browser.json` and
  `B/development-canonical/browser.json`.
- **Small reproduction:** create/commit seed `e2e-seed-0`, claim all players,
  drive cycle one; in cycle two use inherited first-eligible-seat choices.
  Poisoner and Monk target seat 0; Imp targets itself. Submit the original
  invalid-successor resolution. Audit records `DEATH_PREVENTED`, reason `MONK`.
  The external diagnostic preserves the failing assertion and leaves S0
  application/tests unmodified; its standalone observer spec/config are in `T`.
- **Provenance:** **existing relative to S0**, confirmed by the seeded S0
  control, not inferred from an earlier random passing run. **Cause:**
  fixture/assertion precondition defect. `resolveImpKill` returns after
  prevention, before succession validation. DB evidence confirms active
  cycle-two Monk protection on the Imp; role absence, wrong version and wrong
  DB are ruled out. Acceptance here is a valid no-death resolution, not proof
  that an illegal successor can become Imp.
- **Disposition / denominators:** retain the seed and original rejection plus
  STAR_PASS assertions; require roles before commit and route cycle-two Monk/
  Poisoner targets away from the Imp. Red: 1/1 S0 targeted control and 1/1
  early stabilized full-suite occurrence. Green: corrected full-suite E2E-04
  1/1 early control, 3/3 final production resets, 1/1 final development reset.
  No timeout, retry, skip, assertion weakening, seed shopping or app fix.
  Impact: inherited scenario could exercise protection instead of succession.
