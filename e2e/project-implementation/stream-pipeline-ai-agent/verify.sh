#!/usr/bin/env bash
set -euo pipefail

WS="${1:?workspace path is required}"
CODUMENT="${2:?codument executable is required}"
PYTHON_OVERRIDE="${3:-}"

fail() {
  echo "✗ $*" >&2
  exit 1
}

canonical_executable() {
  local executable="$1"
  local directory
  directory="$(cd "$(dirname "$executable")" 2>/dev/null && pwd -P)" || return 1
  printf '%s/%s\n' "$directory" "$(basename "$executable")"
}

python_candidates() {
  local candidate name directory canonical seen=":"
  for name in python3 python; do
    candidate="$(command -v "$name" 2>/dev/null || true)"
    [ -n "$candidate" ] || continue
    canonical="$(canonical_executable "$candidate")" || continue
    case "$seen" in *":$canonical:"*) ;; *) printf '%s\n' "$canonical"; seen="${seen}${canonical}:" ;; esac
  done
  local old_ifs="$IFS"
  IFS=:
  for directory in $PATH; do
    IFS="$old_ifs"
    [ -n "$directory" ] || directory=.
    for candidate in "$directory"/python "$directory"/python[0-9]*; do
      [ -x "$candidate" ] || continue
      name="$(basename "$candidate")"
      [[ "$name" =~ ^python([0-9]+([.][0-9]+)*)?$ ]] || continue
      canonical="$(canonical_executable "$candidate")" || continue
      case "$seen" in *":$canonical:"*) ;; *) printf '%s\n' "$canonical"; seen="${seen}${canonical}:" ;; esac
    done
    IFS=:
  done
  IFS="$old_ifs"
}

install_with_python() {
  local candidate="$1"
  echo "Trying Python environment: $candidate"
  rm -rf "$VENV"
  "$candidate" -m venv "$VENV" >/dev/null 2>&1 || return 1
  "$VENV/bin/python" -c 'import encodings, ensurepip' >/dev/null 2>&1 || return 1
  PIP_DISABLE_PIP_VERSION_CHECK=1 "$VENV/bin/python" -m pip install -q "$WS" pytest || return 1
}

prepare_python_environment() {
  local candidate
  if [ -n "$PYTHON_OVERRIDE" ]; then
    install_with_python "$PYTHON_OVERRIDE" || fail "PYTHON cannot create a usable environment for this project: $PYTHON_OVERRIDE"
    return
  fi

  if command -v uv >/dev/null 2>&1; then
    echo "Trying project-declared Python environment with uv"
    rm -rf "$VENV"
    if uv venv --quiet --project "$WS" "$VENV" \
      && "$VENV/bin/python" -c 'import encodings' >/dev/null 2>&1 \
      && uv pip install --quiet --python "$VENV/bin/python" "$WS" pytest; then
      return
    fi
  fi

  while IFS= read -r candidate; do
    if install_with_python "$candidate"; then
      return
    fi
  done < <(python_candidates)
  fail "no discovered Python can create a usable environment for this project; set PYTHON to override"
}

required_files=(
  pyproject.toml
  README.md
  .env.example
  src/app.py
  src/agent_runtime/common.py
  src/agent_runtime/lexical.py
  src/agent_runtime/syntactic.py
  src/agent_runtime/semantic.py
  src/agent_runtime/pipeline.py
  src/agent_runtime/semantic_mainline.py
  src/agent_runtime/openai_adapter.py
  src/agent_runtime/tools.py
  src/agent_runtime/agent_loop.py
  src/ui/readline_shell.py
  tests/test_pipeline.py
  tests/test_openai_adapter_contract.py
  tests/test_agent_loop.py
  tests/test_readline_projection.py
)

echo "Checking required project files..."
for file in "${required_files[@]}"; do
  [ -f "$WS/$file" ] || fail "missing required file: $file"
done

TRACK_FILES="$(find "$WS/codument/tracks" -type f -name track.xnl -print 2>/dev/null || true)"
[ -n "$TRACK_FILES" ] || fail "the Agent did not create a Codument Track"
if ! grep -q 'status = "completed"' $TRACK_FILES; then
  fail "no Codument Track reached completed status"
fi

echo "Validating Codument resources..."
if [ -x "$CODUMENT" ]; then
  (cd "$WS" && "$CODUMENT" validate --strict)
else
  (cd "$WS" && bun run "$CODUMENT" validate --strict)
fi

echo "Checking declared dependencies and reactive mainline..."
grep -qi 'openai' "$WS/pyproject.toml" || fail "pyproject.toml does not declare OpenAI"
grep -qi 'reactivex' "$WS/pyproject.toml" || fail "pyproject.toml does not declare reactivex"
grep -qi 'pytest' "$WS/pyproject.toml" || fail "pyproject.toml does not declare pytest"
grep -RqsE 'Subject|ReplaySubject|BehaviorSubject' "$WS/src/agent_runtime" || fail "semantic pipeline does not use an RxPY Subject"
grep -RqsE 'Observable|operators|\.pipe\(' "$WS/src/agent_runtime" || fail "semantic pipeline does not expose an RxPY Observable/operator chain"
grep -qsE 'tool_calls|response\.function_call_arguments\.delta' "$WS/src/agent_runtime/openai_adapter.py" || fail "OpenAI adapter does not handle streaming tool-call deltas"
grep -qsE 'function_call|tool_calls' "$WS/src/agent_runtime/openai_adapter.py" || fail "OpenAI adapter does not recognize streamed tool calls"
grep -Rqs 'readline' "$WS/src/ui/readline_shell.py" || fail "readline shell is missing readline integration"

echo "Installing generated project in an isolated virtualenv..."
VENV="$WS/.e2e-venv"
prepare_python_environment

echo "Running generated project tests..."
(cd "$WS" && "$VENV/bin/python" -m compileall -q src && "$VENV/bin/python" -m pytest -q)

echo "✓ stream-pipeline-ai-agent E2E verification passed"
