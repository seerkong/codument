import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadEngineeringRegistry, saveEngineeringRegistry } from '../../../src/cli/engineering/registry';

const SHOW = path.join(__dirname, '..', '..', 'resources', 'engineering-showcase', 'base');

describe('engineering registry', () => {
  it('loads .xnl files and indexes nodes by namespaced id', () => {
    const reg = loadEngineeringRegistry(SHOW);
    expect(reg.index.has('global.howto.orders.add_endpoint')).toBe(true);
    expect(reg.index.get('global.howto.orders.add_endpoint')!.uri).toBe(
      'engineering://global/howto/orders/add_endpoint',
    );
  });

  it('round-trips registry idempotently after first write', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'engineering-reg-'));
    const reg = loadEngineeringRegistry(SHOW);
    saveEngineeringRegistry(reg, out, { textMarkerFactory: () => 'm' });
    const reloaded = loadEngineeringRegistry(out);
    expect([...reloaded.index.keys()].sort()).toEqual([...reg.index.keys()].sort());
  });
});
