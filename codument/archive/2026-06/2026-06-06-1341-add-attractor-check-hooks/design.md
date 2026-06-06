## 上下文
`codument/attractors/` 当前提供项目级长期方向控制，但它主要通过“代理应阅读相关吸引子”的规范生效。这个约束不够显式，也没有进入 `plan.xml` 的状态机，因此执行阶段容易漏读或漏校验。

现有 `<confirm>` 已经证明了一种可用形态：在 XML 计划中显式放置带 `when` 和 `status` 的门控节点。新的吸引子校验能力应复用这个模式，但不应把吸引子校验塞进 `<confirm>`，因为二者职责不同：

- `<confirm>`：处理人工确认或 gap-loop 控制权切换。
- `<attractor-check>`：处理选定 attractor profile 对当前 scope 的一致性校验。

## 方案概览
1. 新增 Attractor Profile 配置
   - 文件：`codument/config/attractor-profiles.json`
   - 默认 profile 在配置缺失时仍可生效。
   - profile 内引用 attractor 文件路径，初期不强制引入新的 VFS scheme。

2. 新增 `plan.xml` hook 节点
   - 推荐节点名：`<attractor-check>`
   - 可放置于 track、phase、task 作用域。
   - 属性：
     - `profile`: profile 名称，默认 `default`
     - `when`: `before | after | both`
     - `status`: `TODO | IN_PROGRESS | DONE | BLOCKED | CANCELLED`
     - `executor`: `main-agent | subagent | fresh-subagent`，默认 `subagent`
   - 作用域默认由父节点推断。

3. 新增结果策略子节点
   - 推荐节点名：`<result-policy>`
   - 推荐属性：
     - `on-gap="fix-immediately"`：可安全修复时立即修复并复检
     - `on-gap="confirm-before-fix"`：先运行嵌套 `<confirm>`
     - `on-gap="block"`：发现 gap 即阻塞等待用户

4. 结构化结果
   - attractor check executor 应返回结构化结果，至少包含：
     - `PASS | GAP | BLOCKED`
     - profile 名称
     - checked scope
     - summary
     - gaps 列表
     - recommended actions

5. Workflow 接入点
   - track 创建：设计/计划完成后可插入 design-level `profile="default"` 校验。
   - implement：phase/task 上的 hook 按 `when` 执行。
   - execute-wave：波次完成后按 phase hook 执行。
   - gap-loop：可读取 hook 结果作为目标偏差上下文，但不得无限嵌套触发 competing checks。
   - archive：归档前可使用 docs/profile 校验 archive、docs sync、decision promotion 是否符合吸引子。

6. Workspace 级稀疏 operation hook overlay
   - `plan.xml` 只覆盖某个 track 的实现计划，不能直接表达 `track`、`archive` 等 Codument 命令/skill 自身的内部阶段。
   - 新增 `codument/config/operation-hooks.xml`，用于给没有独立 `plan.xml` 的命令/skill 挂 hook。
   - 该文件必须是稀疏 overlay：只写需要显性化配置的 command 和 point，不预先列出所有 Codument 子命令。
   - 该 overlay 复用同一套 hook DSL：`<attractor-check>`、`<result-policy>`、`<confirm>`。
   - 使用 operation 命名而不是 lifecycle 命名，因为它也覆盖 `revise-track` 这类非生命周期修订命令。

7. `revise-track` command / skill
   - 新增 `revise-track`，用于在 implement、gap-loop、archive 准备或其他非线性工作中修订现有 track。
   - 目标是把用户原本手动要求补充到 track 文件夹的操作显性化，并统一走 track 自身产物。
   - `revise-track` 不创建新 track，不替代 implement/gap-loop/archive，只修改目标 track 的 proposal、design、spec delta、plan、analysis、decisions 等相关文件。
   - `revise-track` 应读取 `operation-hooks.xml` 中 `operation name="revise-track"` 的配置。
   - 推荐默认 hook point：
     - `before-revise`: 修订前，通常运行 attractor check。
     - `after-revise`: 修订后，可运行 confirm 或 gap report。
   - 修订后应报告修改过的文件、修订原因、是否需要回到 implement/gap-loop/archive。

## 示例配置
```json
{
  "profiles": {
    "default": {
      "description": "默认项目方向校验",
      "attractors": [
        "codument/attractors/project.md",
        "codument/attractors/product.md"
      ]
    },
    "docs": {
      "description": "归档和文档知识同步校验",
      "attractors": [
        "codument/attractors/product.md",
        "codument/attractors/docs-knowledge.md"
      ]
    }
  }
}
```

## 示例 plan.xml 片段
Implementation phase using the default attractor profile:

```xml
<phase id="P2" name="Implementation workflow" status="TODO">
  <goal>Implement phase-level attractor checks.</goal>
  <attractor-check profile="default" when="after" status="TODO" executor="subagent">
    <result-policy on-gap="fix-immediately" />
  </attractor-check>
  <tasks>
    ...
  </tasks>
</phase>
```

Archive readiness phase using a docs-specific attractor profile and nested human confirmation:

```xml
<phase id="P4" name="Archive readiness" status="TODO">
  <goal>Validate archive and docs sync behavior.</goal>
  <attractor-check profile="docs" when="after" status="TODO" executor="fresh-subagent">
    <result-policy on-gap="confirm-before-fix">
      <confirm protocol="yield-human-confirm" when="after" status="TODO" />
    </result-policy>
  </attractor-check>
  <tasks>
    ...
  </tasks>
</phase>
```

