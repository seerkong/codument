你是一名非常擅长教学型工程实现的 Python 架构师。

请为一个“刚开始自己实现第一个 AI Agent 的开发者”生成一个完整、可运行、可测试的项目骨架。

这个项目的目标不是做复杂框架，而是帮助初学者真正理解：

1. 为什么 AI Agent 不应该只写成“用户输入 -> 调一次模型 -> print 完整结果”
2. 为什么要尽早把模型输出做成流式处理流水线
3. 用户输入、模型输出、工具调用、工具结果，应该怎样进入同一条正式的数据流主线
4. 一个最小可运行的 agent loop 是怎么连起来的
请直接输出完整代码和测试，不要只输出设计说明，不要只给伪代码，不要省略关键文件。

在开始生成代码前，请先按下面这个理解实现四层数据流：

- lexical：原始片段层，表示“模型流里刚来了什么碎片”
- syntactic：结构识别层，表示“这些碎片拼起来后形成了什么结构”
- semantic：事实层，表示“在 agent runtime 里真正发生了什么事实”
- projection：显示层，表示“把 semantic 事实翻译成终端界面能显示的内容”

请严格沿着这个理解来设计代码，不要把 lexical、syntactic、semantic 混成一层。

教学版只需要聚焦：

- OpenAI 风格的流式文本输出
- OpenAI 风格的工具调用 delta 累积
- 用户输入、模型输出、工具结果进入同一条正式数据流主线
====================
一、项目目标
====================

请生成一个 Python 3.10+ 项目，具备以下能力：

- 使用 OpenAI 官方 Python SDK
- 使用 SDK 的当前稳定流式接口
- 使用 RxPY 作为流式处理的核心技术栈
- 通过流式输出构建一个正式的流式事实流水线
- 具有 lexical / syntactic / semantic / projection 四层
- 具有一个简单的 semantic mainline，作为 semantic 层事实的统一输入与消费主线
- 具有一个基于 readline 的简单终端交互界面
- 具有一个最小但真实的 agent loop
- 具有最少 2 个可演示的内置工具
- 具有 pytest 测试
注意：

- 不要使用 LangChain、CrewAI、AutoGen、LlamaIndex 等框架
- 不要使用复杂依赖注入框架
- 不要用一堆普通 for-loop 和临时列表去假装实现“流式处理主线”
- 不要生成过度工程化的插件系统
- 不要生成过于分散、初学者难以读懂的模块切分
- 代码要能让一个第一次写 agent runtime 的人看懂
这里要明确限制：

- 流式处理主线必须基于 `RxPY`
- 请使用 `reactivex` 包
- lexical、syntactic、semantic、projection 之间的主线传递，必须通过 Observable / Subject / operators 来组织
这样做的目的，是让初学者直接看到“正式的响应式流处理”是什么样子，而不是只看到几个同步函数串起来。

====================
二、请生成的项目结构
====================

请使用一个简单、教学友好的目录结构，例如：

- pyproject.toml
- README.md
- .env.example
- src/app.py
- src/agent_runtime/common.py
- src/agent_runtime/lexical.py
- src/agent_runtime/syntactic.py
- src/agent_runtime/semantic.py
- src/agent_runtime/pipeline.py
- src/agent_runtime/semantic_mainline.py  # semantic 层事实的统一输入与消费主线
- src/agent_runtime/openai_adapter.py
- src/agent_runtime/tools.py
- src/agent_runtime/agent_loop.py
- src/ui/readline_shell.py
- tests/test_pipeline.py
- tests/test_openai_adapter_contract.py
- tests/test_agent_loop.py
- tests/test_readline_projection.py
如果你认为文件名需要微调，可以调整，但必须保持：

- 初学者容易理解
- 每个文件职责清晰
- 不要使用项目作者个人化命名
====================
三、必须实现的核心思想
====================

请严格围绕下面这条主线实现：

用户输入 -> semantic 事实 -> 模型流式输出 -> lexical -> syntactic -> semantic -> projection -> shell
如果中途发生工具调用，则必须进入：

semantic_tool_call_requested -> tool executor -> semantic_tool_result_received -> 再继续 agent loop
也就是说：

- 用户输入必须进入 semantic 层，而不是只作为一个普通字符串直接传给模型
- 工具结果也必须重新进入 semantic 层，而不是工具执行完后直接拼回 UI
- semantic mainline 应作为 semantic facts 的统一输入与消费主线，把用户输入、模型提升后的事实、工具结果放进同一条正式流式主线
====================
四、四层数据流应该怎样设计
====================

