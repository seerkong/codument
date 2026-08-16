# Design: add-stream-pipeline-agent-e2e

## Layout

`e2e/project-implementation/` 是共享套件，runner 位于套件根目录；`stream-pipeline-ai-agent/` 是具体任务叶子，以 `request.md` 保存原始需求，并以 `verify.sh` 保存任务专属验收。

## Execution

1. runner 创建干净的临时 Git 工作区，并用待测 Codument CLI 执行 `init`。
2. 原始 Markdown 被逐字复制进工作区，同时作为 Agent prompt 的业务需求正文；runner 只在正文前增加“使用 Codument 直接完成开发”的执行要求。
3. 真实 Agent 在单次会话中自行选择 Codument Track 操作并持续实现到完成。
4. Agent 退出后，verifier 作为独立观察者检查 Track、文件、依赖、RxPY 主线和 pytest。

## Result Contract

运行结果必须同时满足：原始需求副本未漂移、至少一个 Track 达到 completed、`codument validate --strict` 通过、规定的 Python 文件齐全、项目声明 OpenAI/RxPY/pytest、源码存在 Observable/Subject/operators 主线且测试全部通过。日志和工作区默认保留，便于复现 Agent 行为。
