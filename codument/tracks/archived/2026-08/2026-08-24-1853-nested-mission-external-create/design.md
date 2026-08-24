# Track Design：External Child Mission Creation

父 Applier 使用本机 `.local` binding 定位目标仓库；不存在子 Mission 时创建 pending authority，写入 ParentMission，再验证父侧 MissionLink。已有冲突 ParentMission 不覆盖，返回 DRIFTED/BLOCKED。子 Mission Applier 保持自己的 Mission/Track/reports/decisions authority，父侧只消费状态投影。
