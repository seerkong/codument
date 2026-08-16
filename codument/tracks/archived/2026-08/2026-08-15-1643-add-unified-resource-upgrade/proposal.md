# 变更：统一单资源升级并修复 Decision 迁移

## 背景和动机

Codument 已有 `migrate inspect|plan|apply|verify` 四阶段底层接口，也会在 `upgrade-workspace` 中批量迁移 `.xml/.xnl`。但用户缺少一个完成 inspect、plan、backup、apply、verify 的单资源入口；当前 workspace inventory 不识别 `decisions.md`，旧 `plan.xml`、Decision wrapper 和部分历史资源也没有进入统一迁移注册表。

长期 Decision Registry 的设计要求按业务 owner/topic 形成递归 XNL 目录树，实际实现却把根 `decisions.xnl` 的 durable roots 全部写入 `codument/decisions/registry.xnl`，并保留了按年月组织的 Markdown 摘要。当前项目还有 active、archived 和长期 registry 共 18 个 `decision.md`/`decisions.md`，其中部分只能由 AI 按最新 Decision 规范保真升级。

## 目标

- 新增 `codument upgrade-resource <path>`，自动执行确定性识别、计划、备份、转换和目标验证。
- 保留 `codument migrate inspect|plan|apply|verify` 作为底层诊断接口。
- 统一注册过去使用 XML/XNL/Markdown 表示的 Track、Mission、Decision、Behavior、BehaviorPatch、配置、Modeling 与 Engineering 资源形态。
- 对无法程序化保真的资源返回简洁 `review-required`，包含源、目标 Kind/apiVersion、建议目标和 AI 修订原因；CLI 不绑定 AI provider。
- `upgrade-workspace` 复用同一 inventory，使 legacy Decision Markdown 也会被明确报告。
- 删除 `registry.xnl` fallback：递归 `decisions/<business-path>.xnl` 原样晋升；根 durable decision 缺少业务归属时交由 AI review。
- 把本项目所有 legacy `decision.md`/`decisions.md` 升级到完整 XNL，按业务语义目录组织并在验证后移除 Markdown，包括 archived Track。

## 非目标

- 不在本 Track 修改 XNL mutation runtime。
- 不让 CLI 从非结构化文本臆造缺失的 options、answer、hierarchy 或业务 owner。
- 不把物理 Decision 路径作为 `decision://` identity。

## 成功判据

- `upgrade-resource` 的 help 无副作用，支持文本和 `--json` 回执。
- 确定性资源完成原子升级；无法保真时原文件不变并返回 exit code 2。
- Decision Markdown、旧 `<decision-tree>` 和缺少业务 owner 的 durable roots 都能被 inventory/AI review 正确识别。
- `codument/decisions/` 只保留业务语义目录下的 XNL，不存在 `registry.xnl` 或日期 bucket。
- 项目 `codument/` 下不存在 `decision.md`/`decisions.md`。
- archive promotion 不再创建或写入 `registry.xnl`。
- focused tests、`bun run check`、build、dogfood upgrade 和 `git diff --check` 通过。
