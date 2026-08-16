# 变更：让 codument-migrate 自主完成工作区升级

## 背景和动机 (Context And Why)

当前 `codument-migrate` 只描述了单资源迁移和简略的工作区步骤。用户仍需要额外说明先运行什么命令、怎样处理 `review-required`、何时验证，以及是否传 `--agent codex`。这把本应由 Skill 判断的迁移范围和循环暴露给了用户，也容易让 Agent 在 CLI 完成机械迁移后停下。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**

- `$codument-migrate` 无参数时，自主升级当前完整 workspace，直到全部验证通过或明确 blocked。
- `$codument-migrate <path>` 保留单资源迁移能力。
- `codument upgrade-workspace --json` 返回稳定、可编排的升级回执。
- `review-required` 在当前 Coding Agent 内完成语义修正，不由 CLI 启动其他 Agent。
- `--agent` 只表示 skill 安装目标，不作为 AI 转换触发参数。

**非目标:**

- 不让 CLI 内嵌或启动 Coding Agent。
- 不让 AI 重写 CLI 已有的 parser、serializer、backup、rollback 或 Kind 版本选择逻辑。
- 不新增第二个面向用户的 workspace migration Skill。

## 变更内容（What Changes）

- 为 `upgrade-workspace` 增加 `--json`，输出 backup、模板刷新、技能安装、清理、资源迁移和 review 清单。
- 将 migrate operation 改成 workspace/resource 双模式控制循环。
- 将 `codument-migrate` Skill 的无参数调用定义为完整 workspace 升级入口。
- 增加 CLI 与模板回归测试，防止退化为需要用户补充长提示词的半自动流程。

## 影响范围（Impact）

- 受影响能力（behaviors）：`codument-core`
- 受影响代码：`upgrade-workspace` command、command registry、migration Skill/operation templates、相关测试
