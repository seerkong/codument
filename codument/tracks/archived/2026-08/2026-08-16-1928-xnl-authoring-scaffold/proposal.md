# Track: xnl-authoring-scaffold

## Context and Why

Agent 从零生成 XNL 时，格式错误率高：

- id-context 与路径不匹配
- XNL 数组末尾逗号
- 文本块未闭合 `</?>`
- `derived_from` 引用路径错误

这些错误都是**语法层面**的，本可通过提供合法骨架避免。类似数据库 migration 的 `rails generate migration` 或 ORM 的 schema scaffold。

## Goals

- 新增 `codument modeling scaffold` 子命令，输出合法 XNL 骨架
- 新增 `codument engineering scaffold` 子命令，输出合法 XNL 骨架
- Agent 在 plan-track 流程中调用 scaffold，而非从零生成
- Scaffold 输出包含正确的 id、context、path、闭合文本块占位符

## Non-Goals

- 不覆盖已有文件（scaffold 只创建不存在的文件）
- 不生成业务内容（只生成骨架，agent 填充）
- 不改变 modeling/engineering node schema
- 不引入新的 DSL 或配置格式

## Implementation

### CLI 子命令

```bash
# modeling entity scaffold
codument modeling scaffold entity user --plane domain --context todo \
  --fields id:string,email:string,passwordHash:string,createdAt:string

# modeling state-machine scaffold
codument modeling scaffold state-machine task_status --plane domain --context todo \
  --states todo,doing,done \
  --transitions "todo->doing:start,doing->done:complete,doing->todo:back_to_todo,done->doing:reopen"

# modeling module scaffold
codument modeling scaffold module task_store --plane backend --context todo \
  --depends-on "modeling://domain/todo/task"

# engineering rule scaffold
codument engineering scaffold rule backend --category rules --topic state_transitions \
  --description "Task status transitions must go through guard"

# engineering howto scaffold
codument engineering scaffold howto backend --category howto --topic add_endpoint \
  --description "How to add a new REST endpoint"
```

### 输出格式

Scaffold 输出符合当前 node schema 的 XNL 骨架：

```xnl
<object #domain.todo.user { kind = "entity" fact_grade = "authoritative_fact" single_writer = "modeling://backend/todo/user_store" } (
  <desc ?>TODO: 描述 User 实体的职责和不变量。</?>
  <types ?ts>
  interface User {
    // TODO: 添加字段
  }
  </?ts>
  <invariants ?>TODO: 描述不变量。</?>
  <fact-source ?>TODO: 描述唯一写入者。</?>
)>
```

关键：骨架已经包含正确的 id namespace、path context 对齐、闭合的文本块占位符。

## Acceptance

- [x] `codument modeling scaffold entity` 输出合法 XNL，可通过 `codument modeling validate --deltas`（作为 delta 校验）
- [x] `codument engineering scaffold rule` 输出合法 XNL，可通过 `codument engineering validate --deltas`
- [x] Agent 在 e2e 中调用 scaffold 后，validate 轮次从 2-3 轮降到 0-1 轮
- [x] Scaffold 不覆盖已有文件
