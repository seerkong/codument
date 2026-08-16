#!/usr/bin/env bash
set -uo pipefail

SUITE_DIR="$(cd "$(dirname "$0")" && pwd)"
TASK_ID="${1:-stream-pipeline-ai-agent}"
TASK_DIR="$SUITE_DIR/$TASK_ID"
REPO="${REPO:-$(cd "$SUITE_DIR/../.." && pwd)}"
REQUEST_FILE="$TASK_DIR/request.md"
VERIFY_SCRIPT="$TASK_DIR/verify.sh"
AGENT="${AGENT:-codex}"
MODEL="${MODEL:-}"
WS="${WS:-/tmp/codument-e2e-project-implementation-${TASK_ID}-$$}"
KEEP="${KEEP:-1}"
SKIP_AGENT="${SKIP_AGENT:-0}"
AGENT_TIMEOUT="${AGENT_TIMEOUT:-7200}"
CODEX="${CODEX:-$(command -v codex 2>/dev/null || true)}"
if [ "${CODUMENT+x}" = "x" ]; then
  CODUMENT_SOURCE="override"
else
  CODUMENT="$REPO/dist/codument"
  CODUMENT_SOURCE="current-workspace-build"
fi
PYTHON="${PYTHON:-}"
E2E_BIN_DIR="$WS/.e2e-bin"

if [[ ! "$TASK_ID" =~ ^[A-Za-z0-9_-]+$ ]] || [ ! -f "$REQUEST_FILE" ] || [ ! -x "$VERIFY_SCRIPT" ]; then
  echo "Unknown or incomplete E2E task '$TASK_ID': expected request.md and executable verify.sh under $TASK_DIR" >&2
  exit 1
fi

say() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
cleanup() {
  [ "$KEEP" = "1" ] || rm -rf "$WS"
}
run_with_timeout() {
  local seconds="$1"
  shift
  if command -v timeout >/dev/null 2>&1; then
    timeout "$seconds" "$@"
  elif command -v gtimeout >/dev/null 2>&1; then
    gtimeout "$seconds" "$@"
  else
    echo "AGENT_TIMEOUT=$seconds configured but timeout/gtimeout is unavailable; running without timeout." >&2
    "$@"
  fi
}
run_codument() {
  "$E2E_BIN_DIR/codument" "$@"
}
prepare_codument() {
  if [ "$CODUMENT_SOURCE" = "current-workspace-build" ]; then
    say "0. 构建当前 Codument workspace"
    (cd "$REPO" && bun run build 2>&1)
  fi
  [ -f "$CODUMENT" ] || {
    echo "找不到待测 Codument CLI: $CODUMENT" >&2
    return 1
  }
  CODUMENT="$(cd "$(dirname "$CODUMENT")" && pwd -P)/$(basename "$CODUMENT")"
  CODUMENT_SHA256="$(shasum -a 256 "$CODUMENT" | awk '{print $1}')"
  CODUMENT_GIT_SHA="$(git -C "$REPO" rev-parse HEAD 2>/dev/null || echo unavailable)"
  if [ -x "$CODUMENT" ]; then
    CODUMENT_VERSION="$("$CODUMENT" --version)"
  else
    CODUMENT_VERSION="$(bun run "$CODUMENT" --version)"
  fi
}
install_codument_entrypoint() {
  mkdir -p "$E2E_BIN_DIR"
  if [ -x "$CODUMENT" ]; then
    ln -s "$CODUMENT" "$E2E_BIN_DIR/codument"
  else
    printf '#!/usr/bin/env bash\nexec bun run %q "$@"\n' "$CODUMENT" > "$E2E_BIN_DIR/codument"
    chmod +x "$E2E_BIN_DIR/codument"
  fi
  {
    printf 'source: %s\n' "$CODUMENT_SOURCE"
    printf 'path: %s\n' "$CODUMENT"
    printf 'entrypoint: %s\n' "$E2E_BIN_DIR/codument"
    printf 'version: %s\n' "$CODUMENT_VERSION"
    printf 'sha256: %s\n' "$CODUMENT_SHA256"
    printf 'git_sha: %s\n' "$CODUMENT_GIT_SHA"
  } | tee "$WS/_codument-provenance.txt"
}
run_agent() {
  local prompt="$1"
  local log="$2"
  case "$AGENT" in
    codex)
      if [ -z "$CODEX" ]; then
        echo "找不到 codex CLI；请安装 codex 或设置 CODEX=/absolute/path/to/codex" >&2
        return 1
      fi
      local codex_args=(exec -C "$WS" --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox)
      [ -n "$MODEL" ] && codex_args+=(-m "$MODEL")
      codex_args+=("$prompt")
      PATH="$E2E_BIN_DIR:$PATH" run_with_timeout "$AGENT_TIMEOUT" "$CODEX" "${codex_args[@]}" < /dev/null 2>&1 | tee "$log"
      ;;
    claude)
      local claude_args=(-p "$prompt" --permission-mode bypassPermissions)
      [ -n "$MODEL" ] && claude_args+=(--model "$MODEL")
      if command -v script >/dev/null 2>&1; then
        (cd "$WS" && PATH="$E2E_BIN_DIR:$PATH" script -q /dev/null claude "${claude_args[@]}" < /dev/null 2>&1 | tee "$log")
      else
        (cd "$WS" && PATH="$E2E_BIN_DIR:$PATH" run_with_timeout "$AGENT_TIMEOUT" claude "${claude_args[@]}" < /dev/null 2>&1 | tee "$log")
      fi
      ;;
    *)
      echo "未知 AGENT: $AGENT" >&2
      return 1
      ;;
  esac
}

