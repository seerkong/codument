import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyResourceMigration, inspectResource, migrateWorkspaceResources, planResourceMigration, RESOURCE_MIGRATIONS, verifyResource } from '../../../src/cli/migrations';

function workspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codument-migrate-'));
}

function write(root: string, relative: string, content: string): string {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return file;
}

describe('structured resource migrations', () => {
  it('inspects and plans an unversioned legacy Track conversion by structure', () => {
    const file = write(workspace(), 'codument/tracks/active/example/track.xml', '<Track id="example"><Metadata><Status>new</Status></Metadata></Track>\n');
    const inspection = inspectResource(file);
    const plan = planResourceMigration(file);

    expect(inspection.format).toBe('xml');
    expect(inspection.kinds).toEqual(['Track']);
    expect(inspection.apiVersions).toEqual([]);
    expect(inspection.fingerprint).toBe('xml:Track:unversioned');
    expect(plan.status).toBe('planned');
    expect(plan.migrationId).toBe('xml.track.to-xnl');
    expect(plan.operation).toBe('convert-track-to-xnl');
    expect(plan.targetApiVersion).toBe('codument.tech/v1alpha1');
  });

  it('registers stable deterministic migration paths', () => {
    expect(RESOURCE_MIGRATIONS.map((migration) => migration.id)).toEqual([
      'xml.track.to-xnl',
      'xml.mission.to-xnl',
      'xml.config.to-xnl',
      'xml.behavior.to-xnl',
      'xml.behavior-patch.to-xnl',
      'xnl.decision-tree.unwrap',
      'xnl.empty-decision-forest.remove',
      'xml.unversioned.add-api-version',
      'xnl.unversioned.add-api-version',
    ]);
  });

  it('converts a track-local BehaviorPatch XML into canonical XNL', () => {
    const root = workspace();
    const source = write(root, 'codument/tracks/active/add-orders/behavior_deltas/orders/delta.xml', `<behavior-patch capability="orders" version="1">
      <upsert selector="behavior://orders/requirements/place"><requirement id="place"><statement>Place.</statement></requirement></upsert>
    </behavior-patch>`);

    const result = applyResourceMigration(source, { backupRoot: path.join(root, '.tmp') });
    const target = path.join(path.dirname(source), 'delta.xnl');
    expect(result).toMatchObject({ status: 'applied', targetPath: target });
    expect(fs.existsSync(source)).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toContain('<BehaviorPatch #track.add-orders.behavior_patch.orders apiVersion="codument.tech/v1alpha1"');
    expect(verifyResource(target).valid).toBe(true);
  });

  it('converts a top-level Behavior XML registry into canonical XNL', () => {
    const root = workspace();
    const source = write(root, 'codument/behaviors/orders.xml', `<behaviors capability="orders" version="1">
      <Metadata><ApiVersion>codument.tech/v1alpha1</ApiVersion></Metadata>
      <requirement id="place"><statement>Place order.</statement><suite id="ok"><case id="valid"><then>Created.</then></case></suite></requirement>
    </behaviors>`);

    const result = applyResourceMigration(source, { backupRoot: path.join(root, '.tmp') });
    const target = path.join(root, 'codument/behaviors/orders.xnl');
    expect(result).toMatchObject({ status: 'applied', targetPath: target });
    expect(fs.existsSync(source)).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toContain('<Behavior #orders apiVersion="codument.tech/v1alpha1"');
    expect(fs.readFileSync(target, 'utf8')).toContain('<Requirement #place');
    expect(verifyResource(target).valid).toBe(true);
  });

  it('converts the four legacy config XML authorities into versioned XNL Kinds', () => {
    const root = workspace();
    const fixtures = [
      ['action-hooks.xml', '<ActionHooks version="1"><Action name="gap-loop"><cdt:GapLoopDefaults verify-round="true"/></Action></ActionHooks>', 'OperationHooks', 'operation-hooks.xnl'],
      ['attractor-profiles.xml', '<AttractorProfiles version="1"><Profile name="docs" enabled="true"><Description>Docs</Description><Attractor ref="vfs://@/docs/"/></Profile></AttractorProfiles>', 'AttractorProfiles', 'attractor-profiles.xnl'],
      ['modeling.xml', '<Modeling version="1" enabled="false"><Lint maxLines="500" maxNodes="9"/><MergePolicy><Conflict type="same-field" resolve="ours"/></MergePolicy></Modeling>', 'ModelingConfig', 'modeling.xnl'],
      ['engineering.xml', '<Engineering version="1" enabled="true"><Lint maxLines="600" maxNodes="10"/><MergePolicy><Conflict type="add-add" resolve="theirs"/></MergePolicy></Engineering>', 'EngineeringConfig', 'engineering.xnl'],
    ] as const;

    for (const [sourceName, xml, kind, targetName] of fixtures) {
      const source = write(root, `codument/config/${sourceName}`, xml);
      const result = applyResourceMigration(source, { backupRoot: path.join(root, '.tmp') });
      const target = path.join(root, 'codument/config', targetName);
      expect(result).toMatchObject({ status: 'applied', targetPath: target });
      expect(fs.existsSync(source)).toBe(false);
      const migrated = fs.readFileSync(target, 'utf8');
      expect(migrated).toContain(`<${kind} #codument.config.`);
      if (kind === 'ModelingConfig') {
        expect(migrated).toContain('max_lines = 500');
        expect(migrated).toContain('max_nodes = 9');
      }
      expect(verifyResource(target).valid).toBe(true);
    }
  });

  it('converts legacy mission.xml to versioned mission.xnl', () => {
    const root = workspace();
    const file = write(root, 'codument/missions/active/example/mission.xml', '<Mission id="example" version="1"><Metadata><Status>active</Status><Revision>1</Revision></Metadata><TaskSpace id="space_example"><SubNodes/></TaskSpace></Mission>\n');
    const result = applyResourceMigration(file, { backupRoot: path.join(root, '.tmp') });
    const target = path.join(path.dirname(file), 'mission.xnl');

    expect(result).toMatchObject({ status: 'applied', targetPath: target });
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toContain('apiVersion="codument.tech/v1alpha1"');
    expect(fs.readFileSync(target, 'utf8')).toContain('<Mission #example');
    expect(verifyResource(target).valid).toBe(true);
  });

  it('converts track.xml to track.xnl and rejects an existing target authority', () => {
    const root = workspace();
    const file = write(root, 'codument/tracks/active/example/track.xml', '<Track id="example" version="1" xmlns:cdt="urn:codument:v1"><Metadata><ApiVersion>codument.tech/v1alpha1</ApiVersion><Status>completed</Status><Goal>Example</Goal></Metadata><TaskSpace id="space_example"><SubNodes><TaskGroup id="P1" status="DONE"/></SubNodes></TaskSpace><Schedule/><Hooks/></Track>\n');
    const result = applyResourceMigration(file, { backupRoot: path.join(root, '.tmp') });
    const target = path.join(path.dirname(file), 'track.xnl');

    expect(result).toMatchObject({ status: 'applied', targetPath: target });
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toContain('<Track #example apiVersion="codument.tech/v1alpha1"');
    expect(verifyResource(target).valid).toBe(true);

    const conflictSource = write(root, 'codument/tracks/active/conflict/track.xml', '<Track id="conflict"/>\n');
    write(root, 'codument/tracks/active/conflict/track.xnl', '<Track #conflict apiVersion="codument.tech/v1alpha1">\n');
    expect(applyResourceMigration(conflictSource)).toMatchObject({ status: 'review-required' });
    expect(fs.existsSync(conflictSource)).toBe(true);
  });

  it('adds XML apiVersion without discarding declarations or comments and keeps a backup', () => {
    const root = workspace();
    const file = write(root, 'codument/config/example.xml', '<?xml version="1.0"?>\n<!-- keep -->\n<ActionHooks version="1">\n  <Action name="archive"/>\n</ActionHooks>\n');
    const result = applyResourceMigration(file, { backupRoot: path.join(root, '.tmp') });
    const updated = fs.readFileSync(file, 'utf8');

    expect(result.status).toBe('applied');
    expect(updated).toContain('<?xml version="1.0"?>');
    expect(updated).toContain('<!-- keep -->');
    expect(updated).toContain('<Metadata>\n    <ApiVersion>codument.tech/v1alpha1</ApiVersion>');
    expect(result.backupPath && fs.existsSync(result.backupPath)).toBe(true);
    expect(verifyResource(file).valid).toBe(true);
  });

  it('adds apiVersion to every top-level decision in an XNL forest', () => {
    const file = write(workspace(), 'codument/tracks/active/example/decisions.xnl', [
      '<decision #track.example.a { status = "accepted" }>',
      '<decision #track.example.b { status = "accepted" }>',
      '',
    ].join('\n'));
    const result = applyResourceMigration(file);
    const updated = fs.readFileSync(file, 'utf8');

    expect(result.status).toBe('applied');
    expect(updated.match(/apiVersion="codument\.tech\/v1alpha1"/g)?.length).toBe(2);
    expect(verifyResource(file).valid).toBe(true);
  });

  it('removes an empty decisions.xnl but requires AI review for malformed input', () => {
    const root = workspace();
    const empty = write(root, 'codument/tracks/active/example/decisions.xnl', '\n');
    expect(planResourceMigration(empty).migrationId).toBe('xnl.empty-decision-forest.remove');
    expect(applyResourceMigration(empty).status).toBe('removed');
    expect(fs.existsSync(empty)).toBe(false);
    expect(verifyResource(empty)).toEqual({ path: empty, valid: true, diagnostics: [] });

    const malformed = write(root, 'codument/tracks/active/example/broken.xnl', '<decision #broken {>');
    const original = fs.readFileSync(malformed, 'utf8');
    const plan = planResourceMigration(malformed);
    const result = applyResourceMigration(malformed);
    expect(plan.status).toBe('review-required');
    expect(result.status).toBe('review-required');
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(fs.readFileSync(malformed, 'utf8')).toBe(original);
  });

  it('unwraps a legacy decision-tree package into a Decision forest', () => {
    const file = write(workspace(), 'codument/decisions/workflow/questions.xnl', [
      '<decision-tree #legacy apiVersion="codument.tech/v1alpha1" { status = "accepted" } [',
      '  <decision #workflow.questions { status = "accepted" }>',
      ']>',
      '',
    ].join('\n'));

    expect(planResourceMigration(file)).toMatchObject({
      status: 'planned',
      migrationId: 'xnl.decision-tree.unwrap',
    });
    expect(applyResourceMigration(file).status).toBe('applied');
    const migrated = fs.readFileSync(file, 'utf8');
    expect(migrated).toContain('<decision #workflow.questions apiVersion="codument.tech/v1alpha1"');
    expect(migrated).not.toContain('<decision-tree');
  });

  it('reports root durable decisions that require a business owner path', () => {
    const file = write(workspace(), 'codument/tracks/active/example/decisions.xnl', [
      '<decision #track.example.owner apiVersion="codument.tech/v1alpha1" {',
      '  status = "accepted"',
      '  durable_candidate = true',
      '}>',
      '',
    ].join('\n'));

    const plan = planResourceMigration(file);
    expect(plan.status).toBe('review-required');
    expect(plan.ownerlessDurableDecisions).toEqual(['track.example.owner']);
    expect(plan.diagnostics.join('\n')).toContain('business-semantic owner path');
  });

  it('still rejects a missing non-decision resource', () => {
    const file = path.join(workspace(), 'track.xml');
    const verification = verifyResource(file);
    expect(verification.valid).toBe(false);
    expect(verification.diagnostics).toContain('resource file does not exist');
  });

  it('does not rewrite resources already at the current apiVersion', () => {
    const file = write(workspace(), 'config.xml', '<ActionHooks><Metadata><ApiVersion>codument.tech/v1alpha1</ApiVersion></Metadata></ActionHooks>\n');
    const before = fs.readFileSync(file, 'utf8');
    expect(applyResourceMigration(file).status).toBe('noop');
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  it('excludes managed codument/std authority from workspace migration inventory', () => {
    const root = workspace();
    const stdKind = write(root, 'codument/std/kinds/manifest.xnl', '<ResourcePackage #managed apiVersion="halfcode.resources/v1">\n');
    const packageManifest = write(root, 'codument/manifest.xnl', '<ResourcePackage #workspace apiVersion="halfcode.resources/v1">\n');
    const track = write(root, 'codument/tracks/active/example/track.xml', '<Track id="example"/>\n');

    const result = migrateWorkspaceResources(path.join(root, 'codument'));

    expect(result).toMatchObject({ applied: 1, reviewRequired: [] });
    expect(fs.readFileSync(stdKind, 'utf8')).toContain('halfcode.resources/v1');
    expect(fs.readFileSync(packageManifest, 'utf8')).toContain('halfcode.resources/v1');
    expect(fs.existsSync(track)).toBe(false);
    expect(fs.readFileSync(path.join(path.dirname(track), 'track.xnl'), 'utf8')).toContain('codument.tech/v1alpha1');
  });
});
