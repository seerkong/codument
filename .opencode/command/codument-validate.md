---
description: Validate track or spec format
allowed-tools: All
---
# codument validate - 验证命令

**描述：** 验证规范和任务文件格式

---

## 1.0 系统指令

你是 Codument 规范驱动开发框架的 AI 代理助手。当前任务是验证 track 或 spec 的格式是否正确。

---

## 2.0 验证流程

### 2.1 确定验证目标

1. **解析参数：**
   - 如果提供了 `[item]`，验证特定 track 或 spec
   - 如果未提供，进入批量验证模式

2. **识别类型：**
   - 如果 `item` 存在于 `codument/tracks/`，验证为 track
   - 如果 `item` 存在于 `codument/specs/`，验证为 spec
   - 如果两者都存在或都不存在，使用 `--type` 参数消歧

### 2.2 验证 Track

对于 track 目录 `codument/tracks/<track_id>/`：

#### 2.2.1 结构验证

- [ ] `metadata.json` 存在且格式正确
- [ ] `spec.md` 存在
- [ ] `plan.xml` 存在且 XML 格式有效

#### 2.2.2 metadata.json 验证

```json
{
  "track_id": "必需，字符串",
  "type": "必需，feature|bug|chore|refactor 之一",
  "status": "必需，new|in_progress|completed|cancelled 之一",
  "created_at": "必需，ISO 8601 格式",
  "updated_at": "必需，ISO 8601 格式",
  "description": "必需，字符串"
}
```

#### 2.2.3 spec.md 验证

- [ ] 至少包含一个增量操作部分：
  - `## ADDED Requirements`
  - `## MODIFIED Requirements`
  - `## REMOVED Requirements`
  - `## RENAMED Requirements`
- [ ] 每个 `### Requirement:` 至少有一个 `#### Scenario:`
- [ ] Scenario 格式正确（使用 `#### Scenario:`，不是列表项）
- [ ] 需求使用规范性语言（SHALL/MUST）

#### 2.2.4 plan.xml 验证

- [ ] XML 格式良好（可解析）
- [ ] 包含 `<plan>` 根元素
- [ ] 包含 `<metadata>` 部分，包括 track_id、track_name、goal、status
- [ ] 包含 `<phases>` 部分
- [ ] 每个 `<phase>` 有 id 和 name 属性
- [ ] 每个 `<task>` 有 id、name、status、priority 属性（status: TODO|IN_PROGRESS|DONE|BLOCKED|CANCELLED）
- [ ] status 值有效：TODO|IN_PROGRESS|DONE|BLOCKED

### 2.3 验证 Spec

对于 spec 目录 `codument/specs/<capability>/`：

#### 2.3.1 结构验证

- [ ] `spec.md` 存在

#### 2.3.2 spec.md 验证

- [ ] 包含 `# <能力名称>` 一级标题
- [ ] 至少包含一个 `### Requirement:` 部分
- [ ] 每个需求至少有一个 `#### Scenario:`
- [ ] Scenario 格式正确
- [ ] 需求使用规范性语言

### 2.4 严格模式 (--strict)

使用 `--strict` 参数时执行额外检查：

#### Track 额外检查

- [ ] proposal.md 存在（如果是新 track）
- [ ] proposal.md 包含必需部分：背景、变更内容、影响范围
- [ ] design.md 格式正确（如果存在）
- [ ] 所有 Scenario 的 WHEN/THEN 格式正确
- [ ] 无重复的需求名称
- [ ] 任务 ID 唯一且符合命名规范

#### Spec 额外检查

- [ ] 无重复的需求名称
- [ ] 所有需求有唯一标识符
- [ ] design.md 存在且格式正确（如果能力复杂）

### 2.5 输出格式

#### 验证通过

```
✓ codument/tracks/add-user-auth/
  ✓ metadata.json - 有效
  ✓ spec.md - 有效 (3 个需求, 5 个场景)
  ✓ plan.xml - 有效 (2 个阶段, 8 个任务)

验证通过！
```

#### 验证失败

