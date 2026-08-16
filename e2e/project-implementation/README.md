# Project Implementation E2E

这个套件验证真实 coding agent 能否在全新项目中使用 Codument，把一份完整需求持续做到可运行、可测试。每个任务叶子目录使用固定的 `request.md` 保存原始需求，并用自己的 `verify.sh` 验收任务；上层 `run.sh` 只负责共享的初始化和 Agent 调用。

```bash
# 只验证工作区初始化、Codument 部署和原始需求复制，不调用 Agent
bash e2e/project-implementation/smoke.sh

# 使用真实 Codex 完整实现 stream pipeline AI Agent
AGENT=codex bash e2e/project-implementation/run.sh stream-pipeline-ai-agent
```

默认工作区为 `/tmp/codument-e2e-project-implementation-<task>-<pid>`，执行后保留 Agent 日志、验证日志和完整项目。可通过 `WS`、`KEEP`、`CODUMENT`、`AGENT_TIMEOUT`、`PYTHON` 覆盖。

独立验收会优先按生成项目声明创建 Python 隔离环境，再动态尝试 PATH 中能实际安装该项目的解释器；`PYTHON` 仅用于显式覆盖。

未设置 `CODUMENT` 时，runner 会先构建当前仓库的 `dist/codument`，再把临时工作区内的专用 entrypoint 放到 Agent `PATH` 首位，确保初始化、Agent 内调用和最终验证使用同一二进制。`_codument-provenance.txt` 记录来源、绝对路径、版本、SHA-256 与仓库 Git SHA；显式设置 `CODUMENT` 时来源标记为 `override`。