## 示例 operation hook overlay 片段
文件：`codument/config/operation-hooks.xml`

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

    <hook id="track-plan-confirm" point="after-plan" status="TODO">
      <confirm protocol="yield-human-confirm" when="after" status="TODO" />
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

Each operation owns a small list of stable hook points. The configuration only uses points that need explicit behavior. Missing operation entries or missing points mean "run the existing default workflow without extra hook waits."

## `revise-track` workflow
1. Resolve target track.
   - Use explicit track id when provided.
   - If user gives an ambiguous description, list candidates and ask for confirmation.
2. Read current track context.
   - `proposal.md`
   - `design.md` and `design/` if present
   - `spec_deltas/**`
   - `plan.xml`
   - `analysis/**`
   - `decisions.md` and `decisions/` if present
3. Execute configured `before-revise` hooks from `operation-hooks.xml`.
   - A common default is `profile="default"` attractor check before changing the track.
   - If the hook blocks, do not modify track files.
4. Apply the requested revision.
   - Update the minimal set of track files.
   - Keep track artifacts self-contained.
   - Record findings or knowledge updates in `analysis/` when useful.
   - Add pending decisions to `decisions.md` when the revision raises unresolved choices.
5. Execute configured `after-revise` hooks if present.
6. Report changed files and recommended next command.

## 影响范围与修改点（Impact）
- `src/prompts/plan-xml-spec.md` and `codument/std/plan-xml-spec.md`: document the new XML node.
- `src/prompts/protocols.md` and `codument/std/protocols.md`: define Attractor Check Hook protocol behavior.
- `src/prompts/track.md`: allow track creation to insert attractor checks and profile metadata.
- `src/prompts/implement.md` and `src/prompts/execute-wave.md`: run hooks during phase/task execution.
- `src/prompts/gap-loop.md`: clarify interaction with fresh child agents and avoid nested competing loops.
- `src/prompts/archive.md`: support archive-readiness profile checks before final archive.
- Command/skill prompts without their own `plan.xml`: read `codument/config/operation-hooks.xml` and execute configured points only when present.
- New `revise-track` command and generated skill: revise existing track artifacts and support operation hooks.
- `src/cli/commands/init.ts`: optionally seed attractor profile config.
- `src/cli/commands/upgrade-workspace.ts`: create missing default profile config without overwriting user edits.
- `src/cli/commands/validate*`: validate hook shape, `operation-hooks.xml` shape, known operation points, and referenced profiles where practical.
- `src/cli/commands/revise-track.ts` or equivalent: implement the new revision command if CLI support is in scope.
- Skill generation tests: ensure generated lifecycle skills mention attractor checks.

## 决策摘要
- 不创建 `decisions.md`，因为本 track 的 initial design follows the user's explicit requested direction.
- Key design choice: use a new `<attractor-check>` hook instead of overloading `<confirm>`.
- Key design choice: place reusable profile config under `codument/config/`.
- Key design choice: add `codument/config/operation-hooks.xml` as a sparse workspace hook overlay for operation-level hooks that do not belong inside a specific track `plan.xml`.
- Key design choice: add `revise-track` as the explicit way to amend track artifacts during non-linear work.

## 风险 / 权衡
- Risk: XML plan schema becomes too broad.
  - Mitigation: keep `<attractor-check>` small and delegate post-check behavior to `<result-policy>` and existing `<confirm>`.
- Risk: profile config becomes another source of truth.
  - Mitigation: profile config only groups attractor files; attractor content remains in `codument/attractors/`.
- Risk: agents may start nested checks or loops.
  - Mitigation: protocols should define parent orchestration ownership rules similar to `yield-gap-loop`.
- Risk: missing custom attractors can block execution unexpectedly.
  - Mitigation: default profile works without config, and validation should report missing profile files clearly.
- Risk: `operation-hooks.xml` becomes a second full workflow language.
  - Mitigation: keep it sparse and point-based; only command name, point name, hook status, and reusable hook DSL are allowed.
- Risk: `revise-track` becomes a backdoor for broad uncontrolled rewrites.
  - Mitigation: require minimal track-local edits, report changed files, and use operation hooks for pre-revision attractor checks.

## 兼容性设计
- Existing workspaces without `codument/config/attractor-profiles.json` use an implicit `default` profile.
- Existing plans without `<attractor-check>` keep current behavior and do not get implicit extra waits.
- Existing `<confirm>` semantics remain unchanged.
- Existing attractor files stay valid; custom attractor files remain supported.
- Existing workspaces without a hook overlay file keep current command/skill behavior.
- Existing commands only execute overlay hooks for explicitly configured operation points.
- Existing ad hoc manual revision remains possible, but `revise-track` becomes the preferred explicit workflow.

## 迁移计划
1. Add docs/spec support for attractor profiles and hooks.
2. Add config creation and upgrade behavior.
3. Add validation support for hook syntax and profile references.
4. Add validation support for `operation-hooks.xml` syntax.
5. Add `revise-track` command/skill guidance and implementation.
6. Update prompts and generated skills to execute the hook.
7. Add tests covering default profile fallback, custom profiles, nested confirm policy, sparse operation hooks, `revise-track`, and archive/docs profile usage.

## 待解决问题
- Decide whether the config root should be `{ "profiles": ... }` or a direct profile map.
- Decide whether executor values should be normative in the first version or prompt-only hints.
- Decide whether structured check reports should be persisted under `reports/` or inside plan metadata.
- Decide whether `revise-track` should be implemented as CLI command, generated skill only, or both in the first release.
