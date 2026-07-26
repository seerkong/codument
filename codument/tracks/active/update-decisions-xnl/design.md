# 方案设计：decisions.xnl DSL

## 上下文

当前 `decisions.md` 是过程决策的 legacy 入口，字段通过 Markdown heading/list 解析。新的 `decisions.xnl` 应利用 XNL 的两个关键特性：

- 文件根可以有多个并列元素，类似 jsonl 的多记录文件。
- 决策树应当用 XNL 嵌套关系表达，而不是额外包装节点或扁平 metadata。

本设计是实现与后续模板生成的 DSL 契约。

## 方案概览

1. `decisions.xnl` 是 track/mission 根级过程决策主入口。
2. DSL 只使用 `<decision>` 表达决策记录。
3. 文件根允许多个并列 `<decision>`；顶层多个 `<decision>` 即 decision forest。
4. 某个 `<decision>` 带 `[]` 子 `<decision>` 时，即一棵 decision tree。
5. 不引入 `<decision-tree>` / `<decision-set>` 包装类型；根、分组、父子关系由 `<decision>` 自身和 XNL 嵌套表达。
6. 普通节点属性必须放在 `{}` attribute block 中；metadata 只保留给 XNL/工具链系统级字段。
7. 单例语义子节点使用 `()` extend block：`question` / `recommendation` / `answer` 等只出现一次的槽位不放进 `[]`；`decision-text` / `rationale` / `evidence` 等回答反馈槽位只出现在 `<answer>` 内。
8. 决策的 `[]` array block **只承载下级 `<decision>`**：父子关系通过其中嵌套的 `<decision>` 表达，不写冗余 `parent`。
9. 备选方案不直接放入决策的 `[]`；决策的 `()` 中只出现一个 `<options>`，由 `<options>` 自己的 `[]` 承载多个 `<option>`。当前解析器要求该数组包装节点写成 `<options { } [...]>`，空属性块只是语法占位。
10. 每个 `<option>` 必须有结构化标题和详细说明；提出带选项的新决策点时，恰好一个 option 标记 `recommended = true`。
11. 回答反馈使用唯一的 `<answer>` 容器：原始回答写 `<raw-answer>`，整理后的结论、理由和证据写入同一 `<answer>` 下的 `<decision-text>`、`<rationale>`、`<evidence>`。

## DSL 草案

### 顶层并列决策

```xnl
<decision #track.foo.choose_carrier {
  priority = "P0"
  status = "pending"
  blocks = ["implementation" "tests"]
}
(
  <question ?>过程决策主入口是否改为 decisions.xnl？</?>
  <recommendation ?>采用 decisions.xnl，legacy decisions.md 只读兼容。</?>
  <options { } [
    <option { key = "A" recommended = true }
    (
      <title ?>采用 decisions.xnl</?>
      <description ?>新建 track/mission 使用 XNL 记录过程决策；保留多根节点和嵌套决策树。</?>
      <tradeoff ?>结构化和可集成性更好，但需要迁移模板和读取逻辑。</?>
    )
    >
    <option { key = "B" recommended = false }
    (
      <title ?>继续使用 decisions.md</?>
      <description ?>继续用 Markdown 标题和列表承载问题、选项和答复。</?>
      <tradeoff ?>人工编辑简单，但字段解析和决策树集成不稳定。</?>
    )
    >
  ]>
  <answer { }
  (
    <raw-answer ?>待用户选择。</?>
    <decision-text ?>待确认。</?>
    <rationale ?>需要先确认过程决策的结构化载体。</?>
    <evidence ?>用户明确提出“将 decisions 改成使用 decisions.xnl”。</?>
  )
  >
)
>

<decision #track.foo.compat {
  priority = "P1"
  status = "accepted"
  blocks = ["archive" "migration"]
}
(
  <question ?>是否保留 decisions.md fallback？</?>
  <answer { }
  (
    <raw-answer ?>保留读取兼容。</?>
    <decision-text ?>新建路径使用 decisions.xnl，历史路径 fallback 到 decisions.md。</?>
    <rationale ?>避免破坏历史 track 和 archive。</?>
    <evidence ?>archive 中已有 decisions.md。</?>
  )
  >
)
>
```

### 决策树嵌套

