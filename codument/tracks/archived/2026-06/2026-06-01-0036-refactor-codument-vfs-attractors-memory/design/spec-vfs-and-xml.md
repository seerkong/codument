# Spec VFS And XML Design

## 目标

`specs/` 应从 Markdown 文档库转为 XML capability contract registry。

它的核心用途是：

- 稳定表达 capability、requirement、statement、BDD suite、BDD case。
- 指导测试 case 的组织和生成。
- 支持增删改移动的语义 mutation。
- 支持物理文件拆分，但保持逻辑 selector 稳定。

## XML 节点模型

推荐逻辑结构：

```text
capability
  requirement
    statement
    suite
      suite
        case
```

节点含义：

- `capability`：能力包，类似测试模块或 feature。
- `requirement`：可验证需求。
- `statement`：需求陈述，不直接等同于测试 case。
- `suite`：可嵌套的场景分组，类似测试框架里的 describe/context。
- `case`：叶子 BDD 场景，类似测试框架里的 it/test。
- `given`、`when`、`then`：BDD 步骤。
- `examples`：表格驱动或参数化场景。

## 单文件示例

```xml
<capability id="resource.skill-tool" version="1">
  <requirement id="save-skill-tool">
    <statement>
      系统应允许保存当前 app 下的 skill tool 草稿。
    </statement>

    <suite id="save" name="保存 skill tool">
      <suite id="valid-draft" name="合法草稿">
        <case id="save-new-skill">
          <given>当前 app 有效</given>
          <given>草稿文件树合法</given>
          <when>用户保存 skill tool</when>
          <then>系统写入 skill_tools</then>
          <then>系统写入 vfs_tree 与 vfs_content</then>
          <then>系统递增 app.version</then>
        </case>
      </suite>

      <suite id="invalid-draft" name="非法草稿">
        <case id="reject-absolute-path">
          <given>草稿包含绝对路径</given>
          <when>用户保存 skill tool</when>
          <then>系统拒绝保存</then>
          <then>错误信息可诊断非法路径</then>
        </case>
      </suite>
    </suite>
  </requirement>
</capability>
```

## 拆分友好布局

小 capability 可以是：

```text
codument/specs/resource.skill-tool.xml
```

变大后升级为：

```text
codument/specs/resource.skill-tool/
  index.xml
  requirements/
    save-skill-tool.xml
    import-public-skill.xml
  suites/
    save/
      valid-draft.xml
      invalid-draft.xml
```

`index.xml` 只做 manifest：

```xml
<capability id="resource.skill-tool" version="1">
  <title>Skill Tool Resource</title>
  <include href="requirements/save-skill-tool.xml" />
  <include href="requirements/import-public-skill.xml" />
</capability>
```

拆出去的文件必须仍是完整 XML root：

```xml
<requirement id="save-skill-tool">
  <statement>系统应允许保存当前 app 下的 skill tool 草稿。</statement>
  <include href="../suites/save/valid-draft.xml" />
  <include href="../suites/save/invalid-draft.xml" />
</requirement>
```

## VFS URI

selector 使用逻辑 URI，不绑定物理路径：

```text
spec://resource.skill-tool/requirement/save-skill-tool/suite/valid-draft/case/save-new-skill
```

物理文件可以从单文件变为目录，selector 不变。

## Mutation Protocol

mutation 使用 XML tag 表达领域结构，用通用 attribute 表达动作。

第一版操作集合：

- `op="upsert"`：新增或替换 selector 对应节点。
- `op="delete"`：删除 selector 对应节点。
- `op="move"`：移动 selector 对应节点到 `to`。

示例：

```xml
<spec-patch version="1" specSchema="codument-spec-xml-v1">
  <case
    op="upsert"
    selector="spec://resource.skill-tool/requirement/save-skill-tool/suite/valid-draft/case/save-new-skill"
    id="save-new-skill">
    <given>当前 app 有效</given>
    <when>用户保存 skill tool</when>
    <then>系统写入资源与 VFS 数据</then>
  </case>

  <case
    op="delete"
    selector="spec://resource.skill-tool/requirement/save-skill-tool/suite/invalid-draft/case/old-case" />

  <requirement
    op="move"
    selector="spec://old-capability/requirement/save-skill-tool"
    to="spec://resource.skill-tool/requirement/save-skill-tool" />
</spec-patch>
```

## Test Mapping

Spec XML 应便于指导测试 case 组织。

一个 case 可以自然映射到：

```text
test://resource.skill-tool/save/valid-draft/save-new-skill
```

物理测试目录可以由项目决定，但逻辑结构保持：

```text
capability / suite / nested-suite / case
```

## Good / Bad

Good：

- requirement 有稳定 `id`。
- suite 表达测试分组。
- case 是叶子 BDD 场景。
- selector 使用 `spec://`。
- 文件过长时升级为同名目录。

Bad：

- 用物理文件路径当 selector。
- 让 `<scenario>` 无限嵌套且没有 suite/case 边界。
- 把完整长文档塞进 `statement`。
- 为每个很小 case 过早拆文件。
- 用 Markdown 标题位置表达 mutation 目标。

