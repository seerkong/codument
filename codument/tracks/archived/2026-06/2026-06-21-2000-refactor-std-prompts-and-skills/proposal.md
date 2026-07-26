# 变更：sop/operations 去重合并 + gap-loop 复检轻量化

## 背景和动机 (Context And Why)

两个相关问题:

1. **sop 与 operations 重复**:`codument/std/sop/{archive,artifact-sync,gap-loop}.md` 与 `operations/` 同名重复——`gap-loop.md` 几乎逐节重复 operations 的完整协议;`archive.md` 是 operations 流程的骨架子集;`artifact-sync.md` 只有「docs 路由」段是独有的。双轨维护、易漂移。
2. **gap-loop 耗时**:首轮怀疑(首轮 NO_GAP 必再验证一轮)+ FIX 必复检,且每轮 fresh-spawn 都**全量重审**目标对比 → 即使正常也最少 2 轮,慢。

## "要做"和"不做" (Goals / Non-Goals)

**目标:**
- sop/ 回归「纯跨操作方法论」:删 sop/{archive,artifact-sync,gap-loop}.md;artifact-sync 的 docs 路由段先并入 operations/artifact-sync.md;约 26 处引用重定向到 operations;重生成 manifest;sop/ 只留 questioning/tdd/validation/wave-exec/workflow。
- gap-loop 复检轻量化(保留首轮怀疑规则):验证轮/复检轮只复核「上轮报告结论 + 当轮 diff」(可降 effort);FIX 后增量复检(只看改动)。

**非目标:**
- 不取消首轮怀疑本身(质量保证保留)。
- 不删非重复的 sop 方法论(questioning/tdd/validation/wave-exec/workflow)。
- 不改 gap-loop 的双角色架构、XML 输出契约、max-rounds/on-exhausted 语义。

## 变更内容（What Changes）

- **去重**:删 `std/sop/{archive,artifact-sync,gap-loop}.md`(src+dogfood);合并 artifact-sync docs 路由段 → `operations/artifact-sync.md`;重定向引用(operations/spec/memory/attractors/skill 壳);重生成 `manifest.ts`。
- **gap-loop**:`operations/gap-loop.md` §1(父层 dispatch)/§2(子代理执行顺序)加「轻量复检」「FIX 增量复检」说明 + 在 §0.2.4 注明验证轮走轻量模式(src+dogfood);相关 skill 壳指针顺带校正。
- behavior:`codument-core` 新增 `std-sop-no-operation-dup`、`gap-loop-recheck-efficiency`。

## 影响范围（Impact）

- 受影响能力:`codument-core`(+2 需求)。
- 受影响文件:`std/sop/`(删 3)、`std/operations/{gap-loop,artifact-sync,archive,implement}.md`、`std/spec/{behavior-registry,track-xml-spec}.md`、`memory/README.md`、`attractors/model-driven-docs.md`、`skills/{codument-gap-loop,codument-artifact-sync}`、`src/templates/manifest.ts`(均 src/templates + dogfood)。
- 测试:`test/templates/manifest.test.ts` 守护(重生成后绿) + 引用残留 grep 检查。
- **纯提示词/std 重构 + gap-loop 协议措辞**,不改 CLI 代码逻辑。

## 补充：skill / operation 改名（plan-track 家族）
- `codument-implement`→`codument-impl-track`、`codument-track`→`codument-plan-track`（旧名留别名壳）；`codument-plan-schedule`→`codument-plan-track-wave`（废弃旧名）。
- operation 文件同步改名：`implement.md`/`track.md`/`plan-schedule.md` → `impl-track.md`/`plan-track.md`/`plan-track-wave.md`。
- 约 90 处引用重定向（src/templates + dogfood）；`codument-plan-wave`/`execute-wave` 属外部框架（.sparrow/.opencode/.eidolon），不动。
