import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

function operation(name: string): string {
  return fs.readFileSync(path.join(ROOT, 'src', 'templates', 'codument', 'std', 'operations', `${name}.md`), 'utf8');
}

describe('CLI-first operation contracts', () => {
  it('uses the CLI as validation authority and does not recreate a manual validator', () => {
    const validate = operation('validate');
    expect(validate).toContain('CLI 是语法、Kind 版本、结构、引用、DAG 与 hook 规则的确定性 authority');
    expect(validate).toContain('运行 `codument validate [item] [--strict]`');
    expect(validate).toContain('结构校验记为 `SKIPPED`');
    expect(validate).toContain('不用提示词重写一套解析器或事务实现');
  });

  it('does not bypass archive confirmation or replay a successful CLI transaction', () => {
    const archive = operation('archive-track');
    expect(archive).toContain('只有用户明确同意归档非 completed Track 时才加 `--yes`');
    expect(archive).toContain('接受 CLI 返回的事务结果');
    expect(archive).toContain('系统找不到 CLI 时归档保持 blocked');
    expect(archive).toContain('不使用提示词模拟 registry transaction');
  });

  it('requires semantic review after structural resource conversion', () => {
    const migrate = operation('migrate');
    expect(migrate).toContain('确认业务语义、未知字段和嵌套关系完整');
    expect(migrate).toContain('保留原文件、backup、migration manifest');
    expect(migrate).toContain('`codument upgrade-resource <path> --json`');
  });

  it('binds Track completion to CLI-run verification and reuses verify evidence', () => {
    const impl = operation('impl-track');
    const verify = operation('verify');
    expect(impl).toContain('codument track task complete <track-id> <task-id> -- <verification-command>');
    expect(impl).toContain('codument track verify <track-id> -- <verification-command>');
    expect(impl).toContain('receipt id/reused');
    expect(impl).toContain('不得用 `;` 把失败检查与完成写入分离');
    expect(impl).toContain('codument track ready <track-id> --json');
    expect(impl).not.toContain('task transition <track-id> <task-id> DONE');
    expect(verify).toContain('建立 evidence plan');
    expect(verify).toContain('每条唯一命令使用一次 `--fresh`');
    expect(verify).toContain('codument track verify <track-id> --fresh -- <verification-command>');
    expect(verify).toContain('不消费实现阶段回执');
    expect(verify).toContain('逐项判定”不等于“逐项重复执行');
  });
});