prepare_codument || exit 1

say "1. 准备干净工作区 $WS"
rm -rf "$WS"
mkdir -p "$WS"
(cd "$WS" && git init -q && git commit -q --allow-empty -m init)
install_codument_entrypoint

say "2. 初始化 Codument 并复制原始需求"
(cd "$WS" && run_codument init --agent="$AGENT" >/dev/null) || {
  echo "Codument init 失败" >&2
  cleanup
  exit 2
}
WORKSPACE_REQUEST="$WS/$(basename "$REQUEST_FILE")"
cp "$REQUEST_FILE" "$WORKSPACE_REQUEST"
cmp -s "$REQUEST_FILE" "$WORKSPACE_REQUEST" || {
  echo "原始需求复制后内容不一致" >&2
  cleanup
  exit 3
}
echo "request: $WORKSPACE_REQUEST"
echo "request sha256: $(shasum -a 256 "$WORKSPACE_REQUEST" | awk '{print $1}')"

if [ "$SKIP_AGENT" = "1" ]; then
  echo "SKIP_AGENT=1: Codument 环境与需求副本准备完成"
  cleanup
  exit 0
fi

AGENT_PROMPT="$(
  printf '%s\n\n%s\n\n' \
    '请先阅读当前工作区的 AGENTS.md，并使用已经初始化好的 Codument 完成下面需求的规划、开发和验证。' \
    '这是一个需要直接落地的工程任务：请在当前工作区写入完整项目，按 Codument 路由创建并实现 Track，持续执行到实现和测试完成；不要只返回设计说明或代码片段。除非出现必须由用户确认的决策或真实阻塞，不要提前停止。Python 环境请使用满足项目声明的可用隔离环境。下面是未经改写的原始需求：'
  cat "$WORKSPACE_REQUEST"
)"

say "3. 使用真实 $AGENT 完成需求"
AGENT_LOG="$WS/_agent.log"
run_agent "$AGENT_PROMPT" "$AGENT_LOG" || {
  rc=$?
  echo "真实 Agent 执行失败，exit=$rc" >&2
  echo "workspace: $WS"
  exit "$rc"
}

say "4. 独立验收 Codument 与项目产物"
VERIFY_LOG="$WS/_verify.log"
CODUMENT_BIN="$E2E_BIN_DIR/codument"
"$VERIFY_SCRIPT" "$WS" "$CODUMENT_BIN" "$PYTHON" 2>&1 | tee "$VERIFY_LOG"
VERIFY_RC=${PIPESTATUS[0]}

say "结果"
echo "workspace: $WS"
echo "agent log: $AGENT_LOG"
echo "verify log: $VERIFY_LOG"
echo "exit: verify=$VERIFY_RC"
cleanup
exit "$VERIFY_RC"
