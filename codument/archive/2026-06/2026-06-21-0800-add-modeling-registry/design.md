## 上下文

### 问题（用 DEPA 事实源视角诊断）

codument 的 `behaviors` 能力晋升有效，但 `docs/modeling` 几乎不更新。根因不是“建模难写”，而是两套机制的结构差异：

| | behaviors（有效） | docs/modeling（失效） |
|---|---|---|
| 唯一写入者 | 有：archive 机械 apply `behavior_deltas` | 无：discuss 实时收敛 + archive 兜底 = **两个半写入者并存** |
| 可定位变更协议 | `behavior://…` selector + `op=upsert\|delete\|move` | 无：free-form Markdown，靠模型“发挥”找文件、手工 merge |
| track 内结构化 delta 物料 | 有：`behavior_deltas/<cap>/delta.xml` | 无：散落 proposal/design，归档时**无物可 apply** |

命中 DEPA 事实源规则①（唯一写入者）与“多个半事实源同时生效”的病。修复方向：给 modeling 配上 behaviors 同级的「单一写入者 + 可定位 mutation + track 内 delta 物料」，并把它从 `docs/` 提升为 codument 托管的 registry。

### 约束 / 利益相关者

- 不破坏现有 behaviors / archive / track 工作流；modeling 默认关闭（存量项目无感）。
- 不自建 delta 节点类型与 apply 算法 —— **复用** xnl 生态（`xnl-core` / `xnl-vfs` / `xnl-vcs`）。
- 建模要“接地气、可指导开发”，融合 DEPA 思想 + modeling 实证 + 多表征 DSL。
- 节点载体用 XNL（非 XML/Markdown）：`TextElement + marker` 让 desc / TypeScript / mermaid / 伪代码零转义内嵌。

---

## 方案概览

1. **registry 落点：`codument/modeling/`，docs/impl 保留**
   1. `docs/modeling` 升级为 `codument/modeling`（codument 托管、archive 单写的 registry）。
   2. `docs/impl` 留在 `docs/`（实现/维护知识，derived 投影层，archive 时模型按类目回写）。
   3. 事实源分层：`code/tests` = authoritative_fact（当前实现）；`codument/behaviors/` = 行为契约；`codument/modeling/` = 领域本体/attractor 载体；`docs/impl/` = 派生实现知识。

2. **registry 物理形态：xnl-vfs 工作树，宿主 git 版本化**（决策 9）
   1. 工作树：`codument/modeling/<plane>/<context>/*.xnl`，磁盘上**可读、可手改、宿主 git 可 diff** 的 XNL 文件（`xnl-vfs` `LocalFsVfsPersistence`）。
   2. 节点稳定 id：优先用 XNL 多级命名空间内联 id（`#<context>.<name>` 或跨 plane `#<plane>.<context>.<name>`）；需要时 `.node-meta/<name>.node.xnl` sidecar 兜底。
   3. **不持久化平行 vcs 仓库**：真 VCS = 宿主 git；xnl-vfs/xnl-vcs 仅作临时合并引擎，`.xnl-vcs/` 等产物入 `.tmp/` 并 gitignore（避免可变控制文件多人冲突、与宿主 git 重复记账）。

3. **delta = 目标态节点 + 临时节点级 3-way 合并（不自建，不持久化）**
   1. track 改动 = `tracks/<id>/modeling_deltas/<plane>/<context>.xnl` 写**改动节点的目标态**（可评审，像 behavior_deltas）= 合并的 theirs。
   2. **3-way base 锚定（决策 A，锚宿主 git）**：track create 时记录当时 `codument/modeling` 的**宿主 git commit id** 作 base。
   3. archive = base（宿主 git 物化）+ ours（工作树）+ theirs（modeling_deltas）→ xnl-vfs `xnlFileHandler.merge` 临时节点级 3-way → 写回工作树 → 宿主 git 提交；冲突 `RENAME_RENAME`/`DELETE_MODIFY`/`BINARY_UNMERGEABLE` 用 `{ metadataId, choice }` 解决或 issues-first 报告。
   4. move/rename = `vfs.rename`（宿主 git 跟踪）+ 单文件内节点移动 = `XnlMutation` `TREE_MOVE`。

4. **节点 schema：kind 谱系 × 多表征 × DEPA 事实源**（详见“节点 schema 规范”）。

5. **分形拆分检查（CLI）**：`codument modeling lint` 扫 `.xnl`（行数 / 节点数阈值）→ 建议把超大文件 `vfs.rename` 拆为同名子目录多文件（vcs 跟踪）。

6. **配置 + 清理**：`codument/config/modeling.xml`（仿 `attractor-profiles.xml`，默认关）；清理项目内 `knowledgeSync` 字符串残留（feature.json 已删，残留字符串一并清）。

7. **依赖项（另开 xnl.ts track）**：`xnl.ts` 侧补 **vfs-import 解析器**（`<Import as="X" src="vfs://...">` 跨文件命名空间符号解析）。其余 git 能力（commit/branch/merge/diff/rename、节点级 xnl diff/merge、本地 fs 持久化）xnl-vcs/xnl-vfs 已具备。

