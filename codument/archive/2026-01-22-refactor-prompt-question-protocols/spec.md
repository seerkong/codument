## MODIFIED Requirements

### Requirement: 提问协议复用
系统应当（SHALL）将提问提示词的通用规则封装为可复用协议，并在所有提问场景中引用。

#### Scenario: 多问提示复用
- **GIVEN** 提示词需要在一轮中提出多个问题
- **WHEN** 系统生成提问提示词
- **THEN** 系统引用多问协议而非重复描述
- **AND** 用户可按 Q1/Q2 标识回答

#### Scenario: 单问提示复用
- **GIVEN** 提示词需要一次提一个问题
- **WHEN** 系统生成提问提示词
- **THEN** 系统引用单问协议而非重复描述

### Requirement: 自由输入选项
系统应当（SHALL）在需要自由输入的提问中提供可输入答案的选项，但不强制固定选项名称。

#### Scenario: 工具内置选项避免重复
- **GIVEN** 运行环境已提供内置“其他/自定义输入”选项
- **WHEN** 系统生成提问选项
- **THEN** 系统不重复添加同义自由输入选项

### Requirement: 归档 XML 规范对齐
系统应当（SHALL）将归档中的旧任务 XML（早期格式）迁移为 plan.xml，并与 plan.xml 规范对齐。

#### Scenario: 归档 XML 迁移
- **GIVEN** 归档目录中存在旧任务 XML（早期格式）
- **WHEN** 系统进行规范同步
- **THEN** 文件被重命名为 plan.xml
- **AND** XML 根节点与元数据字段符合 plan.xml 规范
