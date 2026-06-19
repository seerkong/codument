# Bug: `codument archive` 行为提升对 `<behaviors capability>` 登记表全量误报失败

- **日期**: 2026-06-19
- **版本**: codument `v0.4.0`（`dist/codument`，Mach-O arm64）
- **严重级别**: High — 会阻断所有"升级到当前 behavior 登记表标准 (`<behaviors capability>`) 后、需要 upsert/delete/move 进已存在能力"的归档，且失败时留下半归档不一致态。
- **状态**: 已定位根因（源码级），受影响项目已用人工 fallback 绕过。

---

## 1. TL;DR

`src/cli/utils/spec-xml.ts` 里 `findNode` / `findParentForUpsert` / `findOrCreateParentForUpsert` 三处用
```ts
if (root.tag !== 'capability' || root.attrs.id !== capability) {
  throw new Error(`Selector capability does not match root capability: ${selector}`);
}
```
校验登记表根节点。它只接受**遗留格式** `<capability id="X">`，但当前 behavior 登记表标准（`std/spec/behavior-registry.md`）和实际登记表文件用的是 `<behaviors capability="X">`。对后者：

- `root.tag` 是 `"behaviors"` → `!== 'capability'` 成立 → **立即抛错**；
- 即便不看 tag，root 也没有 `id` 属性（用的是 `capability` 属性），`root.attrs.id` 为 `undefined` → 第二个条件也成立。

于是**任何**对 `<behaviors capability>` 登记表的 upsert/delete/move 都会抛出这条**误导性**错误（错误信息说"selector 与 root capability 不匹配"，其实 selector 完全正确，真正原因是**根节点格式 schema 不匹配**）。

---

## 2. 复现

### 环境
| 项 | 值 |
|----|----|
| codument 二进制 | `/Users/kongweixian/.local/bin/codument` → `dist/codument` |
| codument 源码根 | `/Users/kongweixian/ai/ai-codument/codument/` |
| 受影响项目 | `/Users/kongweixian/ai/ai-coder/sparrow-agents/` |
| 出错源文件 | `src/cli/utils/spec-xml.ts`（v0.4.0 binary 构建于 2026-06-15，晚于该源文件最后修改 2026-06-14，故 binary 反映此源码） |

### 命令
```bash
cd /Users/kongweixian/ai/ai-coder/sparrow-agents
codument archive improve-actor-team-web-performance --yes
```

### 输出（exit 1）
```
Archiving track: improve-actor-team-web-performance
Destination: codument/archive/2026-06/2026-06-03-2107-improve-actor-team-web-performance
✓ Track moved to archive
✓ Archive ID: 2026-06-03-2107-improve-actor-team-web-performance
Error: Selector capability does not match root capability: behavior://web-transcript-long-history-performance/requirements/live-stream-hot-path-coalescing
```

### 复现输入
- **patch（delta）**: `…/archive/2026-06/2026-06-03-2107-improve-actor-team-web-performance/behavior_deltas/web-transcript-long-history-performance/delta.xml`
  - 根: `<behavior-patch capability="web-transcript-long-history-performance" version="1">`
  - 首个 upsert: `<upsert selector="behavior://web-transcript-long-history-performance/requirements/live-stream-hot-path-coalescing">`
- **目标登记表**: `codument/behaviors/web-transcript-long-history-performance/index.xml`
  - 根: `<behaviors capability="web-transcript-long-history-performance" version="1">`

---

## 3. 根因分析（源码级）

### 3.1 selector 解析是正确的——不是 selector 的问题

`parseCodumentVfsUri`（`src/cli/utils/vfs.ts:48`）解析
`behavior://web-transcript-long-history-performance/requirements/live-stream-hot-path-coalescing`：

- authority = `web-transcript-long-history-performance`
- segments = `["web-transcript-long-history-performance", "requirements", "live-stream-hot-path-coalescing"]`

`selectorPairs`（`spec-xml.ts:152`）取 `[capability, ...rest]`：
- **capability = `web-transcript-long-history-performance`**（与 delta 根、与登记表根三者一致）
- pairs = `[{ tag: "requirement", id: "live-stream-hot-path-coalescing" }]`

所以 selector 的 capability **解析完全正确**，错误信息属于误报。

### 3.2 真正的错误点：根节点格式断言只认遗留 schema

`spec-xml.ts` 三处守卫（`findNode` L176-180、`findParentForUpsert` L196-200、`findOrCreateParentForUpsert` L217-221）：
```ts
if (root.tag !== 'capability' || root.attrs.id !== capability) {
  throw new Error(`Selector capability does not match root capability: ${selector}`);
}
```
当前标准的登记表根是 `<behaviors capability="...">`（见 `std/spec/behavior-registry.md` 的节点示例 `<behaviors capability="csv-export" version="1">`）。对它：

| 表达式 | 实际值 | 结果 |
|--------|--------|------|
| `root.tag` | `"behaviors"` | `!== 'capability'` → **true** |
| `root.attrs.id` | `undefined`（根用的是 `capability` 属性，无 `id`） | `!== capability` → **true** |

