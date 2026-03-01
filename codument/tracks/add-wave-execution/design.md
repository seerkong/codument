## 上下文

Codument 是一个规范驱动的 AI 编码助手开发框架，当前使用 plan.xml 管理任务，采用顺序执行模型。本次变更引入 GSD 项目的波次执行原理，在保持完全向后兼容的前提下，为 codument 添加 wave DAG 调度、上下文工程、subtask 嵌套等能力。

约束：
- Bun 运行时，TypeScript，无外部 XML 解析库（纯正则解析）
- 现有正则解析器对属性顺序有隐式依赖
- 旧归档 plan.xml 不可修改
- 提示词通过 `fs.readFileSync` + `__dirname` 嵌入 bunfs 可执行文件

## 方案概览

1. **plan.xml Schema 扩展**
   - `<metadata>` 新增 `<execution_mode>` 子元素（`wave` | `sequential`，缺失默认 `sequential`）
   - `<phase>` 下新增 `<waves>` 容器 → `<wave id="WAVE-P{n}-{序号}" depends_on="..." />`
   - `<phase>` 下新增 `<context_files>` 容器 → `<file>路径</file>`
   - `<task>` 新增 `wave` 属性（值为该 phase 内已声明的 wave ID）
   - `<subtask>` 从自闭合扩展为可开闭标签，支持递归嵌套 `<subtasks>`
   - `<subtask>` 下新增 `<detail_ref>` 子元素（相对路径指向详情文件）
   - 根级别新增 `<wave_config>` 节点（`<parallel>`、`<max_concurrent>`、`<spot_check>`）

2. **Schema 移除**
   - 移除 `<dependencies>` 标签（从 spec、提示词、解析器中删除）
   - 移除 metadata.json 中的 `commit_mode` 字段

3. **解析器改造**（`src/cli/utils/index.ts`）
   - 移除 dependencies 正则匹配和 `dependencies` 字段
   - 新增 wave 属性提取（task 开标签正则扩展）
   - 新增 `<waves>` 解析（phase 内提取 wave DAG）
   - 新增 subtask 递归解析（替代当前的自闭合标签正则）
   - 新增 `<context_files>` 解析
   - 新增 `<execution_mode>` 解析
   - `getCommitMode()` 保持从 plan.xml 读取，移除 metadata.json 回退逻辑

4. **执行引擎**（新增提示词逻辑）
   - Phase 顺序遍历：P1 全部完成 → P2 → ...
   - Phase 内 wave DAG 调度：构建 DAG → 拓扑排序 → 入度为 0 的 wave 并行 → 完成后更新入度 → 循环
   - 同一 wave 内的 task 通过 Task() 并行派发给子代理
   - 子代理按 `<context_files>` 自行读取上下文，编排器仅传递路径
   - 波次间抽检：验证 wave 目录下 index.md 存在 + git commits 存在

5. **Track 目录结构扩展**
   - `context.md`：discuss 命令生成的用户决策记录
   - `state.md`：活记忆，波次执行状态追踪
   - `phases/P{n}/index.md`：phase 完成后的共享知识索引
   - `phases/P{n}/T{x}.{y}.{z}-detail.md`：subtask detail_ref 指向的详情文件
   - `waves/WAVE-P{n}-{序号}/index.md`：wave 完成后的共享知识索引

6. **新增命令提示词**（中文）
   - `src/prompts/discuss.md`：引导 phase 级讨论，输出 context.md
   - `src/prompts/plan-wave.md`：生成带 wave DAG 的 plan.xml
   - `src/prompts/execute-wave.md`：波次执行编排器逻辑
   - `src/prompts/verify.md`（已存在，需扩展）：独立验证子代理

7. **现有提示词修改**
   - `src/prompts/plan-xml-spec.md`：更新 schema 描述，移除 dependencies，新增 wave 相关节点
   - `src/prompts/implement.md`：移除"检查依赖"步骤
   - `src/prompts/track.md`：将提交模式选择合并到创建流程提问中
   - `codument/std/plan-xml-spec.md`：同步更新（运行时副本）
   - `codument/std/AGENTS.md`：更新目录结构说明，新增命令参考
   - `codument/std/workflow.md`：新增波次执行工作流描述

## 影响范围与修改点（Impact）

