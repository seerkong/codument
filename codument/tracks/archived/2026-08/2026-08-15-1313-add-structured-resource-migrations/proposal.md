# 变更：add-structured-resource-migrations

## 背景和动机

历史 Codument XML/XNL 缺少 `apiVersion`，现有 `upgrade-track` 和 `upgrade-workspace` 包含多段命令专属字符串迁移，无法声明来源结构、目标 Kind 版本、验证结果或 AI review fallback。版本升级需要一个可复用、可诊断、可在写入前验证的转换基座。

## 目标

- 新增 `codument migrate inspect|plan|apply|verify`。
- 按 format、kind、source fingerprint、目标 apiVersion 注册确定性迁移。
- XML/XNL 使用结构化 parser/AST 转换，不以正则作为 schema authority。
- apply 在备份或 staging 边界内执行，目标验证失败时不提交破坏性结果。
- 无唯一转换路径、解析失败或目标验证失败时返回 `review-required` 诊断，由 `codument-migrate` 提示词驱动 AI 修订后复验。
- `upgrade-workspace` 复用同一迁移引擎处理受管与项目 Codument 资产。

## 非目标

- 不在本 track 引入 Halfcode runtime dependency。
- 不在本 track 将所有 XML Kind 改写为 XNL。
- 不让 CLI 自己绑定或调用某个 AI provider。

## 成功判据

- unversioned 文件通过结构指纹识别，不被笼统当作同一个 v0。
- 新旧 Track、Mission、decision forest 和基础 Codument XML/XNL 可 inspect、plan、apply、verify。
- 程序转换失败时输出文件、目标版本、阶段和 diagnostics，原文件保持可恢复。
- `upgrade-workspace` 与独立 migrate 命令共享 registry 和 transformer。
- migration E2E、workspace upgrade 回归与 `bun run check` 通过。
