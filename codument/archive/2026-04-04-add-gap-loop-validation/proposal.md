# 变更：添加 Gap Loop 校验协议与命令

## 背景和动机 (Context And Why)
当前 Codument 在 `plan.xml` 的 `<confirm>` 上支持人工确认（`yield-human-confirm`）和 AI 评审确认（`yield-ai-confirm`）。但实际使用中，`yield-ai-confirm` 没有形成稳定工作流，且无法表达“当前执行 agent 结束，把控制权交回父层，由父层重新拉起 fresh agent，在同一新上下文里完成 gap 分析与修正”的闭环。

为了把目标导向的 spec coding 方法沉淀为标准工作流，本次变更引入新的 `yield-gap-loop` 协议和 `/codument:gap-loop` 命令，统一支持：
- 当前 scope 完成后让出控制权
- 父层 fresh-spawn 新的 gap-loop agent
- gap-loop agent 在同一上下文里完成“gap 分析 + gap 修正”
- 返回结构化结果供父层决定继续、复检或阻塞

## "要做"和"不做" (Goals / Non-Goals)
**目标:**
- 删除 `yield-ai-confirm` 协议及相关提示词与文档引用
- 新增 `yield-gap-loop` 协议，作为 `<confirm>` 的新 `protocol` 值
- 新增 `/codument:gap-loop` 命令，支持 `track-id`、可选 `--background`、可选 `--phase`
- 在创建 track 时，强制选择 `validation_mode`
- 当选择 `yield-gap-loop` 时，再选择 `validation_granularity`（`final_phase` 默认，或 `every_phase`）
- 在 `plan.xml` 的 `<metadata>` 中记录 `validation_mode` 与可选的 `validation_granularity`
- 更新顺序执行与波次执行提示词，使其在 phase 结束后按 `yield-gap-loop` 语义由父层 fresh-spawn 子代理
- 统一 gap-loop 子代理的结构化返回格式

**非目标:**
- 不改变 `yield-human-confirm` 的行为
- 不在第一版把 `background` 持久化到 `plan.xml`
- 不要求 Codument CLI 本体直接执行多代理 runtime；仍通过各 AI coding 工具的命令/提示词机制运行
- 不在第一版支持 task 级别默认生成 `yield-gap-loop`，聚焦 phase 级

## 变更内容（What Changes）
- **协议替换**：移除 `yield-ai-confirm`，新增 `yield-gap-loop`
- **命令新增**：新增 `/codument:gap-loop`
- **创建流程更新**：`/codument:track` 生成 plan 时同时收集 `commit_mode`、`validation_mode`，以及条件化的 `validation_granularity`
- **plan.xml 扩展**：`<metadata>` 新增 `validation_mode` 与可选的 `validation_granularity`
- **执行编排更新**：`implement.md` 与 `execute-wave.md` 支持父层根据 gap-loop 结果反复 fresh-spawn 校验/修正子代理
- **生成器更新**：为 Codex、Claude、Gemini、Eidolon、OpenCode 生成新的 gap-loop 命令
- **文档更新**：同步 `plan-xml-spec.md`、`protocols.md`、`workflow.md`、`AGENTS.md`、README 等

## 影响范围（Impact）
- 受影响的功能规范：`codument/specs/codument-core/spec.md`
- 受影响的提示词：
  - `src/prompts/track.md`
  - `src/prompts/implement.md`
  - `src/prompts/execute-wave.md`
  - `src/prompts/plan-xml-spec.md`
  - `src/prompts/protocols.md`
  - `src/prompts/std_agents.md`
  - 新增 `src/prompts/gap-loop.md`
- 受影响的命令生成器：
  - `src/cli/generators/codex.ts`
  - `src/cli/generators/claude.ts`
  - `src/cli/generators/gemini.ts`
  - `src/cli/generators/eidolon.ts`
  - `src/cli/generators/opencode.ts`
- 受影响的文档：
  - `codument/std/plan-xml-spec.md`
  - `codument/std/protocols.md`
  - `codument/std/workflow.md`
  - `codument/std/AGENTS.md`
  - `README.md`
  - `README-cn.md`
