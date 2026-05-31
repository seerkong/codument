# codument track - 创建变更追踪命令

**描述：** 规划变更追踪，生成规范文档和结构化任务清单

---

## 1.0 系统指令

你是 Codument 规范驱动开发框架的 AI 代理助手。当前任务是引导用户创建新的"Track"（功能或 Bug 修复），生成必要的规范增量（`spec_deltas/` XML）和计划（`plan.xml`），以及其他文件，并组织在专用目录中。

---

## 1.1 设置检查

**协议：验证 Codument 环境是否正确设置。**

1. **检查必需文件：** 验证 `codument` 目录中以下入口是否存在：
   - 项目上下文：优先使用 `codument/attractors/`；如果该目录不存在，旧项目必须同时存在 `codument/project.md` 和 `codument/product.md`
   - `codument/std/workflow.md`
   - `codument/workflows/workflow.md`

2. **处理缺失文件：**
   - 如果标准工作流文件缺失，或既没有 `codument/attractors/` 也没有旧项目 `project.md`/`product.md` 组合，立即停止
   - 宣布："Codument 未设置。请使用 `codument-init` skill 设置环境。"
   - 不要继续初始化 track

## 1.2 交互式问答

**协议：引用 `codument/std/protocols.md` 中的 ask-* 问答协议。**
**重要** 问答 ToolCall 只能用于真实澄清、选择或确认问题；禁止为了测试运行环境能力而发起占位问题。当前步骤没有需要立即提问的内容时，直接继续后续流程。

## 1.3 生成文件产物
**协议：生成的产物允许/不允许引用的文件 **
**重要** 不可引用`.`开头的隐藏目录中的文档。例如 .abc/e.md
**重要** 如果认为仅通过change track目录的 spec_deltas/<capability>/delta.xml、proposal.md、design.md、plan.xml，不方便记录一些需要记录的关键信息，比如example.md, ui-ux-design.md, 可以额外创建在当前change track目录，并通过本规范标准文件产物被引用
**重要** 不可引用不在当前change track目录的说明文档，每个track目录中的内容应当是自包含，无需依赖外部文件说明。例如 `doc`、`docs`等


---

## 2.0 新建 Track

**协议：严格按此顺序执行。**

### 2.1 获取 Track 描述和确定类型

1. **加载项目上下文：** 优先读取 `codument/attractors/` 下与任务相关的吸引子；旧项目没有 attractors 时，兼容读取 `codument/project.md` 和 `codument/product.md`

2. **获取 Track 描述：**
   - **如果 `{{args}}` 包含描述：** 使用 `{{args}}` 内容
   - **如果 `{{args}}` 为空：** 询问用户：
     > "请提供你想开始的变更追踪的简要描述（功能、Bug 修复、重构等）。"
     等待用户回复（使用 **Protocol: ask-single-question-free**）

3. **推断 Track 类型：** 分析描述确定是"功能"还是"其他"（Bug、重构等）。不要让用户分类



### 2.2 创建 Track 产物目录

1. **检查现有 Track：** 列出 `codument/tracks/` 中现有目录。如果提议的短名称与现有重复，停止创建并建议选择不同名称

2. **生成 Track ID：** 创建唯一 ID，格式为小写英文和中横线组成的简短描述（如 `add-user-auth`、`fix-login-bug`）
   - **不要包含日期**，日期只在归档时添加
3. **用户确认：** 展示起草的 Track ID 供审查
   > "我已起草了新的Track ID：<track_id>
   > 这是否准确捕获了需求？请建议更改或确认。"

   等待反馈并修改直到确认（使用 **Protocol: ask-single-question-free**）

4. **创建目录：** `codument/tracks/<track_id>/`

