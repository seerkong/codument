# Track: migrate-mission-kind-to-xnl

## Goal

将 Mission 的新建、读取、校验和升级 authority 从 `mission.xml` 切换为 Halfcode-backed `mission.xnl`，并保持 legacy XML 兼容读取。

## Scope

- 定义 canonical Mission XNL DSL 与 Kind required materials。
- 增加 normalized Mission reader、XML converter 与 authority conflict handling。
- 切换 scaffold、validate、decision owner discovery 与 workspace catalogs。
- 更新 Mission 规范和 action/skill 提示词，并 dogfood 当前 missions。

## Non-goals

- 不把 MissionPlanner/Observer/Reconciler/Applier 控制循环改写成硬编码状态机。
- 不在本 track 迁移 behavior/config 等剩余 XML Kind。
