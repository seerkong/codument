## 上下文

当前 `yield-gap-loop` 已经有三个基本事实：

1. 父层编排者负责 fresh-spawn 子代理
2. 子代理负责一轮 gap 对比 / 修正 / 结构化结果回投
3. 上层封装运行环境可以接管该协议

但在实际使用中，仍有三个关键问题：

- `FIX_APPLIED` 后的“必须继续循环”不够强，父层经常停在第一轮修正后
- 首轮没有历史报告却直接得到 `NO_GAP` 时，没有“保持怀疑并再次验证”的规则
- 共享 `gap-loop.md` 同时给父层和子代理阅读，但角色要求没有分层，导致读取者容易错位执行

## 方案概览

### 1. 明确 gap-loop 的双角色结构

共享提示词按如下顺序组织：

1. 总纲说明
2. 角色判定规则
3. 公共规则
4. 父层编排者章节
5. fresh 子代理章节

这样：

- 当前收到命令的代理先判断自己是父层还是本轮专用 fresh 子代理
- 父层只负责轮次控制、子代理创建、状态收口判断
- 子代理只负责一轮实质检查、报告与必要修正

### 2. 用 `gap_loop_round` 把轮次显式化

在 `plan.xml` metadata 中新增：

```xml
<gap_loop_round>0</gap_loop_round>
```

规则：

- 仅当 `validation_mode=yield-gap-loop` 时有意义
- 创建 track 时初始化为 `0`
- 父层在每次启动 fresh round 之前先更新为当前轮次

这使父层能判断：

- 当前是不是第一轮
- 第一轮 `NO_GAP` 是否发生在“无历史报告”的情况下

### 3. 增加首轮无历史报告的二次验证规则

当且仅当：

- `reports/` 为空或不存在
- 当前 `gap_loop_round=1`
- 子代理返回 `NO_GAP`

父层不能立即视为收口，而必须再起一轮 fresh 子代理验证。

理由：

- 首轮无历史输入的 `NO_GAP` 很可能只是因为第一轮上下文理解不完整
- 再跑一轮 fresh 验证，才能确认不是误判

### 4. 明确 `FIX_APPLIED` 的循环语义

`FIX_APPLIED` 不是“已经完成”，而是“当前刚修完，需要继续 fresh-round 复检”。

因此父层必须：

- 更新 `gap_loop_round`
- fresh-spawn 新一轮
- 直到某轮满足真正收口条件才结束

## 影响范围与修改点

- `src/prompts/gap-loop.md`
  - 重构为总纲 + 公共规则 + 父层章节 + 子代理章节
- `src/prompts/protocols.md`
  - 强化 `FIX_APPLIED` 与首轮 `NO_GAP` 的父层循环规则
- `src/prompts/implement.md`
  - 父层在阶段确认时按新规则继续循环
- `src/prompts/execute-wave.md`
  - wave 模式下同样按新规则继续循环
- `src/prompts/track.md`
  - 创建 gap-loop track 时初始化 `gap_loop_round=0`
- `src/prompts/plan-xml-spec.md`
  - 文档化 `gap_loop_round`
- `codument/std/protocols.md`
  - 同步标准协议
- `codument/std/plan-xml-spec.md`
  - 同步标准 plan 规范
- `codument/specs/codument-core/spec.md`
  - 更新真相规范

## 决策

- 决策：使用 `gap_loop_round` 命名
  - 理由：它直接表达该字段只服务 `yield-gap-loop`

- 决策：父层在启动 round 前更新轮次
  - 理由：这样本轮执行者和后续判断都能看到当前 round 编号

- 决策：首轮无历史报告的 `NO_GAP` 需要二次验证
  - 理由：这是当前误收口风险最高的场景

## 风险 / 权衡

- 风险：父层规则更严格后，会增加一次额外验证成本
  - 缓解：仅在“首轮 + 无历史报告 + NO_GAP”这一窄场景触发

- 风险：`gap_loop_round` 若未被更新，会导致规则无法落地
  - 缓解：在协议、提示词和 plan 规范中都显式要求父层在每轮前更新

## 兼容性设计

- 旧 track 缺少 `gap_loop_round` 时，视为历史内容；新生成的 gap-loop track 必须写入该字段
- 上层封装运行环境接管时，仍以其 orchestrator 为准，但应尽量对齐或映射该轮次语义