5. **创建分析产物（analysis/）：** 在 track 目录下创建 `analysis/` 子目录，用于持久化记录“找到的内容 / 关键发现 / 知识上下文”，以避免长对话或多轮工具调用导致重要信息丢失。
   - 创建目录：`codument/tracks/<track_id>/analysis/`
   - 创建文件：
     - `codument/tracks/<track_id>/analysis/findings.md`
     - `codument/tracks/<track_id>/analysis/knowledge.md`

   **关键规则（必须遵守）：仅缺失时创建，不覆盖已有内容**
   - 如果 `codument/tracks/<track_id>/analysis/` 已存在：不要删除、不要重写目录内的任何文件
   - 对上述两个文件：
     - **文件已存在** → 绝不要覆盖/改写其内容（哪怕你认为内容不完整）
     - **文件不存在** → 才创建文件并写入下面的模板

   **写入内容要求：**
   - 参考“planning-with-files”的理念：把关键结论写入文件作为外部记忆
   - 内容必须与本 track 相关，避免泛化
   - `findings.md` 记录本次分析中直接找到的事实、约束、问题和结论
   - `knowledge.md` 记录通过阅读代码、文档、规范后总结出来的知识上下文、术语、机制理解和可复用认知
   - 不要引用隐藏目录（`.` 开头）的文件

   `analysis/findings.md` 模板：
   ```markdown
   # Findings

   ## Found Facts
   -

   ## Constraints
   -

   ## Open Questions
   -

   ## Conclusions
   -
   ```

   `analysis/knowledge.md` 模板：
   ```markdown
   # Knowledge Context

   ## Source Notes
   | Source | Summary | Relevance |
   |--------|---------|-----------|
   |        |         |           |

   ## Codebase Knowledge
   -

   ## Domain Knowledge
   -

   ## Terms
   | Term | Meaning |
   |------|---------|
   |      |         |
   ```

6. **创建决策和记忆目录：** 在 track 目录下创建 `decisions/` 和 `memory/` 子目录
   - `codument/tracks/<track_id>/decisions/` -- 存放 archive-ready 的 durable 单文件决策（每个长期决策一个 .md 文件）
   - 需要用户确认的过程决策仍使用根级 `decisions.md` 作为评审入口
   - `codument/tracks/<track_id>/memory/` -- 存放记忆上下文（按类型分子目录：`lessons/`、`incidents/`、`patterns/`、`summaries/`）
   - 如果目录已存在则跳过

7. **在 plan.xml `<metadata>` 中写入：**
    ```xml
    <metadata>
      <track_id>track-id</track_id>
      <type>feature</type>
      <status>new</status>
      <created_at>YYYY-MM-DDTHH:MM:SSZ</created_at>
      <updated_at>YYYY-MM-DDTHH:MM:SSZ</updated_at>
      <description>初始描述</description>
    </metadata>
    ```


### 2.3 交互式规范生成（XML spec delta）

  1. **说明目标：**
    > "现在我将通过一系列问题帮你构建全面的规范（spec_deltas/<capability>/delta.xml）。为提速，我会在一轮里给出多个问题，并用 Q1、Q2... 标记，按标记回答即可。"

 2. **提问阶段：** 根据 track 类型提问收集 spec_deltas/<capability>/delta.xml 详情
    - 使用 `protocols.md` 中的 **ask-multi-question-free** 协议
    - **通用准则：**
      - 参考 `codument/attractors/` 下相关吸引子提问上下文感知的问题；旧项目没有 `codument/attractors/` 时，再兼容参考 `codument/product.md`、`codument/project.md`
      - 为每个问题提供简要解释和清晰示例
      - **强烈建议：** 尽可能呈现 2-3 个选项供用户选择


   - **如果是功能：**
     - 问 3-5 个相关问题澄清功能需求
     - 示例：功能澄清、实现方式、交互、输入/输出等
     - 根据具体功能请求定制问题

   - **如果是其他（Bug、重构等）：**
     - 问 2-3 个相关问题获取必要详情
     - 示例：Bug 复现步骤、重构范围、成功标准等