---

## 节点 schema 规范（modeling-registry / modeling-delta）

### 载体

- 文件：XNL（`xnl-core`）。`DataElement`（结构）+ `TextElement ?marker`（desc/types/mermaid/伪代码，零转义）。
- 输出用 `xnl-core` `lineBlockFormatter`（pretty 多行）。
- 节点 id：`XnlWord`，`#<context>.<name>` = `namespace + name`（类似 `命名空间::类名`），全局唯一；mutation 在 `metadataIdMode: "identity"` 下按 id 命中。

### kind 谱系（内核裸名跨领域 → shell 命名空间领域）

越靠建模内核越用 DEPA 跨领域概念（裸名 kind）；越靠 shell/展示/交互越落到领域命名空间 kind。

| 层 | kind 标签 | 最小必备表征 | DEPA / 来源 |
|---|---|---|---|
| 内核（裸名，跨领域） | `entity` / `object` | `types` + `fact_grade` + `single_writer` + invariants | Data / 事实源； `objects/data.md` |
| | `enum` | `types` | Data |
| | `state-machine` | `mermaid` + 状态枚举 | Data/Processor； `workflows/state-transitions` |
| | `module` / `capsule` | `depends_on` + `capsule-tree`（到文件/符号级） | Effect/边界 `Module` |
| | `component` | `runtime`/`input`/`config`/`output` 四个 `types` 块 + ctrl/rule/dataflow `pseudo` | DEPA 标准组件；`Procedure` |
| | `port` | 入口签名 + `command\|message` 标注 | Actor/Processor；泛化 HttpEndpoint/Kafka |
| | `actor` | 单写边界 + 偏重(data-owner/执行/组合) + 解环决策 | DEPA actor-paradigm |
| | `policy` | rule `pseudo`(datalog/switch) 或引用 `behavior://` | 跨对象；`policies` |
| shell（命名空间，领域定） | `surface:route` `backend:endpoint` `cli:command` `agent:tool` … | 各 plane 自定义 | route/command/action 本就跨领域 |

### 表征形式（多表征，最小必备强制）

- `<desc ?>` —— 语义 / businessDesc / 边界（`not-owned-here`）。
- `<types ?>` —— TypeScript 类型 / 枚举 / 签名（Data + component IO）。
- `<mermaid ?>` —— ER / state / module-relation / sequence。
- `<pseudo kind="ctrl|rule|dataflow" ?>` —— 控制流 / 规则(datalog·switch) / 数据流伪代码。
- 结构化 metadata —— `fact_grade`(7 级 id) / `single_writer` / `depends_on` / `visibility` / `kind` / `derived_from`。

**最小必备**（强制，CLI 校验）：`entity` 必带 types+fact_grade+single_writer；`state-machine` 必带 mermaid；`module` 必带 depends_on+capsule-tree（到文件级）；`component` 必带 runtime/input/config/output 四块。

### modeling vs behaviors（不重复）

- 可测 BDD 契约（requirement/suite/case，given/when/then）→ `codument/behaviors/`。
- 结构/类型/状态机/依赖/事实源/分发策略 → `codument/modeling/`。
- modeling 的 behavior/policy 节点**引用 `behavior://…`**，不复述 case。

### 样例

registry `codument/modeling/domain/resource/index.xnl`：

```xnl
<object #resource.skill_tool kind="entity" fact_grade="authoritative_fact" single_writer="resource.store" [
  <desc ?>聚合型资源：统一资源模型中的 tool，且是可编辑/打包/恢复的文本文件集合。</?>
  <types ?ts1>
  interface SkillTool { key: string; appId: string; status: SkillToolStatus; isPublic: boolean }
  enum SkillToolStatus { Draft="draft", Online="online" }
  </?ts1>
  <state-machine #resource.skill_tool_status [ <mermaid ?mm1>
  stateDiagram-v2
    draft --> online: publish
    online --> draft: unpublish
  </?mm1> ]>
  <fact-source ?>唯一写入者 resource.store（应用层显式写）；file_contents 为只读投影，不反写。</?>
  <not-owned-here ?>vfs_tree/vfs_content 语义真源在 vcs context，本节点只引用。</?>
]>
```

track delta `tracks/<id>/modeling_deltas/domain/resource.xnl`（目标态变化节点）：

```xnl
<object #resource.skill_tool kind="entity" fact_grade="authoritative_fact" single_writer="resource.store" [
  ... 目标态（含新增字段）...
]>
```

archive 机械合并（复用 xnl-vcs，节点级 3-way）：

```ts
// track 分支 theirs，main 当前 ours，base=track create 时记录的 commit
const merged = repo.merge(trackBranch);   // RENAME_RENAME / DELETE_MODIFY 用 {metadataId, choice} 解决
```

---

## archive merge 流程

