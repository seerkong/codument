# Design

```xnl
<Behavior #csv-export apiVersion="codument.tech/v1alpha1" version="1" (
  <Requirements [
    <Requirement #export-endpoint (
      <Statement ?>系统 SHALL 提供导出端点。</?>
      <Suites [
        <Suite #csv-export (
          <Cases [
            <Case #escapes-fields (
              <Given ?>字段包含分隔符。</?>
              <When ?>导出 CSV。</?>
              <Then ?>字段按 RFC 4180 转义。</?>
            )>
          ]>
        )>
      ]>
    )>
  ]>
)>
```

Plural wrappers are real XNL collections and are unwrapped into the existing
`SpecXmlNode` behavior model for selector/apply compatibility. Singleton text
facts stay in `()`; repeated `And` facts use `Ands[]`.

The registry resolver prefers `<capability>.xnl`, then legacy XML single-file,
then legacy folder `index.xml`. Writes preserve the discovered authority format.
Creating a missing capability always creates XNL.
