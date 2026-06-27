#!/usr/bin/env bash
# Backward-compatible modeling-only E2E entrypoint.
# Prefer `scripts/verify-modeling-engineering-e2e.sh` for the full registry flow.
set -uo pipefail

REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
MODE="${MODE:-plan-only}"
ENGINEERING="${ENGINEERING:-0}"
export REPO MODE ENGINEERING

exec "$REPO/scripts/verify-modeling-engineering-e2e.sh" "$@"