请先用 dataclass 定义分层事实、流片段和公共结构。

### 4.1 common
需要有至少这些公共结构：

- Trace
  - event_id
  - turn_id
  - sequence
  - emitted_at
  - source
- ToolCall
  - tool_call_id
  - tool_name
  - arguments_text
  - raw_payload_text
- ToolResult
  - tool_call_id
  - tool_name
  - output_text
  - is_error
- ErrorInfo
  - message
  - detail
### 4.2 lexical 层
lexical 层只关心“模型流里刚来了什么原始片段”。

请至少定义这些 lexical 流片段类型：

- lexical_content_start
- lexical_content_delta(text)
- lexical_content_end
- lexical_reasoning_start
- lexical_reasoning_delta(text)
- lexical_reasoning_end
- lexical_tool_call_start
- lexical_tool_call_delta(name_fragment, arguments_fragment, tool_call_id_fragment 可选)
- lexical_tool_call_end
- lexical_error(error)

说明：

- reasoning 如果当前 SDK 或模型接口不稳定，可以做成可选能力，但结构上要预留
- lexical 层不要直接理解“业务意义”，它只描述原始流片段
### 4.3 syntactic 层
syntactic 层负责把原始流片段组织成更稳定的结构。

请至少定义这些 syntactic 结构类型：

- syntactic_content_start
- syntactic_content_delta(text)
- syntactic_content_end
- syntactic_reasoning_start
- syntactic_reasoning_delta(text)
- syntactic_reasoning_end
- syntactic_tool_call(tool_call)
- syntactic_error(error)

说明：

- syntactic 层可以理解成“把碎片组装成结构”
- 比如多个 tool call delta 片段，要在这里被累计成一个完整 ToolCall
### 4.4 semantic 层
semantic 层是最关键的，它负责表达“运行时真实发生了什么事实”。

请至少定义这些 semantic 事实类型：

- semantic_user_message_received(text)
- semantic_turn_started
- semantic_assistant_message_started
- semantic_assistant_message_delta(text)
- semantic_assistant_message_completed
- semantic_reasoning_delta(text)
- semantic_tool_call_requested(tool_call)
- semantic_tool_call_started(tool_call)
- semantic_tool_result_received(tool_result)
- semantic_notice(message)
- semantic_error(error)
- semantic_turn_completed
这里要特别强调两个要求：

1. 用户输入在用户按下回车、进入 agent loop 的那一刻，就要立即变成 semantic 事实
2. 工具结果在工具执行完成的那一刻，也要立即重新进入 semantic 层，作为正式事实，而不是只打印到屏幕
### 4.5 projection 层
projection 层只负责把 semantic 事实变成用户界面能显示的内容。

请至少实现一个最简单的 text projection：

- semantic_user_message_received -> `[USER] ...`
- semantic_assistant_message_started -> 开始 assistant streaming 段
- semantic_assistant_message_delta -> 实时追加输出
- semantic_assistant_message_completed -> 结束 assistant streaming 段
- semantic_reasoning_delta -> 可选显示为 `[THINK] ...`
- semantic_tool_call_requested -> 显示 `[TOOL CALL] ...`
- semantic_tool_result_received -> 显示 `[TOOL RESULT] ...`
- semantic_notice -> 显示 `[NOTICE] ...`
- semantic_error -> 显示 `[ERROR] ...`

### 4.6 semantic mainline
请实现一个简单的 `semantic_mainline.py`，它应被设计成 semantic 层事实的统一输入与消费主线。

要求：

- semantic mainline 承载的是 semantic facts 的 stream，强调持续流动的事实主线，而不是零散消息分发
- 用户输入形成的 semantic 事实、由 lexical/syntactic 提升而来的 semantic 事实、工具结果形成的 semantic 事实，都应进入这条主线
- projection、tool executor、trace/debug 观察者，应从这条 semantic mainline 观察、订阅并消费事实流
- 这条主线应通过 RxPY 的 Observable / Subject / operators 组织，而不是只提供几个同步 helper
- 命名和注释中请明确说明：这里强调的是 semantic facts 的主线流动与统一汇流，而不是零散消息分发
- 为了减少生成结果回退到传统消息总线风格，请优先使用这类命名：`append_fact` / `push_fact` / `record_fact` / `observe_facts` / `facts` / `fact_stream` / `mainline`
- 请尽量避免把核心 API 命名成这类风格：`publish` / `dispatch` / `emit_event` / `subscribe_handler` / `event_bus`
- 如果需要类名，请优先考虑：`SemanticMainline`、`FactStreamView`、`SemanticProjection`、`ToolFactRecorder`
- 如果需要方法名，请优先考虑：`append_fact()`、`push_fact()`、`record_tool_result()`、`observe()`、`facts()`、`connect_projection()`
====================
五、用户输入和工具结果，什么时候进入 semantic 层
====================

