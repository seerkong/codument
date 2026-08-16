# 对齐模板指令与资源 CLI

## 背景

Halfcode KindDefinition、版本化 XNL scaffold 和资源生命周期 CLI 已经成为 Codument 的结构 authority，但 `src/templates/` 中仍混有旧 XML/CDT 迁移口径、连字符属性拼法和人工状态写回说明。它们会让新安装的 operation/skill 在当前资源系统上生成错误 XNL，或绕过已经存在的原子 CLI 命令。

## 目标

- 当前 authoring 文档只使用无前缀 XNL 与 snake_case 属性。
- Track/Mission 状态、task 状态、TrackLink 绑定和 gap round 统一调用现有 CLI。
- 普通 operation/method 不再承载旧 `plan.xml`、`cdt:`、wave 文件等迁移教程；历史口径只留在 compat/migrate/spec 的明确兼容章节。
- 修正 skill shell、目录 README 和 workflow 说明中与当前资源体系不一致的文字。
- 扩展 `codument std lint`，在模板发布前阻止同类旧口径回流。

## 非目标

- 不把 proposal、design、Decision、Acceptance 或业务实现改成程序生成。
- 不新增统一 manifest request schema。
- 不改变 legacy 资源的读取与迁移能力。
- 不在本 Track 引入 Track/Mission scheduler runner；AI 仍按已校验的 Schedule 选择 ready 节点。

## 验收

- `src/templates` 的普通 authoring/operation/method 不再教授 `cdt:`、`child-mode`、`verify-round`、XML TrackLink 等当前错误写法。
- impl-track 的每次 task 状态变化都明确使用 `codument track task transition`。
- impl-mission 的 candidate 激活、绑定和任务写回明确使用现有 CLI，当前示例为 XNL。
- `codument std lint src/templates/codument/std` 能捕获代表性的旧属性、XML current-authoring 示例和直接生命周期写回措辞。
- 模板、CLI 测试、构建与 `git diff --check` 通过。
