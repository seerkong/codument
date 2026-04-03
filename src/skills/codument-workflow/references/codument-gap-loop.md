---
description: Run a fresh gap loop for a track or phase
argument-hint: <track-id> [--background <path>]... [--phase <phase-id>]
---

$ARGUMENTS

# codument:gap-loop - Gap Loop 命令

**Codex wrapper 约束：**
- 如果父层需要复检，每一轮都必须 fresh-spawn 一个新的 agent
- 不得复用上一轮 gap-loop agent 的上下文
- 如果上层封装环境已经声明由它统一主持 gap-loop，则应优先服从该上层协议，不得在当前节点内部再造竞争性的 nested loop

---

## 0.0 总纲

`yield-gap-loop` 的目标不是让“当前拿到命令的代理顺手做一次 review”，而是把工作拆成两个角色：

1. **父层编排代理**
   - 负责轮次控制
   - 负责 fresh-spawn 新 round
   - 负责根据 XML 结果决定继续、复检或阻塞
2. **fresh 子代理**
   - 只负责当前这一轮的目标对比、gap 报告、必要修正与 XML 返回

如果你在读取完本文件后，没有先判断角色就直接开始审查代码、diff 或写报告，属于违反协议。

---

## 0.1 角色判定

你读取完本文件后的第一判断必须是：

- 我当前是不是“专门为这一轮 gap-loop freshly created 的 round executor”？

若答案为：

- **是**
  - 你应当按“Fresh 子代理章节”执行
- **否**
  - 你应当按“父层编排代理章节”执行

特别注意：

- 同一个文件给两个角色共用，不代表两个角色都执行全部步骤
- 父层代理不得越权去做子代理的一轮实质工作
- 子代理不得越权去决定下一轮是否继续

---

## 0.2 公共规则

### 0.2.1 上层封装运行环境优先级

如果当前运行在一个更上层的封装编排环境中，而该环境本身已经实现了 `yield-gap-loop` 协议，则**以上层环境的编排实现为准**。

这类环境包括但不限于：

- 多 agent / agent teams 编排应用
- 自定义制度化 workflow 应用
- 显式指定由某个上层 orchestrator 统一主持 gap-loop 的运行环境

此时：

- 当前 agent 必须先判断自己是上层 orchestrator，还是其下游 worker / member
- 如果上层环境已经声明“由它来主持 fresh-round orchestration”，则下游 worker **不得**再在本层自行创建竞争性的 nested gap-loop
- Codument 的 gap-loop 约束仍然有效，但“谁来承担 parent orchestrator”由上层环境定义

换句话说：

- 存在两套都能实现 `yield-gap-loop` 的环境时，以**上层封装运行环境**的实现为主
- 下层 agent 不得绕过上层 orchestrator，私自把 gap-loop 退化成自己节点内部的 subagent loop

### 0.2.2 手动触发时的模式补齐

如果用户显式执行 `codument:gap-loop <track-id>`，而当前 track 的 `plan.xml` 原本不是 gap-loop 模式（例如 `validation_mode` 缺失，或为 `yield-human-confirm`），则父层编排代理在启动第 1 轮之前，必须先把 `plan.xml` 补齐并切换到 gap-loop 模式。

至少需要完成以下修改：

- 将 `<validation_mode>` 写成 `yield-gap-loop`
- 若缺少 `<validation_granularity>`：
  - 若多个 phase 已配置 phase 级 `<confirm>`，则写为 `every_phase`
  - 其他情况默认写为 `final_phase`
- 若缺少 `<gap_loop_round>`，则初始化为 `0`
- 将当前 scope 对应的 `<confirm>` 协议切换为 `yield-gap-loop`
- 若按最终确定的 granularity，本应存在的 phase 级 `<confirm>` 缺失，则补齐为 `when="after" status="TODO"` 的 `yield-gap-loop`

补齐规则的最低要求是：

