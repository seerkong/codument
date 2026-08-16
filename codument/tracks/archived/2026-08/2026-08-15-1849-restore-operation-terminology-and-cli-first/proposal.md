# 恢复 Operation 术语并收敛 CLI-first 执行边界

## 背景

Codument 曾把控制面概念从 operation 改为 action。当前需要恢复 operation 口径，并将 `std/actions/` 恢复为 `std/operations/`。同时，部分 operation 虽已有 CLI 能力，提示词仍重复执行确定性逻辑，造成双重 authority、重复执行和安全门绕过。

## 目标

- 当前标准统一使用 operation、`std/operations/`、`operation-hooks.xnl`、`OperationHooks` 与 `Operation`。
- legacy Action 资源仍可由升级命令识别并迁移，但不再作为当前接口出现。
- validate、archive-track、migrate 使用明确的 CLI-first 分流；CLI 成功后不得重复执行确定性逻辑。
- 补回上一轮 review 发现的 GapLoop 防重复、KnowledgeHint、Track blocker/priority、Parallel 与 Behavior 分形拆分约束。
- 用模板和测试防止未来再次出现 action 路径或 CLI ownership 漂移。

## 影响范围

- `codument/std` 与 `src/templates/codument/std`
- skill 薄壳与模板 manifest
- operation hook 配置、KindDefinition、配置解析和 workspace upgrade
- CLI command help、archive/migration/validation相关测试
- README、docs 与非历史脚本

## 非目标

- 不改写 archived Track、历史 decision/mission 中记录既有改造事实的 action 文本。
- 不把业务领域中的普通英文 action、DEPA 概念或第三方 API 字段机械替换为 operation。
- 不为 Mission/Track 状态迁移、artifact sync 等尚无 CLI 子命令的流程虚构 CLI 接口。
