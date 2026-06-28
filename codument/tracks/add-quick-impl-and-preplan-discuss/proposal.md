# Add Quick Implementation And Pre-plan Discuss

## 背景

Codument 已有中期任务的 track 和长期任务的 mission，但小改动缺少产品级入口。当前 `codument-discuss` 也只服务于已创建 track 的 phase 细化，无法在创建 track/mission 前帮助用户搜集上下文、判断任务尺度。

## 目标

- 新增 `codument-impl-quick`：用于基于 Codument 知识上下文和项目工程文件快速实现小变更。
- 将当前 phase 讨论能力迁移为 `codument-discuss-phase` operation/skill。
- 将 `codument-discuss` 重定义为创建 track/mission 前的上下文搜集与任务尺度分流。
- 新的 pre-plan discuss 不创建 discussion workspace；临时 analysis 只写入 `codument/analysis/`，并在每次 discuss 开始和转入 track/mission 前清理。
- `codument init` / `codument upgrade-workspace` 维护 `.gitignore` 规则：`codument/**/analysis` 与 `codument/**/reports`。

## 非目标

- 不新增 CLI 子命令；本轮只新增/重构 operation body 与 skill shell。
- 不让 quick impl 变成 mini-track；quick 默认不创建 track/proposal/behavior delta。
- 不持久化 pre-plan discussion 目录或 discussion registry。

## 影响范围

- `codument/std/operations/`
- `src/templates/codument/std/operations/`
- `src/templates/skills/`
- `src/templates/manifest.ts`
- `src/cli/commands/init.ts`
- `src/cli/commands/upgrade-workspace.ts`
- template/upgrade 测试

## 成功判据

- `codument-impl-quick`、`codument-discuss`、`codument-discuss-phase` 都有对应 operation body 与 skill shell。
- `codument-discuss` 明确使用 `codument/analysis/`，且开始/转入 plan 前清理。
- `codument-impl-quick` 明确可在发现稳定结构/工程知识时提示写入 `codument/modeling` 或 `codument/engineering`。
- init/upgrade 会在存在 `.gitignore` 时补齐 `codument/**/analysis` 与 `codument/**/reports`。
- `bun run check` 通过。