```
✗ codument/tracks/add-user-auth/
  ✓ metadata.json - 有效
  ✗ spec.md - 错误
    - 第 15 行: Requirement "User Login" 缺少 Scenario
    - 第 28 行: Scenario 格式错误，应使用 "#### Scenario:" 而非 "- Scenario:"
  ✓ plan.xml - 有效

验证失败！请修复以上错误后重试。
```

### 2.6 批量验证

当未指定 `[item]` 时：

1. 列出所有 `codument/tracks/` 下的 tracks
2. 列出所有 `codument/specs/` 下的 specs
3. 依次验证每个项目
4. 汇总结果：

```
批量验证结果:

Tracks:
  ✓ add-user-auth
  ✓ update-payment-flow
  ✗ fix-login-bug (2 个错误)

Specs:
  ✓ auth
  ✓ payment

总计: 4 通过, 1 失败
```

---

## 3.0 参考

### 常见错误及修复

| 错误 | 原因 | 修复 |
|------|------|------|
| "Requirement must have at least one scenario" | 需求下没有场景 | 添加 `#### Scenario:` 部分 |
| "Invalid scenario format" | 场景格式错误 | 使用 `#### Scenario: 名称` 格式 |
| "Invalid XML format" | plan.xml 语法错误 | 检查 XML 标签闭合 |
| "Missing required field in metadata" | metadata.json 缺少字段 | 添加所需字段 |
| "Track must have at least one delta" | spec.md 没有增量操作 | 添加 ADDED/MODIFIED/REMOVED 部分 |

---

## 4.0 独立验证子代理模式

当本命令被 `/codument:execute-wave` 作为验证子代理调用时，执行以下独立验证流程。

### 4.1 触发条件

当提示词中包含以下参数时，进入独立验证模式：
- `workspace_dir`：工作区根目录
- `track_dir`：track 目录路径
- `wave_id`（可选）：指定验证的 wave
- `phase_id`（可选）：指定验证的 phase

### 4.2 Goal-Backward 验证方法

从目标倒推验证，而非从代码正推：

1. **读取验收标准：** 从 plan.xml 提取目标 task 的 acceptance_criteria
2. **逐条验证：** 对每个 criterion，检查实现是否满足
3. **报告差距：** 列出未满足的标准和原因

### 4.3 三级验证

对每个已完成的 task，执行三级递进验证：

#### Level 1: Exists（存在性）
- 验证 task 声明要修改/创建的文件是否存在
- 验证 git commits 是否存在（auto 模式）
- 验证 task 状态是否为 DONE

#### Level 2: Substantive（实质性）
- 验证文件内容是否包含 task 描述中提到的关键变更
- 验证代码变更是否与 acceptance_criteria 对应
- 验证测试是否存在且通过（如 workflow 要求 TDD）

#### Level 3: Wired（连通性）
- 验证新增代码是否被正确引用/导入
- 验证新增功能是否在系统中可达
- 验证配置变更是否生效

### 4.4 验证报告格式

```
📋 **验证报告：<wave_id 或 phase_id>**

## 总览
- 验证任务数：<n>
- 通过：<n>
- 失败：<n>

## 详细结果

### T{x}.{y}: <task name>

**Level 1 - Exists:** ✅ 通过
- [x] 文件存在：src/foo.ts
- [x] Task 状态：DONE

**Level 2 - Substantive:** ✅ 通过
- [x] AC1: <标准描述> — 已验证
- [x] AC2: <标准描述> — 已验证

**Level 3 - Wired:** ⚠️ 部分通过
- [x] 导入正确：src/index.ts 引用了 src/foo.ts
- [ ] 配置未更新：config.json 缺少新字段

## 阻塞问题
- <问题描述>（影响：<影响范围>）

## 非阻塞问题
- <问题描述>（建议：<改进建议>）
```

### 4.5 输出协议

验证结果必须按以下顺序输出（issues-first）：
1. **阻塞问题**（blocking issues）— 必须修复才能继续
2. **非阻塞问题**（non-blocking issues）— 建议修复但不阻塞
3. **简要总结**（brief summary）— 通过/失败统计


<ChangeId>
  $ARGUMENTS
</ChangeId>


