# Knowledge

## 问题本质

这不是单纯的路径替换，而是 Codex 产物模型变化：

- 旧模型：`~/.codex/prompts/codument-*.md`
- 新模型：`~/.codex/skills/codument-workflow/`

因此兼容工作至少涉及：

1. 模板源的引入与管理
2. Codex 生成器职责切换
3. init 输出与行为切换
4. upgrade-workspace 备份/升级目标切换
5. README 与升级文档切换

## 设计边界

- 本 track 只解决“Codex 新版 skill 模式兼容”
- 不处理 `yield-gap-loop` 协议实现
- 其他 AI coding 工具的命令生成方式不变
