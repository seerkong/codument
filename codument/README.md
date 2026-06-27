# Codument DSL v2 — draft-d/codument（基于三层标准 + TaskSpace 的重构）

本目录是 codument 的**结构性重构**，不是在旧 `plan.xml` 上小改。它把 codument 建成 **dynamic-workflow 三层标准的一个领域（domain）**：复用 Layer 1（内核语言）+ Layer 2（Hook/Step）+ Layer 3（业务概念 / TaskSpace 任务树），再叠加 codument 自己的 Layer-3 业务语义。

> 三层标准与 TaskSpace 定义见 `../dynamic-workflow/spec/`（codument **复用**它，不重定义）。本目录只定义 codument 领域特有的东西。

## 核心交付：重构后的 track 文件（取代 plan.xml）

旧 `plan.xml` 是固定三层（Phase→Task→Subtask）+ 一堆并列块（milestones/waves/confirm/attractor-check/validations/risks/summary）。新文件 `tracks/<id>/track.xml`（根 `<Track>`）把这些**解构重组**为三条正交轴：

| 轴 | 旧 plan.xml | 新 track.xml |
|---|---|---|
| **结构（做什么 + 状态）** | `<phases><phase><tasks><task><subtasks>` 固定 3 层 + 手维护 summary | **`<TaskSpace>`**（sparrow Task DSL）：phase = 第一层 `TaskGroup`，下可 `Task`/`TaskGroup` **任意层级嵌套**；status 标在 XML；`<Description>` 元素 |
| **调度（怎么跑）** | `<waves>`+`wave=` 散落在 phase/task；`execution_mode`/`wave_config` 在别处 | **逐层** `cdt:child-mode="dag"` + **`<Schedule>`** 兄弟节点的 `<Dag for><Node id><After ref>`；wave 由依赖派生 |
| **行为（校验/纠偏/确认）** | `<confirm>`/`<attractor-check>`/`<result-policy>` 内联，`validation_mode` 在 metadata | **`<Hooks>`**（Layer 2）：track/phase/task 生命周期挂 `<cdt:AttractorCheck>`/`<cdt:GapLoop>`/`<cdt:HumanConfirm>`（配置内联节点上） |

再加来自内核的能力：
- **`<Ports>` + `<MaterialBundle>`**（Layer 1）：track 作用域的目录物料——`behavior_deltas`（输入）、`docs` + `codument/behaviors/`（输出）——把 artifact/behavior 提升接进 track 模型。**不设 JSON input/output 端口**。
- **`<Imports>`（vfs://）可选**：一般 track 不需要（check 自包含、profile 按约定解析）。

旧的 `summary` 不再手维护（由工具从 TaskSpace 派生）；`milestones`/`risks`/`validations` 降级为 `cdt:` 命名空间的可选节点或移入 proposal。

完整规范见 `std/spec/track-xml-spec.md`；demo 见 `tracks/demo-track/track.xml`。

## 子任务

### 1. config/ 重设计
- `config/attractor-profiles.xml`：命名 attractor 组合（**XML，vfs 标准**）。每个 `<Profile enabled="true|false">`（默认 true）；**profile 开关取代 feature.json 的能力开关**（如 docs profile 启用 = 开启 docs 知识同步）。
- **`config/feature.json` 删除**——能力开关并入 profile 的 `enabled`。
- `config/operation-hooks.xml`：命令生命周期 hook（统一 `<Hook on>` 语法，与 track.xml 同构）。
- **`cdt:` check 自包含、无 `agents/` 注册表**：`<cdt:AttractorCheck use="<profile>"/>`（`use` 指 `attractor-profiles.xml` 的 profile；审查用 fresh-subagent，由 std 约定）、`<cdt:GapLoop max-rounds on-exhausted/>`、`<cdt:HumanConfirm/>`——配置全在节点属性上。

### 2. workflows/（dynamic-workflow 存放）+ std/sop/（内置规程）+ sop/（项目自定义）
- **`workflows/`** = **dynamic-workflow（Process Surface）存放目录**：`definitions/` + `instances/`（`BTWorkflow` 引擎级流程），布局同 `../dynamic-workflow/`。
- **`std/sop/`** = **codument 内置标准规程**（init 落盘、升级刷新）：`workflow.md` + 拆分的协议（`questioning.md`/`validation.md`）+ 方法论（`tdd`/`wave-exec`/`gap-loop`/`archive`/`artifact-sync`）。skills 经 `<protocols><ref>codument/std/sop/...` 引用。
- **`sop/`**（顶层）= **项目自定义规程**（团队特有套路），不被升级覆盖。
- 区分：sop = 给 AI 读的执行规程（std/sop 内置 + sop 自定义）；workflows = 给引擎跑的流程定义。

