import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applySpecXmlPatchContent, applySpecXmlPatchToRegistry, getSpecXmlStats, loadSpecXml, parseSpecXmlContent } from './spec-xml';

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

  it('moves nodes across capability registry entries by spec:// selector', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-spec-xml-cross-move-'));
    fs.writeFileSync(path.join(dir, 'old-capability.xml'), `<capability id="old-capability">
  <requirement id="move-me">
    <statement>Move this requirement.</statement>
  </requirement>
</capability>
`);
    fs.writeFileSync(path.join(dir, 'new-capability.xml'), `<capability id="new-capability">
  <requirement id="keep-me">
    <statement>Keep this requirement.</statement>
  </requirement>
</capability>
`);

    const updated = applySpecXmlPatchToRegistry(`<spec-patch version="1">
  <requirement op="move" selector="spec://old-capability/requirement/move-me" to="spec://new-capability/requirement/move-me" />
</spec-patch>`, dir);

    expect(updated.sort()).toEqual(['new-capability', 'old-capability']);
    expect(fs.readFileSync(path.join(dir, 'old-capability.xml'), 'utf-8')).not.toContain('move-me');
    const newCapability = fs.readFileSync(path.join(dir, 'new-capability.xml'), 'utf-8');
    expect(newCapability).toContain('id="move-me"');
    expect(newCapability).toContain('Move this requirement.');
  });

  it('preserves folder registry include structure when patching included nodes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-spec-xml-folder-patch-'));
    fs.mkdirSync(path.join(dir, 'billing', 'requirements'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'billing', 'index.xml'), `<capability id="billing">
  <include href="requirements/invoice.xml" />
</capability>
`);
    fs.writeFileSync(path.join(dir, 'billing', 'requirements', 'invoice.xml'), `<requirement id="invoice">
  <statement>Invoices are tracked.</statement>
</requirement>
`);

    applySpecXmlPatchToRegistry(`<spec-patch version="1">
  <case op="upsert" selector="spec://billing/requirement/invoice/suite/create/case/new-case" id="new-case">
    <given>draft invoice exists</given>
    <when>invoice is finalized</when>
    <then>invoice total is locked</then>
  </case>
</spec-patch>`, dir);

    const index = fs.readFileSync(path.join(dir, 'billing', 'index.xml'), 'utf-8');
    const requirement = fs.readFileSync(path.join(dir, 'billing', 'requirements', 'invoice.xml'), 'utf-8');
    expect(index).toContain('<include href="requirements/invoice.xml" />');
    expect(index).not.toContain('id="new-case"');
    expect(requirement).toContain('id="new-case"');
    expect(requirement).toContain('invoice total is locked');
  });

  it('preserves nested folder registry includes when patching deeply included nodes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-spec-xml-nested-folder-patch-'));
    fs.mkdirSync(path.join(dir, 'billing', 'requirements'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'billing', 'suites'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'billing', 'index.xml'), `<capability id="billing">
  <include href="requirements/invoice.xml" />
</capability>
`);
    fs.writeFileSync(path.join(dir, 'billing', 'requirements', 'invoice.xml'), `<requirement id="invoice">
  <statement>Invoices are tracked.</statement>
  <include href="../suites/create.xml" />
</requirement>
`);
    fs.writeFileSync(path.join(dir, 'billing', 'suites', 'create.xml'), `<suite id="create">
  <case id="old-case">
    <given>draft invoice exists</given>
    <when>invoice is finalized</when>
    <then>invoice is stored</then>
  </case>
</suite>
`);

    applySpecXmlPatchToRegistry(`<spec-patch version="1">
  <case op="upsert" selector="spec://billing/requirement/invoice/suite/create/case/old-case" id="old-case">
    <given>draft invoice exists</given>
    <when>invoice is finalized</when>
    <then>invoice total is locked</then>
  </case>
</spec-patch>`, dir);

    const index = fs.readFileSync(path.join(dir, 'billing', 'index.xml'), 'utf-8');
    const requirement = fs.readFileSync(path.join(dir, 'billing', 'requirements', 'invoice.xml'), 'utf-8');
    const suite = fs.readFileSync(path.join(dir, 'billing', 'suites', 'create.xml'), 'utf-8');
    expect(index).toContain('<include href="requirements/invoice.xml" />');
    expect(index).not.toContain('invoice total is locked');
    expect(requirement).toContain('<include href="../suites/create.xml" />');
    expect(requirement).not.toContain('invoice total is locked');
    expect(suite).toContain('invoice total is locked');
  });
});
