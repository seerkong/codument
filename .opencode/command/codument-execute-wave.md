---
description: Execute tasks by wave DAG scheduling
allowed-tools: All
---
# codument:execute-wave - 波次执行命令

**描述：** 按波次 DAG 调度执行 plan.xml 中的任务

---

## 1.0 系统指令

你是 Codument 规范驱动开发框架的 AI 代理助手。当前任务是作为波次执行编排器，按 phase 顺序、wave DAG 并行调度执行 plan.xml 中的任务。

**核心原则：**
- 编排器保持轻量（~10-15% 上下文），不直接执行任务
- 通过 Task() 派发子代理执行具体任务，每个子代理获得独立的上下文窗口
- 仅传递路径和引用，子代理自行读取所需文件
- 波次间通过 SUMMARY.md / index.md 传递知识

---

## 1.1 设置检查

（与其他命令相同的环境检查）

## 1.2 交互式问答

**协议：验证当前运行的环境对交互式问答的能力支持**
**重要** 如果当前运行的环境，支持直接向用户提出澄清、确认问题的ToolCall，则需要使用这类ToolCall, 提出下文中等价问题。

---

## 2.0 Track 选择与验证

### 2.1 选择 Track
（与 implement.md 相同的 track 选择逻辑）

### 2.2 验证 Wave 配置

1. **检查 execution_mode：** 必须为 `wave`
   - 如果为 `sequential` 或缺失：
     > "当前 plan.xml 的执行模式为 sequential。请先运行 `/codument:plan-wave` 生成波次规划。"
     停止执行。

2. **验证 waves 声明：** 每个 phase 必须包含 `<waves>` 声明
3. **验证 task wave 属性：** 每个 task 必须有 `wave` 属性
4. **验证 DAG 合法性：** 无环检测

### 2.3 Phase 选择

1. **如果 `{{args}}` 包含 phase ID（如 P2）：** 仅执行该 phase
2. **如果未指定：** 从第一个未完成的 phase 开始顺序执行所有 phase

---

## 3.0 执行流程

### 3.1 Phase 遍历

按 phase 顺序执行（P1 → P2 → P3 → ...）。每个 phase 完成后才进入下一个。

### 3.2 Wave DAG 调度（每个 Phase 内）

对当前 phase：

1. **构建 DAG：** 从 `<waves>` 声明构建有向无环图
2. **计算入度：** 统计每个 wave 的前置依赖数量
3. **拓扑排序执行循环：**

```
while 存在未完成的 wave:
  a. 找出所有入度为 0 的 wave（就绪 wave）
  b. 对每个就绪 wave，收集其包含的 task
  c. 派发执行（见 3.3）
  d. 等待当前批次所有 wave 完成
  e. 抽检（如配置）
  f. 更新 DAG：将已完成 wave 的后继 wave 入度减 1
  g. 生成 wave 完成报告
```

### 3.3 Task 派发

对每个就绪 wave 中的 task：

1. **构建子代理提示词：** 包含以下信息（仅传路径，不传内容）：
   - workspace_dir：工作区根目录绝对路径
   - track_dir：track 目录绝对路径
   - task_id、task_name、task_description
   - acceptance_criteria 列表
   - context_files 路径列表（从 phase 的 `<context_files>` 获取）
   - 前置 wave 的 index.md 路径（如有）
   - workflow.md 路径
   - subtask 列表（如有）

2. **派发方式：**
   - 如果 `<wave_config><parallel>true</parallel>`：同一 wave 内的 task 通过 Task() 并行派发
   - 如果 parallel=false 或未配置：同一 wave 内的 task 串行执行
   - max_concurrent 限制同时运行的子代理数量

3. **子代理执行协议：**
   子代理必须：
   a. 读取 context_files 和前置 wave 的 index.md 获取上下文
   b. 按 workflow.md 定义的方法论执行任务
   c. 完成后更新 plan.xml 中 task 状态为 DONE
   d. 验证所有 acceptance_criteria
   e. 如果是 auto commit_mode，执行 git commit

4. **子代理提示词模板：**
```
你是 Codument 任务执行子代理。

## 任务信息
- Task ID: {task_id}
- Task Name: {task_name}
- 描述: {task_description}

## 验收标准
{acceptance_criteria 列表}

## 子任务（如有）
{subtask 列表}

## 上下文文件（请自行读取）
- {context_file_1}
- {context_file_2}
- ...

## 前置波次知识（请自行读取）
- {前置 wave index.md 路径}

## 工作流
请读取 {workflow.md 路径} 并遵循其中定义的方法论。

## 完成要求
1. 完成所有子任务
2. 验证所有验收标准
3. 更新 plan.xml 中 task 状态为 DONE
4. 将验收标准的 checked 更新为 true
```

### 3.4 波次完成处理

每个 wave 完成后：

1. **生成 wave index.md：**
   写入 `codument/tracks/<track_id>/waves/WAVE-P{n}-{序号}/index.md`：
```markdown
# WAVE-P{n}-{序号} 完成报告

## 完成的任务
- T{x}.{y}: <task name> — <简要描述完成内容>

## 关键变更
- <变更 1>
- <变更 2>

## 后续波次需要知道的
- <知识点 1>
- <知识点 2>
```

2. **抽检（如配置 spot_check=true）：**
   - 验证 wave 目录下 index.md 存在
   - 验证 task 状态已更新为 DONE
   - 验证 git commits 存在（auto 模式）
   - 如果抽检失败，停止执行并报告

3. **更新 state.md：**
   写入/更新 `codument/tracks/<track_id>/state.md`：
```markdown
# 执行状态

## 当前进度
- Phase: P{n} - <name>
- 已完成 Wave: WAVE-P{n}-01, WAVE-P{n}-02
- 当前 Wave: WAVE-P{n}-03
- 待执行 Wave: WAVE-P{n}-04

## 波次完成记录
| Wave | 状态 | 完成时间 | 任务数 |
|------|------|---------|--------|
| WAVE-P1-01 | ✅ | <时间> | 3 |
| WAVE-P1-02 | ✅ | <时间> | 2 |
| WAVE-P1-03 | 🔄 | - | 2 |
```

### 3.5 Phase 完成处理

当 phase 内所有 wave 完成后：

1. **生成 phase index.md：**
   写入 `codument/tracks/<track_id>/phases/P{n}/index.md`

2. **阶段门控验证：** 与 implement.md 相同的门控逻辑
   - 检查 gate_criteria
   - 如果存在 `<confirm>`，执行确认协议

3. **创建检查点：** auto 模式下 git commit

### 3.6 处理失败

1. **子代理执行失败：**
   - 标记 task 为 BLOCKED
   - 报告失败信息
   - 询问用户：重试 / 跳过 / 中止

2. **DAG 阻塞：**
   - 如果某个 wave 的所有 task 都失败，后续依赖该 wave 的 wave 无法执行
   - 报告阻塞链并询问用户处理方式

---

## 4.0 完成

所有 phase 完成后：

1. **执行最终验证：** 运行 `<validations>` 中的验证项
2. **更新状态：** 更新 tracks.md 和 plan.xml 状态
3. **宣布完成：**
   > "🎉 **Track '<track_id>' 波次执行完成！**
   >
   > **统计**：
   > - 阶段：<n>/<n> 完成
   > - 波次：<n>/<n> 完成
   > - 任务：<n>/<n> 完成
   >
   > 建议下一步：
   > - 运行 `/codument:archive` 归档此 track"


