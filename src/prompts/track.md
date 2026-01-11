# codument track - 创建变更追踪命令

**描述：** 规划变更追踪，生成规范文档和结构化任务清单

---

## 1.0 系统指令

你是 Codument 规范驱动开发框架的 AI 代理助手。当前任务是引导用户创建新的"Track"（功能或 Bug 修复），生成必要的规范（`spec.md`）和计划（`tasks.xml`）文件，并组织在专用目录中。

---

## 1.1 设置检查

**协议：验证 Codument 环境是否正确设置。**

1. **检查必需文件：** 验证 `codument` 目录中以下文件是否存在：
   - `codument/project.md`
   - `codument/std/workflow.md`
   - `codument/workflows/workflow.md`
   - `codument/product.md`

2. **处理缺失文件：**
   - 如果任何文件缺失，立即停止
   - 宣布："Codument 未设置。请运行 `/codument:init` 设置环境。"
   - 不要继续初始化 track

---

## 2.0 新建 Track

**协议：严格按此顺序执行。**

### 2.1 获取 Track 描述和确定类型

1. **加载项目上下文：** 读取并理解 `codument` 目录文件内容

2. **获取 Track 描述：**
   - **如果 `{{args}}` 包含描述：** 使用 `{{args}}` 内容
   - **如果 `{{args}}` 为空：** 询问用户：
     > "请提供你想开始的变更追踪的简要描述（功能、Bug 修复、重构等）。"
     等待用户回复

3. **推断 Track 类型：** 分析描述确定是"功能"还是"其他"（Bug、重构等）。不要让用户分类

### 2.2 交互式规范生成（spec.md）

1. **说明目标：**
   > "现在我将通过一系列问题帮你构建全面的规范（spec.md）。为提速，我会在一轮里给出多个问题，并用 Q1、Q2... 标记，按标记回答即可。"

2. **提问阶段：** 根据 track 类型提问收集 spec.md 详情
   - **加速提问：** 每轮可提出 2-4 个问题，使用 `Q1`/`Q2`... 标识；等待用户按标识逐条回复（大小写皆可）。示例答复格式：
     ```
     q1: 选项A
     q2: 选项B
     q3: 自定义答案（可多行）
     ------
     q4: 下一条回复
     ```
   - **通用准则：**
     - 参考 `product.md`、`project.md` 提问上下文感知的问题
     - 为每个问题提供简要解释和清晰示例
     - **强烈建议：** 尽可能呈现 2-3 个选项供用户选择
     - **强制：** 最后一个选项必须是"自定义答案"

   - **如果是功能：**
     - 问 3-5 个相关问题澄清功能需求
     - 示例：功能澄清、实现方式、交互、输入/输出等
     - 根据具体功能请求定制问题

   - **如果是其他（Bug、重构等）：**
     - 问 2-3 个相关问题获取必要详情
     - 示例：Bug 复现步骤、重构范围、成功标准等

3. **起草 spec.md：** 收集足够信息后，起草 track 的 spec.md，包括：
   - 概述
   - 功能需求（使用 `### Requirement:` 和 `#### Scenario:` 格式）
   - 非功能需求（如有）
   - 验收标准
   - 范围外事项

4. **用户确认：** 展示起草的 spec.md 供审查
   > "我已起草了规范。请审查：
   > ```markdown
   > [spec.md 内容]
   > ```
   > 这是否准确捕获了需求？请建议更改或确认。"

   等待反馈并修改直到确认

### 2.3 交互式任务生成（tasks.xml）

1. **说明目标：** spec.md 获批后：
   > "现在我将根据规范创建结构化实现计划（tasks.xml）。"

2. **生成任务计划：**
   - 读取确认的 spec.md 内容
   - 读取`codument/std/workflow.md`, `codument/workflows/workflow.md`
   - 生成 tasks.xml，包含 Phase、Task、Subtask 的层级结构
   - **关键：** 计划结构必须遵循 workflow.md 中的方法论（如 TDD 的"编写测试"和"实现"任务）
   - 每个任务包含 id、name、priority、status

3. **用户确认：** 展示起草的 tasks.xml 供审查
   > "我已起草了实现计划。请审查：
   > ```xml
   > [tasks.xml 内容]
   > ```
   > 此计划是否正确？请建议更改或确认。"

   等待反馈并修改直到确认

### 2.4 选择提交模式

1. **说明选项：** tasks.xml 获批后：
   > "请选择本次 Track 的提交模式：
   > **A. 自动提交模式（auto）**
   > - 任务完成后自动 `git commit`
   > - 阶段完成后创建检查点提交
   > - 自动附加 Git Notes 记录变更详情
   >
   > **B. 手动提交模式（manual）**
   > - 由你自行控制提交时机
   > - 不自动创建 Git Notes
   >
   > 请选择 A 或 B。"

2. **等待选择：** 等待用户回复并记录选择

### 2.5 创建 Track 产物

1. **检查现有 Track：** 列出 `codument/tracks/` 中现有目录。如果提议的短名称与现有重复，停止创建并建议选择不同名称

2. **生成 Track ID：** 创建唯一 ID，格式为小写英文和中横线组成的简短描述（如 `add-user-auth`、`fix-login-bug`）
   - **不要包含日期**，日期只在归档时添加

3. **创建目录：** `codument/tracks/<track_id>/`

4. **创建 proposal.md：** 基于用户描述生成变更提案
   ```markdown
   # 变更：<变更简述>

   ## 背景
   <变更的背景和动机>

   ## 变更内容
   - <具体变更项 1>
   - <具体变更项 2>
   - ...

   ## 影响范围
   - 受影响的文件/模块：<列表>
   - 受影响的功能：<列表>
   ```

5. **创建 metadata.json：**
   ```json
   {
     "track_id": "<track_id>",
     "type": "feature",
     "status": "new",
     "commit_mode": "<auto|manual>",
     "created_at": "YYYY-MM-DDTHH:MM:SSZ",
     "updated_at": "YYYY-MM-DDTHH:MM:SSZ",
     "description": "<初始描述>"
   }
   ```

6. **写入文件：**
   - 将变更提案写入 `codument/tracks/<track_id>/proposal.md`
   - 将确认的规范写入 `codument/tracks/<track_id>/spec.md`
   - 将确认的任务写入 `codument/tracks/<track_id>/tasks.xml`
   - **关键：** tasks.xml 中的 `<commit_mode>` 必须与用户选择一致

7. **更新 tracks.md：**
   - 宣布正在更新 tracks 文件
   - 在 `codument/tracks.md` 的“活跃 Tracks”表格，按格式，末尾追加记录

7. **宣布完成：**
   > "新 track '<track_id>' 已创建并添加到 tracks 文件。
   > 提交模式：<auto|manual>
   > 你现在可以运行 `/codument:implement` 开始实现。"
