#!/usr/bin/env bash
# verify-modeling-engineering-e2e.sh
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
#   bash scripts/verify-modeling-engineering-e2e.sh ecommerce
#   MODE=plan-only AGENT=codex bash scripts/verify-modeling-engineering-e2e.sh todo
#   PRODUCT="$(cat product.md)" bash scripts/verify-modeling-engineering-e2e.sh custom
#
# 环境变量:
#   MODE        full | plan-only（默认 full）
#   AGENT       codex | claude（默认 codex）
#   WS          工作区路径（默认 /tmp/cdt-me-e2e-<topic>-<pid>）
#   KEEP        1=保留工作区（默认 1）
#   ENGINEERING 1=开启 engineering（默认 1；旧 modeling-only 可设 0）
#   SKIP_AGENT  1=不调用真实 agent，仅用于脚本 smoke 测试
#   AGENT_TIMEOUT 单次真实 agent 调用超时秒数（默认 3600）
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
AGENT="${AGENT:-codex}"
MODEL="${MODEL:-}"
MODE="${MODE:-full}"
TOPIC="${1:-todo}"
WS="${WS:-/tmp/cdt-me-e2e-${TOPIC}-$$}"
KEEP="${KEEP:-1}"
ENGINEERING="${ENGINEERING:-1}"
SKIP_AGENT="${SKIP_AGENT:-0}"
AGENT_TIMEOUT="${AGENT_TIMEOUT:-3600}"
CODEX="${CODEX:-/Users/kongweixian/.bun/bin/codex}"
CLI="bun run $REPO/src/cli/index.ts"
SCORE="bun run $REPO/scripts/score-e2e-code-quality.ts"

case "$TOPIC" in
  todo)
    DEFAULT_PRODUCT="# Product: Todo 任务管理应用

一个多用户 Todo 应用：注册登录、任务 CRUD、todo/doing/done、截止日期、标签、筛选。形态：后端 REST API + 前端 Web 页面。"
    ;;
  ecommerce)
    DEFAULT_PRODUCT="# Product: 电商下单系统

一个 B2C 下单子系统：商品 SKU、购物车、库存预留/扣减、订单生命周期、支付、优惠券、金额派生。形态：后端 REST + 异步消息 + 前端商城页面。"
    ;;
  blog)
    DEFAULT_PRODUCT="# Product: 博客 / 内容 CMS

一个多作者内容平台：作者/编辑角色、文章草稿/发布/下线状态机、标签分类、评论审核。形态：后端 REST API + 前端阅读和编辑页面。"
    ;;
  *)
    DEFAULT_PRODUCT="# Product: ${TOPIC}

请用 PRODUCT 环境变量提供产品上下文。"
    ;;
esac
PRODUCT="${PRODUCT:-$DEFAULT_PRODUCT}"

PLAN_PROMPT="${PLAN_PROMPT:-你在一个已初始化 codument 的干净工作区。请严格按 ./AGENTS.md 和 codument/std/actions/plan-track.md 创建一个新 track，为 codument/attractors/product.md 描述的业务应用设计后端 + 前端实现。

要求：
1. 自动推进，不向用户提问。
2. 必须生成 behavior_deltas。
3. modeling 已开启：必须生成 tracks/<id>/modeling_deltas/<plane>/<context>.xnl，至少覆盖 domain、backend、surface。遵守 codument/std/spec/modeling-node-schema.md 与 xnl-format.md。
4. engineering ${ENGINEERING}：如果 codument/config/engineering.xml enabled=true，必须生成 tracks/<id>/engineering_deltas/<plane>/<category>/<topic>.xnl，至少包含 howto、rules、reference 或 code-map 中的三类长期工程知识。遵守 codument/std/spec/engineering-node-schema.md。
5. proposal/design/track.xml 中要说明实现计划如何使用 modeling 与 engineering。

