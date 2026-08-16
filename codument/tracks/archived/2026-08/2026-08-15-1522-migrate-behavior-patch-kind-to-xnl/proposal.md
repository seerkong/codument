# Proposal: migrate-behavior-patch-kind-to-xnl

## 背景

Behavior registry 已迁为版本化 XNL，但 track 内的 BehaviorPatch 仍使用无 apiVersion 的 XML，导致新 track 无法从 CLI 获得与当前 KindDefinition 一致的文件骨架，归档、校验和迁移也仍绑定 XML。

## 目标

- 定义 `BehaviorPatch` Kind 与 canonical `delta.xnl` DSL。
- CLI 仅接收 track id 与 capability，生成当前 apiVersion 的 BehaviorPatch 骨架；行为内容继续由 AI 按提示词编写。
- 校验、show、archive apply 同时支持 canonical XNL 与 legacy XML。
- `upgrade-workspace` 将历史 `behavior_deltas/**/*.xml` 程序化迁为 XNL，失败时保持 review-required 回退。
- 所有 authoring 提示词、规范和示例统一指向 `delta.xnl`。

## 非目标

- 不把 proposal、design 或 behavior 正文改成固定请求 schema。
- 不移除 legacy XML 读取能力。
- 本 track 不扩展 Halfcode 的递归 catalog；track-local patch 先由 Codument Kind registry 直接验证，递归发现作为后续 compiler 能力演进。
