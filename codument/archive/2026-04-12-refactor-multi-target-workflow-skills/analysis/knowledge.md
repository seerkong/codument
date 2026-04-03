# Knowledge

## Current Target Landscape

- `codex`
  - 当前生成到 `~/.codex/skills/codument-workflow/`
  - 由 `src/cli/generators/codex.ts` 负责同步
- `sparrow`
  - 当前生成到 `.sparrow/skill/codument-workflow/`
  - 由 `src/cli/generators/sparrow.ts` 负责同步
- `claude`
  - 当前只生成 `.claude/commands/codument/*.md`
- `eidolon`
  - 当前只生成 `.eidolon/commands/codument/*.toml`
- `opencode`
  - 当前只生成 `.opencode/command/codument-*.md`

## Current Shared Source of Truth

- 生命周期 prompt 主体目前主要来自 `src/prompts/*.md`
- `src/skills/codument-workflow/` 已经是 Codex / Sparrow 的 skill 模板源
- 但 command 型 target 仍直接读取 `src/prompts/*.md` 并拼装 command 文件

## Design Direction Recorded For This Track

- 继续保留统一 skill 名称：`codument-workflow`
- 把生命周期步骤拆为 sub-skill，供 root skill 路由与 command wrapper 复用
- 用 target profile 显式表达：
  - skill 输出目录
  - 是否需要 manifest / agent config
  - 是否保留 command 入口
  - 子代理能力映射示例
- 对 gap-loop 来说，公共模板需要以“fresh child context”作为核心语义，而不是绑定某个具体 target 的 API 名
