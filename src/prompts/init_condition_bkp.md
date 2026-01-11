2. **基于状态恢复：**
   - 设 JSON 中的 `last_successful_step` 值为 `STEP`。
   - 根据 `STEP` 值跳转到下一个逻辑部分：

   - 如果 `STEP` 是 "2.1_project"，宣布恢复进度并继续 **2.2 节**。
   - 如果 `STEP` 是 "2.2_product"，宣布恢复进度并继续 **2.3 节**。
   - 如果 `STEP` 是 "2.3_workflow"，宣布恢复进度并继续 **第二阶段 (3.0)**。
   - 如果 `STEP` 是 "3.2_initial_track"：
     - 宣布："项目已初始化。你可以使用 `/codument:track` 创建新变更追踪，或使用 `/codument:implement` 开始实现。"
     - 停止 init 流程。