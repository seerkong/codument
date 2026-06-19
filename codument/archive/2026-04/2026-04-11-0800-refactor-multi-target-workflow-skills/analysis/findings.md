# Findings

## Review Summary

### 1. `codex` 与 `sparrow` 的 skill 生成仍然是“先生成一份，再二次替换”

- 证据：`src/skills/codument-workflow/index.ts`
- `buildBaseSkillFiles()` 先读取公共文件集合
- `sparrowWorkflowSkillFiles` 基于 `buildBaseSkillFiles()` 结果再调用 `rewriteSparrowSkill()`
- `rewriteSparrowSkill()` 通过完整句子替换 `SKILL.md`、`codument-gap-loop.md`、`codument-implement.md`、`codument-execute-wave.md`

**结论：**
当前不是“共享模板 + target adapter”，而是“共享文件集合 + Sparrow 后处理替换器”。

### 2. gap-loop 的 target 差异被编码为脆弱的文案匹配

- 证据：`src/skills/codument-workflow/index.ts`
- 替换逻辑直接依赖以下语句存在且不变：
  - `子代理（使用 gpt-5.4 模型high思考模式）`
  - `spawn_agent`
  - `fresh-spawn 一个新的子代理`

**结论：**
只要公共 prompt 想改 wording、模型名或句式，就必须同时修改 Sparrow 替换逻辑。这正是当前维护成本高的根因。

### 3. command 型 target 与 skill 型 target 没有共享统一事实源

- 证据：
  - `src/cli/generators/claude.ts`
  - `src/cli/generators/eidolon.ts`
  - `src/cli/generators/opencode.ts`
- 三个 command 生成器分别继续内嵌 gap-loop orchestration 规则

**结论：**
同一套业务约束同时存在于 skill 模板与 command 生成器中，未来继续修改时极易漂移。

### 4. 当前代码已经暴露出“skill 化”和“公共子代理模型”的需求

- 证据：
  - `src/prompts/gap-loop.md`
  - `src/prompts/protocols.md`
- prompt 已经开始使用 `fresh session / fresh task / spawn_agent` 等更泛化的语义

**结论：**
问题不是缺少公共概念，而是这些公共概念还没有沉淀成一份统一可生成的 skill 模板结构。

## Review Decision

本次需求应创建一个新的 refactor track，而不是继续在现有 `add-gap-loop-orchestration-hardening` 上追加实现。原因是：

- 现有 track 已完成且目标是 gap-loop 协议规则收紧，不是产物分发模型重构
- 当前新增需求涉及 skill 结构、target 适配层、command wrapper、文档与规范，属于新的架构级变更
