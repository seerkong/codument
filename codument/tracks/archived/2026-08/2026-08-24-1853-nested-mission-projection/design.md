# Track Design：Nested Mission Projection

父 Observer 读取子 Mission authority 和 selected leaf Task 的状态，不复制子 TaskSpace。父 Task 只在 selected targets 全部 DONE，或有明确 SUPERSEDED 证据时完成；子 Mission active 不阻止父交付。跨层 TrackLink 通过 project_ref、mission_ref、track_ref解析具体 Track。UNBOUND/MISSING/DRIFTED/BLOCKED 只阻断直接依赖分支。
