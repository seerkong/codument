# Mission Design: adopt-halfcode-kind-system

## 控制目标

- desired state：Codument 的结构化产物由版本化 Kind authority 创建、迁移和校验，最终由 Halfcode XNL KindDefinition 承载。
- actual state：Codument CLI、XML/XNL 文件、Halfcode public API、两个项目的测试与 package consumer evidence。
- actuation：创建并执行 Codument 或 Halfcode track，发布兼容版本，接入后按验证反馈修订后续 DAG。
- feedback：CLI E2E、workspace upgrade、Halfcode package consumer test、Codument 全量校验和真实 dogfood 结果。

## 三阶段

### G1 Codument CLI 基座

先建立命令注册表与版本化 scaffold，再建立结构化迁移引擎。提示词继续负责分析和语义编写，CLI 只拥有确定性的结构创建、转换与验证职责。

### G2 Halfcode 能力补齐

以 Codument 的实际要求补齐版本化 KindDefinition、多根或 forest 文档、空文档策略和迁移注册能力。外部项目的具体路径只由执行 session binding 提供，不写入 mission。

### G3 Codument 正式接入

引入已发布的 `halfcode-compiler.xnl`，建立 Codument KindDefinitions，并按 Kind 分批从 XML 转向 XNL。集成时发现的编译器缺口回流 G2 对应项目，修复后重新消费和验证。

## 版本与 authoring 边界

- Codument Kind schema group 为 `codument.tech`，初始版本为 `codument.tech/v1alpha1`。
- `apiVersion` 是 schema 版本；资源自身 `version` 与 npm CLI 版本独立。
- CLI scaffold 只接收 ID 与 `pending|active` stage，不接收任务 DAG、proposal 或 design 内容。
- 不生成空 `decisions.xnl`；首次出现 decision 时创建，每个顶层 decision 携带 `apiVersion`。
- 复杂迁移命令可使用结构化 YAML 输入，但创建 Track/Mission 不使用复杂 YAML。

## 重规划条件

- Halfcode public API 与 Codument 多根 XNL 语义不兼容。
- 某一 XML Kind 无法无损映射到 XNL。
- 程序化迁移无法唯一识别历史结构，或迁移后目标 validator 失败。
- Codument 集成暴露新的 Halfcode compiler authority、cardinality 或 schema version 缺口。

## 人工介入

只有出现不可逆 schema 取舍、无法程序判定的历史语义、外部依赖阻塞或 mission 终态时才返回用户。第一阶段已经获得用户批准，直接执行。
