#!/usr/bin/env bash
# Release hardening: verify the test suite runs against a clean database.
# Drops/recreates the test DB, applies migrations, runs the full suite.
set -euo pipefail

DB="${1:-the_sies_files_test}"
DB_URL="postgresql://psla@localhost:5432/${DB}"

echo "==> Recreating ${DB} from scratch"
dropdb --if-exists "$DB"
createdb "$DB"

echo "==> Applying migrations"
DATABASE_URL="$DB_URL" npx prisma migrate deploy

echo "==> Running full test suite"
npm test

echo "==> Clean-DB verification passed"
