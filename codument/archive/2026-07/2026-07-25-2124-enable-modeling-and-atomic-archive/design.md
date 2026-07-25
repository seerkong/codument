# Design：Modeling 默认启用与原子归档

## 上下文

本 track 同时改变产品默认值和多个长期 registry 的写入一致性。`src/templates/**` 是发布真源；当前 dogfood workspace 的 `codument/config/modeling.xml` 是用户显式配置，因此不得因默认值变化被直接改写。

## 方案概览

1. 默认启用与按变化生成分离
   - `loadModelingConfig` 在配置缺失时返回 `enabled: true`。
   - 发布模板将 `enabled="true"` 作为 fresh init 默认。
   - 解析到显式 `enabled="false"` 时保持 false。
   - planning/implementation prompt 只在结构知识变化时生成 modeling delta。
2. 统一 archive prepare
   - behavior patch 在 transaction staging 中应用，不触碰 live behaviors。
   - modeling prepare 读取 base/ours/theirs，调用现有 `mergeModeling`，收集 conflicts，序列化到 staging。
   - engineering prepare 改为相同输出形态，不再暴露直接写 live registry 的 `apply()`。
   - 所有 prepare 完成后，对 staged tree 运行适用的解析/schema 校验。
3. Commit 与 rollback
   - transaction 为每个将变化的 live registry 建立 transaction-owned backup。
   - 依次以 staged tree 替换 live target；记录已替换目标。
   - 任一步失败时按逆序恢复已替换目标，恢复不存在/存在状态，并清理 staging/backup。
   - 只有 registry commit 成功后才 `renameSync(trackDir, archiveDir)`。
4. 空 registry 语义
   - missing/empty modeling registry 是合法初态，validate 产生 warning。
   - 首次实际 modeling delta 由事务 commit 创建 registry。
   - modeling enabled 但无 delta 时不把空目录加入 transaction target。

## Processor / Effect 边界

- Processor：behavior mutation 结果规划、`mergeModeling`、`mergeEngineering`、冲突分类、目标文件集合计算。
- Effect：git base 物化、registry tree 复制、staging 写入、backup、replace、rollback、track move、console/process exit 适配。
- Archive command 只做 orchestration；事务细节进入可单测模块，避免继续膨胀单个命令文件。

## 影响范围与修改点（Impact）

- `src/cli/modeling/config.ts`
- `src/cli/modeling/validate.ts`
- `src/cli/commands/archive.ts`
- 新增或抽取 `src/cli/archive/*` transaction/prepare 模块
- `src/templates/codument/config/modeling.xml`
- `src/templates/codument/std/spec/modeling-{registry,delta}.md`
- `src/templates/codument/std/operations/archive-track.md`
- `test/cli/modeling/{config,validate}.test.ts`
- `test/cli/commands/archive.test.ts` 及必要的 transaction focused tests

## 决策摘要

- 详见 `decisions.xnl`。
- modeling 缺省与 fresh init 默认 enabled；显式 false 优先。
- modeling delta 按结构变化生成，而非按 track 无条件生成。
- 三类 registry 先全部 prepare，再统一 commit；失败 rollback，成功后移动 track。

## 风险 / 权衡

- 目录级 replace 在不同文件系统上不一定具备单指令原子性 → staging 与 live target 放在同一 workspace filesystem，并实现显式 rollback。
- rollback 本身也可能失败 → 聚合报告原始失败与 rollback failure，保留 backup 路径供人工恢复，测试覆盖正常 rollback。
- 大 registry 全量复制会增加 archive 成本 → 本 track 优先正确性；后续可在不改变事务接口的前提下优化为文件级 mutation set。
- 现有 behavior patch helper 直接写文件 → 先对 staging clone 使用，避免本 track 同时重写 XML mutation engine。

## 兼容性设计

- 显式 `enabled=false` 完全兼容。
- modeling/engineering merge policy 与 base commit 元数据继续沿用现有格式。
- `--skip-specs` 只跳过 behavior registry target，不得跳过 modeling/engineering。
- 没有 modeling/engineering delta 的 track 保持现有 archive 行为，不创建对应 registry。

## 迁移计划

1. 先用红测试锁定默认值、首次 modeling merge、冲突无写入和 commit rollback。
2. 抽取 prepare/stage transaction，不改变 CLI 用户参数。
3. 接入 modeling 并迁移 engineering 写入。
4. 更新发布模板和标准说明，刷新 manifest。
5. 运行 focused tests、完整 archive tests、typecheck、build 和严格 track validate。

## 待解决问题

- 无。实现细节若证明目录级替换无法可靠回滚，必须回到本设计做受控修订，而不是放宽失败不写入的行为契约。
