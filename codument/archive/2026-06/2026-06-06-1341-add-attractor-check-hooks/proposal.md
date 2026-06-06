# 变更：新增 Attractor Check Hook

## 背景和动机 (Context And Why)
Codument 已经有 `codument/attractors/` 作为项目级吸引子集合，也要求代理在任务开始前读取相关吸引子。但当前机制主要依赖提示词约束，执行过程中经常需要用户手动提醒模型检查刚才的 track 设计、phase 结果或归档改动是否符合吸引子。

同时，不同生命周期节点需要检查的吸引子组合不同。开发阶段通常只需要 `project.md` 和 `product.md`，而归档前或 docs knowledge sync 前可能需要文档相关吸引子。现有 `<confirm>` 可以作为显式门控，但不能表达“用指定吸引子组合做校验”。

## “要做”和“不做” (Goals / Non-Goals)
**目标:**
- 在 `codument/config/` 下新增 attractor profile 配置，允许命名组合多个 attractor。
- 定义默认 profile：`codument/attractors/project.md` + `codument/attractors/product.md`。
- 在 `plan.xml` 中新增类似 `<confirm>` 的显式 hook 节点，用于触发吸引子校验。
- 支持在 track 设计后、phase 前后、task 前后、归档前等位置配置不同 profile。
- 支持配置校验结果策略：立即修正、人工确认后修正、阻塞等待用户。
- 允许 hook 内复用现有 `<confirm>`，让校验后仍能进入人工确认或其他确认协议。
- 新增 `codument/config/operation-hooks.xml`，为尚未 `plan.xml` 化的 Codument 命令/skill 提供 workspace 级稀疏 hook 配置入口，只显性化用户需要配置的命令和节点。
- 新增 `revise-track` 命令/skill，用于在 implement、gap-loop、archive 准备或其他非线性工作中修订现有 track 产物。
- `revise-track` 支持 operation hook 和 attractor profile，默认可在修订前执行吸引子校验。

**非目标:**
- 不替代现有 `<confirm>` 协议。
- 不要求所有 track 或所有 phase 默认强制执行吸引子校验。
- 不把所有 attractor 文件固定为 `project.md` / `product.md` 两个名字。
- 不要求把 `track`、`archive`、`verify` 等所有 Codument 命令预先展开成一个完整 XML 工作流。
- 不替代 `implement`、`gap-loop` 或 `archive`；`revise-track` 只负责修订 track 自身产物。
- 不允许 `revise-track` 把修订依据写到 track 目录外部并作为必要上下文。
- 不在本 track 中定义具体业务项目的吸引子内容。

## 变更内容（What Changes）
- 新增 `codument/config/attractor-profiles.json` 配置约定。
- 新增 `plan.xml` 节点，例如：
  ```xml
  <attractor-check profile="default" when="after" status="TODO" executor="subagent">
    <result-policy on-gap="fix-immediately" />
  </attractor-check>
  ```
- 支持嵌套确认策略，例如：
  ```xml
  <attractor-check profile="docs" when="before" status="TODO" executor="fresh-subagent">
    <result-policy on-gap="confirm-before-fix">
      <confirm protocol="yield-human-confirm" when="after" status="TODO" />
    </result-policy>
  </attractor-check>
  ```
- 新增 `codument/config/operation-hooks.xml` 配置约定，用于给 `track`、`archive`、`revise-track` 等没有独立 `plan.xml` 的命令/skill 配置 hook：
  ```xml
  <operation-hooks version="1">
    <operation name="track">
      <hook id="track-design-attractor-check" point="after-design" status="TODO">
        <attractor-check profile="default" when="after" status="TODO" executor="subagent">
          <result-policy on-gap="confirm-before-fix">
            <confirm protocol="yield-human-confirm" when="after" status="TODO" />
          </result-policy>
        </attractor-check>
      </hook>
    </operation>
    <operation name="archive">
      <hook id="archive-docs-attractor-check" point="before-archive" status="TODO">
        <attractor-check profile="docs" when="before" status="TODO" executor="fresh-subagent">
          <result-policy on-gap="block" />
        </attractor-check>
      </hook>
    </operation>
    <operation name="revise-track">
      <hook id="revise-track-before-attractor-check" point="before-revise" status="TODO">
        <attractor-check profile="default" when="before" status="TODO" executor="subagent">
          <result-policy on-gap="confirm-before-fix">
            <confirm protocol="yield-human-confirm" when="after" status="TODO" />
          </result-policy>
        </attractor-check>
      </hook>
    </operation>
  </operation-hooks>
  ```
- 新增 `revise-track` 命令/skill：
  - 输入：track id 或可唯一匹配的 track 描述、修订原因、需要修订的内容。
  - 行为：读取目标 track 的 proposal、design、spec delta、plan、analysis、decisions，并按请求修订对应文件。
  - 默认前置：如 `operation-hooks.xml` 配置了 `revise-track/before-revise`，先执行对应 attractor check 或 confirm。
  - 输出：列出修订过的 track 文件、修订原因、是否需要继续 implement/gap-loop/archive。
- 更新 `plan-xml-spec.md`、`protocols.md`、`workflow.md`、`track.md`、`implement.md`、`execute-wave.md`、`gap-loop.md`、`archive.md`、`AGENTS.md` 及生成的 lifecycle skill 文案。
- 增加 CLI/测试支持，验证 profile 解析、plan XML 节点格式和工作流提示词约束。

## 影响范围（Impact）
- 受影响的功能规范：`codument-core`
- 受影响的标准文档：`codument/std/AGENTS.md`、`codument/std/plan-xml-spec.md`、`codument/std/protocols.md`、`codument/std/workflow.md`
- 受影响的提示词：`src/prompts/*.md`
- 受影响的 CLI：初始化/升级配置、validate、可能的 helper 解析逻辑
- 受影响的测试：track 创建、workspace upgrade、plan XML validation、lifecycle skill generation
