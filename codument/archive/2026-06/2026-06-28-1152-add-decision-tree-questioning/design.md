# Design

## 上下文
Codument 已经具备 track/mission、decisions.md、durable decision promotion、modeling/engineering registry 等持久化结构。新的设计应复用这些结构，而不是新增 CONTEXT.md 或 ADR 目录。

## 方案概览

### 1. Questioning Severity
新增四档：

| severity | 含义 | 行为 |
|---|---|---|
| `auto` | 无问答 / 高自主 | 不向用户提问；名称、范围、默认 hook、提交模式均自行推断；假设写入文件。 |
| `light` | 默认 | 只问 P0 用户意图问题，最多 3 轮，每轮最多 2 题；能查代码/文档就不问。 |
| `normal` | 深一点 | P0/P1，最多 8 轮，每轮最多 3 题。 |
| `deep` | 深度 grilling | 架构/mission 可用，最多 16 轮，每轮最多 3 题，必须持续写文件。 |

### 2. Decision Tree Pass
规划时可创建：

```text
analysis/decision-tree.md
```

用于记录 root question、decision frontier、blocked artifacts、evidence、confidence、reversibility。

### 3. Plan Track / Plan Mission
- 开始时解析 severity；未指定默认 light。
- auto 模式跳过所有用户确认：track-id / mission-id、behavior、proposal、design、track.xml / mission.xml、提交模式、校验模式。
- auto 默认：`CommitMode=manual`、不挂 `cdt:HumanConfirm`、每个 phase 挂 `cdt:AttractorCheck use="coding"`；GapLoop 仅在用户或上下文明确要求时挂。
- light 模式保留 P0 问题，但必须先查代码/文档，减少用户负担。
- `QuestionMode` / `QuestionSeverity` 写入 `track.xml` / `mission.xml` 的 `<Metadata>`，与 `CommitMode` 并列：

```xml
<QuestionMode>decision-tree</QuestionMode>
<QuestionSeverity>light</QuestionSeverity>
<CommitMode>manual</CommitMode>
```

其中 `QuestionMode` / `QuestionSeverity` 控制规划期问答，`CommitMode` 控制实现期提交，两个轴不能互相推断。

### 4. Decision Metadata
扩展 decisions.md 推荐字段：
- Parent
- Blocks
- Evidence
- Confidence
- Reversibility
- Durable candidate

### 5. CLI Decisions Validate
新增：

```bash
codument decisions validate [file|track-id]
```

校验：
- `状态：pending` 产生 error。
- `Blocks:` 非空且状态未 accepted/resolved/deferred 产生 warning/error。
- `Durable candidate: yes` 但缺 Evidence / Reversibility / Confidence 产生 warning。

## 影响范围与修改点
- `codument/std/sop/questioning.md`
- `codument/std/operations/plan-track.md`
- `codument/std/operations/plan-mission.md`
- `src/templates/codument/...` 对应模板
- `src/templates/skills/`
- `src/cli/commands/decisions.ts`
- `src/cli/index.ts`
- `test/cli/commands/decisions.test.ts`
- `test/templates/skills.test.ts`

## 决策摘要
- 采用 `severity=auto` 表达无问答高自主模式。
- 未指定 severity 默认 `light`。
- 在 XML Metadata 中记录 `QuestionMode=decision-tree` 与 `QuestionSeverity=<auto|light|normal|deep>`。
- 第一版 decisions validate 做轻量文本检查。

## 风险 / 权衡
- 风险：auto 模式可能猜错用户意图。
  - 缓解：所有假设必须写入 proposal/design/analysis；重大不可逆行为仍由实现/归档阶段验证。
- 风险：decision-tree 过度提问。
  - 缓解：severity 预算和 “能查就不问” 规则。