| 文件/模块 | 修改类型 | 说明 |
|-----------|---------|------|
| `src/prompts/plan-xml-spec.md` | 修改 | Schema 扩展 + 移除 dependencies |
| `codument/std/plan-xml-spec.md` | 修改 | 运行时副本同步 |
| `src/prompts/implement.md` | 修改 | 移除依赖检查步骤 |
| `src/prompts/track.md` | 修改 | 合并提交模式提问 |
| `src/cli/utils/index.ts` | 修改 | 解析器改造 |
| `codument/std/AGENTS.md` | 修改 | 目录结构 + 命令参考 |
| `codument/std/workflow.md` | 修改 | 新增波次执行工作流 |
| `src/prompts/discuss.md` | 新增 | discuss 命令提示词 |
| `src/prompts/plan-wave.md` | 新增 | plan-wave 命令提示词 |
| `src/prompts/execute-wave.md` | 新增 | execute-wave 命令提示词 |
| `src/prompts/verify.md` | 修改 | 扩展验证能力 |
| `src/prompts/index.ts` | 修改 | 注册新提示词加载 |

## 决策

- **决策：wave 标记在 task 级别，不在 subtask 级别**
  - 理由：现有 plan.xml 中 task 之间有明确的 DAG 模式（扇出、分支），subtask 无依赖机制且实际使用中为可选检查清单粒度
  - 替代方案：subtask 级别 wave → 需先引入 subtask 依赖机制，复杂度过高

- **决策：wave 依赖为 DAG（方案 B），非线性序列**
  - 理由：DAG 允许 WAVE-P1-03 只依赖 WAVE-P1-01 而跳过 WAVE-P1-02，更灵活
  - 替代方案：纯线性序列（编号即顺序）→ 简洁但无法表达跳跃依赖

- **决策：移除 `<dependencies>` 标签，不分模式**
  - 理由：wave DAG 已统一表达依赖，保留 dependencies 会造成两套依赖源矛盾
  - 替代方案：仅在 wave 模式移除 → 增加认知负担，两种模式规则不同

- **决策：subtask 嵌套无硬性层级限制**
  - 理由：灵活性优先，通过文档建议不超过 4 层即可
  - 替代方案：硬性限制 3-4 层 → 需要解析器强制校验，增加复杂度

- **决策：execution_mode 仅在 plan.xml 中**
  - 理由：减少 metadata.json 与 plan.xml 的重复配置
  - 替代方案：两处都放 → 同步成本，不一致风险

- **决策：commit_mode 从 metadata.json 移除，仅在 plan.xml**
  - 理由：同上，消除重复配置
  - 替代方案：保留两处 → 已被证明容易不一致

## 风险 / 权衡

- **正则解析器扩展风险** → 新增节点的正则需严格测试，避免与现有正则冲突。缓解：为每个新节点编写独立解析函数 + 单元测试
- **subtask 递归解析复杂度** → 正则不擅长递归匹配。缓解：使用递归函数逐层提取，而非单个正则
- **旧 track 兼容性** → 旧 plan.xml 含 `<dependencies>` 但解析器不再处理。缓解：解析器遇到未知标签静默跳过，不报错
- **并行执行的不确定性** → Task() 并行派发依赖宿主环境的子代理能力。缓解：先实现串行版 execute-wave，并行作为可选配置

## 兼容性设计

- `execution_mode` 缺失 → 默认 `sequential`，走原有逻辑
- `wave` 属性缺失 → sequential 模式下不需要，wave 模式下报验证错误
- `<waves>` 缺失 → sequential 模式下正常，wave 模式下报验证错误
- `<context_files>` 缺失 → 可选，不影响执行
- `<wave_config>` 缺失 → 使用默认值（parallel=false, max_concurrent=1, spot_check=false）
- `<detail_ref>` 缺失 → subtask 无外链，正常
- `<dependencies>` 存在于旧归档 → 解析器静默忽略
- metadata.json 中存在 `commit_mode` → 解析器忽略，从 plan.xml 读取
- 自闭合 `<subtask ... />` → 仍然合法

## 待解决问题

- 子代理并行调度的具体实现方式（依赖宿主 AI 工具的 Task() 能力）
- verify 命令的三级验证（exists → substantive → wired）的具体检查逻辑
- state.md 的具体格式和字段定义
- 波次间抽检的失败处理策略（重试 vs 停止）
