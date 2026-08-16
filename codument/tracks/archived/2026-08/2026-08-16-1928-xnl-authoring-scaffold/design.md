# Design: xnl-authoring-scaffold

## Problem

Agent 从零生成 XNL 时反复出现可预防的语法错误：

| 错误模式 | 占 planning validate 轮次 | 根本原因 |
|---|---|---|
| id-context mismatch | 30% | agent 自行构造 id，未对齐路径 |
| array trailing comma | 20% | XNL 数组语法不常见 |
| text block unclosed `</?>` | 15% | agent 遗漏闭合标签 |
| derived_from missing | 10% | agent 猜测引用路径 |

这些错误在 0.4.x 时代也存在，但当时 modeling/engineering delta 数量少、validator 较宽松，不构成明显瓶颈。

## Solution

### 1. CLI scaffold 子命令

新增 `codument modeling scaffold` 和 `codument engineering scaffold`，输出合法 XNL 骨架。

**modeling scaffold：**

```bash
codument modeling scaffold entity user --plane domain --context todo \
  --fields id:string,email:string,passwordHash:string

codument modeling scaffold state-machine task_status --plane domain --context todo \
  --states todo,doing,done \
  --transitions "todo->doing:start,doing->done:complete"

codument modeling scaffold module task_store --plane backend --context todo \
  --depends-on "modeling://domain/todo/task"
```

**engineering scaffold：**

```bash
codument engineering scaffold rule backend --category rules --topic state_transitions \
  --description "Task status transitions must go through guard"

codument engineering scaffold howto backend --category howto --topic add_endpoint \
  --description "How to add a new REST endpoint"

codument engineering scaffold reference backend --category reference --topic api_map \
  --description "API endpoint map"
```

### 2. 骨架输出格式

骨架输出满足：
- 正确的 id namespace（`#<plane>.<context>.<id>`）
- 正确的 path context 对齐（文件路径与 id 一致）
- 正确的数组语法（无 trailing comma）
- 闭合的文本块占位符 `</?>`
- 必填字段的 TODO 占位符

### 3. Agent 调用模式

plan-track skill 中增加 scaffold 调用指引（不改动 core 流程）：

```
§3.3b 建模辅助：对 entity/state-machine/module 等常见节点，优先调用
  `codument modeling scaffold <kind> ...` 获得合法骨架，再填充业务内容。
```

## Implementation

在 `src/cli/commands/` 下新增：
- `modeling-scaffold.ts`：处理 modeling scaffold 子命令
- `engineering-scaffold.ts`：处理 engineering scaffold 子命令

在 `src/cli/modeling/` 和 `src/cli/engineering/` 下新增：
- `scaffold.ts`：骨架生成逻辑（XNL 字符串模板）

## Affected Files

- `src/cli/commands/modeling-scaffold.ts`（新建）
- `src/cli/commands/engineering-scaffold.ts`（新建）
- `src/cli/modeling/scaffold.ts`（新建）
- `src/cli/engineering/scaffold.ts`（新建）
- `src/cli/commands/index.ts`（注册子命令）
- `codument/std/operations/plan-track.md`（增加 scaffold 指引，可选）

## Risks

- scaffold 模板与 node schema 漂移 → 由 CLI 本身保证（模板硬编码当前 schema）
- agent 过度依赖 scaffold → scaffold 只覆盖常见 kind，复杂节点仍需手写
