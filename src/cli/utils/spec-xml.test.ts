import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applySpecXmlPatchContent, getSpecXmlStats, loadSpecXml, parseSpecXmlContent } from './spec-xml';

const singleFileSpec = `<capability id="resource.skill-tool" version="1">
  <requirement id="save-skill-tool">
    <statement>系统应允许保存当前 app 下的 skill tool 草稿。</statement>
    <suite id="save" name="保存 skill tool">
      <suite id="valid-draft" name="合法草稿">
        <case id="save-new-skill">
          <given>当前 app 有效</given>
          <when>用户保存 skill tool</when>
          <then>系统写入 skill_tools</then>
        </case>
      </suite>
    </suite>
  </requirement>
</capability>`;

describe('spec XML parser', () => {
  it('parses capability, requirement, nested suites and cases', () => {
    const root = parseSpecXmlContent(singleFileSpec);
    const stats = getSpecXmlStats(root);

    expect(root.tag).toBe('capability');
    expect(root.attrs.id).toBe('resource.skill-tool');
    expect(stats.requirements).toBe(1);
    expect(stats.scenarios).toBe(1);
  });

  it('loads folder-based capability with include nodes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-spec-xml-'));
    fs.mkdirSync(path.join(dir, 'requirements'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.xml'), `<capability id="resource.skill-tool"><include href="requirements/save.xml" /></capability>`);
    fs.writeFileSync(path.join(dir, 'requirements', 'save.xml'), `<requirement id="save"><case id="ok"><given>x</given><when>y</when><then>z</then></case></requirement>`);

    const root = loadSpecXml(dir);
    expect(getSpecXmlStats(root)).toEqual({ requirements: 1, scenarios: 1 });
  });

  it('applies upsert, delete and move operations by spec:// selector', () => {
    const patch = `<spec-patch version="1">
      <case op="upsert" selector="spec://resource.skill-tool/requirement/save-skill-tool/suite/save/suite/valid-draft/case/save-new-skill" id="save-new-skill">
        <given>当前 app 有效</given>
        <when>用户保存 skill tool</when>
        <then>系统写入资源与 VFS 数据</then>
      </case>
      <case op="upsert" selector="spec://resource.skill-tool/requirement/save-skill-tool/suite/save/suite/valid-draft/case/delete-me" id="delete-me" />
      <case op="delete" selector="spec://resource.skill-tool/requirement/save-skill-tool/suite/save/suite/valid-draft/case/delete-me" />
      <case op="move" selector="spec://resource.skill-tool/requirement/save-skill-tool/suite/save/suite/valid-draft/case/save-new-skill" to="spec://resource.skill-tool/requirement/save-skill-tool/suite/save/case/save-new-skill" />
    </spec-patch>`;

    const updated = applySpecXmlPatchContent(singleFileSpec, patch);
    expect(updated).toContain('系统写入资源与 VFS 数据');
    expect(updated).not.toContain('delete-me');
    expect(updated).toContain('<suite id="save"');
  });
});
