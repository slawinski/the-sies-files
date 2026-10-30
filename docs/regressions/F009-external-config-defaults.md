# F009 — External S0 observer lost imported configuration defaults

- **Expected / actual:** external production control retains one mobile worker
  and `baseURL`; all nine tests instead failed immediately with
  `apiRequestContext.post: Invalid URL`. It also incorrectly scheduled multiple
  workers. No gameplay command reached the server.
- **Identity / evidence:** unchanged S0 `c3763052…`, external observer only;
  `T/sies-s0-corrected-evidence/browser-production.{json,log}` and
  `production-artifacts/`. [Runtime/source envelope](README.md), fresh S0 build.
  No seed/role/version transition was reached.
- **Provenance:** **new observer defect**, never inherited app provenance.
  **Cause:** module interop/configuration error: spreading the imported `.ts`
  default under the external `.mts` loader did not spread the expected config
  object. Missing baseURL makes relative request paths invalid independently
  of database, roles or application code.
- **Reproduction:** inspect that failed report's project/worker/baseURL config
  and first relative POST. This is a deterministic pre-request failure, not
  random setup or slow readiness.
- **Disposition / controls:** explicitly declare the inherited mobile,
  one-worker, timeout and baseURL values in the identified external observer;
  change only runtime command/report destinations and first-failure tracing.
  Corrected `browser-production-corrected.{json,log}` passes 9/9. Neither
  observer version modifies S0 tests or config; original failures survive.