### 3. 操作提示词（`std/operations/`）：Markdown 为主 + 流程标记块（文本化控制流语言）（已完成）
每个操作（operation）的提示词 = **Markdown**（说明/规则/示例）+ 程序化执行流程用 **`--` 流程标记块**（串行/并行/条件/循环/spawn/返回/退出；构造全用完整单词）。放 `std/operations/`，init 后**所有提示词在 codument 内自包含**（不依赖 npm 包 src/prompts）。
- **目录命名**：本目录叫 `operations/`（不叫 `skills/`）——因为未来更新 `src/` 时会另有一个符合 coding-agent skill 标准的 `skills/` 壳目录（安装时复制进 agent），那些壳只通过提示词引用 `@/codument/std/operations/<op>.md`。
- DSL 规范：`std/operations/_operation-spec.md`；索引：`std/operations/README.md`；范例：`std/operations/gap-loop.md`
- **14 个操作已全部 full-faithful-port**（从 `src/prompts/*` 完整还原）；旧 `plan-wave`→`plan-schedule`、`execute-wave`→并入 `implement`、`migrate-*`→并入 `migrate`。

### 4. std/ 重组（本轮）
- 不再有单体 `std/workflow.md`/`std/protocols.md`：workflow 移入 `std/sop/workflow.md`，protocols 按域拆为 `std/sop/questioning.md` + `std/sop/validation.md`。
- 新建 `std/spec/`：`track-xml-spec.md` 移入；从 AGENTS 拆出 `behavior-delta.md`（如何写 behavior delta）与 `behavior-registry.md`（登记表格式）。
- `std/AGENTS.md` 只做入口/路由，"怎么操作"指向 `std/sop/`、"格式"指向 `std/spec/`。
- **spec→behavior 口径**：`codument/specs`→`codument/behaviors`、`spec_deltas`→`behavior_deltas`、`spec://`→`behavior://`、`<spec-patch>`→`<behavior-patch>`，文件内同步。

### 5. 吸收 attractor-guided-engineering 的文档沉淀纪律（本轮）
codument 强在 **track 迭代记忆**，弱在 **owner 文档（docs/modeling·impl）维护**。本轮吸收参考项目（`/Users/kongweixian/ai/src/attractor-guided-engineering-template`）的三处长处：
- **信息晋升（promotion）**：新建 `attractors/knowledge-tiers.md`——知识分层表 + **AGE 扁平类目→codument 层级映射** + 晋升阶梯（track→behaviors/docs/decisions/memory，memory 复发→sop/skill/check）+ 真源优先级 + 时效性。
- **目录自描述 + 补齐**：新建 `std/spec/folder-manifest.md`——每个标准文件夹在自己 `index.md` 里就地声明「目录职责」块（解除对单份中心规范的强依赖），自定义类目必填；缺块由 backfill 机制补齐。两份分形 index 与 docs-bootstrap/artifact-sync 接入。
- **实时维护，不只归档**：discuss/澄清期一旦概念稳定就**当轮**收敛进 owner 文档；`questioning.md`/`discuss.md`/`workflow.md`/`artifact-sync.md`/`archive-track.md` 同步加入「澄清即沉淀 + 晋升判定权威=knowledge-tiers」。
- 路由全部接进 `std/AGENTS.md`；修复 reorg 遗留的 `attractors/docs-*-fractal`→`std/`、`docs-knowledge`→`model-driven-docs`、`specs/`→`behaviors/` 等陈旧引用（config/init 内）。

### 6. 补 backlog tier + 回填 src/ 漏掉的提示词功能（本轮，目标：codument 文件夹自包含）
对照真实 `src/prompts/*` 逐项核查"哪些文本提示词功能还没映射进 draft-d"，补齐缺口：
- **backlog tier**：新建 `backlog/README.md`（AGE `docs/backlog/` 的对应）——候选工作 + AI 自主度 + ready 不变量 + 选择规则；接进 knowledge-tiers/AGENTS/init。
- **root AGENTS 受管块**：新建 `std/root-agents.md`（src `root_agents.md` 的对应）——init 据此写/刷新项目根 `AGENTS.md` 的 `<!-- codument:begin/end -->` 指针块。
- **memory tier**：新建 `attractors/project-memory.md`（src `templates/project-memory.md` 的对应）+ `memory/README.md` + config 加 `memory` profile（取代旧 `projectMemory` 开关）。
- **track 目录布局**：track-xml-spec 加 §0.5，文档化 `tracks/<id>/` 全布局（含 `analysis/`(findings/knowledge planning-with-files)、`decisions.md`+`decisions/`、`memory/`、`reports/`）；track skill 接入。
- **中断恢复**：implement skill 加 step 0 续跑检测——以 track.xml 的 `status=ACTIVE` 为恢复点（取代旧 `state.json`），让用户选 继续/重做/跳过。
- **确认不是 gap**：`artifacts.xml`（→ track.xml MaterialBundle）、wave `context.md`/`state.md`/`phases/`/`waves/`（→ TaskSpace status-in-XML）、`tech-stack.md`、`knowledge-hint`（弱链，低价值）均为**有意丢弃**，未回填。

## 目录

