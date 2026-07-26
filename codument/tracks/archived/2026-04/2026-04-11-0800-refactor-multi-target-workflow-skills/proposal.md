# 变更：重构多 Target 的 Codument Workflow Skill 生成方式

## 背景和动机 (Context And Why)

当前 `codex` 与 `sparrow` 的 gap-loop / workflow skill 生成方式存在明显结构问题：

- `src/skills/codument-workflow/index.ts` 先构造一份近似 Codex 的基线 skill 文件，再对 Sparrow 版本执行多段字符串替换
- 这些替换依赖完整句子匹配，例如 `"子代理（使用 gpt-5.4 模型high思考模式）"`，导致公共提示词一旦改文案，Sparrow 侧就要同步改替换逻辑
- `claude`、`eidolon`、`opencode` 的 command 生成器继续内嵌各自的 gap-loop orchestration 文案，和 skill 模板形成双份事实源
- 当前“fresh subagent”描述虽然覆盖了部分环境，但仍是散落在多个 prompt / generator 中的 target-specific 说法，缺少一套公共的能力抽象

结果是：

- 修改 Codex 侧提示词时，常常会意外影响 Sparrow 的替换逻辑
- gap-loop 相关文案无法安全演进
- command 型 target 与 skill 型 target 的行为容易漂移
- “skill 化”趋势下，当前产物模型无法支撑更多 target 的统一扩展

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- 用一套公共的 `codument-workflow` skill 模板生成 Codex、Sparrow，以及后续其它 target 的 skill 产物
- 把当前按文件整体字符串替换的 Codex/Sparrow 生成方式，重构为“公共模板 + target profile/adaptor”
- 将各个生命周期步骤拆成可引用的 sub-skill，使 command 型 target 可以直接引用相同的 skill 子单元
- 在公共模板中重新组织 fresh-subagent / fresh-session / fresh-task / delegate worker 等语义，形成更泛化的能力表达
- 为所有受支持 target 都生成 skill 目录；其中仍支持 command 的 target 保留 command 目录，但 command 内容改为引用合并后的 skill sub-skill
- 同步更新测试、文档和真相规范，避免新的结构再次退化为多份 prompt 副本

**非目标:**

- 不在本 track 中改写 Codument 生命周期本身的业务语义
- 不引入新的 AI runtime 或新的编排协议类型
- 不在本 track 中移除现有 command 入口
- 不要求所有 target 都必须原生支持“技能加载”；对于 command 型 target，可通过 command wrapper 引用生成到工作区中的 skill 子目录

## 变更内容（What Changes）

- **公共 skill 模板化**：把 `codument-workflow` 从“基线文件 + 事后字符串替换”重构为显式的模板与 target 适配层
- **sub-skill 化**：把 `init`、`track`、`implement`、`gap-loop`、`verify` 等生命周期拆成独立 sub-skill
- **多 target 技能分发**：为 Codex、Sparrow、Claude、Eidolon、OpenCode 都生成对应的 skill 目录
- **command 包装层收敛**：保留 Claude / Eidolon / OpenCode 的 command 目录，但命令文件只做参数封装和 skill sub-skill 引用
- **子代理语义泛化**：把当前散落在 prompt / generator 中的 fresh child agent 说法收敛成通用能力模型，再由各 target 提供最小必要适配
- **规范与文档同步**：更新 `codument-core` 真相规范、README、初始化/升级输出文案与回归测试

## 影响范围（Impact）

- 受影响的功能规范：`codument/specs/codument-core/spec.md`
- 受影响的 skill 源与生成器：
  - `src/skills/codument-workflow/`
  - `src/cli/generators/codex.ts`
  - `src/cli/generators/sparrow.ts`
  - `src/cli/generators/claude.ts`
  - `src/cli/generators/eidolon.ts`
  - `src/cli/generators/opencode.ts`
  - `src/cli/generators/prompt-builders.ts`
- 受影响的 CLI 命令与升级逻辑：
  - `src/cli/commands/init.ts`
  - `src/cli/commands/upgrade-workspace.ts`
- 受影响的测试与文档：
  - `src/cli/generators/*.test.ts`
  - `src/cli/commands/upgrade-workspace.test.ts`
  - `README.md`
  - `README-cn.md`
