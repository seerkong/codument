#!/usr/bin/env bash
# Backward-compatible modeling-only E2E entrypoint.
# Prefer `e2e/modeling-engineering/run.sh` for the full registry flow.
set -uo pipefail

REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
MODE="${MODE:-plan-only}"
ENGINEERING="${ENGINEERING:-0}"
export REPO MODE ENGINEERING

exec "$REPO/e2e/modeling-engineering/run.sh" "$@"