这一点必须在代码和注释里说清楚，因为这是很多初学者最容易写乱的地方。

### 5.1 用户输入进入 semantic 层的时机
请明确实现如下顺序：

1. 用户在 readline 界面输入文本并按下回车
2. 立刻产生 `semantic_user_message_received`
3. 再开始本轮 turn
4. 再把消息写入 conversation state
5. 再去调用模型
也就是说：

- “用户说了什么”本身就是运行时事实
- 它不是只有模型看到，runtime 也必须正式看到
### 5.2 工具结果进入 semantic 层的时机
请明确实现如下顺序：

1. 模型流式输出中形成一个完整 tool call
2. syntactic 层把它组装成 `syntactic_tool_call`
3. semantic 层把它提升成 `semantic_tool_call_requested`
4. tool executor 执行这个工具
5. 工具一返回，立即产生 `semantic_tool_result_received`
6. 然后再把这个工具结果追加进后续 agent loop 的上下文，继续下一轮模型决策
也就是说：

- “工具返回了什么”不是 UI 辅助信息
- 它是 agent loop 里的正式事实
====================
六、OpenAI 官方 SDK 接入要求
====================

请使用 OpenAI 官方 Python SDK。

要求：

- 使用当前稳定接口
- 不要伪造 SDK
- 不要写成和官方 SDK 风格完全不同的封装
- 但可以做一个轻量适配器，把 SDK 原始流转成 lexical 流片段
请在 `openai_adapter.py` 中实现：

- 一个最小的流式调用封装
- 它接收 conversation messages
- 调用 OpenAI 官方 SDK 的流式接口
- 把返回的原始流片段翻译成 lexical 流片段序列
请尽量体现 OpenAI chunk 输入的真实特点，例如：

- 文本输出往是分多个 chunk 到达
- 工具调用时，工具名和参数可能分多块到达
- 结束信号通常是最后才到
请在代码注释中明确说明：

- 哪些代码是“SDK 适配层”
- 哪些代码是“你自己的 runtime 层”

这样初学者才看得出边界。

如果某些 SDK chunk 类型在不同版本间可能变化，请把适配器写得清晰、可替换，不要把具体 provider chunk 名字散落到整个项目里。

====================
七、必须有一个能跑通的 agent loop
====================

请生成一个真正可以工作的最小 agent loop，不要只写一次性聊天函数。

至少要有下面这个运行过程：

1. 启动 readline shell
2. 用户输入一条消息
3. runtime 产生 `semantic_user_message_received`
4. runtime 开始一轮 turn
5. 调用模型并流式接收输出
6. lexical -> syntactic -> semantic 逐层推进
7. projection 把 semantic 事实显示到终端
8. 如果模型请求工具：
   - 执行工具
   - 工具结果重新进入 semantic 层
   - 再继续模型循环
9. 当前 turn 结束
10. 等待用户下一次输入
请把 agent loop 写清楚，不要隐藏在魔法封装里。

====================
八、必须有一个基于 readline 的简单 TUI
====================

请实现一个最小但顺手的命令行界面。

要求：

- 使用 Python 标准库 `readline`
- 不要使用 rich、textual、prompt_toolkit 等复杂 UI 框架
- 只需要一个简单的循环输入输出界面
交互效果至少包括：

- 用户输入时能看到提示符，例如 `you> `
- assistant 输出时是流式逐步显示的
- 工具调用时能看到提示
- 工具结果返回时能看到提示
- 错误时能看到 `[ERROR]`

目标不是界面华丽，而是让初学者能看懂“agent loop 和流式数据流是怎么串起来的”。

====================
九、必须有至少两个简单工具
====================

请提供两个不会带来高风险、但足够演示 agent loop 的内置工具，例如：

- `get_current_time`
- `read_text_file_head`

要求：

