#!/usr/bin/env bash
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "$0")" && pwd)"

for task in todo ecommerce blog; do
  echo "== smoke task: $task =="
  SKIP_AGENT=1 MODE=plan-only KEEP=0 "$SUITE_DIR/run.sh" "$task"
done