```xnl
<decision #track.foo.root {
  priority = "P0"
  status = "accepted"
  blocks = ["proposal.md" "design.md" "track.xml"]
}
(
  <question ?>本次 DSL 是否以单一 `<decision>` 节点模型表达？</?>
  <options { } [
    <option { key = "A" recommended = true }
    (
      <title ?>只使用 `<decision>`</?>
      <description ?>顶层多个 decision 构成 forest，子 decision 直接嵌套在父 decision 的树节点集合中。</?>
      <tradeoff ?>节点语义单一，读取器不需要处理 decision-tree 包装类型。</?>
    )
    >
    <option { key = "B" recommended = false }
    (
      <title ?>保留 `<decision-tree>` 包装节点</?>
      <description ?>用包装节点区分根树，再在其中放 decision。</?>
      <tradeoff ?>表面分组清晰，但会引入第二套节点语义和额外读取分支。</?>
    )
    >
  ]>
  <answer { }
  (
    <raw-answer ?>是。</?>
    <decision-text ?>只使用 `<decision>` 节点表达 forest 和 tree。</?>
    <rationale ?>避免引入第二套包装节点语义。</?>
    <evidence ?>XNL 已支持根级并列节点和嵌套 body。</?>
  )
  >
)
[
  <decision #track.foo.child_a {
    priority = "P0"
    status = "pending"
    blocks = ["implementation"]
  }
  (
    <question ?>durable 单文件决策是否也迁移为 XNL？</?>
    <recommendation ?>实现阶段先支持 root decisions.xnl；durable decisions/*.xnl 作为 P1 扩展。</?>
    <answer { }
    (
      <raw-answer ?>待 review。</?>
      <decision-text ?>待确认。</?>
      <rationale ?>需要先评估 durable 决策迁移范围。</?>
      <evidence ?>当前 track 只覆盖 root decisions.xnl。</?>
    )
    >
  )
  >
]>
```

### 节点属性

| 属性 | 类型 | 说明 |
|---|---|---|
| `status` | string | 必备；`pending` / `accepted` / `resolved` / `deferred` / `rejected` |
| `priority` | string | 可选但推荐；`P0` / `P1` / `P2`，用于排序与选择当前要问的问题 |
| `blocks` | string[] | 可选；只在确实阻塞或曾阻塞产物 / 任务时写，如 `["track.xml" "tests"]` |
| `durable_candidate` | boolean | 可选；只在 `true` 时写，表示候选提升为长期 `decision://` |
| `confidence` | number | 可选；主要用于 `durable_candidate = true` 或高风险取舍 |
| `reversibility` | string | 可选；主要用于 `durable_candidate = true` 或高风险取舍，取 `easy` / `moderate` / `hard` |

省略的冗余 / 默认属性：

- `kind`：元素标签已经是 `<decision>`；普通过程决策无需再写 `planning-decision`。
- `parent`：父子关系由 `[]` 嵌套表达。
- `frontier=false`、`durable_candidate=false`：默认不写；当前 frontier 可由 `status="pending"` + `blocks` 识别，或在人类说明中表达。
- `root`、`severity`：不再有 `<decision-tree>` 包装节点；severity 属于提问流程配置，已有 track/mission metadata 承载。

### 子节点

| 子节点 | 说明 |
|---|---|
| `<question>` | 需要回答的问题 |
| `<recommendation>` | 当前建议与默认取舍 |
| `<answer>` | 唯一回答反馈容器；相关回答内容全部放在其下 |
| `<raw-answer>` | 用户或外部参与者的原始回答内容 |
| `<decision-text>` | 整理后的正式决策正文，位于 `<answer>` 下 |
| `<rationale>` | 选择或归纳该决策的理由，位于 `<answer>` 下 |
| `<evidence>` | 支撑该回答或决策的证据，位于 `<answer>` 下 |
| `<options>` | 决策的唯一备选方案集合；放在 decision 的 `()` 中，不放在 decision 的 `[]` 中 |
| `<option>` | `<options>` 的成员；放在 `<options>` 自己的 `[]` 中 |
| `<title>` | option 的标题；每个 option 必须有一个 |
| `<description>` | option 的详细说明；每个 option 必须有一个 |
| `<tradeoff>` | option 的代价、风险或取舍；建议提供 |
| nested `<decision>` | 子决策；用于 decision tree |

