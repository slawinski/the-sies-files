#!/usr/bin/env bash
# Compatibility entry: only the explicitly configured disposable drill is allowed.
set -euo pipefail

if (( $# )); then
  echo "Legacy positional arguments refused; use npm run recovery:prove with an explicit disposable DATABASE_URL" >&2
  exit 2
fi
exec npm run recovery:prove
