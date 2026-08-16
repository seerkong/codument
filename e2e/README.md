# Codument E2E Tasks

`e2e/` 的第一层目录表示一类 E2E 套件；套件下的每个叶子目录是一条独立、可单独运行的具体任务。任务正文必须放在叶子目录；共享 runner 放在套件目录，任务专属验收代码放在对应叶子目录。

分阶段 Modeling/Engineering 任务包含：

- `product.md`：注入临时工作区的业务需求。
- `plan.md`：交给 coding agent 的规划提示词。
- `implement.md`：交给 coding agent 的实现提示词。

套件目录保存共享 runner、评分代码和说明。新增具体任务时创建新的叶子目录，不要把任务提示词分支堆入 runner。默认保留真实运行工作区以便排障；自动 smoke 应设置 `SKIP_AGENT=1 KEEP=0`。

完整项目实现任务统一使用 `request.md` 表示原始需求、`verify.sh` 表示该任务的独立验收，文件名不重复目录中的任务 ID。

当前任务：

- `modeling-engineering/{todo,ecommerce,blog}/`：用三个不同业务任务验证 Track 规划、Modeling/Engineering delta、实现与质量评分的完整链路。
- `project-implementation/stream-pipeline-ai-agent/`：把原始 Python AI Agent 需求交给单次真实 coding-agent 会话，验证 Codument 使用、完整实现与 pytest。
