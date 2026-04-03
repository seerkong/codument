---
description: Execute tasks by wave DAG scheduling
argument-hint: <track-id> [phase]
---

$ARGUMENTS

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
**重要** 若环境支持向用户提出澄清/确认问题的 ToolCall，则在“必须提问”的场景下必须使用 ToolCall。

**必须提问的场景仅包括：**
- 需要用户选择（如 track 选择模糊、phase 选择）
- plan.xml 存在 `<confirm protocol="yield-human-confirm" .../>` 且 `when` 包含 `before/after/both`（按协议要求等待确认）
- 子代理执行失败、抽检失败、DAG 阻塞等失败处理分支（按协议询问重试/跳过/中止）

**禁止提问的场景：**
- 仅因为环境支持 ToolCall 就在每个 phase 或 wave 边界额外发问

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

2. **阶段门控验证：** 与 implement.md 相同的门控逻辑（严格触发条件）
   - 检查 gate_criteria
   - **仅当**该 `<phase>` 下存在 `<confirm protocol="yield-human-confirm" .../>` 或 `<confirm protocol="yield-gap-loop" .../>` 且 `when` 包含 `after`（或 `both`）时：执行 `codument/std/workflow.md` 的“阶段完成验证协议”，并按 `codument/std/protocols.md` 等待确认完成
   - **否则：**跳过门控确认步骤，不要提问，并输出提示："当前 phase 未配置 confirm(after/both)，将自动进入下一 phase。"
   - 如果协议为 `yield-gap-loop`：
     - 当前波次执行编排器在 phase 完成后只负责结束当前轮并把控制权交回父层
     - 父层编排者每次启动新一轮前，必须先更新 `plan.xml` metadata 中的 `<gap_loop_round>`
     - 父层编排者必须 fresh-spawn 新的 gap-loop 子代理或等价的 fresh child context，并让其执行当前 scope 的 gap-loop 子流程
     - 若返回 `NO_GAP`：若这是“首轮 + 无历史报告”的结果，父层仍必须再 fresh-spawn 一轮新的 gap-loop 子代理验证；否则才将 `<confirm>` 标记为 `DONE`
     - 若返回 `FIX_APPLIED`：父层必须再次 fresh-spawn 新的 gap-loop 子代理复检，不得停止在这一轮
     - 若返回 `BLOCKED`：将 `<confirm>` 标记为 `BLOCKED` 并停止

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
