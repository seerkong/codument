# Decisions

## D1: quick impl 不创建 track

状态：accepted

`codument-impl-quick` 是小改动入口，默认不创建 track/proposal/behavior delta。若发现任务实际超出 quick 范围，停止并建议创建 track/mission。

## D2: quick 可提示沉淀 modeling/engineering

状态：accepted

quick 实现过程中若发现稳定结构知识或工程知识，可提示写入 `codument/modeling` 或 `codument/engineering`；不得静默沉淀。

## D3: 新 discuss 不创建 discussion workspace

状态：accepted

`codument-discuss` 不创建 `codument/discussions/`。它必须先作为人机对话进行澄清；讨论内容和决策主要保留在 AI agent 对话上下文，临时 analysis 只写到 `codument/analysis/`。

## D4: discuss analysis 生命周期

状态：accepted

每次触发 `codument-discuss` 时清理旧 `codument/analysis/`；讨论完毕准备创建 track/mission 前也清理 `codument/analysis/`。`codument/analysis/` 只用于 findings/knowledge 类临时材料，不用于保存 route 报告、决策树报告或推荐命令报告。

## D5: 统一 gitignore

状态：accepted

`codument init` / `codument upgrade-workspace` 在 `.gitignore` 已存在时确保包含 `codument/**/analysis` 与 `codument/**/reports`。
