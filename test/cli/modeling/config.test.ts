import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadModelingConfig } from '../../../src/cli/modeling/config';

function writeConfig(xml: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-modeling-cfg-'));
  const p = path.join(dir, 'modeling.xml');
  fs.writeFileSync(p, xml);
  return p;
}

describe('modeling config', () => {
  it('defaults to enabled when the file is absent', () => {
    const cfg = loadModelingConfig(path.join(os.tmpdir(), 'nope-modeling.xml'));
    expect(cfg.enabled).toBe(true);
    expect(cfg.thresholds).toEqual({ maxLines: 400, maxNodes: 8 });
    expect(cfg.mergePolicy['same-field']).toBe('human');
  });

  it('reads enabled=false as disabled', () => {
    const cfg = loadModelingConfig(writeConfig(`<Modeling version="1" enabled="false"></Modeling>`));
    expect(cfg.enabled).toBe(false);
  });

  it('reads enabled=true, thresholds, and merge policy', () => {
    const cfg = loadModelingConfig(
      writeConfig(`<Modeling version="1" enabled="true">
        <Lint maxLines="500" maxNodes="12"/>
        <MergePolicy>
          <Conflict type="delete-modify" resolve="theirs"/>
          <Conflict type="same-field" resolve="human"/>
        </MergePolicy>
      </Modeling>`),
    );
    expect(cfg.enabled).toBe(true);
    expect(cfg.thresholds).toEqual({ maxLines: 500, maxNodes: 12 });
    expect(cfg.mergePolicy['delete-modify']).toBe('theirs');
    expect(cfg.mergePolicy['same-field']).toBe('human');
    expect(cfg.mergePolicy['add-add']).toBe('human'); // unspecified -> default
  });

  it('ignores invalid resolve values', () => {
    const cfg = loadModelingConfig(
      writeConfig(`<Modeling enabled="true"><MergePolicy><Conflict type="same-field" resolve="bogus"/></MergePolicy></Modeling>`),
    );
    expect(cfg.mergePolicy['same-field']).toBe('human');
  });
});
