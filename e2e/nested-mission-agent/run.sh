#!/usr/bin/env bash
set -euo pipefail

SUITE_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SUITE_DIR/../.." && pwd)"
WS="${WS:-/tmp/codument-e2e-nested-mission-agent-$$}"
KEEP="${KEEP:-1}"
AGENT="${AGENT:-codex}"
MODEL="${MODEL:-}"
AGENT_TIMEOUT="${AGENT_TIMEOUT:-7200}"
CODEX="${CODEX:-$(command -v codex 2>/dev/null || true)}"
CODUMENT="${CODUMENT:-$REPO/dist/codument}"
REQUEST_FILE="$SUITE_DIR/request.md"
VERIFY="$SUITE_DIR/verify.sh"

cleanup() { [ "$KEEP" = "1" ] || rm -rf "$WS"; }
trap cleanup EXIT
say() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
run_with_timeout() {
  if command -v timeout >/dev/null 2>&1; then timeout "$AGENT_TIMEOUT" "$@"; else "$@"; fi
}
run_codument() {
  if [ -x "$CODUMENT" ]; then "$CODUMENT" "$@"; else bun run "$REPO/src/cli/index.ts" "$@"; fi
}

[ -f "$REQUEST_FILE" ] || { echo "missing request.md" >&2; exit 1; }
[ -x "$VERIFY" ] || { echo "missing executable verify.sh" >&2; exit 1; }
[ -x "$CODUMENT" ] || (cd "$REPO" && bun run build >/dev/null)
[ "$AGENT" = codex ] || { echo "This E2E currently requires AGENT=codex" >&2; exit 1; }
[ -n "$CODEX" ] || { echo "codex CLI not found" >&2; exit 1; }

say "Create isolated multi-repository workspace"
rm -rf "$WS"
mkdir -p "$WS/bin" "$WS/main-repo" "$WS/inventory-repo"
ln -s "$CODUMENT" "$WS/bin/codument"
for repo in "$WS/main-repo" "$WS/inventory-repo"; do
  (cd "$repo" && git init -q && touch .gitignore && git add .gitignore && git commit -q -m init)
done

say "Initialize Codument in both repositories"
for repo in "$WS/main-repo" "$WS/inventory-repo"; do
  (cd "$repo" && "$WS/bin/codument" init --agent=codex >/dev/null)
done

say "Run real Codex Mission implementation session"
PROMPT="$(cat "$REQUEST_FILE")

The isolated repositories are:
- main-repo: $WS/main-repo
- inventory-repo: $WS/inventory-repo

You are operating in $WS. Implement the complete requirement. Use real Codument CLI commands and the installed skills. Work autonomously without asking questions. You may create/update files in both repositories. Before finishing, run: $VERIFY $WS"

case "$AGENT" in
  codex)
    args=(exec -C "$WS" --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox)
    [ -n "$MODEL" ] && args+=(-m "$MODEL")
    args+=("$PROMPT")
    run_with_timeout "$CODEX" "${args[@]}" 2>&1 | tee "$WS/agent.log"
    ;;
esac

say "Run independent verification"
"$VERIFY" "$WS"

say "E2E complete"
echo "workspace=$WS"