- 如果命令带 `--phase <phase-id>`，则当前 phase 至少必须具备可执行的 `yield-gap-loop` confirm
- 如果命令未指定 `--phase`，则整个 track 的 phase 级 confirm 布局必须与最终的 `validation_granularity` 一致

### 0.2.3 轮次元数据

当 `validation_mode=yield-gap-loop` 时，`plan.xml` 的 `<metadata>` 应包含：

```xml
<gap_loop_round>0</gap_loop_round>
```

规则如下：

- 创建 track 时初始化为 `0`
- 父层每次启动新一轮 fresh 子代理前，先将其更新为当前 round 编号
- 若旧 track 缺少该字段，则按兼容逻辑视为 `0`

### 0.2.4 历史报告与首轮怀疑规则

父层在决定是否收口时，必须区分两类场景：

1. **已有历史 gap-loop**
   - `reports/` 中已有报告，或 `gap_loop_round > 1`
2. **从未跑过 gap-loop**
   - `reports/` 为空或不存在
   - 且当前 round 是第 1 轮

对于第 2 类场景：

- 如果首轮 fresh 子代理返回 `NO_GAP`
- 父层仍必须保持怀疑
- 必须再 fresh-spawn 一轮新的子代理做验证

也就是说：

- **首轮 + 无历史报告 + NO_GAP** 不能直接收口

### 0.2.5 统一禁止事项

无论你是哪种角色，都禁止：

- 复用上一轮 gap-loop 子代理上下文
- 把当前代理的预检查结果伪装成正式 round 结果
- 让子代理在本轮结束后自己继续下一轮
- 在上层 orchestrator 已声明接管时，再在下层节点内部私造一层 nested gap-loop

---

## 1.0 父层编排代理章节

### 1.1 你是父层编排代理时，只允许做什么

如果你当前不是本轮专用 fresh 子代理，那么你只允许做以下事情：

1. 解析命令参数
2. 确认本轮 scope（track 或 phase）
3. 检查并补齐当前 track 的 gap-loop mode metadata 与 confirm 配置
4. 检查 `plan.xml` metadata 中的 `gap_loop_round`
5. 检查当前 track 下 `reports/` 是否已有历史报告
6. fresh-spawn 一个新的子代理
7. 把本文件规定的输入范围和输出协议传给该子代理
8. 等待其返回 XML
9. 根据 XML 决定是否继续下一轮

在 fresh-spawn 子代理之前，父层代理**禁止**：

- 自己读取并审查代码实现细节
- 自己读取并分析未提交 diff
- 自己生成 gap 结论
- 自己写 gap 报告
- 自己修正实现

### 1.2 父层每轮的执行顺序

父层必须严格按以下顺序执行：

1. 解析参数：`<track-id>`、`--background`、`--phase`
2. 判断当前 scope 是否由更上层 orchestrator 接管
   - 若已接管且你不是被授权的 parent orchestrator，则停止当前本地 loop，并把控制权交回上层协议
3. 读取 `plan.xml`，检查当前 track 是否已处于 gap-loop 模式
   - 若 `validation_mode` 缺失或不是 `yield-gap-loop`，必须先补齐 `validation_mode`、`validation_granularity`、`gap_loop_round`，并把当前 scope 所需的 `<confirm>` 迁移为 `yield-gap-loop`
4. 在完成上述补齐后，再读取当前 `gap_loop_round`
   - 若字段缺失，按 `0` 处理
5. 检查当前 track 的 `reports/`
   - 判断是否已有历史报告
6. 计算下一轮 round 编号
   - `next_round = current_round + 1`
7. 在 `plan.xml` metadata 中先写入新的 `<gap_loop_round>`
8. fresh-spawn 一个新的 round executor
9. 仅向该子代理传递最小必要上下文：
   - `track-id`
   - `phase`（如有）
   - `background` 路径（如有）
   - 本文件要求的固定输入范围
   - 输出 XML 契约
10. 等待其返回结构化 XML

### 1.3 父层收到 XML 后的强制循环规则

父层读取 XML 后，必须严格按下列规则处理：

