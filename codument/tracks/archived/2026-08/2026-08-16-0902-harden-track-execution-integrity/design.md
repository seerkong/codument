# Design: harden-track-execution-integrity

## 1. 验证与状态的原子边界

新增命令：

```bash
codument track task complete <track-id> <task-id> [--json] -- <command> [args...]
```

CLI 以参数数组直接启动验证进程，不隐式经过 shell。验证命令退出 0 后，CLI 才把目标节点写为 DONE，并同步该节点拥有的 Acceptance/Gate Criterion；退出非 0、无法启动或 XNL 写入失败时，原状态保持不变。需要多个检查时，调用方可显式执行项目 verify script，或显式使用 `sh -lc 'a && b'`。

Track task 的通用 `transition ... DONE` 将被拒绝并提示使用 `complete`，避免 Agent 把“决定完成”与“已经验证”拆成两个不受约束的动作。Mission task 不在本次范围内，因为其完成依据可能是绑定 Track 终态等控制面事实。

## 2. XNL Criterion 与完成门

生命周期遍历统一支持 DataElementNode 与 TextElementNode。完成叶任务时只同步该任务 Acceptance；完成 TaskGroup 时要求直接下层均处于终态，再同步该组 Gate。完成后，自底向上自动把“所有直接下层都完成且没有未勾选 Gate”的祖先 TaskGroup 汇总为 DONE。

Track 根进入 completed 前必须同时满足：

- 所有 Task/TaskGroup 均为允许的终态；
- 所有 Acceptance 和 Gate Criterion 均为 `checked=true`。

`codument validate --strict` 对 completed Track 执行同一一致性检查。普通结构校验仍允许进行中 Track 存在未勾选 criterion。

## 3. 紧凑查询

`codument show <track> --json` 默认只返回 metadata、task summary 和文件清单，不再内嵌文件正文；显式 `--include-content` 才返回完整内容。

新增 `codument track ready <id> [--json]`，返回当前未完成、依赖已满足的叶任务。首版遵循 TaskSpace 的递归 order 与 Schedule DAG；结果只包含 id、name、status、父节点和 acceptance 摘要，不输出 proposal/design/delta 正文。

## 4. Verify 证据复用

fresh verifier 仍逐项判定所有 Acceptance/Gate/Behavior Case，但执行前先生成 evidence plan：把能够由同一命令证明的目标归组，每条唯一命令只运行一次，随后将退出码和关键输出映射到多个判定项。失败目标仍逐项展开，报告默认保持 issues-first。

## 5. E2E CLI provenance

未显式设置 `CODUMENT` 时，真实 Agent runner 在创建临时工作区前构建当前仓库的 `dist/codument`，并始终用该二进制完成 init、Agent 内调用和最终 validate。runner 在日志中记录绝对路径、Codument 版本、SHA-256、宿主 Git SHA 和构建方式；显式 `CODUMENT` 覆盖时记录 override 来源但不重新构建。

## 6. 兼容与风险

- `show --json` 的文件正文改为 opt-in，属于有意的 CLI 行为调整；提供 `--include-content` 兼容原能力。
- Track task 直接 transition 到 DONE 将失败，模板和测试必须同步迁移到 `task complete`。
- 验证命令可能产生大量输出，CLI 继承 stdout/stderr，不把内容复制进结构化回执。
- 自动汇总只处理可确定的父状态，不自动声称仍有未勾选 Gate 的 TaskGroup 已完成。

## 7. 验证策略

- lifecycle 集成测试覆盖成功、失败、无法启动、真实 TextElement Criterion、TaskGroup Gate、自动汇总和 completed gate。
- validate 测试覆盖 completed + unchecked criterion 失败。
- help/show/ready 测试覆盖新命令和兼容开关。
- template 测试锁定 impl-track 使用 complete、verify 使用 evidence plan。
- E2E shell 静态测试和 smoke 覆盖 build/provenance 路径；不在默认测试中再次运行长时间真实 Agent。