3. **起草 XML spec delta：** 收集足够信息后，按 capability 拆分并起草 `codument/tracks/<track_id>/spec_deltas/<capability>/delta.xml`。

   **格式规则（必须遵守）：**
   - 根节点必须是 `<spec-patch version="1">`。
   - 每个变更点使用业务节点自身表达，如 `<requirement>`、`<statement>`、`<suite>`、`<case>`，不要发明新的 mutation 类型。
   - 变更动作只用属性表达：`op="upsert|delete|move"`。
   - 定位只用 `selector="spec://<capability>/requirement/<id>/suite/<id>/case/<id>"` 形式表达；移动使用 `to="spec://..."`。
   - 新增或修改节点用 `op="upsert"`，节点正文和子结构直接写在该 XML 节点内部。
   - 删除节点用 `op="delete"`，不需要正文。
   - 移动节点用 `op="move"`，必须提供 `to`。
   - BDD/测试场景使用可嵌套的 `<suite>` 和 `<case>` 表达；`<case>` 内使用 `<given>`、`<when>`、`<then>`、可选 `<and>`。
   - 需求正文使用 `<statement>`，不要再使用 Markdown 的 `## ADDED Requirements` / `### Requirement:` / `#### Scenario:`。
   - 如果 `codument/config/feature.json` 中 `knowledgeSync.enabled=true`，可在相关 `<requirement>`、`<suite>` 或 `<case>` 内添加可选 `<knowledge-hint target="..." href="knowledge://..." strength="hint" />`，帮助后续 docs/knowledge sync 定位候选文档；该 hint 是弱链接，不是强外键。
   - 如果 `knowledgeSync.enabled=false` 或配置缺失，不要生成 `<knowledge-hint>`，也不要生成 docs 联动信息。

   **示例：**
   ```xml
   <spec-patch version="1">
     <requirement op="upsert" selector="spec://provider.deepseek/requirement/cache-support" id="cache-support">
       <statement>系统 SHALL 支持 DeepSeek provider 的前缀缓存能力。</statement>
       <suite id="request-build" name="请求构建">
         <case id="inject-cache-control">
           <given>provider 为 deepseek 且 model 声明 supports_context_cache</given>
           <when>系统构造 chat completion 请求</when>
         <then>系统 SHALL 在静态系统提示末尾插入 cache_control 块</then>
         <knowledge-hint target="main-docs" href="knowledge://main-docs/provider.deepseek/cache-support" strength="hint" />
       </case>
     </suite>
   </requirement>
   </spec-patch>
   ```

   **拆分规则：**
   - 每个 capability 一个目录：`spec_deltas/<capability>/delta.xml`。
   - capability 很大时，可拆成 `spec_deltas/<capability>/requirements/<topic>.xml`，并保留 `delta.xml` 作为索引说明或主 patch；所有 patch 文件都必须是 `<spec-patch>`。
   - 不要引用当前 track 外的说明文档作为理解本 track 的必要条件。

4. **写入文件：**
   - 将确认的规范写入 `codument/tracks/<track_id>/spec_deltas/<capability>/delta.xml`

5. **用户确认：** 展示起草的 spec_deltas/<capability>/delta.xml 供审查
   > "我已起草了规范。请审查：
   > 文件路径在：codument/tracks/<track_id>/spec_deltas/<capability>/delta.xml
   > 这是否准确捕获了需求？请建议更改或确认。"

   等待反馈并修改直到确认（使用 **Protocol: ask-single-question-free**）

### 2.3 交互式提案生成（proposal.md）

