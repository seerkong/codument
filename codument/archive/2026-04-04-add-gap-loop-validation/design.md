## 上下文

当前 Codument 的确认协议由 `<confirm>` 驱动，主要分为人工确认和 AI 评审确认。用户的实际工作流已经演化为另一种闭环：

1. 当前实现 agent 完成一个 scope
2. 当前 agent 结束，把控制权交回父层
3. 父层 fresh-spawn 新的子代理
4. 新子代理在同一新上下文里完成“目标对比 / gap 报告 / gap 修正”
5. 子代理返回结构化结果，由父层决定是否继续复检

约束：
- Codument 自身是规范与提示词生成工具，不提供多代理 runtime
- 该闭环必须能兼容 Codex、Claude Code、OpenCode 等常见 AI coding 工具
- 不要求将额外背景文件持久化到 plan.xml
- 当前 track 创建流程已存在默认“只在最后一个 phase 放 confirm”的约定，应尽量复用

## 方案概览

1. **协议替换**
   - 保留 `yield-human-confirm`
   - 删除 `yield-ai-confirm`
   - 新增 `yield-gap-loop`

2. **plan.xml 扩展**
   - `<metadata>` 新增：
     - `<validation_mode>`
     - `<validation_granularity>`（仅 gap-loop 模式下使用）
   - `<phase>` 或 `<task>` 下继续使用现有 `<confirm>`，但新增：
     - `<confirm protocol="yield-gap-loop" when="after" status="TODO" />`

3. **创建 track 交互更新**
   - 创建流程中始终收集：
     - `commit_mode`
     - `validation_mode`
   - 若 `validation_mode=yield-gap-loop`：
     - 再收集 `validation_granularity`
     - 默认 `final_phase`

4. **新增命令**
   - 新增 `/codument:gap-loop`
   - 参数：
     - `<track-id>` 必填
     - `--background <path>` 可重复
     - `--phase <phase-id>` 可选

5. **gap-loop 子代理固定流程**
   - 读取 track 的 `proposal.md`、`spec.md`、`design.md`（如存在）、`plan.xml`
   - 无条件读取 track 下的 `reports/`，作为历史 gap 报告输入
   - 读取可选 `--background` 文件
   - review 当前实现与未提交改动
   - 先写新的 gap 报告
   - 若发现 gap，回灌 `plan.xml`，必要时更新 `design.md/spec.md`
   - 再修正实现
   - 最终只返回结构化 XML

6. **父层编排语义**
   - 当前执行 agent 在 `yield-gap-loop` 确认点仅负责结束当前 turn
   - 父层 fresh-spawn 新的 `/codument:gap-loop` agent
   - 根据子代理返回结果：
     - `NO_GAP` -> confirm `DONE`
     - `FIX_APPLIED` -> fresh-spawn 新的 gap-loop agent 复检
     - `BLOCKED` -> confirm `BLOCKED`

## 协议细化

### 1. plan.xml 中的表达方式

继续复用现有 `<confirm>`，不新增平行 XML 元素。新协议以 `protocol="yield-gap-loop"` 体现。

推荐写法：

```xml
<metadata>
  <track_id>add-gap-loop-validation</track_id>
  <track_name>添加 Gap Loop 校验协议与命令</track_name>
  <goal>...</goal>
  <created_at>2026-04-03T12:00:00Z</created_at>
  <updated_at>2026-04-03T12:00:00Z</updated_at>
  <status>new</status>
  <execution_mode>sequential</execution_mode>
  <commit_mode>manual</commit_mode>
  <validation_mode>yield-gap-loop</validation_mode>
  <validation_granularity>final_phase</validation_granularity>
</metadata>
```

默认仅最后一个 phase 校验：

```xml
<phase id="P3" name="收口与验证">
  <goal>完成最终收口</goal>
  <confirm protocol="yield-gap-loop" when="after" status="TODO" />
  <tasks>
    ...
  </tasks>
</phase>
```

若选择 `every_phase`：

```xml
<phase id="P1" name="基础设施">
  <goal>搭建基础能力</goal>
  <confirm protocol="yield-gap-loop" when="after" status="TODO" />
  <tasks>
    ...
  </tasks>
</phase>
```

人工确认保持原样：

