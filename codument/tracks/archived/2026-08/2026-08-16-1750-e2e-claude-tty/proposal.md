# Track: e2e-claude-tty

## Context and Why

`e2e/modeling-engineering/run.sh` 和 `e2e/project-implementation/run.sh` 在 claude 分支用管道调用 `claude -p`：

```bash
run_with_timeout "$AGENT_TIMEOUT" claude "${claude_args[@]}" < /dev/null 2>&1 | tee "$log"
```

这导致：
1. claude 子进程失去 TTY，tool call 吞吐量下降 20-30%
2. 输出被管道缓冲，`_agent-plan.log` 只看到最终摘要，中间工具调用不可追溯
3. 模型推理更谨慎，倾向于更长输出

用户在交互式终端直接使用 claude 时没有这个问题。

## Goals

- 让 `claude -p` 子进程获得伪 TTY，恢复 tool call 吞吐量
- 让 `_agent-plan.log` 实时记录 agent 的工具调用和中间输出
- 在 CI/headless 环境自动 fallback 到原有管道模式
- 不改变 AGENT=codex 分支的行为

## Non-Goals

- 不修改 claude 本身的调用参数
- 不引入额外的日志库
- 不改变 e2e 的其他语义（超时、工作区、验证流程）

## Implementation

在 `run.sh` 的 `run_agent()` 函数中，claude 分支改为：

```bash
script -q /dev/null claude ... 2>&1 | tee "$log"
```

`script` 是 macOS 和 Linux 都有的标准工具，创建伪终端并转发所有 I/O。

CI/headless 环境如果不可用 `script`，fallback 到原有管道。

## Acceptance

- [x] 本地运行 `AGENT=claude MODE=plan-only bash e2e/modeling-engineering/run.sh todo`，`_agent-plan.log` 出现中间工具调用输出
- [x] `_agent-plan.log` 包含 `codument track create`、`codument behavior-patch create` 等 CLI 调用记录
- [x] planning 时间相比管道模式缩短（todo < 15 min）
- [x] `AGENT=codex` 分支行为不变
- [x] CI 无 TTY 环境仍能正常运行（fallback）
