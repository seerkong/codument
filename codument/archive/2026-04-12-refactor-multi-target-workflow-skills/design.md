## 上下文

当前实现的核心问题不在“有没有 skill”，而在“skill 是不是同源且可演进”。

现状可以分成三层耦合：

1. `src/skills/codument-workflow/index.ts`
   - 直接把一组文件读取成 base skill
   - 再通过 `rewriteSparrowSkill()` 对 `SKILL.md`、`codument-gap-loop.md`、`codument-implement.md`、`codument-execute-wave.md` 做整句替换
2. `src/cli/generators/claude.ts`、`eidolon.ts`、`opencode.ts`
   - 各自继续内嵌 gap-loop orchestration 规则
   - 与 skill 目录中的公共 workflow 内容同时演化
3. `src/prompts/gap-loop.md`
   - 已经开始尝试泛化“fresh 子代理 / fresh session / fresh task”
   - 但 target 适配并未收敛成显式能力模型，仍然要靠多个入口分别转述

这导致同一个业务约束被重复编码在：

- prompt 文件
- skill 文件生成逻辑
- command 生成器
- target-specific 替换规则

## 方案概览

### 1. 引入显式的多 target skill 构建模型

把“生成 skill 文件集合”的逻辑重构成两个层次：

- **公共模板层**
  - 维护 Codument 生命周期的唯一事实源
  - 负责 root skill、sub-skill、共享说明文件与公共 prompt 片段
- **target profile 层**
  - 声明 skill 安装路径、是否需要 manifest、是否保留 command 入口
  - 声明参数占位符、入口提示、subagent 能力映射示例

这样可以避免“先生成 Codex，再替换成 Sparrow”的派生方式。

### 2. 把 workflow skill 拆成 root skill + sub-skills

建议 skill 结构改为：

```text
codument-workflow/
├── SKILL.md
├── target.json|manifest.yml|agents/...   # 由 target profile 决定
├── subskills/
│   ├── init/
│   │   └── SKILL.md
│   ├── track/
│   │   └── SKILL.md
│   ├── implement/
│   │   └── SKILL.md
│   ├── gap-loop/
│   │   └── SKILL.md
│   ├── verify/
│   │   └── SKILL.md
│   └── ...
└── shared/
    ├── subagent-model.md
    └── workflow-routing.md
```

其中：

- 根 `SKILL.md` 负责意图路由和加载说明
- `subskills/*/SKILL.md` 承担当前 `references/*.md` 的职责
- `shared/subagent-model.md` 用来沉淀 fresh child / fresh round 的通用能力表达

### 3. 用通用“子代理能力模型”替代 target-specific 文案散落

公共模板不再把 `spawn_agent`、`task`、fresh session、delegate worker 当作互不相关的几套说法，而是归并为统一能力模型：

- **目标语义**：每一轮 gap-loop 必须在 fresh child context 中执行
- **可接受等价物**：
  - 显式 `spawn_agent`
  - `task` / new task
  - delegate worker / child worker
  - fresh session / fresh thread
- **降级规则**：
  - 若当前环境无法提供任何 fresh child 机制，则返回 `BLOCKED`
  - 父层不得在可 fresh-spawn 的情况下自己完成该轮 gap-loop

target profile 只需要补充：

- 这个 target 最典型的术语是什么
- command / skill 入口中如何提示用户或代理使用该能力
- 是否需要 manifest、agent 配置或其它 target 元数据

### 4. command 生成器只负责 wrapper，而不再维护业务 prompt 本体

对 Claude、Eidolon、OpenCode：

- 保留当前 command 目录，兼容现有用法
- 但 command 文件内容只做三件事：
  - 参数包裹
  - 指向对应的 sub-skill
  - 声明 command 环境的最小语法差异

不再在 command 文件中复制完整的 `track`、`implement`、`gap-loop` 业务 prompt。

### 5. init / upgrade-workspace 统一以 target profile 驱动产物生成

初始化和升级命令不再分别理解“这个 target 用 command，那个 target 用 skill”，而是读取 target profile：

- 是否需要 skill
- skill 写到哪里
- 是否同时需要 command
- command 生成器是否引用 skill sub-skill

这样新增 target 时，不需要再在多个 switch 分支中手工拼接行为。

## 影响范围与修改点

- `src/skills/codument-workflow/`
  - 从静态文件集合 + Sparrow 字符串替换，改为模板构建器 + target profile
  - 增加 sub-skill 与 shared 文件组织
- `src/cli/generators/*`
  - 收敛为共享的 target profile / skill install / command wrapper 生成逻辑
- `src/cli/commands/init.ts`
  - 输出文案改为所有 target 都会生成 skill；command 型 target 额外生成 command wrapper
- `src/cli/commands/upgrade-workspace.ts`
  - 备份与升级逻辑覆盖新增的 target skill 目录
- `src/cli/generators/*.test.ts`
  - 断言从“是否含有某段内嵌 prompt”转为“是否生成 skill 目录、sub-skill、wrapper 引用”
- `README.md` / `README-cn.md`
  - 更新所有 target 的产物目录与典型调用方式

## 决策

- 决策：保留 `codument-workflow` 作为统一 skill 名称
  - 理由：避免因 target 扩展而引入新的命名分叉

- 决策：把生命周期拆成 sub-skill，而不是继续使用 `references/*.md`
  - 理由：command wrapper 需要引用更明确的技能单元，而不只是“某个参考文件”

- 决策：command 型 target 继续保留 command 目录
  - 理由：兼容用户现有调用习惯，同时让 command 退化为 skill 的薄入口层

- 决策：公共模板以能力模型表达 fresh child，而不是继续硬编码目标工具术语
  - 理由：这是避免下次再出现“改 Codex 还要改 Sparrow 替换逻辑”的关键

## 风险 / 权衡

- 风险：一次性调整 skill 结构后，现有测试与 README 会大量变化
  - 缓解：先以 target profile 和 wrapper 引用为边界，保持命令名与根 skill 名不变

- 风险：不同 target 的“skill”能力并不对等
  - 缓解：允许 command 型 target 仅把 skill 目录作为公共事实源，并通过 command wrapper 引用

- 风险：从 `references/*.md` 迁移到 `subskills/*/SKILL.md` 会涉及较多文件移动
  - 缓解：允许迁移期保留兼容别名或过渡文件，但公共事实源只能保留一份

## 兼容性设计

- 现有 `codument init` 和 `upgrade-workspace` 的命令名保持不变
- Codex 与 Sparrow 现有 `codument-workflow` skill 根名称保持不变
- Claude、Eidolon、OpenCode 现有 command 名保持不变，但正文迁移为对 sub-skill 的引用
- 旧的 command-only 逻辑在迁移后不应继续作为公共事实源存在
