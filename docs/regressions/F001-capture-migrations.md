# F001 — Observer excluded migration SQL

- **Expected / actual:** a reconstructed source applies 12 migrations; initial
  `migrate deploy` found none. 85 unit hooks failed with PostgreSQL `42P01`,
  `relation "browser_sessions" does not exist`; nine create-game requests then
  failed with Prisma `P2021`, HTTP 500, missing `game_sessions`.
- **Identity:** invalid capture `8db91d…` versus corrected S0 `c3763052…`;
  exact source/runtime details and local path aliases are in [the account](README.md).
  No scenario reached setup, so seed/role/version inputs were not applicable.
- **Evidence:** `T/sies-s0-evidence/{stages.json,unit.json,unit.log,browser-dev.json,browser-dev.log}`;
  the invalid manifest is `T/sies-baseline-s0/manifest.json`. Its excluded list
  names all migration SQL. Corrected capsule/report paths are in the account.
- **Cause:** **environment/harness defect introduced by the observer**, not an
  inherited app defect. The SQL-dump regex also matched committed migration SQL.
  The copy lacked those files; PostgreSQL target agreement did not repair them.
- **Reproduction:** capture a tree containing `prisma/migrations/001/migration.sql`
  with the original exclusion, migrate into an empty owned DB, then run an
  existing DB test. Pure contract `includes schema migrations but excludes
  database dumps` now proves the exact boundary without real secrets.
- **Controls / disposition:** corrected immutable `8251540` reconstruction
  includes all 12 migrations. S0 unit 156/156 and development 9/9 pass, as does
  its production control. S1 canonical controls pass 3/3 complete runs. Original
  failed reports are retained; invalid capture is never application provenance.
  Severity: invalidated initial attribution, repaired in tooling only.
