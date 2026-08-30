# 变更：支持预置的 Codument 目录软链接

## 背景和动机 (Context And Why)

部分项目不便将 Codument 等 coding/spec 工具内容提交到代码仓库。用户会自行把同一项目多个 clone 下的 `codument` 目录链接到同一个外部目录，使规划、决策、track、mission 和 workspace bindings 在同一台电脑上互通。

## "要做"和"不做" (Goals / Non-Goals)

**目标：**
- `codument init` 默认仍创建普通 `codument/` 目录，不主动创建软链接。
- 若 workspace 中已经存在有效的 `codument` 目录软链接，init、upgrade-workspace、资源升级及其他 Codument 写操作 SHALL 透明写入链接目标。
- 所有写操作 SHALL 保留 `codument` 链接节点本身。
- 完整共享链接目标，包括 `.local/workspace-bindings.xnl`。
- 对损坏链接和非目录目标给出明确错误，不创建或猜测替代目标。
- 软链接相关提示词只在一个权威位置简短说明，其他 operation 依赖统一 CLI/文件系统语义。

**非目标：**
- 不增加创建、管理或发现共享目录的 CLI 命令。
- 不根据 Git remote 派生项目身份，也不规定共享目标位于何处。
- 不自动修改 `.gitignore` 或 `.git/info/exclude` 来忽略 `codument` 链接。
- 不改变普通目录 workspace 的行为。
- 不引入 clone-local overlay；链接目标中的 `.local` 也共享。

## 变更内容（What Changes）

- 明确 Codument workspace 路径层对“普通目录”和“已有目录软链接”的统一读写语义。
- 审计并修正 init、upgrade-workspace、upgrade-resource、迁移及生命周期命令中可能替换链接或绕开统一路径层的写入。
- 添加真实软链接测试，覆盖普通初始化、链接初始化、链接升级、资源修改、跨 clone bindings 共享与错误链接。
- 仅在 workspace 的权威说明中增加一段精简的链接语义，避免在各 operation 中重复禁止性说明。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`workspace.shared-codument-link`
- 受影响的代码：workspace effect/path helper、init/upgrade/migration 的必要路径、相关 tests，以及单一 workspace 权威提示词。
