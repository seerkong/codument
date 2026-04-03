# Findings

## Confirm 协议现状

- 当前规范与提示词同时支持 `yield-human-confirm` 和 `yield-ai-confirm`
- `yield-ai-confirm` 在文档、plan-xml-spec、implement、execute-wave、track 创建提示词中均有引用
- 现有 `<confirm>` 已具备 phase / task 级挂载能力，适合直接承载新协议

## 新工作流约束

- `yield-gap-loop` 的核心语义不是“本 agent 内继续校验”，而是“当前 agent 结束，把控制权交回父层，再由父层 fresh-spawn 新 agent”
- gap-loop 子代理在同一新上下文里完成“gap 分析 + gap 修正”
- gap-loop 子代理结束后，只返回结构化 XML 结果，由父层决定继续、复检或阻塞

## 背景上下文规则

- 无论是否传入 `--background`，当前 track 目录下的 `reports/` 都必须作为 gap-loop 的背景上下文
- `--background` 用于补充 track 外背景文件，典型场景是 `.tmp/*.md`

## 命名结论

- 新协议名：`yield-gap-loop`
- 新命令名：`/codument:gap-loop`
- gap-loop 返回状态：`NO_GAP`、`FIX_APPLIED`、`BLOCKED`
