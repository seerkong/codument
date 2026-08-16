# 设计：模板 authority 收敛

## Gap-loop 结论

本 Track 的首轮 gap-loop 审阅把问题分成四个边界：

1. **语法漂移**：当前 XNL 示例已使用 `child_mode`、`max_rounds`、`on_exhausted`、`verify_round`、`project_ref`，但 operation/method 仍出现 XML 风格连字符属性和 XML 元素示例。
2. **写入 authority 漂移**：CLI 已有 `track|mission transition`、`task transition`、`mission bind-track` 和 `gap-round`，部分流程文字仍要求 executor 直接改 status/revision。
3. **兼容知识越界**：普通 plan/impl/verify 文档仍复制旧 `plan.xml`、`cdt:`、wave/state 文件映射，和 CLI-first 的薄 operation 边界冲突。
4. **自动保护不足**：现有 std lint 只捕获 `<cdt:`，无法捕获纯文本 `cdt:Acceptance`、连字符属性或 XML current-authoring 示例。
5. **骨架与合并基线缺口**：Decision 没有 CLI scaffold；Track scaffold 没有记录 modeling/engineering 的宿主 Git base。
6. **知识 registry 示例漂移**：modeling/engineering 的单例表征仍放在 `[]`，folder manifest 和 docs bootstrap 仍混用 registry 晋升与外部 artifact 分发。

详细证据见 `reports/gap-templates-resource-cli-1.md`。

## 修正策略

### 当前 XNL 口径

普通 operation、method、README 和 skill shell 使用当前 Kind 的 XNL 词汇。历史名称只允许出现在：

- `std/compat/**`
- `std/operations/migrate.md`
- `std/spec/**` 中明确标注的兼容/迁移章节
- migration 专用 skill reference

### CLI 写入边界

语义判断仍由 operation 负责，确定性写入调用 CLI：

- Track 根状态：`codument track transition`
- Track task/group 状态：`codument track task transition`
- Mission 根与 task/group 状态：对应 `mission` transition 命令
- TrackLink 绑定：`codument mission bind-track`
- GapLoop 轮次：`track|mission gap-round`

受控重规划可以由 AI 修改 TaskSpace/Schedule 的语义结构，但状态、revision 和时间的后续写回必须由 CLI 完成并重新 validate。

### Lint 策略

`std lint` 继续跳过 compat、spec 和 migrate，针对普通标准文档增加窄规则：

- `cdt:` 领域前缀；
- `child-mode`、`verify-round`、`max-rounds`、`on-exhausted`、`project-ref`；
- XML 风格 `<Task id=` / `<TrackLink state=` current-authoring 示例；
- 明确要求直接设置 task status 的流程措辞。

规则保持 token 级，不尝试用正则完整解析 XNL。

### Decision scaffold

增加 `codument decisions create <file> <decision-id> [--parent <decision-id>]`。命令从 Decision Kind registry 读取当前 `apiVersion`，创建或追加一个 pending Decision 骨架；`--parent` 把节点加入父 Decision 的 `[]` 子决策集合。AI 随后只填写 question、recommendation、options 与 answer 语义。

### Registry merge base

`codument track create` 在 Git HEAD 可解析时把同一 commit 写入根 `modeling_base_commit` 与 `engineering_base_commit`。存在相关 delta 而基线缺失时，archive 明确报错，不再把当前 registry 静默当作 base。没有 Git HEAD 的 workspace 仍可创建 Track，但在首次需要 registry delta 前必须建立可解析基线。

### Resource package boundary

根 `manifest.xnl` 只登记当前 Halfcode loader 能诚实发现的单层资源。归档资源、Track-local BehaviorPatch/Decision 和递归 modeling/engineering registry 暂由 owner CLI 加载与校验；在 Halfcode 支持递归 Catalog 或 ResourceModule authoring 前，不添加看似完整但实际无法发现资源的 Catalog。

## 验证

- std lint 单元测试覆盖每一类新规则和 compat/spec 豁免。
- 运行模板测试与完整 `bun run check`。
- 构建后运行 `codument std lint`、Track strict validate 和 workspace dogfood upgrade。

## 第二轮补充

fresh verifier 在首轮实现后仍发现四类 gap：pending README 直接移动 Track authority；plan-track 直接维护 `updated_at` / `gap_round`；`xnl-format.md` 正例把普通属性放进 metadata；kernel pointer 与项目 SOP 仍使用旧 XML 结构词汇。P4 将这些修正为 CLI transition/gap-round、当前 XNL 通道和 CLI scaffold 口径，并把代表性模式加入 lint 与模板测试。

后续 round 继续收敛 BehaviorPatch 单 authority、Track spec 写入 authority、示例版本来源和 DAG task transition。第五轮 fresh verifier 返回 `NO_GAP`。
