# Problem Statement

## 当前 spec 的问题

Codument 当前使用 Markdown `spec.md` 表达 track delta，并把归档后的结果合并到 `codument/specs/`。这种方式适合早期轻量规范，但不适合长期 spec coding。

主要问题：

1. **变更定位不稳定**
   - Markdown 通过标题和自由文本表达需求。
   - 增删改移动需要模型自行推断目标位置。
   - 当前 archive 使用正则识别 `ADDED/MODIFIED/REMOVED Requirements`，无法形成稳定 mutation 协议。

2. **BDD case 组织能力不足**
   - Markdown scenario 不适合表达多层级测试结构。
   - 测试框架中常见的 suite/context/case/table-driven cases 无法稳定映射。
   - spec 变长后缺少自然拆分机制。

3. **specs 的长期价值弱化**
   - 文档性不如项目 docs。
   - 事实真源不如代码、测试和运行时契约。
   - 归档后只是“合并到 specs”，没有把知识落到项目实际长期文档和决策记忆中。

## 当前项目级 attractor 的问题

Codument 的 track 级 gap-loop 已经能帮助单次迭代闭环，但项目级“不走偏”的机制不足。

缺口包括：

- 缺少项目级 attractor 目录。
- `product.md`、`project.md`、`tech-stack.md` 分散在 `codument/` 根层，且不支持用户自定义多个 attractor。
- `std/AGENTS.md` 对固定文件入口依赖过强。
- 归档时没有检查 track 是否改变项目长期方向、长期决策或长期记忆。

## 当前知识同步的问题

很多项目的长期知识不在 `specs/` 中，而在项目自己的 docs 或其他知识目录中。

但 Codument 现在缺少：

- 可配置启用/关闭 docs knowledge sync 的 feature gate。
- 配置一个或多个知识同步目标的能力。
- 在计划生成时自动加入知识同步任务的规则。
- 在执行同步时读取项目 docs attractor 的规范。
- 可维护大型 docs 规范的默认 attractor。

## 当前归档排序的问题

当前 archive 目录使用归档日期：

```text
codument/archive/YYYY-MM-DD-track-id/
```

问题：

- 一天多个 track 时顺序不可见。
- AI 生成和归档速度很快，日期级前缀不足。
- 用户可能后补归档，归档日期不等于实际迭代最后更新时间。

因此 archive 应使用 track 最后更新时间的分钟级前缀：

```text
codument/archive/YYYY-MM/YYYY-MM-DD-HHmm-track-id/
```

## 当前大型 track 产物的问题

对于设计点很多的大型需求，单个 `proposal.md` 和 `design.md` 会过长。

Codument track 提示词应支持：

- 创建 `proposal/` 子目录承载 proposal 子方向说明。
- 创建 `design/` 子目录承载详细设计。
- `proposal.md` 和 `design.md` 作为总览与导航。
- 后续生成大 track 时必须给出 good/bad examples，避免把所有设计塞进一个文件。

