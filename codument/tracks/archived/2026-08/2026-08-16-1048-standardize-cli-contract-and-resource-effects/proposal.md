# 变更：standardize-cli-contract-and-resource-effects

## 背景和动机

Codument 已经用嵌套命令树统一了命令发现、帮助与分发，但叶命令仍只接收裸 `string[]`，输出与退出状态由各 handler 自行处理，缺少统一的上下文、结果、输入 schema 和文档契约。随 CLI 发布的模板、skills、operations 与 KindDefinitions 则依赖生成式 `src/templates/manifest.ts`，源码运行和编译产物没有共享一个可替换的资源边界。

同时，发布资源只读访问与用户 workspace 写入属于不同 authority。若共用一个笼统文件系统抽象，会让发布资产读取和 workspace mutation 的权限、路径语义与测试替身彼此污染。

## 目标

- 保留现有嵌套命令树，为所有叶命令建立统一的 `CommandContext`、`CommandResult`、输入 schema 与文档协议。
- 让 CLI 入口统一构造上下文、执行 schema 校验、调用叶命令并呈现结构化结果。
- 建立只读 `ResourceEffect`，统一读取随 CLI 发布的 `codument/**`、`skills/**`、operations 与 KindDefinitions。
- 建立独立的可写 `WorkspaceEffect`，承接 init/upgrade 安装路径中的 workspace 与 skills mutation。
- 为同一 `ResourceEffect` contract 提供源码目录与 `Bun.embeddedFiles` 两种适配器。
- 构建时直接嵌入发布资源，删除生成式 `manifest.ts` 与对应生成步骤。

## 非目标

- 不改变现有命令路径、帮助短路语义或用户可见输出。
- 不在本 Track 重写各业务命令内部的领域处理器。
- 不把 workspace 中的 Track、Mission、Decision 等可写资源纳入只读发布资源 Effect。
- 不引入新的公开 manifest schema，也不改变 KindDefinition 的业务格式。

## 成功判据

- 注册表中的每个叶命令都具备完整的 context/result/schema/doc 协议，协议完整性由递归测试守护。
- `-h/--help` 仍在 schema 与 handler 执行前短路，且所有现有命令行为回归通过。
- source adapter 与 embedded adapter 对同一逻辑路径返回一致目录、文件和文本内容。
- init/upgrade 通过只读资源 Effect 读取发布资产，通过 workspace Effect 写入目标目录。
- `templates`、`skills`、`std/operations`、`std/kinds` 都能由发布资源 Effect 访问。
- `src/templates/manifest.ts` 与 `scripts/gen-template-manifest.ts` 不再存在，构建产物仍可在空临时目录完成 init。
