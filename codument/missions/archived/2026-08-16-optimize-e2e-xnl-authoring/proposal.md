# Mission: optimize-e2e-xnl-authoring

## Context and Why

E2E 验证发现 0.5.0 的 planning 阶段显著慢于 0.4.x：todo 约 23 分钟，ecommerce 约 30+ 分钟。根因分析指向三个叠加因素：

1. **XNL 验证修复循环**：modeling/engineering validate 作为每批写入后的强制门控，agent 经历多轮 generate → validate → fix 循环（surface id-context、XNL 数组逗号、文本块闭合等格式错误反复出现）。
2. **`claude -p` 非 TTY 子进程**：`run.sh` 通过管道调用 `claude -p`，丧失真实终端，tool call 吞吐量下降 20-30%，输出被缓冲导致中间过程不可追溯。
3. **产物复杂度 compound**：ecommerce 产生 26 个 planning 产物（7 behavior + 15 modeling + 4 engineering），跨文件引用网络密集，一个错误触发连锁修复。

本 Mission 不换数据格式，而是从 validator 错误提示、验证时机、scaffold 辅助、TTY 调用、e2e 粒度五个方向系统性降低写错 XNL 的概率。

## Goals

- 让 agent 在 planning 阶段的 XNL 一次写对率从约 60% 提升到 90%+
- 让 claude e2e 的 planning 时间回到 0.4.x 水平（todo < 10 min, ecommerce < 15 min）
- 让 XNL 格式错误的诊断时间从数轮 validate 缩短到一轮
- 保持 XNL 作为唯一权威格式，不引入格式转换层

## Non-Goals

- 不替换 XNL 为 XML/JSON/TOML
- 不修改 xnl-core parser 本身
- 不改变 modeling/engineering node schema 语义
- 不把 validator 改成"猜测修复"模式

## Operations

| Track | 目标 |
|---|---|
| `e2e-claude-tty` | run.sh 的 claude 分支使用 TTY，恢复 tool call 吞吐与实时可见性 |
| `xnl-validator-error-messages` | validator 输出包含最小修复示例，agent 一轮修复成功率提升 |
| `xnl-staged-validate` | planning 阶段改为 staged validate（全量一次性校验），减少子进程调用 |
| `xnl-authoring-scaffold` | 新增 `codument modeling scaffold` / `codument engineering scaffold` CLI，agent 从"自由生成"变为"生成骨架→填充内容" |
| `e2e-task-split` | 拆分 ecommerce 等重任务为更小粒度，单次会话可承载 |

## Impact

- 受影响代码：`e2e/modeling-engineering/run.sh`、`src/cli/modeling/validate.ts`、`src/cli/engineering/validate.ts`、`src/cli/commands/`（新增 scaffold 子命令）
- 受影响文档：`e2e/modeling-engineering/README.md`、各 track 的 plan.md
- 验证方式：重新运行 todo/ecommerce/blog e2e，对比 planning 时间和 validate 轮次
