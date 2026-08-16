# 变更：close-mission-execution-stop-points

## 背景和动机 (Context And Why)

用户的多次手动纠正（自动继续、连续执行、不频繁建 subagent、无隐式暂停、归档非交互）已让 `impl-mission` 主体进入连续执行模型，但 `src/templates` 里仍残留会令自主迭代中途停下的子流程 gate：

1. `plan-track` 的"待批准"门禁：track 创建后留在 `pending/` 等待批准，而 `impl-track` 只扫描 `tracks/active/`，mission 执行中新建的 track 无法被下一 ready action 拾取 → 停在"没有可实现的活跃 track"并等待用户指示。
2. questioning severity 默认 `light`：规划期问答预算会在执行期继续生效，mission 的 ready frontier 有未决问题就停下。
3. `impl-track` 失败/续跑分支默认 `ask-single-question-closed`：任务失败、门控失败、DAG 阻塞、ACTIVE 续跑都会停下来等用户选择。
4. delegated 提示词"完成即停"措辞残留，与 mission 主循环护栏不协调。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- mission/auto 语境下，`plan-track` 产出的候选 track 创建即激活（落 `tracks/active/`、回写 `TrackLink state="bound"`、写 bind report），不进入 pending 等待批准。
- 明确"规划期问答预算不构成执行期停点"：执行期未决决策按 `auto` 语义记录假设 + 保守默认后继续，除非显式配置确认 gate。
- `impl-track` 的 mission 子 track 语境：失败/门控/DAG 阻塞先尝试自动修复，无法自动修复时返回结构化结果给 `MissionApplier` 由 mission 裁决，不默认提问；续跑检测 auto 默认"继续"。
- 收敛 delegated 提示词："完成即停" → "完成即返回结果（stop 仅限子流程边界）"。
- 行为契约、模板、回归测试与 dogfood 工作区一致。

**非目标:**
- 不改变 `plan-track` 对用户直接对话场景的 pending/批准语义。
- 不删除 `cdt:HumanConfirm` / `cdt:GapLoop` / `cdt:AttractorCheck` 的显式 gate 语义。
- 不改 CLI 实现与 XNL parser。
- 不改变 mission 的 10-track checkpoint 语义。

## 变更内容（What Changes）

- `src/templates/codument/std/actions/impl-mission.md`：候选 track 激活规则 + 返回条件收紧。
- `src/templates/codument/std/actions/plan-track.md`：mission/auto 调用方上下文（直接落 active、门禁由 mission 层批准）。
- `src/templates/codument/std/spec/mission-xml-spec.md`：§8.1 候选激活语义 + 人工介入澄清。
- `src/templates/codument/std/protocols/questioning.md`：执行期 severity 继承规则。
- `src/templates/codument/std/actions/plan-mission.md`：默认 severity 建议 auto。
- `src/templates/codument/std/actions/impl-track.md`：§1.3/§1.4 候选激活、§3.0 auto 默认继续、§6.2 措辞、§8.0 mission 语境失败分支。
- `src/templates/codument/std/methods/dag-execution.md`：delegated 措辞收敛。
- `src/templates/codument/std/actions/archive-track.md`：mission 语境未完成 track 交还 mission 裁决。
- `codument/behaviors/codument-core.xml`：`mission-cybernetic-actors` 新增三个 case。
- `test/templates/`：mission-continuity 扩展 + 新增 stop-points 回归测试。

## 影响范围（Impact）

- 受影响的能力（behaviors）：`codument-core`
- 受影响的代码/文档：上述文件 + `src/templates/manifest.ts`（重新生成）+ `codument/std/**`（dogfood 同步）

## 成功判据（Acceptance）

- `impl-mission.md` 包含"创建即激活 / 不等待用户批准"的候选 track 激活规则。
- `plan-track.md` 包含 mission/auto 语境直接落 active 的调用方规则。
- `questioning.md` 包含执行期 severity 继承（规划预算不构成执行期停点）。
- `impl-track.md` 的 mission 子 track 失败分支不默认提问；续跑 auto 默认继续。
- `dag-execution.md` / `impl-track.md` 不再以"完成即停"作为 delegated 的收尾措辞。
- `bun run check` 通过；dogfood `codument/std` 与 `src/templates` 同步。
