# Design: Existing Codument Directory Symlink

## 目录语义

用户自行准备共享目录和链接：

```text
<clone-a>/codument -> <user-managed-shared-dir>
<clone-b>/codument -> <user-managed-shared-dir>
```

Codument 不创建、不登记、不推导链接目标。CLI 始终以 workspace 下的逻辑路径 `codument/...` 工作；当 `codument` 是有效目录软链接时，操作系统与 workspace effect 将写入转发到真实目标。链接目标中的所有内容均共享，包括 `codument/.local/workspace-bindings.xnl`。

## Init 与 Upgrade

- `codument init` 在 `codument` 不存在时保持现有行为，创建普通目录。
- `codument init` 在 `codument` 已是有效目录软链接时，在目标内安装模板，不替换链接。
- `codument upgrade-workspace`、`codument upgrade-resource` 及迁移过程在链接目标内更新文件，不删除、rename 或重新创建 workspace 根部的 `codument` 链接。
- upgrade-workspace 的备份仍位于调用 clone 的 `.tmp/codument/`；备份链接目标的内容快照，不复制成新的链接。
- 损坏软链接或指向文件的链接视为无效 workspace，命令在写入前失败并报告原因。

## 实现收敛点

不为每个命令加入软链接分支。实现先增加一个小型 workspace-root 检查/解析能力，并让通用写入入口及少数仍直接操作 `codument` 根的升级代码复用它。子路径读写继续使用现有相对路径接口。

只有确实可能替换、删除或误判根链接的代码需要调整。普通的 `readFile`、`writeFile`、`mkdir`、`rename`、`rm` 对 `codument/...` 子路径会自然跟随目录链接，不增加重复包装。

## 提示词策略

只在一个 workspace 权威文档中写明：已有的有效 `codument` 目录软链接等价于普通 Codument root，所有操作透明跟随；链接的创建和目标管理由用户负责。各 skill/operation 不重复软链接规则，也不加入散弹式“禁止替换链接”文字。

## 验证策略

- 在临时目录中验证无链接的 `codument init` 仍创建普通目录。
- 预先创建外部目录和 `codument` 软链接，再运行 init，断言模板写入目标且链接仍为链接。
- 在链接 workspace 运行 upgrade-workspace 与单资源升级，断言目标更新、链接保留、备份落在调用 clone。
- 建立两个 workspace 链接到同一目标，验证一侧修改 track 或 `.local/workspace-bindings.xnl` 后另一侧立即可见。
- 覆盖损坏链接和指向文件的链接，确认写入前失败且不产生替代 `codument` 目录。
