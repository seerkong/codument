# Design

## Resource package

Each KindDefinition is `sourceShapes = ["single-file"]`, cardinality one, current
version `codument.tech/v1alpha1`. Root catalogs use a common directory plus exact
entry, for example:

```xnl
<Catalog #modeling_config {
  kind = "ModelingConfig"
  shape = "single-file"
  root = "vfs://./config/"
  entry = "modeling.xnl"
}>
```

## DSL

Configuration roots carry identity/version metadata. Settings use `{}`;
singleton sections use `()`; repeated actions, profiles, hooks, attractors, and
conflict rules use named plural `[]` collections. Domain tags do not use `cdt:`.

`ModelingConfig` and `EngineeringConfig` share a normalized projection:

```xnl
<ModelingConfig #codument.config.modeling apiVersion="codument.tech/v1alpha1" version="1" {
  enabled = true
} (
  <Registry { dir = "vfs://@/codument/modeling/" }>
  <Lint { max_lines = 400 max_nodes = 8 }>
  <MergePolicy (
    <Conflicts [
      <Conflict { type = "same-field" resolve = "human" }>
    ]>
  )>
)>
```

## Migration and compatibility

A shared XML-to-XNL converter maps root attributes, Metadata apiVersion, text
descriptions, and child structure without string rewriting. Migration actions
derive the target filename from the four known XML basenames. Readers prefer XNL
and may parse an explicitly supplied legacy XML path during the compatibility
window. `installTemplates` skips a new config XNL default while its legacy XML
sibling exists, allowing migration to preserve user-owned values.
