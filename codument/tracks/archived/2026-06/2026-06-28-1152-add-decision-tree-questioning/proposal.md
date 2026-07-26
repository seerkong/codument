# 变更：增强决策树式提问与无问答规划模式

## 背景和动机 (Context And Why)
Codument 已有 `decisions.md`、durable decision promotion 和 file-in/file-out 纪律，但 plan-track / plan-mission 的提问方式仍偏固定流程：要么一次问多题，要么在 track/mission 名称和产物确认处等待用户。对高自主自动化场景，这些确认会阻塞；对复杂设计场景，固定多问又缺少决策树依赖、预算和证据分类。

## 目标 / 非目标
**目标:**
- 为 Codument 增加 bounded decision-tree questioning 协议。
- 增加 `severity=auto|light|normal|deep`，其中未指定默认 `light`。
- `severity=auto` 为无问答模式：track/mission 名称、behavior/proposal/design/track.xml/mission.xml 等确认点都不发问，按证据和默认值推进，并把假设写入文件。
- 在 `track.xml` / `mission.xml` 的 `<Metadata>` 中记录 `<QuestionMode>` 与 `<QuestionSeverity>`，与 `<CommitMode>` 并列但分属不同轴。
- 更新 plan-track、plan-mission 提示词，让它们显式支持 decision-tree pass 与无问答模式。
- 增加可复用 `codument-decision-tree` skill 壳。
- 增加轻量 decisions validate/lint，帮助防止 completed track 带 unresolved blocking decisions。

**非目标:**
- 不实现复杂交互 UI。
- 不强制所有旧 track 补 `analysis/decision-tree.md`。
- 不改变 archive 对 durable decisions 的现有提升规则，只补充更清晰的元数据约定。

## 变更内容（What Changes）
- 修改 `codument/std/sop/questioning.md` 和模板版本：增加 decision-tree protocol、severity 预算、auto no-question mode。
- 修改 `codument/std/operations/plan-track.md` 和模板版本：在主流程前解析 severity，默认 light；auto 跳过全部确认提问，并写入 Metadata 的 `QuestionMode` / `QuestionSeverity`。
- 修改 `codument/std/operations/plan-mission.md` 和模板版本：同样支持 severity 和 auto，并写入 mission Metadata。
- 修改 `track-xml-spec.md` / `mission-xml-spec.md` / validate 规范，把 question mode/severity 明确为 XML Metadata 字段。
- 新增 `src/templates/skills/codument-decision-tree/SKILL.md` 并更新 skills README/manifest。
- 新增 CLI `codument decisions validate [file|track-id]`，用于检查 decisions.md 的 pending/blocking/durable 元数据问题。

## 影响范围（Impact）
- 受影响能力：`codument-core`
- 受影响代码：CLI command routing、decisions validation helper、template manifest、tests
- 受影响文档：questioning SOP、plan-track/plan-mission operations、skill templates
