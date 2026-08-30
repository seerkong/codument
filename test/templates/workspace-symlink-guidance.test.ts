import { describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';

const stdRoot = path.resolve(import.meta.dir, '../../src/templates/codument/std');

function markdownFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(absolute);
  }
  return files;
}

describe('workspace symlink guidance', () => {
  it('keeps the rule concise and in one authoritative prompt', () => {
    const matches = markdownFiles(stdRoot).filter((file) =>
      fs.readFileSync(file, 'utf8').includes('软链接')
    );
    expect(matches).toEqual([path.join(stdRoot, 'methods', 'workflow.md')]);
    expect(fs.readFileSync(matches[0], 'utf8')).toContain(
      '`init` 默认创建普通 `codument/`；若该路径已是有效目录软链接，所有 Codument 读写透明作用于链接目标且保留链接，链接及目标由用户管理。',
    );
  });
});
