import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { validateEngineeringTree } from '../../../src/cli/engineering/validate';

const SHOW = path.join(__dirname, '..', '..', 'resources', 'engineering-showcase', 'base');

describe('validateEngineeringTree', () => {
  it('validates the showcase base with no errors', () => {
    const findings = validateEngineeringTree(SHOW);
    expect(findings.filter((f) => f.severity === 'error')).toEqual([]);
  });

  it('flags id path mismatch', () => {
    const dir = path.join(__dirname, '..', '..', 'resources', 'engineering-validate', 'id-path-mismatch');
    const findings = validateEngineeringTree(dir);
    expect(findings.some((f) => f.layer === 'hierarchy' && f.severity === 'error')).toBe(true);
  });

  it('scans URI references from attribute blocks', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codument-engineering-attrs-'));
    const target = path.join(dir, 'global', 'howto');
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'orders.xnl'), `<howto #global.howto.orders.add_endpoint { kind = "howto" related = ["engineering://global/howto/orders/missing"] } [
      <when-to-use ?>新增 endpoint。</?>
      <steps ?>写代码。</?>
      <verification ?>跑测试。</?>
    ]>`);

    const findings = validateEngineeringTree(dir);
    expect(findings.some((f) => f.layer === 'hierarchy' && /missing/.test(f.message))).toBe(true);
  });
});
