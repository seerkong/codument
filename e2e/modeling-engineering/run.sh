#!/usr/bin/env bash
# e2e/modeling-engineering/run.sh
# ─────────────────────────────────────────────────────────────────────────────
# 用真实 agent 端到端验证 codument modeling + engineering：
# 1. 在 /tmp 干净工作区初始化 codument；
# 2. 开启 modeling + engineering；
# 3. 让真实 agent 创建 track，并生成 modeling_deltas + engineering_deltas；
# 4. validate 两类 delta；
# 5. MODE=full 时继续让 agent 根据 track + deltas 实现代码；
# 6. 运行代码质量评分，输出 reports/code-quality.{json,md}。
#
# 用法:
#   bash e2e/modeling-engineering/run.sh todo
#   MODE=plan-only AGENT=codex bash e2e/modeling-engineering/run.sh ecommerce
#   AGENT=claude bash e2e/modeling-engineering/run.sh blog
#
# 环境变量:
#   MODE        full | plan-only（默认 full）
#   AGENT       codex | claude（默认 codex）
#   WS          工作区路径（默认 /tmp/codument-e2e-modeling-engineering-<pid>）
#   KEEP        1=保留工作区（默认 1）
#   ENGINEERING 1=开启 engineering（默认 1；旧 modeling-only 可设 0）
#   SKIP_AGENT  1=不调用真实 agent，使用当前 XNL fixture 做 smoke 测试
#   AGENT_TIMEOUT 单次真实 agent 调用超时秒数（默认 3600）
#   CODUMENT    待测 codument 可执行文件（默认 dist/codument；不存在时回退源码）
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

SUITE_DIR="$(cd "$(dirname "$0")" && pwd)"
TASK_ID="${1:-todo}"
TASK_DIR="$SUITE_DIR/$TASK_ID"
REPO="${REPO:-$(cd "$SUITE_DIR/../.." && pwd)}"
if [[ ! "$TASK_ID" =~ ^[A-Za-z0-9_-]+$ ]] || [ ! -d "$TASK_DIR" ]; then
  echo "Unknown E2E task '$TASK_ID'. Expected one of: todo, ecommerce, blog." >&2
  exit 1
fi
AGENT="${AGENT:-codex}"
MODEL="${MODEL:-}"
MODE="${MODE:-full}"
WS="${WS:-/tmp/codument-e2e-${TASK_ID}-$$}"
KEEP="${KEEP:-1}"
ENGINEERING="${ENGINEERING:-1}"
SKIP_AGENT="${SKIP_AGENT:-0}"
AGENT_TIMEOUT="${AGENT_TIMEOUT:-3600}"
CODEX="${CODEX:-$(command -v codex 2>/dev/null || true)}"
CODUMENT="${CODUMENT:-$REPO/dist/codument}"
SCORE="bun run $SUITE_DIR/score.ts"

if [ -x "$CODUMENT" ]; then
  SCORE_CLI="$CODUMENT"
else
  SCORE_CLI="$REPO/src/cli/index.ts"
fi

for required in product.md plan.md implement.md; do
  if [ ! -f "$TASK_DIR/$required" ]; then
    echo "E2E task '$TASK_ID' is missing $required under $TASK_DIR" >&2
    exit 1
  fi
done

# PRODUCT_FILE 可指向任务目录内某个子集 product 定义（如 ecommerce 的
# product-core.md / product-payment.md），用于拆分重任务为单次会话可承载的子域。
PRODUCT_FILE="${PRODUCT_FILE:-$TASK_DIR/product.md}"
[ -f "$PRODUCT_FILE" ] || { echo "PRODUCT_FILE not found: $PRODUCT_FILE" >&2; exit 1; }
PRODUCT="${PRODUCT:-$(cat "$PRODUCT_FILE")}"
PLAN_PROMPT="${PLAN_PROMPT:-$(cat "$TASK_DIR/plan.md")}"
IMPL_PROMPT="${IMPL_PROMPT:-$(cat "$TASK_DIR/implement.md")}"

say() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }
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
  if [ -x "$CODUMENT" ]; then
    "$CODUMENT" "$@"
  else
    bun run "$REPO/src/cli/index.ts" "$@"
  fi
}
run_agent() {
  local prompt="$1"
  local log="$2"
  if [ "$SKIP_AGENT" = "1" ]; then
    echo "SKIP_AGENT=1: skip real agent" | tee "$log"
    return 0
  fi
  case "$AGENT" in
    codex)
      if [ -z "$CODEX" ]; then
        echo "找不到 codex CLI；请安装 codex 或设置 CODEX=/absolute/path/to/codex" >&2
        return 1
      fi
      local codex_args=(exec -C "$WS" --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox)
      [ -n "$MODEL" ] && codex_args+=(-m "$MODEL")
      codex_args+=("$prompt")
      run_with_timeout "$AGENT_TIMEOUT" "$CODEX" "${codex_args[@]}" < /dev/null 2>&1 | tee "$log"
      ;;
    claude)
      local claude_args=(-p "$prompt" --permission-mode bypassPermissions)
      [ -n "$MODEL" ] && claude_args+=(--model "$MODEL")
      if command -v script >/dev/null 2>&1; then
        ( cd "$WS" && script -q /dev/null claude "${claude_args[@]}" < /dev/null 2>&1 | tee "$log" )
      else
        ( cd "$WS" && run_with_timeout "$AGENT_TIMEOUT" claude "${claude_args[@]}" < /dev/null 2>&1 | tee "$log" )
      fi
      ;;
    *) echo "未知 AGENT: $AGENT"; return 1 ;;
  esac
}

enable_xnl_config() {
  local file="$1"
  [ -f "$file" ] || return 0
  perl -i -pe 's/enabled\s*=\s*false/enabled = true/' "$file"
}