- `BLOCKED`
  - 将当前 `<confirm>` 标记为 `BLOCKED`
  - 停止并请求用户输入

- `FIX_APPLIED`
  - **不得停止**
  - **不得视为完成**
  - 必须继续下一轮：
    - 更新 `gap_loop_round`
    - 再次 fresh-spawn 新的子代理

- `NO_GAP`
  - 若满足以下全部条件：
    - 当前 round 是第 1 轮
    - `reports/` 为空或不存在
    - 此前没有执行过 gap-loop
  - 则**不得立即收口**
  - 必须再 fresh-spawn 一轮新的子代理做验证

- `NO_GAP` 且不满足上述“首轮怀疑”条件
  - 才可以将当前 `<confirm>` 标记为 `DONE`

### 1.4 父层对外输出限制

父层代理对用户最终只应转交：

- 子代理最终返回的结构化 XML

父层不应：

- 输出自己的 gap 推理过程
- 把自己的中间判断冒充为本轮 gap-loop 结果

---

## 2.0 Fresh 子代理章节

### 2.1 继续执行的前提

你只有在满足以下前提时，才允许继续：

- 你已经是本轮 freshly created 的专用执行者
- 当前 track 的 `plan.xml` 已由父层确认或补齐为 gap-loop 模式
- 当前 round 已由父层决定并写入 `plan.xml` metadata
- 你不是某个上层 workflow 下游节点内部私造出来的竞争性 nested loop

如果这些前提不成立，应立即返回 `BLOCKED`，并说明当前环境无法满足 `yield-gap-loop` 的 fresh-round 执行要求。

### 2.2 你必须读取的输入

必须读取：

- `codument/tracks/<track-id>/proposal.md`
- `codument/tracks/<track-id>/spec.md`
- `codument/tracks/<track-id>/design.md`（如存在）
- `codument/tracks/<track-id>/plan.xml`
- `codument/tracks/<track-id>/reports/` 下已有的历史报告（如存在）

如果命令中提供了 `--background <path>`，继续读取这些背景文件。

还必须检查：

- 当前代码实现
- 当前未提交的代码改动
- 若指定 `--phase <phase-id>`，聚焦该 phase 的目标、任务、验收标准和对应实现

### 2.3 你这一轮必须按什么顺序执行

严格按以下顺序执行：

1. 确认你当前确实是本轮专用 fresh 子代理；若不是，返回 `BLOCKED`
2. 读取目标文档
3. 读取 `reports/` 中的历史 gap 报告
4. 读取可选背景文件
5. review 当前实现与未提交改动
6. 生成新的 gap 报告，写入 `codument/tracks/<track-id>/reports/`
7. 若没有 gap：
   - 不做不必要修改
   - 返回 `NO_GAP`
8. 若存在 gap：
   - 先更新 `plan.xml`
   - 必要时更新 `design.md`
   - 必要时更新 `spec.md`
   - 再修正实现
   - 返回 `FIX_APPLIED`
9. 若依赖用户决策、外部输入或无法继续自动修正：
   - 记录 gap 报告
   - 必要时更新 `plan.xml/spec.md/design.md`
   - 返回 `BLOCKED`

### 2.4 这一轮结束时你不能做什么

当你返回本轮 XML 后：

- 不得自己继续下一轮
- 不得假设 `FIX_APPLIED` 就代表收口
- 不得自行判定“首轮 NO_GAP 已经足够”

下一轮是否继续，由父层编排代理决定。

---

## 3.0 输出协议

最终只允许输出以下结构化 XML：

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

`scope` 规则：

- 未指定 `--phase` 时：`<scope kind="track">...</scope>`
- 指定 `--phase P2` 时：`<scope kind="phase">P2</scope>`

`status` 只允许：

- `NO_GAP`
- `FIX_APPLIED`
- `BLOCKED`

禁止输出：

- Markdown 说明
- 自然语言前言或总结
- 额外代码块
- 多段 XML