- 工具定义简单
- 工具执行器清晰
- 工具输入输出可测试
- 工具结果必须重新进入 semantic 层
不要生成需要浏览器、数据库、外部服务才能跑的工具。

====================
十、测试要求
====================

请生成 pytest 测试，至少包含下面这些类别。

### 10.1 pipeline 基础测试
- lexical content delta 能正确进入 syntactic content delta
- lexical tool_call_delta 能正确组装成 syntactic_tool_call
- syntactic content / tool_call 能正确提升成 semantic 事实
这里不要只写一个抽象的“pipeline 基础测试”。

请明确生成下面这些具体 case，并把 case 名、输入和期望写进测试里。

### 10.1.1 必须照着下面这些 case 规格生成测试
如果你选择使用 transcript fixture 或样例资源文件，请直接按这些 case 名生成对应的 fixture 文件或测试输入文件。

#### case A: `test_thinking_stream_keeps_start_delta_end`

测试目标：

- 验证 reasoning/thinking 流的开始、增量、结束片段，在各层都保持顺序
输入：

- thinking_start
- thinking_delta("analysis")
- thinking_end
期望：

- syntactic 层结构顺序为：
  - `syntactic_thinking_start`
  - `syntactic_thinking_delta`
  - `syntactic_thinking_end`
- semantic 层事实顺序为：
  - `semantic_reasoning_started` 或你定义的等价事件
  - `semantic_reasoning_delta`
  - `semantic_reasoning_completed` 或你定义的等价事件
#### case B: `test_toolcall_delta_transcript_pipeline`

测试目标：

- 验证 OpenAI 风格的工具调用 delta 能累计成一个完整 tool call
输入要模拟下面这种顺序：

- tool_call_start
- tool_call_delta(`{"index": 0, "id": "call_abc123", "type": "function", "function": {"name": "get_weather"}}`)
- tool_call_delta(`{"index": 0, "function": {"arguments": "{\"location\":"}}`)
- tool_call_delta(`{"index": 0, "function": {"arguments": " \"San Francisco\"}"}}`)
- tool_call_end
期望：

- syntactic 层形成 1 个完整 tool call
- semantic 层形成 1 个 `semantic_tool_call_requested`
- 字段应为：
  - `tool_call_id == "call_abc123"`
  - `tool_name == "get_weather"`
  - `arguments_text == "{\"location\": \"San Francisco\"}"`

#### case C: `test_default_mixed_pipeline`

测试目标：

- 验证普通文本输出和工具调用混合出现时，流水线仍能正确分层
输入要模拟下面这种结构：

- thinking_start
- thinking_delta("我先想一下")
- thinking_end
- content_start
- content_delta("我先查询天气")
- content_end
- tool_call_start
- tool_call_delta(名称片段)
- tool_call_delta(参数片段 1)
- tool_call_delta(参数片段 2)
- tool_call_end
期望：

- syntactic thinking delta 为：
  - `"我先想一下"`
- syntactic content delta 为：
  - `"我先查询天气"`
- syntactic 层有且只有 1 个完整 tool call
- semantic 层有：
  - 1 个 reasoning started
  - 1 个 reasoning delta
  - 1 个 reasoning completed
  - 1 个 assistant started
  - 1 个 assistant delta
  - 1 个 assistant completed
  - 1 个 tool_call_requested
### 10.1.2 必须有容错与错误恢复测试
请至少生成下面这些具体错误 case：

#### case D: `test_toolcall_stream_tolerates_missing_id`

输入：

- 一个 tool call delta，只包含：
  - `name_fragment = "get_weather"`
  - `arguments_fragment = "{\"location\":\"Paris\"}"`

期望：

- 仍形成 1 个 tool call
- `tool_call_id == ""`
- `tool_name == "get_weather"`
- `arguments_text == "{\"location\":\"Paris\"}"`

#### case E: `test_toolcall_stream_tolerates_missing_name`

输入：

- 一个 tool call delta，只包含：
  - `provider_call_id = "call_missing_name"`
  - `arguments_fragment = "{\"location\":\"Paris\"}"`

期望：

- 仍形成 1 个 tool call
- `tool_call_id == "call_missing_name"`
- `tool_name == ""`
- `arguments_text == "{\"location\":\"Paris\"}"`

#### case F: `test_toolcall_stream_tolerates_missing_arguments`

输入：

- 一个 tool call delta，只包含：
  - `provider_call_id = "call_missing_arguments"`
  - `name_fragment = "get_weather"`