detect_track_dir() {
  local stage candidate
  for stage in active pending; do
    for candidate in "$WS/codument/tracks/$stage"/*; do
      [ -d "$candidate" ] || continue
      if [ -f "$candidate/track.xnl" ] || [ -f "$candidate/track.xml" ]; then
        printf '%s\n' "$candidate"
        return 0
      fi
    done
  done
  return 1
}

create_smoke_track() {
  local track="smoke-modeling-engineering"
  local dir="$WS/codument/tracks/active/$track"
  ( cd "$WS" && run_codument track create "$track" --stage active >/dev/null )
  ( cd "$WS" && run_codument behavior-patch create "$track" smoke >/dev/null )
  mkdir -p "$dir/modeling_deltas/domain" "$dir/engineering_deltas/global/howto"
  cat > "$dir/track.xnl" <<'XNL'
<Track #smoke-modeling-engineering apiVersion="codument.tech/v1alpha1" version="1" {
  status = "completed"
  goal = "Smoke validate modeling and engineering deltas"
  description = "SKIP_AGENT smoke track for current E2E harness validation."
  question_mode = "decision-tree"
  question_severity = "auto"
  commit_mode = "manual"
  created_at = "2026-08-15T00:00:00Z"
  updated_at = "2026-08-15T00:00:00Z"
} (
  <Ports { scope = "track" }>
  <TaskSpace #space_smoke-modeling-engineering { name = "smoke-modeling-engineering" version = "1" } (
    <SubNodes [
      <TaskGroup #P1 { name = "Smoke" status = "DONE" order = 0 } (
        <SubNodes [<Task #P1-T1 { name = "Write deltas" status = "DONE" order = 0 }>]>
      )>
    ]>
  )>
  <Schedule []>
  <Hooks []>
)>
XNL
  cat > "$dir/behavior_deltas/smoke/delta.xnl" <<'XNL'
<BehaviorPatch #track.smoke-modeling-engineering.behavior_patch.smoke apiVersion="codument.tech/v1alpha1" version="1" { capability = "smoke" } (
  <Mutations [
    <Upsert { selector = "behavior://smoke/requirements/e2e-smoke" } (
      <Requirement #e2e-smoke (
        <Statement ?>系统 SHALL validate current smoke deltas.</?>
        <Suites [<Suite #validate (<Cases [<Case #ok (<Given ?>deltas exist</?> <When ?>validate runs</?> <Then ?>it passes</?>)>]>)>]>
      )>
    )>
  ]>
)>
XNL
  cat > "$dir/modeling_deltas/domain/smoke.xnl" <<'XNL'
<object #domain.smoke.item { kind = "entity" fact_grade = "authoritative_fact" single_writer = "backend.item" } [
  <types ?m>
  interface SmokeItem { id: string }
  </?m>
]>
XNL
  cat > "$dir/engineering_deltas/global/howto/smoke.xnl" <<'XNL'
<howto #global.howto.smoke.validate_item { kind = "howto" } [
  <when-to-use ?m>
  验证 E2E smoke harness 时使用。
  </?m>
  <steps ?m>
  1. 生成最小 track。
  2. 运行 validate。
  </?m>
  <verification ?m>
  modeling 和 engineering validate 通过。
  </?m>
]>
XNL
}

say "1. 工作区 $WS"
rm -rf "$WS"; mkdir -p "$WS"
( cd "$WS" && git init -q && git commit -q --allow-empty -m init )

say "2. 部署 codument + 开启 modeling/engineering"
( cd "$WS" && run_codument init --agent="$AGENT" >/dev/null ) || { echo "init 失败"; exit 1; }
enable_xnl_config "$WS/codument/config/modeling.xnl"
if [ "$ENGINEERING" = "1" ]; then enable_xnl_config "$WS/codument/config/engineering.xnl"; fi
printf '%s\n' "$PRODUCT" > "$WS/codument/attractors/product.md"
grep '<ModelingConfig' "$WS/codument/config/modeling.xnl" || true
[ "$ENGINEERING" = "1" ] && grep '<EngineeringConfig' "$WS/codument/config/engineering.xnl" || true

say "3. 真实 agent 创建 track 和 deltas（mode=${MODE} agent=${AGENT}）"
PLAN_LOG="$WS/_agent-plan.log"
run_agent "$PLAN_PROMPT" "$PLAN_LOG" || exit 2
if [ "$SKIP_AGENT" = "1" ]; then
  create_smoke_track
fi

TRACK_DIR="$(detect_track_dir || true)"
if [ -z "$TRACK_DIR" ]; then echo "✗ 未生成任何 track"; exit 3; fi
TRACK="$(basename "$TRACK_DIR")"
TRACK_STAGE="$(basename "$(dirname "$TRACK_DIR")")"
echo "track = $TRACK ($TRACK_STAGE)"

say "4. validate track + modeling/engineering deltas"
( cd "$WS" && run_codument validate "$TRACK" --strict ); TRACK_RC=$?
( cd "$WS" && run_codument modeling validate --deltas "$TRACK" ); MODELING_RC=$?
if [ "$ENGINEERING" = "1" ]; then
  ( cd "$WS" && run_codument engineering validate --deltas "$TRACK" ); ENGINEERING_RC=$?
else
  ENGINEERING_RC=0
fi
find "$TRACK_DIR/modeling_deltas" -name '*.xnl' 2>/dev/null | sed 's/^/modeling: /' || true
find "$TRACK_DIR/engineering_deltas" -name '*.xnl' 2>/dev/null | sed 's/^/engineering: /' || true

if [ "$TRACK_RC" -ne 0 ] || [ "$MODELING_RC" -ne 0 ] || [ "$ENGINEERING_RC" -ne 0 ]; then
  echo "✗ delta validation failed: track=$TRACK_RC modeling=$MODELING_RC engineering=$ENGINEERING_RC"
  [ "$KEEP" = "1" ] || rm -rf "$WS"
  exit 4
fi

if [ "$MODE" = "full" ]; then
  say "5. 真实 agent 根据 track + deltas 实现代码"
  IMPL_LOG="$WS/_agent-impl.log"
  run_agent "$IMPL_PROMPT" "$IMPL_LOG" || exit 5
  TRACK_DIR="$(detect_track_dir || true)"
else
  say "5. MODE=${MODE}，跳过代码实现"
fi

say "6. 代码质量评分"
( cd "$WS" && $SCORE "$WS" --track "$TRACK" --out "$WS/reports" --codument "$SCORE_CLI" ); SCORE_RC=$?

say "结果"
echo "workspace: $WS"
echo "track: $TRACK"
echo "plan log: $PLAN_LOG"
[ -f "$WS/_agent-impl.log" ] && echo "impl log: $WS/_agent-impl.log"
echo "quality report: $WS/reports/code-quality.md"
echo "exit: score=$SCORE_RC"
[ "$KEEP" = "1" ] || rm -rf "$WS"
exit "$SCORE_RC"
