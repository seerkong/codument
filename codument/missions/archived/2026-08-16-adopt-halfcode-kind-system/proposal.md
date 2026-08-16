# Mission: adopt-halfcode-kind-system

## 背景和动机

Codument 已经积累了大量提示词、XML/XNL 资产和 CLI 逻辑，但新文件的结构仍主要由 AI 手工拼装，CLI 命令定义、帮助、版本创建和历史迁移也缺少统一基座。`halfcode-compiler.xnl` 已完成发布准备，可作为后续标准 KindDefinition 与 XNL manifest 体系的实现基础。

## 目标

- 建立 Codument CLI 命令注册表、版本化 Kind registry、最小参数 scaffold 和结构化迁移基座。
- 补齐 Halfcode 对版本化 KindDefinition、多根 XNL 文档等真实集成所需能力。
- 正式让 Codument 使用 Halfcode 编译和校验 Kind，并按 Kind 分批淘汰 XML。
- 在 Codument 集成阶段发现 Halfcode 缺口时，以可复现证据反向补齐 Halfcode compiler。

## 非目标

- 不把 plan-track、impl-track、plan-mission、impl-mission 的语义规划改写为程序。
- 不把 proposal、design、任务描述和决策理由迁入长期 YAML manifest。
- 不在 CLI 基座阶段一次性删除所有 XML。

## 成功判据

- 所有 CLI 命令和子命令由单一注册表驱动，`-h/--help` 在 handler 前短路。
- Track/Mission 只需 ID 与 lifecycle stage 即可由 CLI 生成当前 Kind 版本骨架。
- 新 XML/XNL 使用 `codument.tech/v1alpha1`，空 decision forest 不落文件。
- 无版本历史文件先走确定性迁移；失败时产生 AI review 所需诊断，再由 validator 复验。
- Halfcode 能表达 Codument 所需的版本化 KindDefinition 与多根 XNL 文档。
- Codument 正式接入 Halfcode，并形成可继续分 Kind 移除 XML 的稳定路径。

## 为什么需要 Mission

工作跨越 Codument 与 Halfcode 两个项目，包含 CLI 基座、编译器能力、跨项目反馈和多 Kind 迁移，执行中必然需要根据真实集成证据重规划。Mission 只负责跨 track 控制面；代码、规范和测试均由真实 track 承担。
