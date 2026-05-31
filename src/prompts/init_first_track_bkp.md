
2. **过渡：** 宣布初始设置完成，将进入定义第一个 track

---

### 3.4 最终公告

1. **宣布完成：** 宣布项目设置和初始 track 生成完成

2. **保存文件：** 添加并提交所有文件，消息为 `codument(init): Add codument setup files`

3. **后续步骤：** 通知用户可以使用 `请使用 codument-implement skill, 实现track: <track_id>` 开始工作

## 3.0 初始变更追踪生成

**协议：交互式定义需求，提出初始 track，自动创建 track 及其计划。**

### 3.1 生成产品需求（Greenfield 项目）

1. **过渡：** 宣布将定义高级产品需求

2. **分析上下文：** 读取 `codument/product.md` 理解核心概念

3. **顺序提问：** 收集用户故事、功能需求等信息
   - **加速：** 每轮可以 2-3 个问题并用 `Q1`/`Q2`... 标识，等待用户按标识回复；总问题数最多 5 个
   - 使用 `protocols.md` 中的 **ask-multi-question-free** 协议
   - 遵循相同的问题格式规范，示例答复格式同前
   - 最后选项包括"自动生成剩余需求"

4. **继续：** 收集足够信息后进入下一节

### 3.2 提出初始 Track（自动 + 批准）

1. **说明目标：** 宣布将提出初始 track。解释"track"是高级工作单元

2. **生成 Track：** 分析项目上下文生成 track 标题
   - Greenfield 示例（通常是 MVP）：
     > "为创建此项目的 MVP，我建议以下 track：
     > - 构建核心功能..."
   - Brownfield 示例：
     > "为此项目的第一个 track，我建议：
     > - 创建用户认证流程..."

3. **用户确认：** 展示生成的 track 供审查。如果用户拒绝，请求澄清（使用 **Protocol: ask-single-question-free**）

### 3.3 转换为产物（自动）

1. **说明目标：** Track 获批后，宣布将创建产物

2. **初始化 tracks 目录：** 创建 `codument/tracks/` 目录；active tracks 通过该目录发现，track 元数据与状态写入各自 `plan.xml` 的 `<metadata>`。

3. **生成 Track 产物：**
   a. **定义 Track：** 批准的标题是 track 描述
   b. **生成 spec.md 和 plan.xml：**
      - 自动生成详细的 `spec.md`
      - 自动生成 `plan.xml`
      - **关键：** 任务结构必须遵循 `workflow.md` 中的原则
   c. **创建产物：**
      - 生成 Track ID：格式 `shortname-YYYYMMDD`
      - 创建目录：`codument/tracks/<track_id>/`
      - 在 `plan.xml` 的 `<metadata>` 中写入：
        ```json
        {
          "track_id": "<track_id>",
          "type": "feature",
          "status": "new",
          "created_at": "YYYY-MM-DDTHH:MM:SSZ",
          "updated_at": "YYYY-MM-DDTHH:MM:SSZ",
          "description": "<描述>"
        }
        ```
      - 写入 `spec.md` 和 `plan.xml`

   d. **提交状态：** 写入 `{"last_successful_step": "3.2_initial_track"}`

   e. **宣布进度：** 宣布 track 已创建
