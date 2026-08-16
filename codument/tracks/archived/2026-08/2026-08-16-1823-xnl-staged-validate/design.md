# Design: xnl-staged-validate

## Problem

`run.sh` 的 plan 阶段（step 3-4）当前是：

```bash
run_agent "$PLAN_PROMPT" "$PLAN_LOG" || exit 2
# 每批写入后立即 validate
run_codument validate "$TRACK" --strict
run_codument modeling validate --deltas "$TRACK"
run_codument engineering validate --deltas "$TRACK"
```

但 `plan-track.md` 要求 agent 分批落盘：

1. CLI 骨架
2. BehaviorPatch
3. Modeling deltas（§3.3b 自检：写完立即 validate）
4. Engineering deltas（§3.3c 自检：写完立即 validate）
5. proposal/design
6. track.xnl

每批后 validate 导致 5-10 轮子进程调用。每轮约 30-60 秒（XNL 解析 + schema 校验 + 输出生成）。

## Solution

### 短期（run.sh 层，不改 skill）

修改 `run.sh` 的 plan 阶段时序：

```bash
say "3. agent 创建 track 和 deltas（mode=${MODE} agent=${AGENT}）"
PLAN_LOG="$WS/_agent-plan.log"
run_agent "$PLAN_PROMPT" "$PLAN_LOG" || exit 2

# 新的 staged validate：agent 完成所有 deltas 后一次性校验
say "4. validate track + modeling/engineering deltas"
run_codument validate "$TRACK" --strict
run_codument modeling validate --deltas "$TRACK"
run_codument engineering validate --deltas "$TRACK"
```

agent 在规划时仍然可以（也应该）在内部做 sanity check，但 runner 不再强制每批后 validate。

### 中期（skill 层，可选）

在 `plan-track.md` 中调整 §3.3b 和 §3.3c 的自检指令：

```
§3.3b 自检：写完 / 编辑 modeling_deltas 后，运行 `codument modeling validate --deltas <track_id>`；
          staged 模式下可在全部 deltas 写完后统一校验。
```

保留逐批自检作为 agent 内部最佳实践，但不作为 runner 的强制门控。

## Affected Files

- `e2e/modeling-engineering/run.sh`：step 3-4 时序调整
- `e2e/project-implementation/run.sh`：如适用（project-implementation 的 verify 阶段不变）

## Risks

- 延迟错误发现：agent 写完 10 个文件才发现全部有误 → 但一轮修复 + 一轮 re-validate 仍比 5 轮修复快
- agent 可能在内部跳过 validate → 最终 staged validate 仍会捕获，不影响正确性
