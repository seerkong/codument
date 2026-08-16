# Design: e2e-claude-tty

## Problem

`run.sh` 当前 claude 分支：

```bash
run_with_timeout "$AGENT_TIMEOUT" claude "${claude_args[@]}" < /dev/null 2>&1 | tee "$log"
```

管道导致：
1. `claude -p` 无 TTY → tool call 吞吐量下降
2. `tee` 缓冲 → 实时输出不可见
3. 子进程无 `script`/`unbuffer` 等伪终端工具

## Solution

在 `run_agent()` 函数中，claude 分支使用 `script` 包裹：

```bash
script -q /dev/null claude ... 2>&1 | tee "$log"
```

`script` 的行为：
- macOS/Linux 标准工具，无需安装
- 创建伪终端，子进程获得完整 TTY 环境
- `-q` 静默模式，不输出 "Script started" 垃圾信息
- `/dev/null` 表示不录制输出文件（我们只用 tee 捕获）

CI/headless 环境 fallback：检测 `script` 可用性，不可用时用原有管道。

## Affected Files

- `e2e/modeling-engineering/run.sh`：`run_agent()` 函数 claude 分支
- `e2e/project-implementation/run.sh`：`run_agent()` 函数 claude 分支（共享逻辑，需同步修改）

## Risks

- 某些 CI 容器无 `script` 命令 → fallback 到管道
- `script` 可能改变 stdout 的 buffering 行为 → 实测确认无影响
