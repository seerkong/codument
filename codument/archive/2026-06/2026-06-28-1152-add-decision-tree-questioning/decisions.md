# Decisions

## Usage
- 本文件记录本 track 的关键决策。
- 本 track 采用高自主无问答执行，所有决策均由用户需求和上下文直接推断。

### 1. 【P0】无问答模式的 severity 名称
- 背景：用户希望基于 severity 级别添加一种显式无问答模式。
- 需要决定：该级别如何命名。
- 选项：
  - A) `none`
  - B) `auto`
  - C) `silent`
- 当前建议：B
- 用户答复：用户要求“无问答模式，用于高自主实现”。
- 最终决策：采用 `severity=auto`，并兼容 “no-question / 无问答 / 高自主” 自然语言触发。
- 决策理由：`auto` 表达的是高自主规划，而不是完全没有判断；比 `none` 更准确。
- Parent: root
- Blocks: questioning protocol, plan-track, plan-mission
- Evidence: 用户明确补充需求
- Confidence: 0.95
- Reversibility: moderate
- Durable candidate: yes
- 状态：accepted

### 2. 【P0】未指定 severity 的默认值
- 背景：用户明确要求 plan track / mission skill 未指定 severity 时默认 light。
- 需要决定：默认值。
- 选项：
  - A) auto
  - B) light
  - C) normal
- 当前建议：B
- 用户答复：默认 light。
- 最终决策：采用 B。
- 决策理由：light 保留少量 P0 用户意图澄清，适合日常规划；auto 需要显式触发。
- Parent: root
- Blocks: questioning protocol, plan-track, plan-mission
- Evidence: 用户明确补充需求
- Confidence: 1.0
- Reversibility: moderate
- Durable candidate: yes
- 状态：accepted

### 3. 【P1】decisions validate 的第一版范围
- 背景：建议的 P2 validator/lint 应轻量落地，避免过度实现。
- 需要决定：第一版校验什么。
- 选项：
  - A) 全面解析 Markdown AST 和所有字段。
  - B) 轻量正则检查 pending/blocking/durable candidate 元数据。
  - C) 暂不实现 CLI。
- 当前建议：B
- 用户答复：同意三步建议并要求直接实现。
- 最终决策：采用 B。
- 决策理由：能覆盖最重要的 completed track 带 pending/blocking 决策风险，同时实现成本低。
- Parent: root
- Blocks: CLI tests
- Evidence: 用户同意三步建议
- Confidence: 0.85
- Reversibility: easy
- Durable candidate: no
- 状态：accepted

### 4. 【P0】question severity 的 XML 真源位置
- 背景：用户希望 question severity 与 commit mode 一样，成为 track.xml / mission.xml 中的并列配置，而不是只存在于提示词文字里。
- 需要决定：question mode / severity 应落到哪里。
- 选项：
  - A) `<Metadata><QuestionMode>` 与 `<Metadata><QuestionSeverity>`
  - B) 独立 `<Questioning mode="..." severity="..."/>` 节点
  - C) 只保留在 proposal / design 文本中
- 当前建议：A
- 用户答复：同意放到 Metadata，与 CommitMode 并列。
- 最终决策：采用 A。track.xml 与 mission.xml 的 `<Metadata>` 中写 `<QuestionMode>decision-tree</QuestionMode>` 与 `<QuestionSeverity>auto|light|normal|deep</QuestionSeverity>`。
- 决策理由：符合当前 Metadata 简单标量字段风格；也能明确区分 question mode 与 commit mode 两条轴。
- Parent: root
- Blocks: track-xml-spec, mission-xml-spec, plan-track, plan-mission, validate
- Evidence: 用户明确要求“将 question severity 放到 track.xml, mission.xml 和 commit mode 并列”
- Confidence: 1.0
- Reversibility: moderate
- Durable candidate: yes
- 状态：accepted
