# Design: build-versioned-cli-foundation

## 命令边界

`CommandDefinition` 是 CLI 命令发现、帮助和执行的单一真源，至少包含 path、summary、usage、options、children 与 handler。入口只解析全局参数、解析命令路径、执行 help gate，然后调用 handler。

子命令可以继续复用现有 command function，但 registry 必须拥有其路径和 help。测试直接遍历 registry，保证新增命令无法绕过 help 回归。

## Kind registry

内部 registry 记录：

- kind 名称；
- 当前 `apiVersion`；
- format；
- 允许创建的 stage；
- scaffold writer；
- 后续 migration registry 的连接点。

它是 TypeScript 内部 authority，不是 workspace 中新的公开 manifest，也不要求用户提交 `apiVersion/kind` YAML。

## Scaffold 契约

```text
codument track create <id> --stage pending|active
codument mission create <id> --stage pending|active
```

- stage 必须显式提供；archived 只能由 archive 命令进入。
- target 已存在则失败，不提供覆盖选项。
- Track 写 `track.xml`、`proposal.md`、`design.md`；Mission 对应写 `mission.xml`、`proposal.md`、`design.md`。
- XML 骨架结构完整但语义内容允许处于规划中；plan skill 在容器内填充内容并最终 validate。
- 不创建空 decision forest。

## Bootstrap

本 track 和所属 mission 创建时 scaffold 尚不存在，因此作为唯一一次手工 bootstrap。实现后测试以相同 ID/stage 在临时 workspace 生成骨架，并以 validator 反向验证结构契约。
