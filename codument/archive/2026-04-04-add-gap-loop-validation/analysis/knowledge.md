# Knowledge

## 设计意图

`yield-gap-loop` 不是一次性的 review 协议，而是一个父层编排语义：

1. 当前实现 agent 完成当前 scope
2. 当前 agent 在确认点结束，不继续本地校验
3. 父层 fresh-spawn `/codument:gap-loop`
4. gap-loop 子代理执行：
   - 读取目标与背景
   - 生成 gap report
   - 更新 plan/spec/design（必要时）
   - 修正实现
   - 返回结构化 XML
5. 父层根据返回结果决定：
   - `NO_GAP` -> 完成当前 confirm
   - `FIX_APPLIED` -> 再次 fresh-spawn gap-loop 复检
   - `BLOCKED` -> 停止并等待用户输入

## 与现有体系的关系

- `yield-human-confirm` 保留不变
- `yield-ai-confirm` 整体删除
- `<confirm>` 继续作为唯一确认挂载点，不新增平行 XML 元素
- `validation_mode` 与 `validation_granularity` 记录在 `plan.xml` 的 `<metadata>` 中，用于在创建 track 时保留用户选择

## 工具兼容策略

为了兼容 Codex、Claude Code、OpenCode：

- 核心 gap-loop 提示词保持工具无关
- 各命令生成器提供薄 wrapper，负责：
  - 使用各自工具的 fresh-subagent 能力
  - 保证每轮 gap-loop 都是新子代理
  - 解析统一的 XML 返回结果
  - 在 `FIX_APPLIED` 时由父层重新拉起下一轮
