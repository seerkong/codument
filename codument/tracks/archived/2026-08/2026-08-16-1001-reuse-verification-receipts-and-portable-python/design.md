# Design: reuse-verification-receipts-and-portable-python

## Verification Receipt Boundary

CLI 提供统一执行入口：

```text
codument track verify <track-id> [--fresh] [--json] -- <command> [args...]
codument track task complete <track-id> <task-id> [--fresh] [--json] -- <command> [args...]
```

两条命令共享同一回执引擎。CLI 用 Track id、规范化工作目录、原始 argv 和工作区内容指纹生成确定性 receipt id。缓存命中时跳过进程启动；`--fresh` 强制实跑并刷新回执。`task complete` 仍先检查 TaskGroup 子节点，再取得成功验证，最后原子更新 status 与 Criterion。

回执保存到 `<track-dir>/reports/verification/<receipt-id>.json`，只包含版本、id、track、cwd、argv、工作区指纹、成功时间和退出码，不保存大段 stdout/stderr。JSON 是 CLI 私有运行期证据，不是用户 authoring Kind。

## Workspace Fingerprint

在 Git workspace 中，CLI 对 `git ls-files --cached --others --exclude-standard` 返回的文件按路径、可执行位和内容做 SHA-256；非 Git workspace 回退为递归文件遍历。为避免状态写回自行使证据失效，只排除当前 Track 的 `track.xnl`、`analysis/` 和 `reports/`，以及 `.git` 与常见依赖/缓存目录。当前 Track 的 proposal、design、behavior/modeling/engineering delta 仍参与指纹。

命令成功后按执行后的工作区状态生成回执，因此验证自身产生的稳定项目文件也纳入证据。源码、测试、配置或规范一旦变化，receipt id 随之变化并触发重新执行。

## Gate Reuse Semantics

- executor 对 task、phase gate 和 track 最终验证使用相同的 `track verify` / `task complete` 命令；相同 argv 与前提自动复用。
- 不同命令不做猜测性合并。多个检查应使用项目 verify script 或明确的聚合命令。
- `codument-verify` 仍由 fresh 子代理执行 evidence plan，并为每条唯一命令使用 `track verify --fresh`；它可在本次独立验证内部复用映射结果，但不消费实现阶段缓存。

## Portable Python Environment

E2E verifier 按以下顺序准备隔离环境：

1. 显式 `PYTHON` override，仅尝试该解释器。
2. 若存在 `uv`，让其依据生成项目声明选择解释器并创建环境。
3. 动态枚举 PATH 中的 Python 命令；逐个实测 venv 可启动，并尝试安装当前项目与测试依赖，直到成功。

runner 不枚举固定的 Python 次版本。Agent prompt 只增加一句：`Python 环境请使用满足项目声明的可用隔离环境。`

## Verification

- CLI 测试覆盖首次执行、相同状态复用、源文件变化失效、`--fresh`、失败不落回执和 task 原子完成。
- help 测试由现有全命令遍历自动覆盖新命令。
- E2E 脚本测试锁定无固定次版本列表、短提示和可运行环境探测。
- 构建、typecheck、目标测试、全量测试、std lint 与 `git diff --check` 通过。
