# Design: add-structured-resource-migrations

## 核心模型

迁移 registry 以 `(format, kind, source fingerprint, target apiVersion)` 为键。缺失 `apiVersion` 只表示 unversioned，不代表单一 v0；detector 必须根据根节点、必需子节点和历史结构唯一识别。

```text
inspect -> plan -> stage/apply -> target validate -> commit
                         | validation/ambiguity failure
                         v
                   review-required -> AI revise -> verify
```

## 命令

- `migrate inspect <path>`：只读报告 format、root kinds、版本和 fingerprint。
- `migrate plan <path>`：报告将采用的迁移路径，不写文件。
- `migrate apply <path>`：先解析和转换 staging，再验证目标；通过后原子替换并保留备份。
- `migrate verify <path>`：验证文件是否符合 registry 当前版本。

简单调用使用位置参数；批量或未来复杂迁移计划才使用结构化 YAML 输入。默认文本回执保持简洁，`--json` 提供机器可读诊断。

## AI fallback

CLI 不调用 AI。`review-required` 回执包含 path、detected kind、target apiVersion、失败阶段和 diagnostics；`codument-migrate` skill 读取最新规范修订文件，然后再次调用 verify。任何 fallback 都不得静默宣称程序迁移成功。

## Workspace upgrade

`upgrade-workspace` 在现有 workspace backup 之后调用 migration engine。已是当前版本的文件 no-op；可确定迁移的文件升级；需要 review 的文件汇总报告且保持原文件可恢复。