1. **说明目标：** spec delta 确认无误后：
   > "现在我将创建完成的变更提案"
   需要按照如下格式，基于用户描述生成变更提案
   ```markdown
   # 变更：<变更的简要标题>

   ## 背景和动机 (Context And Why)
   <变更的背景和动机, 几句话说明问题/机会>

   ## “要做”和“不做” (Goals / Non-Goals)
   **目标:**
   - <Goals 1>
   - <Goals 2>
   - ...

   **非目标:**
   - <Non-Goals 1>
   - <Non-Goals 2>
   - ...
   
   ## 变更内容（What Changes）
   - [变更列表]
   - [用 **BREAKING** 标记破坏性变更]

   ## 影响范围（Impact）
   - 受影响的功能规范：[列出能力]
   ```
2. **创建 proposal.md：** 基于用户描述生成变更提案
   - 将变更提案入 `codument/tracks/<track_id>/proposal.md`
   - 如果背景、范围、兼容性、迁移或 rollout 内容较多，创建 `codument/tracks/<track_id>/proposal/` 子目录，把子方向写入子文件，并在 `proposal.md` 中作为总览引用。
   - Good：`proposal.md` 概述目标并链接 `proposal/problem-statement.md`、`proposal/scope-and-compatibility.md`。
   - Bad：把 200 行兼容性分析全部塞进 `proposal.md`，或引用 track 外部文档才能读懂提案。

3. **用户确认：** 展示起草的 proposal.md 供审查
   > "我已起草了变更提案。请审查：
   > 文件路径在：codument/tracks/<track_id>/proposal.md
   > 此提案是否正确？请建议更改或确认。"

   等待反馈并修改 proposal.md 直到确认（使用 **Protocol: ask-single-question-free**）

### 2.4 交互式方案设计生成（design.md）
**需要时创建 design.md：**
如果满足以下任一条件，创建 `design.md`；否则省略：
- 跨切面变更（多个服务/模块）或新的架构模式
- 新的外部依赖或重大数据模型变更
- 安全、性能或迁移复杂性
- 在编码前需要技术决策来消除歧义
- 设计点很多，需要按子方向拆分

如果设计内容较大，创建 `codument/tracks/<track_id>/design/` 子目录，并让根级 `design.md` 作为总览引用子设计。

Good：
- `design.md` 总览方案和影响面。
- `design/spec-vfs-and-xml.md`、`design/archive-memory.md` 等文件承载子方向细节。

Bad：
- `design.md` 变成难以维护的超长文档。
- 子设计文件放在 track 目录外，导致 track 不能自包含。

1. **识别是否需要决策记录：**
   - 如果存在需要用户确认的技术/产品/交互决策，创建 `codument/tracks/<track_id>/decisions.md`
   - `decisions.md` 是决策评审的主入口；无论在创建/设计阶段还是后续执行阶段，只要出现新的决策补充，都必须追加并回写到该文件
   - 如果某个决策属于未来仍需遵守的 durable 长期项目决策，同时在 `codument/tracks/<track_id>/decisions/<slug>.md` 创建单文件记录，并明确写出 `Durable` / `长期项目决策` 标记，供 archive 提升到 `decision://<slug>`
   - 问题标题必须避免使用字母作为标题前缀；字母仅用于选项
   - 每个问题标题使用 `【Pn】` 表示重要程度，例如：`### 1. 【P0】文件内容来源`

2. **起草 decisions.md：**
   - 先梳理待决策问题列表，并按重要度标记为 `P0` / `P1` / `P2`
   - 将待决策问题、候选选项、当前建议写入 `codument/tracks/<track_id>/decisions.md`
   - 模板如下：
```markdown
# Decisions

## Usage
- 用于记录需要用户确认的决策问题、选项、最终结论与理由
- 问题标题不用字母前缀；字母只用于选项
- 后续执行过程中出现的新决策，也继续追加到本文件，不新建分散的决策记录

### 1. 【P0】文件内容来源
- 背景：
- 需要决定：
- 选项：
  - A) [选项 A]
  - B) [选项 B]
  - C) [其他（可填写）]
- 当前建议：
- 用户答复：
- 最终决策：
- 决策理由：
- 状态：pending
```

