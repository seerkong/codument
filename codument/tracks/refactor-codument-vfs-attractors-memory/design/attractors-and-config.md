# Attractors And Config Design

## 目标

Codument 需要项目级 attractor，补齐 track 级 gap-loop 之外的长期方向控制。

`codument/attractors/` 是项目级吸引子的根目录，允许用户自定义增加 attractor。

## 新项目布局

新项目初始化后：

```text
codument/
  attractors/
    product.md
    project.md
  config/
    feature.json
  tracks/
  specs/
  decisions/
  archive/
  std/
  workflows/
```

新项目不再生成：

```text
codument/tech-stack.md
```

## 旧项目兼容

旧项目可能仍有：

```text
codument/product.md
codument/project.md
codument/tech-stack.md
```

upgrade 时：

- 不强制删除旧文件。
- 可在缺失 attractors 时复制或生成新 attractor。
- 不覆盖用户已有 attractor。
- `tech-stack.md` 保留为 legacy，但不再作为新项目模板输出。

## upgrade-workspace 迁移策略

`codument upgrade-workspace` 应从“刷新内置标准文件”扩展为“将旧 workspace 补齐到当前 Codument 结构”的命令。

必须补齐：

- `codument/attractors/`
- `codument/config/feature.json`
- `codument/legacy/`
- 当前版本需要的 `codument/std/` 与 `codument/workflows/` 标准文件
- 新 archive、decisions、memory、spec registry 所需的读取兼容逻辑

迁移规则：

- 如果 `codument/product.md` 存在且 `codument/attractors/product.md` 不存在，可复制生成 attractor；如果 attractor 已存在，不覆盖。
- 如果 `codument/project.md` 存在且 `codument/attractors/project.md` 不存在，可复制生成 attractor；如果 attractor 已存在，不覆盖。
- `codument/tech-stack.md` 不再迁入标准入口，但应保留原文件，并可复制到 `codument/legacy/project-context/tech-stack.md` 作为旧项目证据。
- 缺失 `feature.json` 时创建默认关闭配置；已有配置只补缺失键，不改变已有值。
- 旧 Markdown specs 不强制转换为 XML。转换不确定时，应复制到 `codument/legacy/specs/...`，并保留原 `codument/specs/...` 供兼容读取。
- 如果实现已有临时备份目录，可以继续把升级前快照写入临时备份；但仍必须把不能安全转换的旧内容保留到 `codument/legacy/`。

`codument/legacy/` 的定位：

- 是 workspace 内长期可见的旧格式保留区。
- 不是新的事实真源。
- 不要求每次运行都重写。
- 不维护中心索引，避免多分支冲突。
- 文件路径应尽量镜像原始来源，便于人工追溯。

示例：

```text
codument/legacy/
  project-context/
    product.md
    project.md
    tech-stack.md
  specs/
    codument-core/
      spec.md
```

`codument/legacy/` 不替代正常兼容读取。也就是说，旧 spec 原位置仍应可被 `list/show/validate` 读取，legacy 副本只承担迁移证据和人工恢复作用。

## std/AGENTS.md 更新

`codument/std/AGENTS.md` 应改为：

- 要求开始任务前读取 `codument/attractors/` 下与任务相关的文件。
- 不引用固定文件名作为唯一入口。
- 明确 `codument/attractors/` 允许用户自定义添加 attractor。
- 如果 `codument/attractors/` 不存在，可兼容读取旧 `product.md`、`project.md`，但提示新项目应迁移。

示例表述：

```text
开始涉及产品、架构、工作流、知识同步、项目边界的任务前，先检查 `codument/attractors/`。
该目录是项目级吸引子集合，文件名由项目自定义。
不要假设只有固定的 product/project 文件。
```

## Feature Config

新增：

```text
codument/config/feature.json
```

默认：

```json
{
  "knowledgeSync": {
    "enabled": false,
    "targets": []
  },
  "projectMemory": {
    "enabled": false
  }
}
```

缺失文件时，行为等同默认关闭。

## Knowledge Sync Target

启用示例：

```json
{
  "knowledgeSync": {
    "enabled": true,
    "targets": [
      {
        "name": "main-docs",
        "root": "docs",
        "attractor": "codument/attractors/docs-knowledge.md"
      },
      {
        "name": "external-docs",
        "root": "/absolute/path/to/docs",
        "attractor": "codument/attractors/docs-knowledge.md"
      }
    ]
  },
  "projectMemory": {
    "enabled": true
  }
}
```

规则：

- `root` 可以是相对路径或绝对路径。
- 绝对路径必须来自配置，不应由 AI 自行推断。
- target 对应 VFS scheme 为 `knowledge://<target-name>/...`。

## docs-knowledge attractor

当用户启用 docs knowledge sync 时，可生成：

```text
codument/attractors/docs-knowledge.md
```

该文件应保持领域中立，不写死某个特定项目或 Web 分层。

应表达：

- 项目应定义 canonical knowledge 和 derived knowledge。
- 项目可按自身领域定义 implementation knowledge plane。
- 大文档可 single-file -> same-name-folder。
- `index` 类文件只做导航。
- 非 Markdown 资产应与正式知识正文区分。
- track 完成时如何判断是否同步 docs。

示例可以给多种项目类型：

- Web 应用：domain / ui / server。
- CLI 工具：domain / command / runtime。
- 数据平台：domain / pipeline / storage。
- 编译器：syntax / ir / runtime / diagnostics。

不得把任何一个示例当作默认强制结构。
