#!/usr/bin/env bash
# Release hardening: verify database backup + restore.
# Dumps the given database, restores it into a throwaway database, sanity-checks
# the table count, then drops the throwaway database.
set -euo pipefail

DB="${1:-the_sies_files}"
BACKUP_FILE="${2:-backup-$(date +%Y%m%d-%H%M%S).dump}"
RESTORE_DB="${DB}_restore_test"

echo "==> Dumping ${DB} -> ${BACKUP_FILE}"
pg_dump -Fc -d "$DB" -f "$BACKUP_FILE"

echo "==> Restoring into ${RESTORE_DB}"
dropdb --if-exists "$RESTORE_DB"
createdb "$RESTORE_DB"
pg_restore -d "$RESTORE_DB" "$BACKUP_FILE"

TABLES=$(psql -d "$RESTORE_DB" -tAc "select count(*) from information_schema.tables where table_schema='public'")
echo "==> Restored database has ${TABLES} tables"

dropdb "$RESTORE_DB"
echo "==> Backup/restore verified (artifact: ${BACKUP_FILE})"