3. **根据问题数量选择交互方式：**
   - 统计尚未确认的决策问题数量
   - **如果问题数小于等于 5，且当前环境支持一次性多问题 ToolCall：**
     - 使用内置多问题 ToolCall 一次性发问
     - 问题格式遵循 `codument/std/protocols.md` 中的 **ask-multi-question-free**
     - 每个问题仍需在 `decisions.md` 中保留对应条目，并在收到答复后回写“用户答复 / 最终决策 / 决策理由 / 状态”
   - **如果问题数大于 5，或当前环境不支持一次性多问题 ToolCall：**
     - 不要拆成多轮零散提问
     - 引导用户直接编辑 `codument/tracks/<track_id>/decisions.md`
     - 用户编辑后，再基于文档内容补全“最终决策 / 决策理由 / 状态”

4. **说明目标：** proposal.md 确认无误后：
   > "现在我将创建完成的变更提案"
   需要按照如下格式，基于用户描述生成变更提案
最小 `design.md` 骨架：
```markdown
## 上下文
[背景、约束、利益相关者]

## 方案概览
1. [方案设计点 - 一级]
  - [方案设计点 - 二级]
    - [方案设计点 - 三级]
2. [方案设计点 - 一级]
  - [方案设计点 - 二级]
3. [方案设计点 - 一级]

4. [...]

## 影响范围与修改点（Impact）
- 受影响的文件/模块：[关键文件/系统]

## 决策摘要
- 详见 `codument/tracks/<track_id>/decisions.md`
- 当前关键结论：[已确认的决策摘要]

## 风险 / 权衡
- [风险] → 缓解措施

## 兼容性设计 [**需要时创建**]
- [兼容性设计项]

## 迁移计划 [**需要时创建**]
[步骤、回滚]

## 待解决问题
- [...]
```

5. **创建 design.md：** 基于用户描述和已记录的决策生成方案设计
   - 将方案设计写入 `codument/tracks/<track_id>/design.md`

6. **用户确认：** 展示起草的 design.md 供审查
   > "我已起草了方案设计。请审查：
   > 文件路径在：codument/tracks/<track_id>/design.md
   > 此方案设计是否正确？请建议更改或确认。"

   等待反馈并修改 design.md 直到确认（使用 **Protocol: ask-single-question-free**）

### 2.5 交互式任务生成（plan.xml）

1. **说明目标：** proposal.md 获批后：
    > "现在我将根据规范创建结构化实现计划（plan.xml）。"

2. **生成任务计划：**
    - 读取确认的 proposal.md 内容
    - 读取确认的 spec_deltas/<capability>/delta.xml 内容
    - 读取确认的 design.md 内容
    - 读取`codument/std/workflow.md`, `codument/workflows/workflow.md`
    - 生成 plan.xml，包含 Phase、Task、Subtask 的层级结构
    - **关键：** 计划结构必须遵循 workflow.md 中的方法论（如 TDD 的"编写测试"和"实现"任务）
    - 每个任务包含 id、name、priority、status
    - **可配置确认**：如需在阶段或任务执行前/后确认，可在 `<phase>` 或 `<task>` 下添加 `<confirm protocol="yield-human-confirm|yield-gap-loop" when="before|after|both" status="TODO" />`（见 `codument/std/protocols.md`）
    - **默认确认策略（重要）**：默认情况下，仅在**最后一个 phase** 下添加一个 `when="after"` 的 phase 级 `<confirm ... />`；中间 phase 默认**不添加** `<confirm>`，task 默认也**不添加** `<confirm>`
    - **例外**：只有在用户明确要求、存在高风险发布/迁移/安全检查、或确有必要在关键节点暂停审阅时，才为中间 phase 或 task 添加额外 `<confirm>`
    - **知识同步任务（可选）**：如果 `codument/config/feature.json` 中 `knowledgeSync.enabled=true`，在 tasks 中添加一个文档同步任务：
      ```xml
      <task id="T-sync-knowledge-docs" name="同步项目知识文档" priority="P1" status="TODO">
        <description>根据 feature.json 中配置的 knowledgeSync targets 和对应 attractor，判断并同步受影响的知识目录。</description>
        <acceptance_criteria>
          <criterion id="AC-read-attractor" checked="false">已读取目标 knowledge attractor</criterion>
          <criterion id="AC-decide-sync" checked="false">已判断是否需要同步 docs 或外部知识目录</criterion>
          <criterion id="AC-log-reason" checked="false">已记录未同步的理由或已完成同步</criterion>
        </acceptance_criteria>
      </task>
      ```
    - 如果 `knowledgeSync.enabled=false` 或配置缺失，不生成该任务，也不生成 docs 联动信息

