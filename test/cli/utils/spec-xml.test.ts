import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applySpecXmlPatchContent, applySpecXmlPatchToRegistry, getSpecXmlStats, loadSpecXml, parseSpecXmlContent } from '../../../src/cli/utils/spec-xml';
import { applyNativeBehaviorMutations } from '../../../src/cli/behavior/mutations';
import { serializeBehaviorNode } from '../../../src/cli/behavior/resource';

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
  it('compiles canonical Behavior changes into a native XNL mutation batch', () => {
    const base = parseSpecXmlContent(`<behaviors capability="native-test">
  <requirement id="existing"><statement>Before.</statement></requirement>
</behaviors>`);
    const expected = parseSpecXmlContent(`<behaviors capability="native-test">
  <requirement id="existing"><statement>After.</statement></requirement>
  <requirement id="added"><statement>Added.</statement></requirement>
</behaviors>`);

    const result = applyNativeBehaviorMutations(serializeBehaviorNode(base), expected);

    expect(result.mutations.length).toBeGreaterThan(0);
    expect(result.content).toContain('After.');
    expect(result.content).toContain('#added');
  });

  it('rejects a native mutation result with duplicate Behavior identities', () => {
    const base = parseSpecXmlContent('<behaviors capability="native-test" />');
    const expected = parseSpecXmlContent(`<behaviors capability="native-test">
  <requirement id="duplicate"><statement>First.</statement></requirement>
  <requirement id="duplicate"><statement>Second.</statement></requirement>
</behaviors>`);

    expect(() => applyNativeBehaviorMutations(serializeBehaviorNode(base), expected))
      .toThrow('Native Behavior mutation batch rejected');
  });

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

  it('applies behavior-patch wrapper operations by behavior:// selector', () => {
    const patch = `<behavior-patch capability="resource.skill-tool" version="1">
      <upsert selector="behavior://resource.skill-tool/requirements/save-skill-tool/suites/save/suites/valid-draft/cases/save-new-skill">
        <case id="save-new-skill">
          <given>当前 app 有效</given>
          <when>用户保存 skill tool</when>
          <then>系统写入资源与 VFS 数据</then>
        </case>
      </upsert>
    </behavior-patch>`;

    const updated = applySpecXmlPatchContent(singleFileSpec, patch);
    expect(updated).toContain('系统写入资源与 VFS 数据');
    expect(updated).toContain('<case id="save-new-skill">');
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

  it('moves nodes across canonical Behavior XNL authorities through native batches', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-behavior-xnl-cross-move-'));
    const source = parseSpecXmlContent(`<behaviors capability="source-cap">
  <requirement id="move-me"><statement>Move through native XNL mutations.</statement></requirement>
</behaviors>`);
    const target = parseSpecXmlContent(`<behaviors capability="target-cap">
  <requirement id="keep-me"><statement>Keep this.</statement></requirement>
</behaviors>`);
    fs.writeFileSync(path.join(dir, 'source-cap.xnl'), serializeBehaviorNode(source));
    fs.writeFileSync(path.join(dir, 'target-cap.xnl'), serializeBehaviorNode(target));

    const updated = applySpecXmlPatchToRegistry(`<behavior-patch capability="source-cap">
  <move selector="behavior://source-cap/requirements/move-me" to="behavior://target-cap/requirements/moved" />
</behavior-patch>`, dir);

    expect(updated.sort()).toEqual(['source-cap', 'target-cap']);
    expect(fs.readFileSync(path.join(dir, 'source-cap.xnl'), 'utf8')).not.toContain('#move-me');
    const targetContent = fs.readFileSync(path.join(dir, 'target-cap.xnl'), 'utf8');
    expect(targetContent).toContain('#moved');
    expect(targetContent).toContain('Move through native XNL mutations.');
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

  it('upserts, deletes and moves into an existing <behaviors capability> single-file registry', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-behaviors-single-'));
    fs.writeFileSync(path.join(dir, 'web-perf.xml'), `<behaviors capability="web-perf" version="1">
  <requirement id="existing">
    <statement>Existing requirement is preserved.</statement>
  </requirement>
  <requirement id="drop-me">
    <statement>This one will be deleted.</statement>
  </requirement>
</behaviors>
`);

    const updated = applySpecXmlPatchToRegistry(`<behavior-patch capability="web-perf" version="1">
  <upsert selector="behavior://web-perf/requirements/hot-path-coalescing">
    <requirement id="hot-path-coalescing">
      <statement>系统 SHALL 合并热路径。</statement>
    </requirement>
  </upsert>
  <delete selector="behavior://web-perf/requirements/drop-me" />
  <move selector="behavior://web-perf/requirements/existing" to="behavior://web-perf/requirements/renamed-existing" />
</behavior-patch>`, dir);

    expect(updated).toEqual(['web-perf']);
    const registry = fs.readFileSync(path.join(dir, 'web-perf.xml'), 'utf-8');
    expect(registry).toContain('<behaviors capability="web-perf"');
    expect(registry).toContain('id="hot-path-coalescing"');
    expect(registry).not.toContain('id="drop-me"');
    expect(registry).toContain('id="renamed-existing"');
    expect(registry).not.toContain('id="existing"');
  });

  it('upserts into an existing <behaviors capability> folder registry and preserves includes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-behaviors-folder-'));
    fs.mkdirSync(path.join(dir, 'web-perf', 'requirements'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'web-perf', 'index.xml'), `<behaviors capability="web-perf" version="1">
  <include href="requirements/render.xml" />
</behaviors>
`);
    fs.writeFileSync(path.join(dir, 'web-perf', 'requirements', 'render.xml'), `<requirement id="render">
  <statement>Rendering stays within budget.</statement>
</requirement>
`);

    const updated = applySpecXmlPatchToRegistry(`<behavior-patch capability="web-perf" version="1">
  <upsert selector="behavior://web-perf/requirements/render/suites/budget/cases/coalesce">
    <case id="coalesce">
      <given>many updates queued</given>
      <when>frame budget is tight</when>
      <then>updates are coalesced</then>
    </case>
  </upsert>
</behavior-patch>`, dir);

    expect(updated).toEqual(['web-perf']);
    const index = fs.readFileSync(path.join(dir, 'web-perf', 'index.xml'), 'utf-8');
    const requirement = fs.readFileSync(path.join(dir, 'web-perf', 'requirements', 'render.xml'), 'utf-8');
    expect(index).toContain('<include href="requirements/render.xml" />');
    expect(index).not.toContain('id="coalesce"');
    expect(requirement).toContain('id="coalesce"');
    expect(requirement).toContain('updates are coalesced');
  });

  it('creates a brand-new registry in the current Behavior XNL format', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-behaviors-new-'));

    applySpecXmlPatchToRegistry(`<behavior-patch capability="fresh-cap" version="1">
  <upsert selector="behavior://fresh-cap/requirements/first">
    <requirement id="first">
      <statement>First requirement.</statement>
    </requirement>
  </upsert>
</behavior-patch>`, dir);

    const registry = fs.readFileSync(path.join(dir, 'fresh-cap.xnl'), 'utf-8');
    expect(registry).toContain('<Behavior #fresh-cap apiVersion="codument.tech/v1alpha1"');
    expect(registry).toContain('<Requirement #first');
  });

  it('applies legacy XML patches to an existing Behavior XNL authority', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-behaviors-xnl-'));
    fs.writeFileSync(path.join(dir, 'web-perf.xnl'), `<Behavior #web-perf apiVersion="codument.tech/v1alpha1" version="1" (
      <Requirements [
        <Requirement #existing (<Statement ?>Existing requirement.</?>)>
        <Requirement #drop-me (<Statement ?>Drop requirement.</?>)>
      ]>
    )>`);

    applySpecXmlPatchToRegistry(`<behavior-patch capability="web-perf" version="1">
      <upsert selector="behavior://web-perf/requirements/new-one"><requirement id="new-one"><statement>New requirement.</statement></requirement></upsert>
      <delete selector="behavior://web-perf/requirements/drop-me" />
      <move selector="behavior://web-perf/requirements/existing" to="behavior://web-perf/requirements/renamed" />
    </behavior-patch>`, dir);

    const registry = fs.readFileSync(path.join(dir, 'web-perf.xnl'), 'utf-8');
    expect(registry).toContain('<Requirement #new-one');
    expect(registry).toContain('<Requirement #renamed');
    expect(registry).not.toContain('#drop-me');
    expect(registry).not.toContain('#existing');
  });

  it('still accepts legacy <capability id> registry roots for backward compatibility', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-behaviors-legacy-'));
    fs.writeFileSync(path.join(dir, 'legacy-cap.xml'), `<capability id="legacy-cap" version="1">
  <requirement id="kept">
    <statement>Kept requirement.</statement>
  </requirement>
</capability>
`);

    const updated = applySpecXmlPatchToRegistry(`<behavior-patch capability="legacy-cap" version="1">
  <upsert selector="behavior://legacy-cap/requirements/added">
    <requirement id="added">
      <statement>Added requirement.</statement>
    </requirement>
  </upsert>
</behavior-patch>`, dir);

    expect(updated).toEqual(['legacy-cap']);
    const registry = fs.readFileSync(path.join(dir, 'legacy-cap.xml'), 'utf-8');
    expect(registry).toContain('id="kept"');
    expect(registry).toContain('id="added"');
  });
});
