# Decisions

## Usage
- 记录需用户确认的决策；字母仅用于选项。

### 1. 【P0】gap-loop 耗时优化策略
- 用户答复：B 验证轮轻量化 + C FIX 增量复检；并追加：验证轮「是否启用」做成配置项。
- 最终决策：
  - **B 轻量化**：验证轮（开启时）只复核「上轮报告结论 + 当轮 diff」、可降 effort。
  - **C 增量**：FIX_APPLIED 后复检只针对 FIX 改动范围；该复检**始终强制**，不受 verify-round 控制。
- 状态：confirmed

### 1b. 【P0】验证轮配置项 verify-round（首轮 NO_GAP 后是否再跑验证轮）
- 用户答复：全局默认 + 节点属性二者都要；**默认关**；创建 track 时像 commit/校验模式一样询问，据答复写入节点 verify-round；后续追加 phase 沿用。
- 最终决策：
  - 全局 config 开关：gap-loop `verify-round` 默认 **false（关）**。
  - 节点属性 `<cdt:GapLoop verify-round="true|false">` 覆盖全局默认（per-scope）。
  - codument-track §3.7 同轮确认增问「是否启用 gap-loop 验证轮」，据答复（缺省取全局默认）写各 GapLoop 节点的 verify-round。
  - 父层：首轮 NO_GAP+无历史 时，verify-round=true 才跑（轻量）验证轮；false（默认）直接收口。
  - 首轮怀疑由「写死强制」改为「默认关、可配」。
- 状态：confirmed

### 2. 【P0】sop/operations 去重范围
- 最终决策：删 sop/{archive,artifact-sync,gap-loop}.md（与 operations 同名重复）；artifact-sync 的 docs 路由段先并入 operations；保留 questioning/tdd/validation/wave-exec/workflow 五个纯方法论
- 状态：confirmed

### 3. 【P1】引用重定向去向
- 背景：sop 三文件被 ~26 处引用。
- 最终决策：全部重定向到 operations/对应文件（operations 是权威 body）；artifact-sync 的 docs 路由引用指向 operations/artifact-sync.md 的合并后段落
- 状态：confirmed

### 4. 【过程】提交 + 校验模式
- 沿用：CommitMode=manual；末 phase cdt:GapLoop（final）；每 phase cdt:AttractorCheck（docs/coding）
- 注：本 track 改 gap-loop 协议本身——P3 的 GapLoop 仍按当前（旧）协议跑（改动在归档后才对后续生效）
- 状态：默认（review 时可改）

### 5. 【P0】skill/operation 改名（plan-track 家族）
- 最终决策：
  - skill 名 = operation 文件 base 名同名。
  - codument-implement→codument-impl-track、codument-track→codument-plan-track：旧名**保留别名壳**（路由新 operation、可触发）。
  - codument-plan-schedule→codument-plan-track-wave：**废弃旧名**（无别名）。
  - operation 文件 implement.md/track.md/plan-schedule.md → impl-track.md/plan-track.md/plan-track-wave.md（src+dogfood）。
  - codument-plan-wave/execute-wave 不在 codument 模板源（在 .sparrow/.opencode/.eidolon 外部框架），本 track 不动；plan-track-wave/plan-mission 作命名约定。
  - track 重命名 refactor-std-prompts-and-skills。
- 状态：confirmed