结构约定：

- `()`：单例语义槽位，适合一个 decision 的说明、答案、理由和证据。
- `<answer>`：decision 的唯一回答反馈容器；其 `()` 只放 `<raw-answer>`、`<decision-text>`、`<rationale>`、`<evidence>` 等单例反馈槽位。
- `<raw-answer>`：明确表示原始回答，不再用含义过宽的直接 `<answer ?>...?></?>`。
- decision 的 `[]`：只用于下级 decision tree 节点；不能直接放 `<option>` 或 `<options>`。
- `<options>` 的 `[]`：只用于多个 `<option>` 的有序集合。
- `<option>` 的 `()`：放该选项的唯一字段 `<title>`、`<description>`、`<tradeoff>` 等。
- 带选项的新决策点：必须在 `<options>` 中恰好标记一个 `recommended = true`；未推荐的选项省略 `recommended` 或写 `false`。
- 顶层文件根：允许多个并列根 `<decision>`，形成 decision forest。

## 读取与兼容策略

- 新建 track/mission：
  - 默认写 `decisions.xnl`。
  - 若需要 decision tree，默认写入嵌套 `<decision>`；可选分析态写 `analysis/decision-tree.xnl`，但同样只使用 `<decision>`。
- 读取 track-id：
  - 优先 `codument/tracks/<id>/decisions.xnl`。
  - 若不存在，fallback `codument/tracks/<id>/decisions.md`。
- 显式 file path：
  - `.xnl` 使用 XNL parser。
  - `.md` 使用 legacy Markdown parser。
- Archive：
  - root `decisions.xnl` 支持 durable promotion。
  - 历史 `decisions.md` 与 `decisions/*.md` 保持兼容。

## 影响范围与修改点

- CLI:
  - `src/cli/commands/decisions.ts`：XNL parser、track-id resolution preference、XNL findings。
  - `src/cli/commands/archive.ts`：读取 `decisions.xnl` durable candidates。
  - `src/cli/commands/show.ts`：展示文件列表加入 `decisions.xnl`，保留 `decisions.md` legacy。
- Std/templates:
  - `codument/std/sop/questioning.md`
  - `codument/std/spec/xnl-format.md`
  - `src/templates/skills/codument-decision-tree/SKILL.md`
- Tests:
  - XNL decision validation tests.
  - Legacy Markdown fallback tests.
  - Archive durable promotion from XNL tests.
  - Template/authoring tests禁止 `<decision-tree>` 包装节点示例回归。

## 决策摘要

- 详见 `decisions.xnl`。
- 当前关键结论：采用单一 `<decision>` 节点模型；顶层多个 `<decision>` 是 forest；嵌套 `<decision>` 是 tree；单例语义子节点用 `()`；下级 decision 节点用 `[]`。

## 风险 / 权衡

- 风险：一次性迁移所有 durable decision 文件会扩大范围。
  - 缓解：先把 root process decisions 改为 `decisions.xnl`，durable promotion 支持 XNL，但历史 `.md` 不迁移。
- 风险：XNL DSL 退化成 XML 风格的“所有子节点都进 `[]`”。
  - 缓解：规范明确 decision 的 `[]` 只承载子 decision；备选方案经唯一 `<options>` 进入其自身的 `[]`，并在测试中加入结构断言。
- 风险：只记录推荐结论，看不到提出决策时的其他候选方案。
  - 缓解：每个待决策点保存完整 `<options>` 集合；每个 option 保存 title/description/tradeoff，并标记唯一推荐项。
- 风险：旧 skill 文档仍引用 `decisions.md` 或 `<decision-tree>`。
  - 缓解：用 rg 覆盖 `decisions.md` / `decision-tree.md` / `<decision-tree>` 引用，并更新模板 manifest。

## 兼容性设计

- legacy `decisions.md` 继续可被 `codument decisions validate` 和 archive 读取。
- 显式路径不做格式猜测之外的迁移；`.md` 走 markdown parser，`.xnl` 走 XNL parser。
- 若同一 track 同时有 `decisions.xnl` 和 `decisions.md`，默认以 `decisions.xnl` 为 canonical，`decisions.md` 不参与阻塞校验，除非用户显式传入该文件路径。