```xml
<confirm protocol="yield-human-confirm" when="after" status="TODO" />
```

### 2. 创建 track 时的交互规则

创建流程固定收集：

1. `commit_mode`
2. `validation_mode`
   - `yield-human-confirm`
   - `yield-gap-loop`

仅当用户选择 `yield-gap-loop` 时，继续询问：

3. `validation_granularity`
   - `final_phase`，默认
   - `every_phase`

生成规则：
- `yield-human-confirm`
  - 只按现有默认策略插入人工确认，不再继续问粒度
- `yield-gap-loop + final_phase`
  - 仅在最后一个 phase 下插入一个 `yield-gap-loop`
- `yield-gap-loop + every_phase`
  - 在每个 phase 下都插入一个 `yield-gap-loop`

### 3. 命令与参数格式

新命令名固定为：

```text
/codument:gap-loop
```

参数格式：

```text
/codument:gap-loop <track-id> [--background <path>]... [--phase <phase-id>]
```

参数语义：
- `<track-id>`：必填
- `--background <path>`：可选，可重复。用于传入 track 目录外的补充背景文件，例如 `.tmp/xxx.md`
- `--phase <phase-id>`：可选。用于仅针对单个 phase 执行 gap loop

命令示例：

```text
/codument:gap-loop add-user-auth
/codument:gap-loop add-user-auth --background .tmp/overview.md
/codument:gap-loop add-user-auth --background .tmp/overview.md --background .tmp/notes.md --phase P2
```

### 4. gap-loop 子代理固定输入规则

无论是否传入 `--background`，子代理都必须读取：

1. `codument/tracks/<track-id>/proposal.md`
2. `codument/tracks/<track-id>/spec.md`
3. `codument/tracks/<track-id>/design.md`（如存在）
4. `codument/tracks/<track-id>/plan.xml`
5. `codument/tracks/<track-id>/reports/` 下已有报告文件（如存在）

这里需要严格区分两类输入：

- **历史输入**
  - 当前 track 下 `reports/` 目录中的已有 gap 报告
  - 这部分始终要读，用于了解过往轮次已经发现过什么 gap、如何收口、当前是否仍有未完全收敛的问题

- **背景输入**
  - 由 `--background <path>` 显式传入的额外文件
  - 这部分是可选补充，通常位于 track 目录之外，例如 `.tmp/overview.md`

因此：
- 即使没有传 `--background`，提示词中也仍然必须有“读取当前 track 下 reports/ 历史报告”的指令
- 只有在传了 `--background` 时，提示词中才需要额外出现“背景文件”区块

若用户额外传入 `--background`，则在上述固定输入基础上继续读取这些额外文件。

若提供 `--phase`，则 gap-loop 聚焦该 phase；否则默认对当前 track 的整体状态做分析与修正。

### 5. 子代理执行步骤

gap-loop 子代理在单个 fresh 上下文中，固定按如下顺序执行：

1. 读取目标文档
2. 读取 `reports/` 中的历史 gap 报告
3. 读取可选背景文件（如传入 `--background`）
4. review 当前实现与未提交改动
5. 对照目标生成新的 gap 报告
6. 若没有新增 gap，直接结束
7. 若存在 gap：
   - 更新 `plan.xml`
   - 必要时更新 `design.md`
   - 必要时更新 `spec.md`
   - 按补充后的任务修正实现
8. 结束时只返回结构化 XML

### 6. 提示词中的输入分层

为了避免“历史报告”和“背景文件”在提示词中混成一个区块，gap-loop 提示词应采用分层表达。

当没有 `--background` 时，提示词应至少包含：

```text
请阅读当前迭代 track
codument/tracks/<track-id>/
了解当前迭代任务

请阅读当前 track 目录下 reports/ 中已有的 gap 报告，
了解过往轮次已经发现和修正过的问题
```

当存在 `--background` 时，才额外追加背景区块，例如：

```text
请阅读以下背景文件，了解宏观任务背景
- .tmp/overview.md
- .tmp/notes.md
```

然后再继续：

```text
review 当前的代码实现，并查看当前未提交的代码改动
```

也就是说，`reports/` 的读取指令是固定存在的；背景区块是条件化出现的。

### 7. 结构化返回 XML

父层与子层之间使用固定 XML 契约通信。子代理结束时只允许返回如下结构：

