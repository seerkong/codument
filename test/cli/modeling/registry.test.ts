import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  loadModelingRegistry,
  saveModelingRegistry,
  readNodeId,
  modelingUri,
  nodeName,
} from '../../../src/cli/modeling/registry';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codument-modeling-'));
}

const ENTITY = `<object #resource.skill_tool kind="entity" fact_grade="authoritative_fact" single_writer="resource.store" [
  <desc ?>聚合型资源。</?>
  <types ?t>interface SkillTool { key: string }</?t>
]>`;

describe('modeling registry', () => {
  it('loads .xnl files and indexes nodes by namespaced id', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'domain', 'resource'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'domain', 'resource', 'index.xnl'), ENTITY);

    const reg = loadModelingRegistry(dir);
    const ref = reg.index.get('resource.skill_tool');
    expect(ref).toBeDefined();
    expect(ref!.file).toBe(path.join('domain', 'resource', 'index.xnl'));
    expect(ref!.uri).toBe('modeling://domain/resource/skill_tool');
  });

  it('round-trips registry idempotently (markers stabilize on first write)', () => {
    // Deterministic marker factory for the test; production keeps the ULID default.
    const detFactory = () => {
      let i = 0;
      return () => `m${i++}`;
    };
    const rel = path.join('domain', 'resource', 'index.xnl');

    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'domain', 'resource'), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), ENTITY);

    const reg1 = loadModelingRegistry(dir);
    const out = tmpDir();
    saveModelingRegistry(reg1, out, { textMarkerFactory: detFactory() });

    const reg2 = loadModelingRegistry(out);
    const out2 = tmpDir();
    saveModelingRegistry(reg2, out2, { textMarkerFactory: detFactory() });

    // ids preserved; second save is byte-identical (stable after first materialization).
    expect([...reg2.index.keys()]).toEqual([...reg1.index.keys()]);
    expect(fs.readFileSync(path.join(out2, rel), 'utf-8')).toBe(
      fs.readFileSync(path.join(out, rel), 'utf-8'),
    );
    // round-trip preserves nodes once markers exist in the file.
    const reg3 = loadModelingRegistry(out2);
    expect(reg3.index.get('resource.skill_tool')!.node).toEqual(
      reg2.index.get('resource.skill_tool')!.node,
    );
  });

  it('skips hidden dirs (.node-meta/.tmp/.xnl-vcs)', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, '.tmp'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.tmp', 'junk.xnl'), `<junk #x.y kind="entity">`);
    fs.mkdirSync(path.join(dir, 'domain', 'resource'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'domain', 'resource', 'index.xnl'), ENTITY);

    const reg = loadModelingRegistry(dir);
    expect(reg.index.has('x.y')).toBe(false);
    expect(reg.index.has('resource.skill_tool')).toBe(true);
  });

  it('rejects duplicate node ids across files', () => {
    const dir = tmpDir();
    fs.mkdirSync(path.join(dir, 'domain', 'resource'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'domain', 'resource', 'a.xnl'), ENTITY);
    fs.writeFileSync(path.join(dir, 'domain', 'resource', 'b.xnl'), ENTITY);
    expect(() => loadModelingRegistry(dir)).toThrow(/Duplicate modeling node id/);
  });

  it('helpers: readNodeId, nodeName, modelingUri', () => {
    expect(nodeName('domain.resource.skill_tool')).toBe('skill_tool');
    expect(modelingUri(path.join('domain', 'resource', 'index.xnl'), 'resource.skill_tool')).toBe(
      'modeling://domain/resource/skill_tool',
    );
  });
});