`||` 任一为 true 即抛错 → **对所有 `<behaviors capability>` 登记表的写操作必失败**。

### 3.3 写侧也只产出遗留格式（次要缺陷）

`createRegistryEntry`（`spec-xml.ts:469`）新建登记表根时：
```ts
root: { tag: 'capability', attrs: { id: capability, version: '1' }, children: [] },
writePath: path.join(specsDir, `${capability}.xml`),
```
即 codument 自己**写出的是 `<capability id="X" version="1">`**，与 `<behaviors capability>` 标准不一致。这解释了受影响项目里 50 个登记表中那 3 个 `<capability id>` 异类文件——
`dynamic-workflow-authoring-tools.xml` / `dynamic-workflow-language-runtime.xml` / `dynamic-workflow-workspace-instances.xml`，正是此前 "归档三个 track" 时由 codument 新建产生的。

### 3.4 为什么过去有归档"成功过"

只有**新建能力**这条路径能成功：`createRegistryEntry` 在内存里造一个 `<capability>` 根，恰好通过 `root.tag === 'capability'` 的自检，再写出新的 `<capability id>.xml`。而**对已存在的 `<behaviors capability>` 登记表 upsert** 一定抛错。

- 上述 3 个 dynamic-workflow 能力 = 新文件 → 成功。
- `web-transcript-long-history-performance` 已存在且是 `<behaviors capability>` → 抛错。

实测受影响项目：50 个登记表中 **47 个是 `<behaviors capability>`**，3 个是 `<capability id>`。也就是说当前几乎任何"对既有能力的归档提升"都会被此 bug 阻断。

---

## 4. 次要问题：归档非原子，失败后状态不一致

`archive` 流水线顺序是**先 move track，再提升 behavior**。提升抛错时 track 已被移入 `archive/`（输出里已打印 `✓ Track moved to archive`），导致：

1. track 不在 `tracks/` 了，**无法重跑** `codument archive`（命令找不到 track）；
2. 登记表却没更新 → 归档卡在半完成不一致态，需要人工补提升。

建议：把 behavior 提升放到 move 之前（提升失败则 track 原地不动），或失败时回滚 move，或支持对"已 move 未提升"的 track 续跑提升步骤。

---

## 5. 影响范围

- 任何已采用当前 `<behaviors capability>` 标准的项目，归档若需 upsert/delete/move 进**已存在**能力 → 100% 失败 + 半归档不一致态。
- `createRegistryEntry` 持续产出遗留 `<capability id>` 文件 → 登记表格式分裂，长期会让同一仓库里两种 root 并存。

---

## 6. 建议修复

### 6.1 守卫兼容两种 root（核心）

抽一个 helper，统一从 root 取 capability，兼容新旧两种格式：
```ts
function rootCapability(root: SpecXmlNode): string | undefined {
  if (root.tag === 'behaviors') return root.attrs.capability;   // 当前标准
  if (root.tag === 'capability') return root.attrs.id;          // 遗留兼容
  return undefined;
}
```
三处守卫改为：
```ts
if (rootCapability(root) !== capability) {
  throw new Error(`Selector capability does not match root capability: ${selector}`);
}
```
（顺带让错误信息更准确，例如附上 `root.tag` 与实际取到的 capability，避免再次误导。）

### 6.2 写侧产出当前标准格式

`createRegistryEntry` 改为产出 `<behaviors capability>`，并按标准用目录/单文件演化：
```ts
root: { tag: 'behaviors', attrs: { capability, version: '1' }, children: [] },
```
（如需对存量 3 个 `<capability id>` 文件做一次性迁移，可在 `migrate` / `upgrade-workspace` 里补规则。）

### 6.3 归档原子性

调整流水线顺序或加回滚/续跑，见 §4。

### 6.4 回归测试建议

- `applySpecXmlPatchToRegistry` 对 `<behaviors capability>` **单文件**登记表 upsert/delete/move。
- 对 `<behaviors capability>` **目录形态**（`<capability>/index.xml`）同样三类操作。
- 对遗留 `<capability id>` 登记表保持兼容（不回归）。
- 新建能力时断言写出的是 `<behaviors capability>`。

---

## 7. 受影响项目里采用的人工 fallback（仅记录）

按 `codument/std/operations/archive.md` 的 "CLI 失败 → 手工 fallback"：

1. 手工把 delta 的 4 个 requirement（`live-stream-hot-path-coalescing` / `transcript-render-layout-budget` / `actor-team-performance-observability` / `workflow-history-surface-separation`）提升进 `codument/behaviors/web-transcript-long-history-performance/index.xml`（5 → 9 条），XML 校验 well-formed；
2. 确认 archive 内 track `<Status>completed</Status>`；
3. `codument validate --strict` 通过。

> 注：归档目录里 `analysis/` 与 `reports/` 受 `.gitignore` 约束不纳入跟踪，属既定策略，与本 bug 无关。
