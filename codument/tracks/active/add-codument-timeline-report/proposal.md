# 变更：add-codument-timeline-report

## 背景和动机 (Context And Why)

Codument 的 Track 与 Mission 记录分散在用户主目录下的多个 Git 仓库中，且经历过 `plan.xml`、XML 和 XNL 等格式演进。需要一个不会深入仓库业务目录的本地分析器，集中产出可复用的时间序列数据与趋势图。

## "要做"和"不做" (Goals / Non-Goals)

**目标：**

- 从指定 home 目录发现 Git 根目录；只读取其同级 `codument/` 的 Track/Mission 资源。
- 覆盖当前 XNL、legacy XML 与 legacy `plan.xml` + `metadata.json` 的元数据时间字段。
- 输出逐资源的基础 JSON、CSV、按日/周/月聚合 JSON、以及可离线打开的 HTML/SVG 曲线图。
- HTML 报告可以在季度、月、周、天之间即时切换，无须重新扫描仓库。
- 累计创建数按 Track 与 Mission 分开呈现，图表悬停可查看当前位置的四项事件指标。
- 支持按 Git remote host 过滤，并为指定公司的 Git host 输出独立使用统计。
- 在 host 筛选后的 HTML 中，按 Git remote repository 汇总并列出 Track、Mission 与总资源数。
- 清晰报告解析失败、缺失时间及同目录多 authority 的情况，而非静默丢失。

**非目标：**

- 不修改被扫描仓库、不会迁移或校验其 Codument 资源。
- 不读取 Git 根目录内除 `codument/` 外的业务文件，也不通过符号链接递归扫描。
- 不引入图表或数据库第三方依赖。

## 变更内容（What Changes）

- 新增 `scripts/codument-timeline.ts` 作为 Bun 可执行分析脚本。
- 将 HTML 报告升级为内嵌基础资源数据的交互式时间线。
- 新增覆盖 Git 边界、格式兼容、去重、聚合与 HTML 输出的自动化测试。
- 在 `package.json` 暴露方便调用的脚本入口。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`codument-core`
- 受影响的代码：`scripts/`、`test/scripts/`、`package.json`
