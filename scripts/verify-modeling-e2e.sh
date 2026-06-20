#!/usr/bin/env bash
# verify-modeling-e2e.sh
# ─────────────────────────────────────────────────────────────────────────────
# 用真实大模型（codex / claude CLI）端到端验证：在一个干净工作区里部署 codument、
# 开启 modeling、让 LLM 走 codument-track 工作流生成 modeling_deltas，再用
# `codument modeling validate` 机器判定生成的 modeling 是否语法/schema/层级合规。
#
# 这是「codument 引入 XNL 后，真实 LLM 能否生成合规 modeling」的回归验证。
#
# 用法:
#   bash scripts/verify-modeling-e2e.sh <topic>     # topic: todo | ecommerce | blog
#   AGENT=codex  MODEL=gpt-5.5 bash scripts/verify-modeling-e2e.sh ecommerce
#   AGENT=claude MODEL=opus    bash scripts/verify-modeling-e2e.sh blog
#   PRODUCT="$(cat my-product.md)" bash scripts/verify-modeling-e2e.sh custom   # 自定义题目
#
# 环境变量:
#   REPO   codument 仓库根（默认：脚本所在仓库）
#   AGENT  codex | claude（默认 codex）
#   MODEL  模型名（可选；不传用 agent 默认）
#   WS     工作区路径（默认 /tmp/cdt-e2e-<topic>-<pid>）
#   KEEP   1=保留工作区供查看（默认 1）
#   CODEX  codex 二进制路径（默认 /Users/kongweixian/.bun/bin/codex）
#   PROMPT 覆盖默认生成 prompt
#   PRODUCT 覆盖默认 product.md 内容
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

REPO="${REPO:-$(cd "$(dirname "$0")/.." && pwd)}"
AGENT="${AGENT:-codex}"
MODEL="${MODEL:-}"
TOPIC="${1:-todo}"
WS="${WS:-/tmp/cdt-e2e-${TOPIC}-$$}"
KEEP="${KEEP:-1}"
CODEX="${CODEX:-/Users/kongweixian/.bun/bin/codex}"
CLI="bun run $REPO/src/cli/index.ts"

# 预置题目（按 TOPIC 切换）；PRODUCT 环境变量可覆盖任意内容。
case "$TOPIC" in
  todo)
    DEFAULT_PRODUCT="# Product: Todo 任务管理应用

一个多用户的 Todo 任务管理应用。
- 用户：注册/登录（认证），每个用户拥有自己的任务。
- 任务：标题、描述、状态（todo/doing/done）、截止日期、标签。
- 操作：创建/编辑/完成/删除任务；按标签/状态筛选。
- 形态：后端 REST API + 前端 Web 页面。"
    ;;
  ecommerce)
    DEFAULT_PRODUCT="# Product: 电商下单系统

一个 B2C 电商的下单子系统。
- 用户：浏览商品、加入购物车、下单、支付。
- 商品：SKU、价格、上下架。
- 库存：按 SKU 扣减/预留，是单写边界；跨 context 经消息协作（不直写）。
- 订单：下单 → 支付 → 发货 → 完成 的生命周期；优惠券；金额是只读派生。
- 形态：后端 REST + 异步消息 + 前端商城页面。"
    ;;
  blog)
    DEFAULT_PRODUCT="# Product: 博客 / 内容 CMS

一个多作者的内容发布平台。
- 用户/作者：注册登录，角色（作者 / 编辑）。
- 文章：草稿 → 发布 → 下线 的状态机；标签、分类。
- 评论：读者评论，审核状态（待审 / 通过 / 拒绝）。
- 形态：后端 REST API + 前端阅读 / 编辑页面。"
    ;;
  *)
    DEFAULT_PRODUCT="# Product: ${TOPIC}

（未预置题目 ${TOPIC}；请用 PRODUCT 环境变量提供产品上下文。）"
    ;;
esac
PRODUCT="${PRODUCT:-$DEFAULT_PRODUCT}"

PROMPT="${PROMPT:-你在一个已初始化 codument 的工作区。请严格按 codument-track 工作流（见 ./AGENTS.md 与 codument/std/operations/track.md）创建一个新 track，为 codument/attractors/product.md 描述的业务设计后端 + 前端实现。

modeling 已在 codument/config/modeling.xml 开启：你必须生成 tracks/<id>/modeling_deltas/<plane>/<context>.xnl，覆盖三个 plane：
- domain：实体/枚举/状态机/模块/组件（带 fact_grade、single_writer、capsule-tree 到文件级）
- backend：端口/endpoint
- surface：前端路由
节点必须遵循 codument/std/spec/modeling-node-schema.md 与 codument/std/spec/xnl-format.md（XNL TextElement ?marker 零转义；id 命名空间须与文件路径 plane/context 对齐）。

这是非交互模式：自动推进所有确认步骤、用合理默认、直接把文件写到磁盘、不要向我提问。完成后列出你生成的 modeling_deltas 文件路径。}"

say() { printf '\n\033[1m== %s ==\033[0m\n' "$*"; }

say "1. 工作区 $WS"
rm -rf "$WS"; mkdir -p "$WS"
( cd "$WS" && git init -q && git commit -q --allow-empty -m init )

say "2. 部署 codument（init --agent=$AGENT）+ 开 modeling + product 上下文"
( cd "$WS" && $CLI init --agent="$AGENT" >/dev/null ) || { echo "init 失败"; exit 1; }
perl -i -pe 's/(<[Mm]odeling[^>]*enabled=")false/${1}true/' "$WS/codument/config/modeling.xml"
printf '%s\n' "$PRODUCT" > "$WS/codument/attractors/product.md"
grep -i 'enabled' "$WS/codument/config/modeling.xml" | grep -i 'modeling' || grep '<Modeling' "$WS/codument/config/modeling.xml"

say "3. 真实大模型生成 track（agent=$AGENT model=${MODEL:-default}）"
LOG="$WS/_agent.log"
case "$AGENT" in
  codex)
    # `< /dev/null`: codex exec 把管道 stdin 当作要附加的输入会一直等待，非交互必须关掉 stdin。
    "$CODEX" exec -C "$WS" --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox \
      ${MODEL:+-m "$MODEL"} "$PROMPT" < /dev/null 2>&1 | tee "$LOG"
    ;;
  claude)
    ( cd "$WS" && claude -p "$PROMPT" --permission-mode bypassPermissions \
      ${MODEL:+--model "$MODEL"} < /dev/null 2>&1 | tee "$LOG" )
    ;;
  *) echo "未知 AGENT: $AGENT"; exit 1 ;;
esac

say "4. 机器判定：modeling validate"
TRACK="$(ls "$WS/codument/tracks" 2>/dev/null | head -1)"
if [ -z "$TRACK" ]; then echo "✗ 未生成任何 track"; exit 2; fi
echo "track = $TRACK"
echo "-- modeling_deltas 文件 --"
find "$WS/codument/tracks/$TRACK/modeling_deltas" -name '*.xnl' 2>/dev/null || echo "(无 modeling_deltas)"
echo "-- validate --deltas $TRACK --"
( cd "$WS" && $CLI modeling validate --deltas "$TRACK" ); VRC=$?

say "结果"
echo "工作区: $WS （KEEP=$KEEP）"
echo "agent log: $LOG"
if [ "$VRC" -eq 0 ]; then echo "✓ 生成的 modeling 通过 validate（语法+schema+层级合规）"; else echo "✗ validate 报告问题（exit=$VRC）—— 见上"; fi
[ "$KEEP" = "1" ] || rm -rf "$WS"
exit "$VRC"
