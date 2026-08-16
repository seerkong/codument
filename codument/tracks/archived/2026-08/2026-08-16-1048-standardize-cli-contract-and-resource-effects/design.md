# Design: standardize-cli-contract-and-resource-effects

## 1. 命令叶协议

嵌套 `CommandDefinition.children` 继续作为命令树 authority。分支节点只负责导航与帮助，叶节点必须声明：

```ts
interface CommandContext {
  path: readonly string[];
  args: readonly string[];
  positional: readonly string[];
  options: Readonly<Record<string, string | boolean>>;
  runtime: CommandRuntime;
}

interface CommandResult {
  code: number;
  message?: string;
  data?: unknown;
}
```

每个叶节点还必须持有 `schema` 与 `doc`。`schema` 负责将原始叶参数解析为上下文并可执行命令级校验；`doc` 统一承载 summary、usage、examples 与 options，供递归 help 使用。已有业务 command function 先通过适配器接入该协议，保持现有 stdout 行为；新命令可以直接返回 `CommandResult`，由入口统一渲染。

分发顺序固定为：解析命令路径 -> help gate -> 构造 context -> schema parse/validate -> run -> render result。help gate 不创建 runtime，不触发 schema，也不调用叶命令。

## 2. Effect authority 边界

### ResourceEffect

`ResourceEffect` 只表示随 Codument 发布的不可变资源：

```ts
interface ResourceEffect {
  stat(path: string): Promise<ResourceEntry | undefined>;
  readDirectory(path: string): Promise<readonly ResourceEntry[] | undefined>;
  readText(path: string): Promise<string | undefined>;
}
```

逻辑路径始终相对发布资源根，例如 `codument/std/operations/impl-track.md`、`codument/std/kinds/Track.xnl`、`skills/codument-impl-track/SKILL.md`。接口不提供 write/remove/move，拒绝绝对路径与 `..` 逃逸。

### WorkspaceEffect

`WorkspaceEffect` 表示一个明确根目录下的可写文件系统能力，提供安装所需的 exists/read/write/mkdir/remove 等操作。workspace 和每个 agent skills 目录分别创建 effect；发布资源路径不会被当成 workspace 路径写回。

init/upgrade 安装器接收 `ResourceEffect`、workspace `WorkspaceEffect` 与 skills `WorkspaceEffect`。安装策略仍由安装器决定，Effect 只执行 I/O，不拥有覆盖规则。

## 3. Source 与 embedded 适配

- source adapter 以 `src/templates` 为根读取真实目录，供 `bun run src/cli/index.ts`、测试与 npm 源码入口使用。
- embedded adapter 从 `Bun.embeddedFiles` 建立逻辑路径索引，供单文件编译产物使用。
- runtime factory 检测带固定资源前缀的 embedded files；存在时选择 embedded adapter，否则选择 source adapter。
- 两个 adapter 的排序、目录语义、缺失返回值和路径校验完全一致，由 contract test 验证。

## 4. 构建资源嵌入

新增 TypeScript 构建脚本递归收集 `src/templates` 文件，并通过 Bun `type: "file"` import 将每个文件嵌入编译产物。asset name 使用稳定的 `codument-resource/` 前缀，embedded adapter 只消费该命名空间。

发布资源不再先展开为 TypeScript 文本 import 数组，因此删除：

- `src/templates/manifest.ts`
- `scripts/gen-template-manifest.ts`
- `gen:templates` package script

KindDefinition 的编译期投影仍可由现有 Kind registry 维护；其 XNL authority 同时作为 `codument/std/kinds/**` 发布资源经 `ResourceEffect` 可读。本 Track 不把 Kind registry 的领域 API 改成 workspace 文件读取。

## 5. 验证策略

- 命令协议：递归检查所有叶节点的 `run/schema/doc`，验证 context 构造、result render 与 help 无副作用。
- Effect contract：同一组目录/读取/缺失/路径逃逸用例同时运行 source 与内存 embedded adapter。
- 资源覆盖：断言模板、skills、operations、KindDefinitions 均存在。
- 安装回归：init/upgrade 测试继续验证覆盖与保留策略，并断言读写经各自 Effect。
- 编译验证：构建单文件 CLI，在空临时目录运行 init，验证 embedded 资源完整落盘。
