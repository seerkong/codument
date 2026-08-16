# Design: optimize-e2e-xnl-authoring

## Layout

Mission 包含 5 条 Track，分两层 DAG：

```
G1 (并行，无依赖):
  T1: e2e-claude-tty
  T2: xnl-validator-error-messages
  T3: xnl-staged-validate

G2 (依赖 G1 全部完成):
  T4: xnl-authoring-scaffold

G3 (依赖 T4 完成):
  T5: e2e-task-split
```

G1 的三条 Track 独立且可并行实现（TTY、validator、staged validate 互不依赖）。
G2 的 scaffold 需要 validator 先稳定（error message 格式确定）。
G3 的 e2e 拆分需要 scaffold CLI 可用（agent 在 e2e 中可直接调用 scaffold）。

## Per-Track Design

### T1: e2e-claude-tty

**问题**：`run.sh` 用管道调用 `claude -p`，丧失 TTY。
**方案**：在 `run.sh` 的 claude 分支使用 `script`（macOS 内置）包裹调用：
```bash
script -q /dev/null claude ...
```
`script` 创建伪终端，让 claude 获得完整 TTY 环境，输出实时流入 tee。
**影响面**：仅 `e2e/modeling-engineering/run.sh` 和 `e2e/project-implementation/run.sh` 的 claude 分支。

### T2: xnl-validator-error-messages

**问题**：当前 validator 返回 `file/line/layer/reason`，但错误消息是自然语言描述，agent 需要推断修复方式。例如：
- `"surface id-context 与路径 context 不一致"` → agent 需猜正确格式
- `"XNL 数组逗号语法"` → 无示例

**方案**：为每个 rule 定义 `code` + `message` + `fix_hint` 三元组。validator 输出格式升级为：
```typescript
interface ValidateFinding {
  rule: string;          // e.g. "modeling.id-context-mismatch"
  message: string;       // human-readable
  fix_hint: string;      // 最小修复示例
  file: string;
  line?: number;
}
```

对于已知错误模式，fix_hint 直接给出正确写法：
- id-context 不匹配 → `"文件路径为 modeling_deltas/domain/todo.xl，节点 id 应为 #domain.todo.xxx"` 
- 数组末尾逗号 → `"删除最后一个元素后的逗号"` 
- 文本块未闭合 → `"文本块应以 </?> 闭合"`

**影响面**：`src/cli/modeling/validate.ts`、`src/cli/engineering/validate.ts` 的 findings 生成逻辑。

### T3: xnl-staged-validate

**问题**：plan-track skill 要求"每批写完后运行 validate"，导致 N 个文件 = N 轮 validate 子进程。todo 约 5 轮，ecommerce 约 10 轮。

**方案**：新增 `--staged` 模式，改变验证时机：
```bash
# behavior delta 写入阶段：不 validate
# modeling delta 写入阶段：不 validate
# engineering delta 写入阶段：不 validate
# 全部写入完成后：一次性 validate
codument validate <track> --strict
codument modeling validate --deltas <track>
codument engineering validate --deltas <track>
```

在 `run.sh` 中，plan 阶段改为 staged 模式（先让 agent 写完所有 deltas → 一次性 validate）。保留原有逐批验证作为可选 `--strict-validate`。

**影响面**：`e2e/modeling-engineering/run.sh`、`src/cli/commands/validate.ts`（新增 --staged 旗标或由 runner 控制时序）。

### T4: xnl-authoring-scaffold

**问题**：agent 从零生成 XNL，格式错误率高（尤其是 id-context、数组语法、文本块闭合）。

**方案**：新增 scaffold 子命令，提供合法骨架，agent 只需填充业务内容。

```bash
# modeling entity scaffold
codument modeling scaffold entity user --plane domain --context todo \
  --fields id:string,email:string,passwordHash:string,createdAt:string

# modeling state-machine scaffold
codument modeling scaffold state-machine task_status --plane domain --context todo \
  --states todo,doing,done --transitions "todo->doing:start,doing->done:complete"

# engineering rule scaffold
codument engineering scaffold rule backend --category rules --topic state_transitions \
  --description "Task status transitions must go through guard"
```

Scaffold 输出：
- 合法的 XNL 骨架文件（含正确 id、context、path）
- 已闭合的文本块占位符
- 正确的数组语法模板

agent 在 plan-track 流程中调用 scaffold，而非从零生成。

**影响面**：`src/cli/commands/`（新增 modeling scaffold / engineering scaffold 子命令），`src/cli/modeling/`、`src/cli/engineering/`（scaffold 逻辑）。

### T5: e2e-task-split

**问题**：ecommerce 的 7 capability + 15 modeling delta 对单次 claude 会话过重，上下文耗尽。

**方案**：将重任务拆分为多个 track，mission 的 DAG 表达依赖关系。具体拆分：

```
ecommerce-core (track):
  - catalog + cart + order lifecycle + inventory reservation
  - behavior: catalog/cart/inventory/order
  - modeling: domain/backend/surface (核心域)

ecommerce-payment (track, 依赖 ecommerce-core):
  - payment + coupon + pricing
  - behavior: payment/coupon/pricing
  - modeling: domain/backend (支付域)
```

runner 层增加 `--split` 或 `--max-capabilities` 参数，控制单次 e2e 的产物规模。

**影响面**：`e2e/modeling-engineering/run.sh`、`e2e/modeling-engineering/ecommerce/product.md`（可能需要拆分为两个 product 文件）。

## Validation Strategy

每条 Track 完成后：
1. `codument validate <track> --strict`
2. `codument modeling validate --deltas <track>`（如适用）
3. `codument engineering validate --deltas <track>`（如适用）
4. 重新运行 `bun run test:e2e:smoke` 确认 harness 未破坏
5. Mission reconcile 检查 downstream track 是否可启动

## Risks

- TTY 方案在 CI/headless 环境可能不可用 → 保留原有管道作为 fallback
- Scaffold 增加 CLI 表面积 → 保持 scaffold 输出为纯 XNL，不引入新 DSL
- Staged validate 延迟错误发现 → 对 e2e 可接受（最终一轮 validate 仍会捕获全部错误），对交互式用户需保留选项
