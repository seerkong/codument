你在一个已初始化 Codument 的干净工作区。请严格遵循 ./AGENTS.md，并使用 codument-plan-track 为 codument/attractors/product.md 描述的业务应用创建一个实现 Track。

要求：

1. 自动推进，不向用户提问；对可安全默认的事项直接作出保守决定。
2. 必须生成 BehaviorPatch XNL。
3. Modeling 已开启：必须在同一 Track 的 modeling_deltas/<plane>/<context>.xnl 中生成 delta，至少覆盖 domain、backend、surface，并遵守 modeling-node-schema.md 与 xnl-format.md。
   - **优先用 scaffold 生成合法骨架再填充**：对 entity/object/state-machine/enum/module 调用 `codument modeling scaffold <kind> <name> --plane <plane> --context <ctx> --track <track_id>`（entity 可加 `--fields id:string,...`，state-machine/enum 可加 `--states a,b`），然后只改 TODO 占位符，不要从零手写 XNL。
   - **校验必须用 --deltas**：运行 `codument modeling validate --deltas <track_id>`，不要运行不带 --deltas 的 `codument modeling validate`（后者校验 registry，会漏掉 delta 错误）。
4. Engineering 已开启：必须在同一 Track 的 engineering_deltas/<plane>/<category>/<topic>.xnl 中生成 delta，至少包含 howto、rules、reference 或 code-map 中的三类长期工程知识，并遵守 engineering-node-schema.md。
   - **优先用 scaffold**：对 rule/howto/reference/code-map/overview 调用 `codument engineering scaffold <kind> <name> --plane <plane> --category <cat> --topic <topic> --track <track_id>`，然后只改 TODO 占位符。
   - **校验必须用 --deltas**：运行 `codument engineering validate --deltas <track_id>`。
5. proposal.md、design.md 与 track.xnl 必须说明实现计划如何使用 Modeling 与 Engineering。
6. 使用当前 Track、BehaviorPatch 和配置 Kind 的 apiVersion，不得新建 legacy XML authority。

执行时分批落盘：先用 CLI 创建版本化骨架，再按 Behavior、Modeling、Engineering、proposal/design、track.xnl 的顺序逐批完善；每批写完后观察已落盘文件，并用 `codument validate <track_id> --strict`、`codument modeling validate --deltas <track_id>`、`codument engineering validate --deltas <track_id>` 校验（注意必须带 --deltas 或 <track_id>）。

完成后列出 Track id、lifecycle stage、Modeling delta 和 Engineering delta 文件。