1. （前置）track create 时已记录 base commit id 到 track 元信息。
2. 读 `codument/modeling`（xnl-vfs + xnl-vcs），定位 track 分支与 main。
3. `repo.merge(trackBranch)`：节点级 3-way（`xnlFileHandler.merge`）合并进 main；冲突按类型用 `{ metadataId, choice }` 解决，无法自动解的报告并停。
4. 跑分形拆分检查（`modeling lint`），按需 `vfs.rename` 拆分。
5. 模型把 track 设计方案按类目回写 `docs/impl/`（overview/howto/rules/reference/troubleshooting）。
6. 仅当 `config/modeling.xml` 对应 profile `enabled` 时执行 2–5；默认关则跳过并说明。

---

## 影响范围与修改点（Impact）

- 新增依赖：`xnl-core` / `xnl-vfs` / `xnl-vcs`（npm）。
- 新增 std 规范：`std/spec/modeling-registry.md`、`std/spec/modeling-delta.md`（仿 `behavior-registry.md` / `behavior-delta.md`）。
- 新增 attractor/模板：modeling 节点 schema 指南（kind 谱系 + 最小表征 + 样例 good/bad）。
- 新增 CLI：`codument modeling lint`（分形拆分检查）；archive 增 modeling merge 步骤。
- 新增配置：`codument/config/modeling.xml`（默认关）。
- 修改操作提示词：`std/operations/track.md`（生成 modeling_delta）、`std/operations/archive.md`（merge + docs/impl 回写）、`std/operations/implement.md`（实现期可改 modeling）。
- 清理：项目内 `knowledgeSync` 字符串残留。
- 受影响功能规范（behaviors capability `codument-core`）：modeling-registry / modeling-node-schema / modeling-delta-git / modeling-fractal-split / modeling-config / modeling-docs-impl-writeback。
- **外部依赖**：xnl.ts 侧 `add-vfs-import-resolver` track（多文件 `<Import>` 命名空间解析）。

---

## 决策摘要

- 详见 `decisions.md`。
- 关键已定：registry=xnl-vfs+vcs；delta=git（branch/commit + merge）；3-way base 锚定在 track create（决策 A）；component IO=四个 ts 块；id=XNL namespace；最小表征强制；modeling 引用 behavior://；config 默认关。

---

## 风险 / 权衡

- **xnl 生态成熟度**：xnl-vfs/xnl-vcs 为 0.1.0。→ 先在 codument 集成层做薄封装 + 充分测试；缺能力在 xnl.ts 侧补 track，不在 codument 内 fork。
- **vfs-import 解析器是前置依赖**：→ 多文件逻辑引用先以“单 context 单文件 + 目录 glob 回退”起步，import 解析器就绪后再启用跨文件命名空间引用。
- **建模过重**：→ 最小必备表征 + 默认关；只有显式启用 modeling profile 的项目才产出。
- **merge 冲突需人工**：→ archive 时把无法自动解的冲突 issues-first 报告，交用户决断，不静默覆盖。

## 兼容性设计

- 默认关：存量项目无 `config/modeling.xml` 或 profile 未 enabled → 全流程跳过 modeling，行为不变。
- 旧 `docs/modeling`：提供迁移指引（吸收式迁移到 `codument/modeling`，保留 migration-map），不强制。

## 迁移计划

1. 先落 registry 规范 + xnl 集成 + CLI lint（不动 archive）。
2. 再接 track create 产出 modeling_delta + archive merge（profile 开关后）。
3. xnl.ts vfs-import 就绪后启用跨文件命名空间引用。
4. 回退：profile 关即停用，registry 文件可保留为普通 XNL 文档。

## 已解决问题（本轮 review）

- **`.xnl-vcs/` 持久化**（决策 9）：不持久化平行仓库；真 VCS = 宿主 git；xnl-vfs/xnl-vcs 仅作临时合并引擎，`.xnl-vcs/` 产物入 `.tmp/` 并 gitignore。base 锚 = 宿主 git commit id。理由：新 clone 只需工作树即可；不提交可变控制文件 → 无多人协作平行仓库冲突；只取节点级 merge 算法不要持久化。
- **node id 多级命名空间**（决策 10）：允许 `#<context>.<name>` 与跨 plane `#<plane>.<context>.<name>`。
- **分形拆分阈值**（决策 10）：lint 默认 > ~400 行 或 > ~8 个顶层建模节点 标记候选，可在 `config/modeling.xml` 配；lint 只建议。

- **跨文档引用**（决策 11）：VFS URI（`modeling://`/`behavior://`）+ scheme 自识别解析（扫值匹配 scheme 即解析，无固定 key 白名单）；`<Import as>` 可选语法糖。
- **merge 冲突默认策略**（决策 12）：保守——无歧义自动、真冲突 issues-first 暂停；按类型在 `config/modeling.xml` `<merge-policy>` 可配（human|ours|theirs|base）。

## 待解决问题

- （无阻塞项；实现期细节随 P2/P4 落地。）