执行约束：
- 分批落盘：先创建目录，再按 behavior、modeling、engineering、proposal/design、track.xml 的顺序逐批写文件。
- 不要把所有文件塞进一个巨大补丁；每批写完后用 find/ls 观察已落盘文件。
- 如需较长文本，优先写少量可验证的最小节点，确保 validate 先通过。

完成后列出 track id、modeling_deltas 文件、engineering_deltas 文件。}"

IMPL_PROMPT="${IMPL_PROMPT:-你在一个已生成 codument track 的工作区。请读取 ./AGENTS.md、codument/tracks/active 下唯一 track、proposal.md、design.md、behavior_deltas、modeling_deltas、engineering_deltas。

请根据这些设计实现一个最小但可运行的业务应用代码：
1. 代码必须有 package.json 和 test 脚本。
2. 尽量补 typecheck/lint/build 脚本。
3. 实现要尊重 modeling 的事实源/状态机/模块/组件边界。
4. 实现要使用 engineering_deltas 中的 howto/rules/reference/code-map 作为工程约束。
5. 完成后运行可用测试，并把 track.xml 状态更新为 completed。

执行约束：分批写代码文件，每批写完后运行一次轻量检查；不要一次性生成巨大补丁。

非交互模式：不要向用户提问，合理默认并直接写文件。}"

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
run_agent() {
  local prompt="$1"
  local log="$2"
  if [ "$SKIP_AGENT" = "1" ]; then
    echo "SKIP_AGENT=1: skip real agent" | tee "$log"
    return 0
  fi
  case "$AGENT" in
    codex)
      run_with_timeout "$AGENT_TIMEOUT" "$CODEX" exec -C "$WS" --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox \
        ${MODEL:+-m "$MODEL"} "$prompt" < /dev/null 2>&1 | tee "$log"
      ;;
    claude)
      ( cd "$WS" && run_with_timeout "$AGENT_TIMEOUT" claude -p "$prompt" --permission-mode bypassPermissions \
        ${MODEL:+--model "$MODEL"} < /dev/null 2>&1 | tee "$log" )
      ;;
    *) echo "未知 AGENT: $AGENT"; return 1 ;;
  esac
}

enable_xml_config() {
  local file="$1"
  local tag="$2"
  [ -f "$file" ] || return 0
  perl -i -pe "s/(<${tag}[^>]*enabled=\")false/\${1}true/i" "$file"
}

detect_track() {
  ls "$WS/codument/tracks/active" 2>/dev/null | head -1
}

create_smoke_track() {
  local track="smoke-modeling-engineering"
  local dir="$WS/codument/tracks/active/$track"
  mkdir -p "$dir/behavior_deltas/smoke" "$dir/modeling_deltas/domain" "$dir/engineering_deltas/global/howto"
  cat > "$dir/track.xml" <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<Track id="smoke-modeling-engineering" version="1" xmlns:cdt="urn:codument:v1">
  <Metadata>
    <Status>completed</Status>
    <Goal>Smoke validate modeling and engineering deltas</Goal>
    <Description>SKIP_AGENT smoke track for E2E harness validation.</Description>
    <CommitMode>manual</CommitMode>
    <CreatedAt>2026-06-28T00:00:00+08:00</CreatedAt>
    <UpdatedAt>2026-06-28T00:00:00+08:00</UpdatedAt>
  </Metadata>
  <TaskSpace id="space_smoke-modeling-engineering" name="smoke-modeling-engineering" version="1">
    <SubNodes>
      <TaskGroup id="P1" name="Smoke" status="DONE" order="0">
        <SubNodes>
          <Task id="T1.1" name="Write deltas" status="DONE" order="0"/>
        </SubNodes>
      </TaskGroup>
    </SubNodes>
  </TaskSpace>
</Track>
XML
  cat > "$dir/behavior_deltas/smoke/delta.xml" <<'XML'
<behavior-patch capability="smoke" version="1">
  <upsert selector="behavior://smoke/requirements/e2e-smoke">
    <requirement id="e2e-smoke">
      <statement>系统 SHALL validate smoke deltas.</statement>
      <suite id="validate"><case id="ok"><given>deltas exist</given><when>validate runs</when><then>it passes</then></case></suite>
    </requirement>
  </upsert>
</behavior-patch>
XML
  cat > "$dir/modeling_deltas/domain/smoke.xnl" <<'XNL'
<object #domain.smoke.item kind="entity" fact_grade="authoritative_fact" single_writer="backend.item" [
  <types ?m>
  interface SmokeItem { id: string }
  </?m>
]>
XNL
  cat > "$dir/engineering_deltas/global/howto/smoke.xnl" <<'XNL'
