# Design: add-unified-resource-upgrade

## 1. 用户入口与底层接口

```text
codument upgrade-resource <path>
  -> inspect
  -> plan
  -> backup
  -> deterministic transform
  -> Kind/domain verify
  -> atomic replace
```

`upgrade-resource` 是一次性高层入口。现有 `migrate inspect|plan|apply|verify` 保持稳定，继续承担调试、dry planning 和 AI 修订后的独立复验。两者调用同一个 migration registry，不复制 transformer。

默认输出只显示 `upgraded|noop|review-required|blocked`、path、target、backup 和 diagnostics；`--json` 提供相同字段的机器可读形式，不引入 XNL 回执或复杂 request schema。

## 2. 资源识别

inventory 同时使用路径约定、扩展名、根 Kind 和结构 fingerprint，覆盖：

- Track：`plan.xml`、`tasks.xml`、`track.xml|track.xnl`；
- Mission：`mission.xml|mission.xnl`；
- Decision：`decision.md`、`decisions.md`、`decisions.xnl`、递归 Decision XNL、旧 `<decision-tree>` wrapper；
- Behavior：`specs/**/*.xml`、`behaviors/**/*.{xml,xnl}`；
- BehaviorPatch：`spec_deltas/**/delta.xml`、`behavior_deltas/**/delta.{xml,xnl}`；
- Config：operation/action hooks、attractor profiles、modeling、engineering；
- Modeling/Engineering registry 与 workspace-owned manifest。

能唯一识别且保真的执行程序转换；组合式 `plan.xml + tasks.xml`、非结构化 Markdown、旧 wrapper 含义不明确或业务 owner 缺失时返回 `review-required`。

## 3. AI review 边界

CLI 不调用 AI。单资源结果包含：

```text
path
detectedFormat
detectedKind
targetKind
targetApiVersion
suggestedTarget
status
diagnostics
```

Markdown Decision 必须被识别为 legacy Decision，而不是普通 unsupported `.md`。如果 archive 中存在唯一完整 XNL source，可程序恢复 AST；否则保留源并要求 AI 按当前 Decision Kind 修订。修订后再次运行 `migrate verify` 或 `upgrade-resource`。

## 4. Decision 业务目录

长期真源只允许业务语义路径：

```text
codument/decisions/
  cli/resource-migration/*.xnl
  workflow/mission/*.xnl
  workflow/track/*.xnl
  authoring/xnl/*.xnl
```

- track/mission 的 `decisions/<business-path>.xnl` 晋升时保留相对 owner path。
- 根 `decisions.xnl` 可以承载过程 decision forest，但其中 durable root 没有长期业务 owner，archive 必须返回 review-required。
- 不再使用 `registry.xnl` fallback，也不使用日期、track id 或 archive id 作为长期 owner 目录。
- stable `#id` 和 `decision://<id>` 仍是 identity；物理路径只表达维护归属。

本仓库 dogfood 由 AI 读取 18 个 Markdown、archive XNL 与现有 registry，按语义归类为 CLI、workflow、authoring、registries 等目录。可以从 archive 唯一恢复的节点保留完整 AST；Markdown-only 内容只写可证实字段，并保留 provenance/raw evidence，不伪造历史选项。

## 5. 安全和验证

- 写入前逐文件备份到 `.tmp/codument/`。
- target 已存在且不等价时 fail closed。
- transformer 先在内存或临时文件生成，Kind/domain verify 通过后 rename。
- 删除 legacy Markdown 前确认对应 XNL parse、Decision schema、stable-id uniqueness 和 raw provenance。
- workspace 批量升级汇总 review-required，但单条失败不伪装成功。
