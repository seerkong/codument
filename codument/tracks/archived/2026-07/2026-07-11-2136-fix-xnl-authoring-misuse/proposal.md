# 变更：修正历史 XNL authoring 误用

## 背景和动机 (Context And Why)

近期连续暴露出两类 XNL 使用问题：

1. 普通节点属性误写进 metadata，而不是 `{}` attributes。
2. 单例语义子节点误写进 `[]` array body，而不是 `()` extend block。

这说明问题不只是某个 DSL 的局部写法，而是项目里 XNL authoring 规范、示例、测试资源和生成逻辑需要统一收敛。新 track 用来追踪清理历史误用、补充规范和防回归测试。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- 完成 XNL metadata/attributes 与 extend/array 的规范化说明。
- 排查并修正 std、templates、fixtures、tests 中非系统级属性误放 metadata 的情况。
- 排查并修正 DSL 示例中单例语义子节点误放 `[]` 的情况。
- 把当前 `codument/std` 与 `src/templates/codument/std` 通过 build/upgrade dogfood 同步。
- 添加防回归测试或 lint，避免后续再次误写。

**非目标:**
- 不改变 XNL parser 的语法。
- 不把 XML track/mission/task 属性纳入 XNL 修正范围。
- 不迁移历史 archive 中已归档内容，除非它们作为模板或测试资源参与当前行为。

## 变更内容（What Changes）

- 文档：
  - `xnl-format.md` 增加 `()` vs `[]` 语义分工。
  - modeling/engineering/decision DSL 示例统一使用 `{}` attributes。
- 测试资源：
  - 将 canonical showcase/validate fixtures 迁移到 attributes。
  - 仅保留少量 legacy metadata fixture，明确用于兼容性测试。
- 测试：
  - 新增/调整测试，断言普通属性优先落 attributes。
  - 新增 XNL DSL shape 测试，断言单例槽位在 extend，child decision 在 body array。
- Dogfood：
  - build 后运行 `codument upgrade-workspace`，让当前项目 `codument/std` 同步模板修正。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`codument-core`
- 受影响的代码/文档：
  - `src/templates/codument/std/spec/xnl-format.md`
  - `src/templates/codument/std/spec/*node-schema.md`
  - `codument/std/spec/*`
  - `test/resources/modeling-*`
  - `test/resources/engineering-*`
  - `test/cli/modeling/*`
  - `test/cli/engineering/*`
  - `codument/tracks/update-decisions-xnl/*`
