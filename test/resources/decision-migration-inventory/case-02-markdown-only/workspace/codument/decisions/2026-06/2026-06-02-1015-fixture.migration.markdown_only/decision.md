# Decision: fixture.migration.markdown_only

Decision URI: decision://fixture.migration.markdown_only

# Historical decisions

The original document has no recoverable XNL source.
LEGACY-RAW-CONTENT-MUST-SURVIVE, including punctuation: `<legacy> & "quoted"`.

### 1. Preserve the original narrative

- Context: This predates structured `decisions.xnl`.
- User response: Keep the complete historical document.
- Final decision: Convert only fields that can be determined.
- Rationale: Missing question, options, hierarchy, and activation must not be invented.
- Status: accepted

### 2. A second historical choice

- Context: One Markdown file may contain several choices while exposing one legacy URI.
- Final decision: Retain the ambiguity as a migration issue.
- Status: accepted
