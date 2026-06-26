## 上下文
- 依据 analysis/findings.md：3 个 sop 与 operations 同名重复；gap-loop 每轮全量重审导致耗时。
- 决策（已定）：删 sop 3 文件并入 operations；gap-loop 保留首轮怀疑、但验证/复检轮轻量化 + FIX 增量复检。
- 约束：纯 std 提示词重构 + gap-loop 协议措辞；不改 CLI 代码逻辑；src/templates + dogfood 双份同步。

## 方案概览

1. **artifact-sync 内容合并**
   - 把 `sop/artifact-sync.md` 的「docs 路由」段（knowledge-tiers 判定 + 建模/实现路由 + model-driven-docs Routing Table + folder-manifest 补齐）并入 `operations/artifact-sync.md`（它是 codument-artifact-sync skill body）。archive/gap-loop 的 sop 内容是 operations 子集，无需额外合并。

2. **删除 + 引用重定向**
   - 删 `std/sop/{archive,artifact-sync,gap-loop}.md`（src/templates + dogfood）。
   - 重定向引用 → operations 对应文件：
     - `operations/{archive,artifact-sync,implement}.md`、`spec/{behavior-registry,track-xml-spec}.md`、`memory/README.md`、`attractors/model-driven-docs.md`（src+dogfood）
     - skill 壳 `skills/{codument-gap-loop,codument-artifact-sync}/SKILL.md`（src/templates；.claude/skills 为生成产物，随 upgrade 再生）
   - `sop/archive.md`→`operations/archive.md`；`sop/artifact-sync.md`→`operations/artifact-sync.md`；`sop/gap-loop.md`→`operations/gap-loop.md`。

3. **manifest 重生成**
   - `bun run scripts/gen-template-manifest.ts`（少 3 模板）；`test/templates/manifest.test.ts` 守护。

4. **gap-loop 验证轮配置 verify-round（首轮怀疑可配、默认关）**
   - 全局开关：gap-loop `verify-round` 默认 `false`（落在 gap-loop 配置处，沿用现有 config 读取风格）。
   - 节点属性 `<cdt:GapLoop verify-round="true|false">` 覆盖全局（per-scope）。
   - `operations/track.md` §3.7 同轮确认（commit/校验模式那步）**增问「是否启用 gap-loop 验证轮」** → 据答复（缺省取全局默认）写各 GapLoop 节点 verify-round；后续追加 phase 沿用。
   - `operations/gap-loop.md` §0.2.4/§1.2/§1.3：首轮 `NO_GAP`+无历史 时读节点 verify-round —— `true` 才跑（轻量）验证轮，`false`（默认）直接收口。首轮怀疑由「写死强制」改为「默认关、可配」。
   - `std/spec/track-xml-spec.md` 记录 `<cdt:GapLoop verify-round>` 属性；`src/cli` validate 接受该属性。

5. **gap-loop 轻量 / 增量复检**（`operations/gap-loop.md` §1/§2，src+dogfood）
   - 验证轮（verify-round=true 时）+ FIX 复检走「轻量模式」：fresh 子代理只读「上轮 gap 报告 + 当轮 diff（FIX 则聚焦改动范围）」做确认，不重做全量目标对比，可用更低 effort。
   - `FIX_APPLIED` 复检**始终强制**（独立于 verify-round），但走增量。双角色 / XML 契约 / max-rounds 不变。

## 影响范围与修改点（Impact）
- 删：`std/sop/{archive,artifact-sync,gap-loop}.md` ×2 份。
- 改（verify-round）：gap-loop 全局 config 开关、`operations/track.md`（§3.7 增问 + 写节点）、`std/spec/track-xml-spec.md`（属性文档）、`src/cli` validate（接受 verify-round）。
- 改：`operations/{artifact-sync,gap-loop,archive,implement}.md`、`spec/{behavior-registry,track-xml-spec}.md`、`memory/README.md`、`attractors/model-driven-docs.md`、`skills/{codument-gap-loop,codument-artifact-sync}/SKILL.md`、`src/templates/manifest.ts`（均 src+dogfood，manifest 仅 src/templates）。
- 测试：manifest 守护 + 残留 grep。

## 决策摘要
- 见 decisions.md。要点：B+C（验证轮轻量 + FIX 增量）、保留首轮怀疑；sop 删 3 留 5；引用全指 operations。

## 风险 / 权衡
- 引用重定向遗漏 → 用 grep `sop/(archive|artifact-sync|gap-loop)\.md` 残留=0 把关 + manifest 守护。
- gap-loop「轻量复核」可能漏判 → 限定仅用于「验证轮/FIX 复检轮」；首轮的完整对比与首轮怀疑保留，质量底线不变。
- dogfood/src 双份漂移 → 每对改完 diff 校验一致。

## 待解决问题
- 见 decisions.md（均 confirmed）。

## skill / operation 改名方案（P3）
- operation 文件 `git mv`（src+dogfood）：implement.md→impl-track.md、track.md→plan-track.md、plan-schedule.md→plan-track-wave.md；文件内自指标题/口径同步。
- skill 壳：新增 codument-impl-track/plan-track/plan-track-wave（@ 同名 operation）；codument-implement/codument-track 保留别名壳（description 标 renamed、body 路由新 operation）；codument-plan-schedule 改名 codument-plan-track-wave（废弃旧名）。
- 引用：codument-implement(46)/codument-track(22)/codument-plan-schedule 的引用 → 新名（用户可见处，别名壳除外）；plan-schedule 残留=0。重生成 manifest。
- 风险：引用面大 → grep 残留把关（plan-schedule=0、旧 operation 路径=0）+ manifest 守护 + 别名壳验证（旧名仍可触发）。