<howto #global.howto.smoke.validate_item kind="howto" [
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
( cd "$WS" && $CLI init --agent="$AGENT" >/dev/null ) || { echo "init 失败"; exit 1; }
enable_xml_config "$WS/codument/config/modeling.xml" "Modeling"
if [ "$ENGINEERING" = "1" ]; then enable_xml_config "$WS/codument/config/engineering.xml" "Engineering"; fi
printf '%s\n' "$PRODUCT" > "$WS/codument/attractors/product.md"
grep '<Modeling' "$WS/codument/config/modeling.xml" || true
[ "$ENGINEERING" = "1" ] && grep '<Engineering' "$WS/codument/config/engineering.xml" || true

say "3. 真实 agent 创建 track 和 deltas（mode=$MODE agent=$AGENT）"
PLAN_LOG="$WS/_agent-plan.log"
run_agent "$PLAN_PROMPT" "$PLAN_LOG" || exit 2
if [ "$SKIP_AGENT" = "1" ]; then
  create_smoke_track
fi

TRACK="$(detect_track)"
if [ -z "$TRACK" ]; then echo "✗ 未生成任何 track"; exit 3; fi
echo "track = $TRACK"

say "4. validate track + modeling/engineering deltas"
( cd "$WS" && $CLI validate "$TRACK" --strict ); TRACK_RC=$?
( cd "$WS" && $CLI modeling validate --deltas "$TRACK" ); MODELING_RC=$?
if [ "$ENGINEERING" = "1" ]; then
  ( cd "$WS" && $CLI engineering validate --deltas "$TRACK" ); ENGINEERING_RC=$?
else
  ENGINEERING_RC=0
fi
find "$WS/codument/tracks/active/active/$TRACK/modeling_deltas" -name '*.xnl' 2>/dev/null | sed 's/^/modeling: /' || true
find "$WS/codument/tracks/active/active/$TRACK/engineering_deltas" -name '*.xnl' 2>/dev/null | sed 's/^/engineering: /' || true

if [ "$TRACK_RC" -ne 0 ] || [ "$MODELING_RC" -ne 0 ] || [ "$ENGINEERING_RC" -ne 0 ]; then
  echo "✗ delta validation failed: track=$TRACK_RC modeling=$MODELING_RC engineering=$ENGINEERING_RC"
  [ "$KEEP" = "1" ] || rm -rf "$WS"
  exit 4
fi

if [ "$MODE" = "full" ]; then
  say "5. 真实 agent 根据 track + deltas 实现代码"
  IMPL_LOG="$WS/_agent-impl.log"
  run_agent "$IMPL_PROMPT" "$IMPL_LOG" || exit 5
else
  say "5. MODE=${MODE}，跳过代码实现"
fi

say "6. 代码质量评分"
( cd "$WS" && $SCORE "$WS" --track "$TRACK" --out "$WS/reports" --codument "$REPO/src/cli/index.ts" ); SCORE_RC=$?

say "结果"
echo "workspace: $WS"
echo "track: $TRACK"
echo "plan log: $PLAN_LOG"
[ -f "$WS/_agent-impl.log" ] && echo "impl log: $WS/_agent-impl.log"
echo "quality report: $WS/reports/code-quality.md"
echo "exit: score=$SCORE_RC"
[ "$KEEP" = "1" ] || rm -rf "$WS"
exit "$SCORE_RC"
