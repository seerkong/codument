# 变更：加强 Gap Loop 编排规则与轮次元数据

## 背景和动机 (Context And Why)

当前 `yield-gap-loop` 已经表达了“父层编排者 fresh-spawn 新子代理执行一轮 gap 分析与修正”的基本语义，但实际使用中还存在三个空缺：

- 父层代理在收到 `FIX_APPLIED` 后，没有被足够明确地要求继续 fresh-spawn 下一轮复检
- 当某个事项从未跑过 gap-loop、`reports/` 为空，首轮 fresh 子代理直接返回 `NO_GAP` 时，父层缺少“保持怀疑并至少再跑一轮验证”的规则
- `gap-loop.md` 同时给父层编排代理和 fresh 子代理阅读，但角色边界与各自规则混在一起，容易让当前代理错误地在本层直接执行实质工作

此外，现有 `plan.xml` metadata 还无法显式记录当前 gap-loop 已执行到第几轮，导致：

- 父层编排者难以依据结构化状态判断“当前是不是第一次 round”
- 上层封装运行环境接管 `yield-gap-loop` 时，难以与 Codument 自身协议对齐轮次

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 强化父层编排规则：当收到 `FIX_APPLIED` 时必须继续 fresh-spawn 新 round，而不是停止
- 增加“首轮无历史报告且返回 `NO_GAP` 时，必须再跑一轮 fresh 验证”的规则
- 在 `plan.xml` metadata 中新增 `gap_loop_round` 字段，用于记录当前 gap-loop 轮次
- 重构共享 `gap-loop.md`，先给出总纲、角色判定与公共规则，再分别说明父层编排者与 fresh 子代理各自必须遵守的内容
- 让上层封装运行环境在接管 `yield-gap-loop` 时，也能基于同样的轮次与复检规则协作

**非目标:**
- 不引入 Codument CLI 自身的多代理 runtime
- 不在本次变更中新增新的 `<confirm>` 协议类型
- 不把 `gap_loop_round` 扩展成通用多协议计数器，先只服务 `yield-gap-loop`

## 变更内容（What Changes）

- **协议加强**：明确父层编排者在 `FIX_APPLIED` 时必须继续 fresh-spawn 新 round
- **首轮怀疑规则**：当 `reports/` 为空、且此前未执行过 gap-loop 时，首轮 `NO_GAP` 不得直接收口，必须再跑一轮 fresh 验证
- **metadata 扩展**：在 `plan.xml` 的 `<metadata>` 下新增 `gap_loop_round`
- **共享提示词重构**：把 `gap-loop.md` 拆成总纲、公共规则、父层角色规则、fresh 子代理规则
- **文档与规范同步**：更新 `protocols.md`、`plan-xml-spec.md`、`track.md` 与 `codument-core` 真相规范

## 影响范围（Impact）

- 受影响的功能规范：`codument/specs/codument-core/spec.md`
- 受影响的提示词与标准文档：
  - `src/prompts/gap-loop.md`
  - `src/prompts/protocols.md`
  - `src/prompts/implement.md`
  - `src/prompts/execute-wave.md`
  - `src/prompts/track.md`
  - `src/prompts/plan-xml-spec.md`
  - `codument/std/protocols.md`
  - `codument/std/plan-xml-spec.md`
- 可能受影响的生成器与测试：
  - `src/cli/generators/claude.ts`
  - `src/cli/generators/eidolon.ts`
  - `src/cli/generators/opencode.ts`
  - `src/cli/generators/assistant-commands.test.ts`
  - `src/cli/generators/codex.test.ts`
  - `src/cli/generators/sparrow.test.ts`
