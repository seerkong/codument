#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WS="${WS:-$(mktemp -d /tmp/codument-e2e-nested-mission.XXXXXX)}"
BIN="$WS/bin/codument"
MAIN="$WS/main"
CHILD="$WS/child"
KEEP="${KEEP:-0}"
cleanup() { [ "$KEEP" = "1" ] || rm -rf "$WS"; }
trap cleanup EXIT

say() { printf '\n== %s ==\n' "$*"; }

say "Build current Codument"
(cd "$REPO" && bun run build >/dev/null)
mkdir -p "$WS/bin" "$MAIN" "$CHILD"
ln -s "$REPO/dist/codument" "$BIN"

say "Initialize independent main and child repositories"
for repo in "$MAIN" "$CHILD"; do
  (cd "$repo" && git init -q && touch .gitignore && git add .gitignore && git commit -q -m init && "$BIN" init --agent=codex >/dev/null)
done

say "Create parent and child Mission authorities"
(cd "$MAIN" && "$BIN" mission create root-evolution --stage active >/dev/null)
(cd "$CHILD" && "$BIN" mission create repo-a-evolution --stage active >/dev/null)

python3 - "$MAIN" "$CHILD" <<'PY'
from pathlib import Path
import sys
main, child = map(Path, sys.argv[1:])
parent = main / "codument/missions/active/root-evolution/mission.xnl"
text = parent.read_text()
text = text.replace('<ProjectRef #host { kind = "host" }>', '<ProjectRef #host { kind = "host" }>\n    <ProjectRef #repo-a { kind = "external" }>')
needle = '<Task #G1-T1 { name = "" status = "NOT_STARTED" order = 0 }>'
if needle not in text:
    # Scaffold versions may use a different empty task shape; add a valid task group before TaskSpace.
    marker = '  <TaskSpace'
    task = '''  <TaskSpace #space_root-evolution { name = "root-evolution" version = "1" child_mode = "dag" } (\n    <SubNodes [\n      <TaskGroup #G1 { name = "Cross repository delivery" status = "NOT_STARTED" order = 0 } (\n        <SubNodes [\n          <Task #G1-T1 { name = "repo-a delivery" status = "NOT_STARTED" order = 0 } (\n            <MissionLink #repo-a-link { state = "bound" project_ref = "repo-a" mission_ref = "repo-a-evolution" completion_mode = "selected-tasks" } (\n              <SelectedTasks [<TaskRef { ref = "A-G1-T1" }>]>
            )>\n          )>\n        ]>\n      )>\n    ]>\n  )>\n'''
    start = text.index(marker)
    end = text.index('  <Schedule', start)
    text = text[:start] + task + text[end:]
else:
    text = text.replace(needle, '''<Task #G1-T1 { name = "repo-a delivery" status = "NOT_STARTED" order = 0 } (\n  <MissionLink #repo-a-link { state = "bound" project_ref = "repo-a" mission_ref = "repo-a-evolution" completion_mode = "selected-tasks" } (\n    <SelectedTasks [<TaskRef { ref = "A-G1-T1" }>]>
  )>\n)>''')
parent.write_text(text)

child_file = child / "codument/missions/active/repo-a-evolution/mission.xnl"
ctext = child_file.read_text()
ctext = ctext.replace('<ProjectRef #host { kind = "host" }>', '<ProjectRef #host { kind = "host" }>\n    <ProjectRef #main { kind = "external" }>')
ctext = ctext.replace('  <TaskSpace', '  <ParentMission { project_ref = "main" mission_ref = "root-evolution" link_ref = "repo-a-link" }>\n  <TaskSpace', 1)
ctext = ctext.replace('    <SubNodes []>', '''    <SubNodes [
      <TaskGroup #G1 { name = "Selected delivery" status = "NOT_STARTED" order = 0 } (
        <SubNodes [
          <Task #A-G1-T1 { name = "API compatibility" status = "DONE" order = 0 }>
        ]>
      )>
    ]>''', 1)
child_file.write_text(ctext)
PY

say "Bind logical ProjectRef to local child workspace"
(cd "$MAIN" && "$BIN" project bind repo-a "$CHILD" >/dev/null)

say "Validate parent and child nested Mission resources"
(cd "$MAIN" && "$BIN" validate root-evolution --strict)
(cd "$CHILD" && "$BIN" validate repo-a-evolution --strict)

say "Validate local binding is ignored and portable"
[ "$(cd "$MAIN" && git check-ignore -q codument/.local/workspace-bindings.xnl; echo $?)" = "0" ]
(cd "$MAIN" && "$BIN" project bindings | grep -F "repo-a" | grep -F "$CHILD")

say "Result"
echo "nested Mission E2E passed"
echo "workspace: $WS"