```xml
<codument-gap-loop-result version="1">
  <protocol>yield-gap-loop</protocol>
  <track_id>add-user-auth</track_id>
  <scope kind="track">add-user-auth</scope>
  <status>NO_GAP</status>
  <report_path>codument/tracks/add-user-auth/reports/track-impl-gap-report-4.md</report_path>
  <plan_updated>false</plan_updated>
  <spec_updated>false</spec_updated>
  <design_updated>false</design_updated>
  <summary>未发现相对于当前目标的新增 gap。</summary>
</codument-gap-loop-result>
```

phase 级示例：

```xml
<codument-gap-loop-result version="1">
  <protocol>yield-gap-loop</protocol>
  <track_id>add-user-auth</track_id>
  <scope kind="phase">P2</scope>
  <status>FIX_APPLIED</status>
  <report_path>codument/tracks/add-user-auth/reports/track-impl-gap-report-5.md</report_path>
  <plan_updated>true</plan_updated>
  <spec_updated>false</spec_updated>
  <design_updated>true</design_updated>
  <summary>已补充 P2 的收口任务并完成第一轮修正。</summary>
</codument-gap-loop-result>
```

阻塞示例：

```xml
<codument-gap-loop-result version="1">
  <protocol>yield-gap-loop</protocol>
  <track_id>add-user-auth</track_id>
  <scope kind="phase">P2</scope>
  <status>BLOCKED</status>
  <report_path>codument/tracks/add-user-auth/reports/track-impl-gap-report-6.md</report_path>
  <plan_updated>true</plan_updated>
  <spec_updated>true</spec_updated>
  <design_updated>false</design_updated>
  <summary>发现 gap，但需要用户确认设计边界，无法继续自动修正。</summary>
</codument-gap-loop-result>
```

状态只允许三种：
- `NO_GAP`
- `FIX_APPLIED`
- `BLOCKED`

### 8. 父层编排规则

父层编排者读取结构化 XML 后，固定按如下规则行动：

- `NO_GAP`
  - 当前 `<confirm>` 标记为 `DONE`
  - 继续下一步

- `FIX_APPLIED`
  - 当前 `<confirm>` 保持未完成
  - 父层再次 fresh-spawn 一个新的 `/codument:gap-loop` 子代理复检

- `BLOCKED`
  - 当前 `<confirm>` 标记为 `BLOCKED`
  - 停止并向用户请求输入

因此，`yield-gap-loop` 的本质不是“本 agent 内继续循环”，而是“每一轮都由父层重新拉起 fresh gap-loop agent”。

## 提示词设计

### 1. 核心 prompt 与工具适配 wrapper 分层

为了兼容 Codex、Claude Code、OpenCode，提示词设计必须拆成两层：

1. **工具无关的核心 prompt**
   - 描述 gap-loop 子代理应该做什么
   - 不绑定具体 AI coding 工具名
   - 明确：
     - 当前 agent 是 fresh gap-loop agent
     - 先分析、后修正
     - 先写报告、后更新 plan/spec/design
     - 最终只输出结构化 XML
     - 当前 agent 不负责发起下一轮 gap-loop

2. **各工具自己的 wrapper prompt**
   - 由各生成器注入
   - 负责告诉父层如何 fresh-spawn 子代理
   - 负责解析 XML 并决定是否再启动下一轮

### 2. gap-loop 核心提示词应覆盖的关键约束

核心提示词必须明确写入：

- 当前 agent 的任务是：在同一个 fresh 上下文里完成“gap 分析 + gap 修正”
- 无论是否传入 `--background`，都要读取当前 track 下的 `reports/` 历史报告
- `--background` 是补充背景，不替代 track 自带历史报告输入
- 必须先生成 gap report，再修正
- 若无 gap，不创建不必要的修正
- 最终只返回结构化 XML，不附加额外自然语言总结

### 3. 各工具的兼容策略

**Codex**
- 父层使用 `spawn_agent`
- 每轮 gap-loop 都必须 fresh-spawn，不能复用上一次 delta/gap agent
- 子代理返回 XML 后，父层决定 `DONE / 复检 / BLOCKED`

**OpenCode**
- 父层使用 `task`
- 每轮 gap-loop 都不得传 `task_id`，保证 fresh session
- 子代理返回 XML 后，父层决定下一步

