# Track: xnl-staged-validate

## Context and Why

`run.sh` 当前在 planning 阶段执行分批 validate：

```bash
# 每批写入后立即 validate
run_codument validate "$TRACK" --strict
run_codument modeling validate --deltas "$TRACK"
run_codument engineering validate --deltas "$TRACK"
```

todo 约 5 轮 validate，ecommerce 约 10 轮。每轮 = 子进程启动 + XNL 解析 + 输出生成 = 约 30-60 秒。累计占用 planning 时间的 30-40%。

## Goals

- planning 阶段改为 staged validate：agent 写完所有 deltas 后一次性 validate
- 减少子进程调用次数（从 N 轮降到 2-3 轮）
- 保留原有逐批验证作为可选模式（不破坏现有工作流）
- 错误修复循环仍在，但每轮修复后只需重新运行一次 validate

## Non-Goals

- 不修改 validator 本身的规则
- 不改变 modeling/engineering schema
- 不影响实现阶段的 validate 行为

## Implementation

在 `src/cli/commands/validate.ts` 中新增 `--staged` 旗标（或由 runner 控制时序，不改 CLI 语义）：

实际改造点在 `run.sh`：

```bash
# 当前（分批 validate）
say "4. validate track + modeling/engineering deltas"
run_codument validate "$TRACK" --strict
run_codument modeling validate --deltas "$TRACK"
run_codument engineering validate --deltas "$TRACK"

# 改为 staged（仅在 plan-only/full 的 plan 阶段）
say "4. agent 完成所有 deltas，一次性 validate"
# ... agent 完成规划 ...
run_codument validate "$TRACK" --strict
run_codument modeling validate --deltas "$TRACK"
run_codument engineering validate --deltas "$TRACK"
```

关键改动：在 step 3（agent 规划）和 step 4（validate）之间，不插入中间 validate。agent 自由生成所有 deltas，最终一次性校验。

## Acceptance

- [x] `run.sh` 的 plan 阶段不再每批写入后 validate
- [x] agent 完成规划后，一次性运行三次 validate
- [x] 错误仍被完整捕获（不丢失任何 error）
- [x] todo e2e planning 时间从 23 分钟降到 15 分钟以内
- [x] ecommerce e2e planning 时间从 30+ 分钟降到 20 分钟以内
