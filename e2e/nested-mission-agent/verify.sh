#!/usr/bin/env bash
set -euo pipefail

WS="${1:?workspace required}"
BIN="$WS/bin/codument"
MAIN="$WS/main-repo"
INV="$WS/inventory-repo"

fail() { echo "VERIFY FAILED: $*" >&2; exit 1; }

[ -x "$BIN" ] || fail "missing built Codument CLI"
[ -d "$MAIN" ] || fail "missing main repository"
[ -d "$INV" ] || fail "missing inventory repository"

(cd "$MAIN" && "$BIN" validate --strict) || fail "main strict validation"
(cd "$INV" && "$BIN" validate --strict) || fail "inventory strict validation"

[ -f "$MAIN/codument/missions/active"/*/mission.xnl ] || fail "missing active root Mission"
[ -f "$INV/codument/missions/active"/*/mission.xnl ] || fail "missing active child Mission"

rg -l 'MissionLink' "$MAIN/codument/missions" >/dev/null || fail "missing MissionLink"
rg -l 'ParentMission' "$INV/codument/missions" >/dev/null || fail "missing reciprocal ParentMission"
rg -l 'completion_mode = "selected-tasks"' "$MAIN/codument/missions" >/dev/null || fail "missing selected-tasks contract"
rg -l 'mission_ref' "$MAIN/codument/missions" >/dev/null || fail "missing cross-layer mission_ref"
rg -l 'track_ref' "$MAIN/codument/missions" >/dev/null || fail "missing cross-layer track_ref"

(cd "$MAIN" && "$BIN" project bindings | rg 'inventory-repo') || fail "missing local ProjectRef binding"
git -C "$MAIN" check-ignore -q codument/.local/workspace-bindings.xnl || fail "workspace binding is not ignored"

test_count=0
for repo in "$MAIN" "$INV"; do
  [ -f "$repo/package.json" ] || fail "missing package.json in $repo"
  (cd "$repo" && bun test) || fail "application tests failed in $repo"
  test_count=$((test_count + 1))
done

rg -l 'order|inventory|reserve' "$MAIN" --glob '!codument/**' >/dev/null || fail "main business implementation missing"
rg -l 'reserve|stock|inventory' "$INV" --glob '!codument/**' >/dev/null || fail "inventory business implementation missing"

echo "real nested Mission ecommerce E2E verification passed for $test_count repositories"
