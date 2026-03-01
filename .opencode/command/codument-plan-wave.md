---
description: Plan wave DAG for a track phase
allowed-tools: All
---
# codument:plan-wave - 波次规划命令

**描述：** 为 plan.xml 生成波次（wave）DAG 分组，优化并行执行

---

## 1.0 系统指令

你是 Codument 规范驱动开发框架的 AI 代理助手。当前任务是为指定 track 的 plan.xml 生成波次分组，将 task 按依赖关系组织为可并行执行的 wave。

---

## 1.1 设置检查

**协议：验证 Codument 环境是否正确设置。**

1. **检查必需文件：** 验证 `codument` 目录中以下文件是否存在：
   - `codument/project.md`
   - `codument/std/workflow.md`
   - `codument/workflows/workflow.md`
   - `codument/product.md`
   - `codument/tech-stack.md`（可选，但推荐）

2. **处理缺失文件：**
   - 如果任何必需文件缺失，立即停止
   - 宣布："Codument 未设置。请运行 `/codument:init` 设置环境。"
   - 不要继续 track 选择

---

## 1.2 交互式问答

**协议：验证当前运行的环境对交互式问答的能力支持**
**重要** 如果当前运行的环境，支持直接向用户提出澄清、确认问题的ToolCall，则需要使用这类ToolCall, 提出下文中等价问题。

---

## 2.0 Track 选择

**协议：识别并选择要规划波次的 track。**

1. **检查用户输入：** 检查用户是否提供了 track 名称作为参数

2. **解析 tracks 文件：** 读取并理解 `codument/tracks.md`。查看"活跃 Tracks"中表格
   - **关键：** 如果没有 track 部分，宣布"tracks 文件为空或格式错误"并停止

3. **选择 Track：**
    - **如果提供了名称：**
      - 执行精确、不区分大小写的匹配
      - 找到唯一匹配时与用户确认（使用 **Protocol: ask-single-question-closed**）
      - 无匹配或模糊时请求澄清（使用 **Protocol: ask-single-question-free**）

   - **如果未提供名称：**
     - 找到"活跃 Tracks"表格中第一个track
     - 宣布自动选择并继续
     - 如果都已完成，宣布并停止

4. **处理无选择：** 如果未选择 track，通知用户并等待指示（使用 **Protocol: ask-single-question-free**）

---

## 3.0 波次规划流程

### 3.1 加载上下文

1. **读取 track 文件：**
   - `plan.xml` — 当前任务计划
   - `spec.md` — 需求规范
   - `design.md` — 方案设计（如存在）
   - `context.md` — 讨论记录（如存在）
   - `codument/std/plan-xml-spec.md` — plan.xml schema 规范

2. **检查 execution_mode：**
   - 如果 plan.xml 中 `<execution_mode>` 为 `sequential`，询问是否切换为 `wave`
   - 如果不存在 `<execution_mode>`，询问用户选择模式

### 3.2 分析任务依赖

对每个 phase：

1. **构建任务依赖图：** 分析 phase 内 task 之间的逻辑依赖关系
   - 基于 task 描述、验收标准、技术栈推断依赖
   - 考虑 design.md 和 context.md 中的决策

2. **识别并行机会：**
   - 无依赖关系的 task 可以并行
   - 有共同前置依赖的 task 可以在同一 wave
   - 有顺序依赖的 task 必须在不同 wave

### 3.3 生成 Wave 分组

1. **拓扑排序：** 对依赖图进行拓扑排序
2. **分层分组：** 将同一拓扑层级的 task 归入同一 wave
3. **命名规则：** `WAVE-P{阶段号}-{两位序号}`（如 WAVE-P1-01, WAVE-P1-02）

4. **展示分组方案：**
   > "📋 **Phase P1 波次分组方案：**
   >
   > **WAVE-P1-01**（无依赖）
   > - T1.1: <task name>
   > - T1.2: <task name>
   >
   > **WAVE-P1-02**（依赖: WAVE-P1-01）
   > - T1.3: <task name>
   >
   > **WAVE-P1-03**（依赖: WAVE-P1-01, WAVE-P1-02）
   > - T1.4: <task name>
   > - T1.5: <task name>
   >
   > 此方案是否合理？请建议调整或确认。"
   （使用 **Protocol: ask-single-question-free**）

### 3.4 更新 plan.xml

确认后，更新 plan.xml：

1. **设置 execution_mode：** `<execution_mode>wave</execution_mode>`

2. **为每个 phase 添加 waves 声明：**
```xml
<waves>
  <wave id="WAVE-P1-01" />
  <wave id="WAVE-P1-02" depends_on="WAVE-P1-01" />
  <wave id="WAVE-P1-03" depends_on="WAVE-P1-01,WAVE-P1-02" />
</waves>
```

3. **为每个 task 添加 wave 属性：**
```xml
<task id="T1.1" name="..." status="TODO" priority="P0" wave="WAVE-P1-01">
  <description>...</description>
</task>
```

4. **添加 context_files（如适用）：**
```xml
<context_files>
  <file>codument/tracks/<track_id>/spec.md</file>
  <file>codument/tracks/<track_id>/design.md</file>
  <file>codument/tracks/<track_id>/context.md</file>
</context_files>
```

5. **添加 wave_config（可选）：**
   询问用户是否需要配置并行执行参数：
   > "是否配置波次执行参数？
   > A) 使用默认配置（串行执行，无抽检）
   > B) 自定义配置"
   （使用 **Protocol: ask-single-question-closed**）

   如果选择自定义：
   ```xml
   <wave_config>
     <parallel>true</parallel>
     <max_concurrent>3</max_concurrent>
     <spot_check>true</spot_check>
   </wave_config>
   ```

---

## 4.0 完成

宣布规划完成：
> "波次规划完成，plan.xml 已更新。
> - 执行模式：wave
> - Phase 数：<count>
> - 总 Wave 数：<count>
>
> 你现在可以运行 `/codument:execute-wave` 开始波次执行。"


