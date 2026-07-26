# Decisions

## Usage
- 记录本 track 已确认的关键设计决策、选项、结论与理由。
- 问题标题不用字母前缀；字母只用于选项。

### 1. 【P0】delta 载体与 apply 机制
- 背景：modeling 是 prose-heavy，需可定位增删改，且要支持类 git 的丰富 delta（rename/3-way/冲突）。
- 选项：
  - A) 自建 `<modeling-patch>` + upsert/delete/move 包裹（behavior 同构）
  - B) XNL 节点子树 + `diffNodes`/`applyMutations` 自动 diff
  - C) 复用 xnl-vfs/xnl-vcs，delta = git（branch/commit + merge）
- 最终决策：C。
- 决策理由：xnl-vcs/xnl-vfs 已提供节点级 diff/merge、rename、3-way + 冲突类型，复用即得 git-like 富 delta，不自建节点类型与算法。XNL 用 `xnl-core`，prose/ts/mermaid/伪代码用 TextElement+marker 零转义。
- 状态：confirmed

### 2. 【P0】多文件 import 落点
- 背景：registry 分形需多文件管理；XNL loader 无文件级 include。
- 最终决策：给 xnl.ts 加 vfs-import 解析器（`<Import as src="vfs://">` 跨文件命名空间），复用 vfs；作为 xnl.ts 侧另一个 track。codument 侧先以单文件 + 目录 glob 起步。
- 状态：confirmed

### 3. 【P0】3-way merge 的 base 锚定
- 选项：
  - A) track create 记录当时 main commit id 作 base；archive 用三方合并
  - B) 不记 base，archive 对目标态全树 diff 覆盖
- 最终决策：A，且 base 锚在**宿主 git**（见决策 9）。
- 决策理由：支持并发 track、其他 track 先归档导致 registry 前进时仍能正确 3-way 合并并提示冲突；B 丢并发合并能力、易误删。
- 状态：confirmed

### 9. 【P0】xnl-vcs 是否持久化为平行仓库
- 背景：原设计在 `codument/modeling/.xnl-vcs/` 持久化平行 git。多人协作时 refs/HEAD/logs/workspace 等可变控制文件易冲突；新 clone 缺历史则 base 锚失效。
- 选项：
  - A) 持久化 `.xnl-vcs/` 并入宿主 git
  - B) **不持久化**；xnl-vfs/xnl-vcs 仅作临时合并引擎，真 VCS = 宿主 git；base 锚 = 宿主 git commit id；`.xnl-vcs/` 产物入 `.tmp/` 并 gitignore
- 最终决策：B。
- 决策理由：(1) 新文件夹 clone 只需工作树 .xnl（宿主 git 跟踪），base 用宿主 git commit 仍可解析；(2) 不提交可变控制文件 → 无多人协作平行仓库冲突，协作交宿主 git；(3) 只取 xnl 的节点级 merge 算法（优于 git 行级），不要它的持久化；modeling 历史宿主 git 已有，平行历史冗余。归档 merge：base（宿主 git 物化）+ ours（工作树）+ theirs（modeling_deltas）→ xnl-vfs `xnlFileHandler.merge` 临时 3-way → 写回 → 宿主 git 提交。
- 状态：confirmed

### 11. 【P1】跨文档引用语法与解析
- 引用语法：**VFS URI**（`modeling://<plane>/<context>/<name>`、`behavior://...`），绝对自描述、文件移动后不失效、与既有 VFS scheme 同族。
- 解析规则：**scheme 自识别**——扫节点所有 metadata/attribute 值，凡匹配已知 VFS scheme 即视为引用解析，其余字面量；不用固定 key 白名单。约定可读 key（depends_on/derived_from/single_writer/uses/behaviors）不强制。`<Import as>` 是可选语法糖。
- 状态：confirmed

### 12. 【P1】merge 冲突解决默认策略
- 默认：**保守**——无歧义自动合并；真冲突（同子部异内容 / DELETE_MODIFY / RENAME_RENAME / ADD-ADD 同 id）一律 issues-first 报告并暂停，不静默选边。
- 可配：按冲突类型在 `config/modeling.xml` 的 `<merge-policy>` 覆盖（resolve = human|ours|theirs|base），缺省全人工。
- 状态：confirmed

### 10. 【P2】node id 多级命名空间 + 分形拆分阈值
- node id：允许多级命名空间 `#<context>.<name>` 或跨 plane `#<plane>.<context>.<name>`（XnlWord namespace 本就支持点号多级）。
- 分形拆分阈值：lint 默认 **> ~400 行 或 > ~8 个顶层建模节点** 标记拆分候选，可在 `config/modeling.xml` 配；lint 只建议，实际拆分模型按 folder-manifest 应用。
- 状态：confirmed

### 4. 【P1】component 的 IO 表征
- 选项：A) `<Ports>` 结构化端口；B) `runtime`/`input`/`config`/`output` 四个 ts 文本块
- 最终决策：B（轻量、足够表达 DEPA 标准组件）。
- 状态：confirmed

### 5. 【P1】节点 id 唯一性范围
- 最终决策：用 XNL `XnlWord` 命名空间，`#<context>.<name>`（类似 类命名空间::类名）实现全局唯一；vfs path-index 维护 路径↔id。
- 状态：confirmed

### 6. 【P1】DEPA 介入深度（最小表征）
- 最终决策：不照搬全部 DEPA。建模内核强制事实源（fact_grade + single_writer + 衍生不反写）；用 Effect 拆模块依赖 + contract/logic/support + capsule 目录树；用 TypeScript 建标准组件 IO；数据层建关键类型/枚举/状态机）；逻辑层建跨领域 action/route/endpoint；关键处建 actor。最小必备表征强制，其余可选。
- 状态：confirmed

### 7. 【P1】modeling 与 behaviors 边界
- 最终决策：可测行为契约归 behaviors（behavior://）；modeling 引用不重复。
- 状态：confirmed

### 8. 【P2】modeling 是否常开
- 最终决策：`config/modeling.xml`（仿 attractor-profiles），默认关。knowledgeSync 字符串残留一并清理。
- 状态：confirmed
