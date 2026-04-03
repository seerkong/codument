# Findings

## Found Facts
- 当前 gap-loop 已要求 fresh 子代理，但没有把首轮 `NO_GAP` 的二次验证规则写清楚。
- 当前 `plan.xml` metadata 还没有显式的 gap-loop 轮次字段。
- 当前共享 `gap-loop.md` 把父层与子代理要求混在一个主流程里。

## Constraints
- 必须兼容上层封装运行环境接管 `yield-gap-loop` 的场景。
- 不能引入 Codument CLI 自己的多代理 runtime。

## Open Questions
- 无

## Conclusions
- 需要新增 `gap_loop_round` 字段，并用提示词和协议规则明确父层循环。
