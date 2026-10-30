#!/usr/bin/env bash
# An explicit local *_test target is required; no reset override is supported.
set -euo pipefail
exec npx tsx scripts/test-database.mts reset