```
draft-d/codument/
├── README.md                       本文
├── std/                            内置标准（init 落盘、升级刷新；self-contained）
│   ├── AGENTS.md                   入口/路由：指向 tiers/sop（怎么做）、spec（格式）、operations（操作 body）
│   ├── root-agents.md              项目根 AGENTS.md 受管块模板（init 写/刷新）
│   ├── kernel-pointer.md           codument 如何复用 ../dynamic-workflow 的三层内核
│   ├── spec/                       格式规范
│   │   ├── track-xml-spec.md       ★ 核心：重构后的 track 文件规范（含 §0.5 track 目录布局）
│   │   ├── behavior-delta.md       如何写 behavior delta（旧 spec delta）
│   │   ├── behavior-registry.md    behavior 登记表（codument/behaviors/）格式
│   │   └── folder-manifest.md      ★ 目录职责自描述 + 补齐机制（每个标准文件夹就地声明装什么）
│   ├── docs-modeling-fractal/index.md  建模侧分形规范（领域中立、生成式）
│   ├── docs-impl-fractal/index.md      实现侧分形规范（docs/impl/，类目可替换）
│   ├── sop/                        内置执行规程（原 workflow.md + 拆分的 protocols + 方法论）
│   │   ├── workflow.md · questioning.md · validation.md
│   │   └── tdd.md · wave-exec.md · gap-loop.md
│   └── operations/                 14 个操作 body（每个 = `codument-<x>` 的完整提示词）+ _operation-spec.md + README 索引
├── attractors/                     吸引子载体（init 落盘 project/product/tiers；按 profile 加 docs/memory）
│   ├── project.md · product.md     项目/产品级吸引子
│   ├── knowledge-tiers.md          ★ 知识分层 + 信息晋升阶梯 + 真源优先级（吸收 AGE 纪律）
│   ├── model-driven-docs.md        docs 知识入口（路由到两份分形 + frontmatter）
│   └── project-memory.md           memory tier 吸引子（lessons/incidents/patterns/summaries）
├── config/
│   └── attractor-profiles.xml · operation-hooks.xml   （coding/docs/memory profile；feature.json 已删，开关并入 enabled）
├── workflows/{definitions,instances}/  dynamic-workflow（Process Surface）存放目录
├── sop/README.md                   项目自定义执行流程（区别于内置 std/sop/）
├── backlog/README.md               候选工作 + AI 自主度（AGE docs/backlog 的对应；活的清单）
├── memory/README.md                长期记忆（lessons/incidents/patterns/summaries；memory profile）
├── behaviors/（运行期生成）          behavior 登记表（旧 codument/specs/）
└── tracks/demo-track/
    ├── track.xml                   ★ 核心 demo：重构后的 track 文件
    ├── proposal.md · design.md
    └── behavior_deltas/csv-export/delta.xml   （旧 spec_deltas）
```

## 关键决策（待你拍板）

1. **新文件名 `track.xml`、根 `<Track>`**（取代 `plan.xml`/`<plan>`）——明确"重构"而非小改。根**只声明 `xmlns:cdt`**，不引入 `xmlns:config`（不引用 bt-instant-ctrl-flow 配置）。
2. **phase = TaskSpace 第一层 `TaskGroup`**（不引入独立 `<Phase>` 标签，保持与 sparrow TaskSpace 同构）；codument phase 元信息（gate）走 `cdt:` 命名空间子节点。
3. **调度按层级**：`<TaskSpace>`/`<TaskGroup>` 上 `cdt:child-mode="sequential|dag"`（默认 sequential、零配置）；仅 dag 层在 `<Schedule><Dag for="P"><Node id after></Dag>` 声明**该层直接下层**依赖（单层、可多父、`after` 就近表达）。取代旧 `<Needs>`/`<waves>`/`wave=`。
4. **summary 不再手维护**（工具从 TaskSpace 派生）；milestones/risks/validations 降级为可选 `cdt:` 节点。
5. **track 作用域不设 JSON input/output 端口**；输入输出 = 目录物料：`behavior_deltas`（输入）、`docs` + `codument/behaviors/` 行为登记表（输出）。
6. **config 全 XML + vfs**：`attractor-profiles.xml`，每 `<Profile enabled>`（默认 true）；**profile 开关取代并删除 `feature.json`**。
7. **三个流程目录**：`workflows/`（dynamic-workflow 引擎级）、`std/sop/`（内置规程）、`sop/`（项目自定义）。
8. **std/ 重组**：无单体 workflow.md/protocols.md（→ `std/sop/`）；`std/spec/` 收 track-xml-spec + behavior-delta/registry；`std/AGENTS.md` 只路由。
9. **spec→behavior 口径**：registry `codument/behaviors/`、deltas `behavior_deltas/`、`behavior://`、`<behavior-patch>`。
10. **skills 自包含进 `std/operations/`**（14 个已 full-faithful-port），Markdown 为主 + `--` 流程标记块；npm 包 `src/prompts` 在 init/upgrade 落盘到此。
