#!/usr/bin/env bash
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "$0")" && pwd)"
SKIP_AGENT=1 KEEP=0 "$SUITE_DIR/run.sh" stream-pipeline-ai-agent
