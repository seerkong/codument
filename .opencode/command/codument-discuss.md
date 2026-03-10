---
description: Discuss a phase for wave execution planning
allowed-tools: All
---
# codument:discuss - 讨论命令

**描述：** 引导 phase 级讨论，收集实现方案决策，生成上下文文件

---

## 1.0 系统指令

你是 Codument 规范驱动开发框架的 AI 代理助手。当前任务是引导用户对指定 phase 进行深入讨论，收集关键决策和实现方案，生成 context.md 供后续波次执行使用。

---

## 1.1 设置检查

**协议：验证 Codument 环境是否正确设置。**

1. **检查必需文件：** 验证以下文件是否存在：
   - `codument/project.md`
   - `codument/std/workflow.md`
   - `codument/workflows/workflow.md`
   - `codument/product.md`

2. **处理缺失文件：**
   - 如果任何文件缺失，立即停止
   - 宣布："Codument 未设置。请运行 `/codument:init` 设置环境。"
   - 不要继续讨论流程

## 1.2 交互式问答

**协议：验证当前运行的环境对交互式问答的能力支持**
**重要** 如果当前运行的环境，支持直接向用户提出澄清、确认问题的ToolCall，则需要使用这类ToolCall, 提出下文中等价问题。

---

## 2.0 Track 与 Phase 选择

### 2.1 选择 Track

1. **解析 tracks.md：** 读取 `codument/tracks.md`，列出所有活跃 track
2. **如果 `{{args}}` 包含 track ID：** 精确匹配该 track；若精确且唯一匹配，直接选择并继续，不需要用户确认；仅在无匹配或存在多个候选时请求澄清
3. **如果只有一个活跃 track：** 自动选择该 track
4. **如果有多个活跃 track 且未指定：** 列出所有活跃 track 供用户选择
   > "请选择要讨论的 Track：
   > A) <track_id_1> - <描述>
   > B) <track_id_2> - <描述>
   > ..."
   （使用 **Protocol: ask-single-question-closed**）

### 2.2 选择 Phase

1. **解析 plan.xml：** 读取 track 的 plan.xml，列出所有 phase
2. **如果 `{{args}}` 包含 phase ID（如 P1）：** 直接选择该 phase
3. **如果未指定：** 列出所有 phase 供用户选择
   > "请选择要讨论的阶段：
   > A) P1 - <phase名称>
   > B) P2 - <phase名称>
   > ..."
   （使用 **Protocol: ask-single-question-closed**）

---

## 3.0 讨论流程

### 3.1 加载上下文

1. **读取 track 文件：**
   - `spec.md` — 需求规范
   - `proposal.md` — 变更提案
   - `design.md` — 方案设计（如存在）
   - `plan.xml` — 任务计划

2. **提取 phase 信息：**
   - phase 目标（goal）
   - phase 内所有 task 列表
   - context_files（如有声明）
   - waves DAG（如有声明）

3. **读取已有 context.md：** 如果 `context.md` 已存在，加载之前的讨论记录

### 3.2 引导讨论

1. **展示 phase 概览：**
   > "📋 **Phase <id>: <name>**
   > 目标：<goal>
   > 任务数：<count>
   > 
   > 任务列表：
   > - T{x}.{y}: <task name> [<priority>]
   > - ..."

2. **提出讨论问题：** 根据 phase 内容，提出 3-5 个关键问题帮助澄清实现方案
   - 使用 **Protocol: ask-multi-question-free**
   - 问题应聚焦于：
     - 技术方案选择（如有多种实现路径）
     - 边界条件和异常处理策略
     - 与现有代码的集成方式
     - 测试策略
     - 性能/安全考量（如适用）

3. **迭代讨论：** 根据用户回答，可能追问 1-2 轮深入问题

4. **总结决策：** 讨论结束后，总结所有关键决策

### 3.3 生成 context.md

1. **格式：**
```markdown
# 讨论记录

## Phase <id>: <name>

### 讨论时间
<ISO 8601 时间>

### 关键决策
1. **<决策主题>**：<决策内容>
   - 理由：<为什么这样决定>
2. ...

### 实现要点
- <要点 1>
- <要点 2>

### 约束与注意事项
- <约束 1>
- <约束 2>

### 参考资料
- <相关文件路径>
```

2. **写入文件：** 写入 `codument/tracks/<track_id>/context.md`
   - 如果文件已存在，追加新 phase 的讨论记录（不覆盖之前的）

3. **用户确认：**
   > "讨论记录已生成。请审查：
   > 文件路径：codument/tracks/<track_id>/context.md
   > 是否准确？请建议更改或确认。"
   （使用 **Protocol: ask-single-question-free**）

---

## 4.0 完成

宣布讨论完成：
> "Phase <id> 讨论完成，context.md 已更新。
> 你现在可以运行 `/codument:plan-wave` 生成波次计划，或 `/codument:execute-wave` 开始执行。"


