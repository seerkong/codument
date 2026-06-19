# Knowledge Context

## Source Notes
| Source | Summary | Relevance |
|--------|---------|-----------|
| `src/prompts/gap-loop.md` | 当前共享提示词同时面向父层和子代理 | 高 |
| `codument/std/protocols.md` | 当前协议缺少首轮 `NO_GAP` 二次验证规则 | 高 |
| Sparrow Edict 背景输入 | 上层封装环境可能接管 `yield-gap-loop` | 高 |

## Codebase Knowledge
- gap-loop 当前主要是提示词 / 协议 / 生成器层实现，没有独立 runtime。

## Domain Knowledge
- `FIX_APPLIED` 表示当前轮已修正，但尚未证明目标已完全收敛。
- “首轮无历史报告的 NO_GAP” 是高误判风险场景，需要额外 fresh round 验证。