**Claude Code**
- 父层使用 `AgentTool` 新建 subagent
- 不使用旧 gap agent 的续写模式做复检
- hook 可以辅助触发，但主循环必须由父层显式编排

共同约束：
- “每轮 gap-loop 都是新的子代理”写在 wrapper，而不是只写在核心 prompt
- 子代理不自我递归启动下一轮
- 父层才拥有复检决策权

## 影响范围与修改点

| 文件/模块 | 修改类型 | 说明 |
|-----------|---------|------|
| `src/prompts/track.md` | 修改 | 创建流程增加 validation 相关提问与默认生成逻辑 |
| `src/prompts/plan-xml-spec.md` | 修改 | `<confirm>` 支持 `yield-gap-loop`；删除 `yield-ai-confirm`；新增 metadata 字段 |
| `src/prompts/protocols.md` | 修改 | 删除 `yield-ai-confirm`；新增 `yield-gap-loop` 协议说明 |
| `src/prompts/implement.md` | 修改 | 阶段确认支持 gap-loop 的父层编排语义 |
| `src/prompts/execute-wave.md` | 修改 | wave 模式阶段确认支持 gap-loop |
| `src/prompts/gap-loop.md` | 新增 | gap-loop 命令核心提示词 |
| `src/prompts/index.ts` | 修改 | 注册 gap-loop 提示词 |
| `src/cli/generators/*` | 修改 | 为各 AI coding 工具生成 `/codument:gap-loop` |
| `codument/std/plan-xml-spec.md` | 修改 | 运行时副本同步 |
| `codument/std/protocols.md` | 修改 | 运行时副本同步 |
| `codument/std/workflow.md` | 修改 | 阶段确认协议描述更新 |
| `codument/std/AGENTS.md` | 修改 | 命令与协议文档更新 |
| `README.md` / `README-cn.md` | 修改 | 新命令与新协议说明 |
| `src/prompts/subagent/codument-code-review.md` | 删除 | 旧 AI review 协议产物不再需要 |

## 决策

- **决策：继续复用 `<confirm>`，不新增平行元素**
  - 理由：现有 schema、执行器提示词和默认生成策略都围绕 `<confirm>` 建立，扩展成本最低

- **决策：协议名使用 `yield-gap-loop`**
  - 理由：保留 `yield-*` 风格，清楚表达“让出控制权后进入 gap loop”

- **决策：命令名使用 `/codument:gap-loop`**
  - 理由：简洁，且与报告、状态词 `gap` / `NO_GAP` / `FIX_APPLIED` 保持统一

- **决策：`reports/` 总是作为 gap-loop 的历史输入**
  - 理由：历史 gap 报告本身就是下一轮分析的重要输入，不应要求用户每次显式传入

- **决策：`--background` 不写入 plan.xml**
  - 理由：属于运行期输入，不应污染 track 结构；不同轮次可灵活传不同文件

- **决策：返回 XML 使用 `NO_GAP` 而不是 `NO_DELTA`**
  - 理由：与 `gap report`、`gap loop` 术语一致，整体命名更统一

## 风险 / 权衡

- **风险：不同 AI coding 工具的 fresh-subagent 机制不同**
  - 缓解：核心 prompt 保持工具无关；由各生成器包一层工具适配 wrapper

- **风险：gap-loop 可能出现多轮反复修正**
  - 缓解：协议明确由父层根据 `FIX_APPLIED` 决定复检；后续可补充最大轮次限制

- **风险：track 创建问题变多**
  - 缓解：仅在选择 `yield-gap-loop` 时才追加询问 `validation_granularity`

## 兼容性设计

- 旧 `plan.xml` 中存在 `yield-human-confirm`：保持不变
- 旧 `plan.xml` 中存在 `yield-ai-confirm`：验证与文档层面视为已弃用；新生成内容不再使用
- 未声明 `validation_mode`：视为旧 track，不影响解析
- 未声明 `validation_granularity`：在 gap-loop 模式下按 `final_phase` 理解

## 待解决问题

- 是否在第一版引入最大复检轮次（如 `<gap_loop_max_rounds>`）
- 是否在后续把某些背景文件选择持久化到 phase 级上下文中
