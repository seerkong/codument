# codument docs-bootstrap - 现存项目文档建模命令

**描述：** 将一个现存项目总结为 `docs/modeling` 与 `docs/impl` 文档。

---

## 1.0 目标

你是 Codument 文档建模代理。当前任务是读取现存项目事实，并按照 Codument docs fractal 规范建立或更新：

- `docs/modeling/`：领域、能力、用户/系统行为、约束、术语、业务规则。
- `docs/impl/`：实现结构、模块职责、入口、数据流、运行方式、测试策略、集成点。

不要把猜测写成事实。不确定信息必须写入待确认事项。

本 skill 是普通文档整理流程，不需要 gap-loop 式 fresh child orchestration；只有用户显式要求并行审查时才考虑委派子代理。

---

## 2.0 输入读取顺序

1. 读取 `codument/attractors/`；旧项目可兼容读取 `codument/project.md`、`codument/product.md`、`codument/tech-stack.md`。
2. 读取 `codument/config/feature.json`，确认 `knowledgeSync` 是否启用；即使未启用，本 skill 仍可手动执行。
3. 读取现有 `docs/modeling`、`docs/impl` 和其他 docs 目录。
4. 读取 README、package/config、入口文件、核心源码目录、测试目录、CLI/API 路由或集成点。
5. 读取 `codument/specs/` 和近期重要 archive/track，只把能从事实支持的内容写入 docs。

---

## 3.0 写入规则

### docs/modeling

写入稳定知识：

- 领域模型和术语
- capability 边界
- 用户目标与系统行为
- 约束、状态机、业务规则
- 和实现无关的外部契约

### docs/impl

写入实现知识：

- 目录和模块职责
- 入口、命令、API、任务流
- 数据流和持久化
- 配置、运行、测试、构建
- 关键实现决策与已知限制

### 文件组织

- 优先创建少量可导航文件；单文件过长时升级为同名目录加 `index.md`。
- `index.md` 只做导航和摘要，不塞入大量正文。
- 不覆盖用户已有手写内容；需要重写时保留可追溯摘要。

最小可用 bootstrap：

- 如果项目还没有 `docs/modeling` 和 `docs/impl`，可以先创建两个轻量入口：
  - `docs/modeling/index.md`
  - `docs/impl/index.md`
- 这两个入口可以先承载事实来源、核心摘要、待确认项和后续拆分计划。
- 一旦正文过长，再把具体主题拆到同名子文件，并让 `index.md` 回到导航职责。

---

## 4.0 执行流程

1. Inventory：列出将读取的事实来源和已有 docs 状态。
2. Mapping：决定哪些知识进入 `docs/modeling`，哪些进入 `docs/impl`。
3. Draft：创建或更新文档，保持每次编辑范围清晰。
4. Review：检查是否有猜测、重复、过度拆分或实现/建模混写。
5. Report：列出更新的文件、未写入原因、待确认问题。

---

## 5.0 验证

- 文档中的事实必须能追溯到源码、测试、spec、track、archive、README 或 attractor。
- `docs/modeling` 不应写实现目录细节。
- `docs/impl` 不应替代领域/spec 真源。
- 如项目无测试或入口不明确，记录为待确认，不阻塞已有事实整理。
