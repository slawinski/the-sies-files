#!/usr/bin/env bash
set -euo pipefail
if [[ $# -ne 0 ]]; then
  printf '%s\n' 'Set DATABASE_URL explicitly; positional database overrides are refused.' >&2
  exit 1
fi
exec npx tsx scripts/test-database.mts verify
