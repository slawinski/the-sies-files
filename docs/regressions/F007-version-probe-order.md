# F007 — Server version probe preceded database creation

- **Expected / actual:** record the server version; `psql` exited 2 because its
  explicit `PGDATABASE=sies_baseline_s1_test` did not exist yet.
- **Identity / evidence:** early S1 `b9bbf175…`,
  `B/production-initial/postgres-version.log` and `stages.json`;
  [runtime/resource envelope](README.md). No seed/role inputs apply.
- **Provenance:** **new tooling ordering**, not inherited PostgreSQL failure.
  **Cause:** environment/harness dependency error. Target resolution was
  correct, but the metadata stage ran before the owned `reset-unit` creation.
- **Small reproduction:** probe an explicitly named, not-yet-created disposable
  DB. The later reset/migration succeeds on the same host/port/account, ruling
  out unavailable service or credentials as the cause.
- **Disposition / controls:** make the server-version query depend on
  `reset-unit`. All final profiles record PostgreSQL 16.15 after creation;
  no fallback to an original database or alternate URL was introduced.