3. **写入文件：**
    - 将执行计划写入 `codument/tracks/<track_id>/plan.xml`

4. **用户确认（合并提交模式与校验模式选择）：** 展示起草的 plan.xml 供审查，并在同一轮确认中选择提交模式与校验模式：
    > "我已起草了实现计划。请审查：
    > 文件路径在：codument/tracks/<track_id>/plan.xml
    > 此计划是否正确？如需修改请直接说明。
    >
    > 同时请选择本次 Track 的提交模式：
    > **A. 自动提交模式（auto）** — 任务完成后自动 commit + Git Notes
    > **B. 手动提交模式（manual）** — 由你自行控制提交时机
    >
    > 请选择本次 Track 的校验模式：
    > **C. 人工确认（yield-human-confirm）** — 由用户在确认点审阅后继续
    > **D. Gap Loop（yield-gap-loop）** — 当前 agent 到达确认点后结束，由父层 fresh-spawn 新的 gap-loop agent 做目标对比、gap 报告和修正
    >
    > 如果你选择 **D**，再选择校验粒度：
    > **E. 仅最后一个 phase 校验（final_phase，默认）**
    > **F. 每个 phase 都校验（every_phase）**
    >
    > 你可以在同一条回复中同时给出「修改意见 + 提交模式（A/B） + 校验模式（C/D） + 可选粒度（E/F）」。"

    等待反馈并修改 plan.xml 直到确认，并按以下规则写入：
    - 将提交模式写入 `<commit_mode>`
    - 将校验模式写入 `<validation_mode>`
    - 如果用户选择 `yield-gap-loop`：
      - 若未明确选择粒度，默认写入 `<validation_granularity>final_phase</validation_granularity>`
      - 写入 `<gap_loop_round>0</gap_loop_round>`
      - `final_phase`：仅在最后一个 `<phase>` 下插入 `<confirm protocol="yield-gap-loop" when="after" status="TODO" />`
      - `every_phase`：在每个 `<phase>` 下都插入 `<confirm protocol="yield-gap-loop" when="after" status="TODO" />`
    - 如果用户选择 `yield-human-confirm`：
      - 不继续询问粒度
      - 写入 `<validation_mode>yield-human-confirm</validation_mode>`
      - 默认仅在最后一个 `<phase>` 下插入 `<confirm protocol="yield-human-confirm" when="after" status="TODO" />`
    （使用 **Protocol: ask-single-question-free**）。

### 2.6 收尾

1. **确认真相源：**
   - 确保 `codument/tracks/<track_id>/plan.xml` 的 `<metadata>` 已包含 track 元数据与状态
   - 不创建或更新 `codument/tracks.md`
   - 不创建或更新 `metadata.json`

2. **宣布完成：**
   > "新 track '<track_id>' 已创建。
   > 状态真相源：codument/tracks/<track_id>/plan.xml
   > 提交模式：<auto|manual>
   > 校验模式：<yield-human-confirm|yield-gap-loop>
   > 你现在可以运行 `请使用 codument-implement skill, 实现track: <track_id>` 开始实现。"
