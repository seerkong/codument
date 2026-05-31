# codument migrate-specs - 旧 Specs 迁移命令

**描述：** 将旧 Markdown specs 迁移为新的 XML capability registry 文件或目录。

---

## 1.0 目标

你是 Codument specs 迁移代理。当前任务是把旧 specs 转换为 XML registry，同时保留无法安全转换的原文。

迁移目标：

- 小 capability：`codument/specs/<capability>.xml`
- 大 capability：`codument/specs/<capability>/index.xml` 加 `<include href="..."/>`
- 不安全转换：保留到 `codument/legacy/specs/...`

本 skill 是普通迁移流程，不需要 gap-loop 式 fresh child orchestration；只有用户要求独立复检时才考虑委派子代理。

---

## 2.0 输入读取

读取：

- `codument/specs/**/*.md`
- `codument/specs/**/*.xml`
- `codument/tracks/**/spec.md`
- `codument/archive/**/spec.md`
- `codument/legacy/specs`
- `codument/std/AGENTS.md` 和 workflow

先 inventory，不要直接覆盖。

---

## 3.0 转换规则

### Markdown 到 XML

- `### Requirement: Name` 转为 `<requirement id="slug">`
- Requirement 正文转为 `<statement>`
- `#### Scenario: Name` 转为 `<case id="slug">`
- Given/When/Then 列表转为 `<given>`、`<when>`、`<then>`
- 生成的 `requirement`、`suite`、`case` `id` 必须稳定且在同一 capability 内全局唯一；如果 slug 冲突，应加上父级 requirement、suite 或主题前缀，例如 `create-success`、`invoice-create-success`
- 无法映射的正文保留为 XML 注释或 legacy 原文，并标记待确认

### XML 文件组织

小 capability：

```text
codument/specs/billing.xml
```

大 capability：

```text
codument/specs/billing/
  index.xml
  requirements/invoice.xml
  suites/create.xml
```

`index.xml` 应保留 capability 根节点，并通过 `<include>` 引用拆分文件。

如果旧 spec 已经位于 `codument/specs/<capability>/spec.md` 这种目录内，优先迁移为同目录的 folder registry：

```text
codument/specs/<capability>/index.xml
```

不要为了生成单文件 XML 把已有 capability 目录折叠成 `codument/specs/<capability>.xml`。

---

## 4.0 安全策略

- 不覆盖已有 XML spec，除非用户明确要求并有备份。
- 转换前将原 Markdown 复制到 `codument/legacy/specs/...`。
- 如果 Markdown 层级不规范、场景缺少 Given/When/Then、需求边界不清，先生成迁移草案并请求确认。
- 不把 track delta 误当成长期 registry，除非它已归档且语义明确。

---

## 5.0 验证

迁移后运行：

1. `codument list --specs`
2. `codument show <capability>`
3. `codument validate --strict`

验证前先识别当前 Codument CLI 是否支持 XML registry：

- 如果 `codument list --specs`、`codument show <capability>` 或 `codument validate <capability> --strict` 仍只识别旧 `spec.md`，说明当前 CLI 版本不支持 XML registry 或未升级到本 track 所需版本。
- 在这种情况下，不要把 XML 迁移判定为失败；降级执行本地验证，并在最终报告中明确写出 CLI 版本/能力限制。

本地降级验证至少包括：

- XML well-formedness（如 `xmllint --noout`，或等价解析检查）。
- requirement/case 数量与原 Markdown 场景数量对照。
- `codument/legacy/specs/...` 中的原文备份存在且内容一致。
- 检查 generated XML 的 `requirement`、`suite`、`case` `id` 稳定，并在同一 capability 内全局唯一、无重复。

`codument validate --strict` 可能会格式化或补写 active track metadata；运行后必须检查 `git diff`，并在报告中区分验证副作用和本次 specs migration 修改。
