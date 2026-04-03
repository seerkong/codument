## 上下文

当前仓库中 Codex 相关逻辑仍假设：

- `init` 选择 Codex 时，生成 `~/.codex/prompts/codument-*.md`
- `upgrade-workspace` 备份和覆盖 `~/.codex/prompts/`
- README 与升级文档都把 Codex 入口描述为 prompts

但用户当前已将 Codument 工作流迁移为 Codex skill，目录位于：

`/Users/kongweixian/.codex/skills/codument-workflow/`

该目录当前包含：
- `SKILL.md`
- `agents/openai.yaml`
- `references/` 下的各生命周期参考文件

## 方案概览

1. **仓库内引入 Codex skill 模板源**
   - 将 `codument-workflow` skill 的内容纳入仓库内受控模板
   - 后续 `init` 与 `upgrade-workspace` 都从该模板同步到 `~/.codex/skills/codument-workflow/`

2. **替换 Codex 生成器职责**
   - `src/cli/generators/codex.ts` 不再生成 prompts 文件
   - 改为安装/更新 `codument-workflow` skill 目录

3. **更新 init 流程**
   - 选择 Codex 时，输出“已安装 `~/.codex/skills/codument-workflow/`”
   - 不再输出 prompts 相关提示

4. **更新 upgrade-workspace 流程**
   - 备份目标从 `~/.codex/prompts/codument-*.md` 改为 `~/.codex/skills/codument-workflow/`
   - 升级输出文案同步切换

5. **更新文档**
   - README / README-cn / UPGRADE_WORKSPACE 中 Codex 的路径、调用方式、升级说明全部改为 skill 模式

## 影响范围与修改点

| 文件/模块 | 修改类型 | 说明 |
|-----------|---------|------|
| `src/cli/generators/codex.ts` | 修改 | 从 prompts 生成器改为 skill 安装/同步器 |
| `src/cli/commands/init.ts` | 修改 | Codex 初始化输出与行为改为 skill 模式 |
| `src/cli/commands/upgrade-workspace.ts` | 修改 | Codex 备份/升级路径改为 skill 目录 |
| `README.md` | 修改 | Codex 支持说明改为 skills |
| `README-cn.md` | 修改 | 同上 |
| `UPGRADE_WORKSPACE.md` | 修改 | Codex 升级说明改为 skill 目录 |

## 决策

- **决策：Codex 只支持 skill 模式，不再维持 prompts 双轨兼容**
  - 理由：当前目标是“兼容新版 Codex 配置”，继续保留旧 prompts 主路径会增加实现和文档混乱

- **决策：以用户现有的 `codument-workflow` skill 结构为模板基线**
  - 理由：这是已经验证可工作的迁移结果，能减少重新设计 skill 结构的风险

## 风险 / 权衡

- **风险：skill 模板源与用户本地目录可能出现漂移**
  - 缓解：将模板纳入仓库内受控目录，由 `upgrade-workspace` 统一覆盖

- **风险：README 中 Codex 调用示例需要整体改写**
  - 缓解：在本 track 中同步调整文档，避免实现与说明脱节

## 兼容性设计

- `cli_tools` 中选择 `codex` 的值不变
- 只改变其对应产物路径与安装方式
- 其他工具的命令生成方式保持不变

## 待解决问题

- skill 模板应放在仓库内哪个目录最合适
- README 中应如何描述新版 Codex 的具体调用方式