期望：

- 仍形成 1 个 tool call
- `tool_call_id == "call_missing_arguments"`
- `tool_name == "get_weather"`
- `arguments_text == ""`

#### case G: `test_toolcall_stream_preserves_delta_order`

输入：

- 一个 tool call start
- 连续 3 个 delta：
  - 名称片段
  - 参数片段前半
  - 参数片段后半
- 一个 tool call end
期望：

- 名称按原顺序累积
- 参数按原顺序累积
- 不发生片段乱序拼接
### 10.1.3 必须有模拟 OpenAI chunk 输入顺序的测试
请至少增加 2-3 个“模拟 OpenAI chunk 输入顺序”的测试，不要只测试静态 helper 函数。

这些测试应该自己构造一串模拟 chunk 输入，送进 openai adapter 和 pipeline，然后断言最终产生的流片段 / 事实数量与顺序。

至少包含下面两类：

1. 纯文本输出场景
   - 模拟 3 个连续 content chunk
   - 断言至少产生：
     - 1 个 `lexical_content_start`
     - 3 个 `lexical_content_delta`
     - 1 个 `lexical_content_end`
     - 1 个 `semantic_assistant_message_started`
     - 3 个 `semantic_assistant_message_delta`
     - 1 个 `semantic_assistant_message_completed`

2. 工具调用场景
   - 模拟 tool call 的 name 和 arguments 分多块到达
   - 断言至少产生：
     - 1 个 `lexical_tool_call_start`
     - 多个 `lexical_tool_call_delta`
     - 1 个 `lexical_tool_call_end`
     - 1 个 `syntactic_tool_call`
     - 1 个 `semantic_tool_call_requested`

如果你愿意，也可以再加第三类：

3. 文本 + 工具调用混合场景
   - 先来一段 assistant 文本
   - 再来 tool call chunk
   - 断言 semantic 层事实顺序合理
### 10.2 用户输入进入 semantic 层的顺序测试
请明确测试：

- 用户按下回车后，先出现 `semantic_user_message_received`
- 再开始 turn
- 再触发模型调用
### 10.3 工具结果返回 semantic 层的顺序测试
请明确测试：

- 先产生 `semantic_tool_call_requested`
- 再执行工具
- 再产生 `semantic_tool_result_received`
- 再继续下一轮 agent 决策
### 10.4 projection 测试
请测试 semantic facts 能被正确投影为终端文本：

- `[USER]`
- `[ASSISTANT]`
- `[TOOL CALL]`
- `[TOOL RESULT]`
- `[ERROR]`

### 10.5 agent loop 冒烟测试
请做一个最小冒烟测试，验证：

- 一个用户输入
- 一次流式 assistant 输出
- 一次工具调用
- 一次工具结果回流
整个回路是通的。

### 10.6 RxPY 主线测试
请至少增加一个测试，明确证明核心主线是基于 RxPY Observable / Subject 运行的，而不是假借 RxPY 名字、实际全靠同步函数串起来。

例如可以测试：

- 一个 Subject 推入 lexical 流片段
- 经过 operators 和 pipeline
- 下游 observable 收到预期事实或结构
====================
十一、README 要写给初学者看
====================

请在 README 里解释这几件事：

1. 这个项目不是完整框架，而是教学型骨架
2. lexical / syntactic / semantic / projection 分别干什么
3. 为什么用户输入和工具结果也要进入 semantic 层
4. agent loop 是怎么工作的
5. 如何运行
6. 如何配置 OpenAI API Key
7. 如何运行测试
README 的风格要求：

- 用初学者能看懂的语言
- 少术语堆砌
- 多用“为什么要这样做”

====================
十二、代码风格要求
====================

- 优先可读性，不要为了“像框架”而过度抽象
- 每个文件都要有明确职责
- 适当写解释性注释，但不要废话注释
- dataclass 命名清楚
- 类型数量不要太多，但要足够体现分层
- 让初学者能顺着代码一层一层看懂
====================
十三、输出方式
====================

请直接按文件输出完整项目代码。

顺序建议：

1. pyproject.toml / README.md / .env.example
2. common / lexical / syntactic / semantic
3. pipeline / semantic_mainline / openai_adapter / tools / agent_loop
4. readline_shell
5. tests
不要只输出目录树。
不要只输出设计说明。
不要省略 imports。
不要留 TODO。
不要把 OpenAI SDK 调用写成假代码。
