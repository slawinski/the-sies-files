#!/usr/bin/env bash
# Reset the E2E database from scratch (audit spec 24 §2.2 safety guard).
# Refuses to run unless the target database is clearly test-only.
set -euo pipefail

URL="${E2E_DATABASE_URL:-postgresql://${USER:-postgres}@localhost:5432/the_sies_files_test}"
DB_NAME="$(node -e "console.log(new URL(process.argv[1]).pathname.replace(/^\\//, ''))" "$URL")"

if [[ "$DB_NAME" != *_test* ]]; then
  if [[ "${ALLOW_E2E_DB_RESET:-}" != "1" ]]; then
    echo "Refusing to reset non-test database '${DB_NAME}'." >&2
    echo "Set E2E_DATABASE_URL to a *_test database or ALLOW_E2E_DB_RESET=1 to override." >&2
    exit 1
  fi
fi

echo "==> Recreating ${DB_NAME}"
dropdb --if-exists "$DB_NAME"
createdb "$DB_NAME"

echo "==> Applying migrations"
DATABASE_URL="$URL" npx prisma migrate deploy

echo "==> E2E database ready: ${DB_NAME}"
