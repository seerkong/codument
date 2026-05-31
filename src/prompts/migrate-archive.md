# codument migrate-archive - 旧 Archive 布局迁移命令

**描述：** 将旧 Codument archive 转换为新的 `codument/archive/YYYY-MM/YYYY-MM-DD-HHmm-track-id/` 目录规范。

---

## 1.0 目标

你是 Codument archive 迁移代理。当前任务是把旧归档目录迁移到新布局，同时保留证据和不可安全解释的内容。

不要静默删除旧内容。不要把无法确定的时间或 track ID 伪造成确定事实。

本 skill 是普通迁移流程，不需要 gap-loop 式 fresh child orchestration；只有用户要求独立复检时才考虑委派子代理。

---

## 2.0 识别旧布局

扫描：

- `codument/archive/<YYYY-MM-DD-track-id>/`
- `codument/archive/<track-id>/`
- 缺少 `YYYY-MM/` bucket 的 archive 目录
- 缺少 `plan.xml`、只有 `metadata.json`、`tasks.xml`、`spec.md` 或 `summary.md` 的目录

新布局是：

```text
codument/archive/YYYY-MM/YYYY-MM-DD-HHmm-track-id/
```

---

## 3.0 迁移前安全步骤

1. 读取 `codument/std/AGENTS.md` 和项目 workflow。
2. Inventory 所有候选 archive，列出源路径、推断 track ID、推断更新时间、风险。
3. 创建备份或迁移记录：
   - 优先写入 `.tmp/codument/migrate-archive-<timestamp>/`
   - 或在最终报告中记录用户已有备份位置
4. 只有在源路径和目标路径都明确时才移动目录。

---

## 4.0 迁移规则

- 更新时间优先级：`plan.xml metadata.updated_at` -> `metadata.json updated_at` -> 归档目录日期 -> 文件最大 mtime。
- 如果目录名日期、`plan.xml` 时间和 `metadata.json` 时间不一致，必须在迁移记录中显式标记风险；仍优先使用 `plan.xml`/`metadata.json` 中可验证的更新时间。
- 能确定分钟时使用真实分钟；只能确定日期时使用 `0000` 并记录原因。
- 目标目录已存在时不要覆盖，改为记录冲突并请求用户处理。
- 如果旧 archive 缺少 `plan.xml`，从可用 metadata/tasks 生成最小 `plan.xml`；无法生成时保留原文并记录。
- 旧 `spec.md`、summary、reports、decisions、memory 内容应随 archive 保留。
- 不安全或无法解释的内容复制到 `codument/legacy/archive/...` 或备份区，不直接删除。

---

## 5.0 验证

迁移后执行：

1. `codument validate --strict`；找不到外部 `codument` 命令时说明跳过原因。
2. 运行额外 archive 布局扫描，因为 `codument validate --strict` 不保证检查旧 archive 目录形态：
   - 查找 `codument/archive/*` 下仍然直接包含 `plan.xml` 或 `metadata.json` 的根级旧 archive 目录。
   - 查找不匹配 `codument/archive/YYYY-MM/YYYY-MM-DD-HHmm-track-id/` 的目录。
   - 报告所有剩余旧布局候选，即使本次只迁移其中一个。
3. 检查新 archive 路径是否符合 `YYYY-MM/YYYY-MM-DD-HHmm-track-id`。
4. 报告迁移列表、跳过列表、冲突列表和待确认问题。
