#!/usr/bin/env bun
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BunPlugin } from 'bun';

const repoRoot = path.resolve(import.meta.dir, '..');
const templatesRoot = path.join(repoRoot, 'src', 'templates');
const entrypoint = path.join(repoRoot, 'src', 'cli', 'index.ts');
const outfileArg = process.argv.find((arg) => arg.startsWith('--outfile='));
const outfile = path.resolve(repoRoot, outfileArg?.slice('--outfile='.length) || 'dist/codument');

async function collectFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files.sort();
}

const resourceFiles = await collectFiles(templatesRoot);
const imports = resourceFiles
  .map((file) => `import ${JSON.stringify(file)} with { type: "file" };`)
  .join('\n');

const embedResources: BunPlugin = {
  name: 'codument-packaged-resources',
  setup(build) {
    build.onLoad({ filter: /src\/cli\/index\.ts$/ }, async ({ path: sourcePath }) => {
      const source = (await Bun.file(sourcePath).text()).replace(/^#![^\n]*\n/, '');
      return { contents: `${imports}\n${source}`, loader: 'ts' };
    });
  },
};

const result = await Bun.build({
  entrypoints: [entrypoint],
  compile: { outfile },
  plugins: [embedResources],
  root: templatesRoot,
  naming: { asset: 'codument-resource/[dir]/[name].[ext]' },
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`Built ${path.relative(repoRoot, outfile)} with ${resourceFiles.length} packaged resources.`);
