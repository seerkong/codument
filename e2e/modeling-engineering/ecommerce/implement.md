你在一个已生成 Codument Track 的工作区，用户已经明确批准该 Track。请读取 ./AGENTS.md，以及 codument/tracks/pending 或 active 下唯一 Track 的 proposal.md、design.md、behavior_deltas、modeling_deltas、engineering_deltas，并使用 codument-impl-track 完成实现。

要求：

1. 实现一个最小但可运行的业务应用，包含 package.json 和 test 脚本。
2. 尽量提供 typecheck、lint、build 脚本。
3. 实现必须尊重 Modeling 中的事实源、状态机、模块、组件和端口边界。
4. 实现必须使用 Engineering delta 中的 howto、rules、reference、code-map 作为工程约束。
5. 分批写入代码，每批后运行轻量检查；完成后运行全部可用测试和 Codument 校验。
6. 将 Track 任务与根状态更新为 completed，并保留验证证据。

这是非交互 E2E：不要向用户提问；遇到可恢复偏差时自行修正并继续。
